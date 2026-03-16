"""
Kiri — Interaction Lab: PPI Network Service

Fetches protein-protein interaction data from STRING-DB and BioGRID,
merges into a unified Cytoscape.js-compatible graph structure.
"""

import logging
from typing import Any

import httpx

from app.core.cache import cache
from app.core.config import settings
from app.core.errors import KiriExternalAPIError

logger = logging.getLogger("kiri.interaction.ppi")

# ── STRING-DB ──


async def fetch_string_network(
    genes: list[str],
    species: int = 9606,
    score_threshold: float = 0.4,
) -> dict[str, Any]:
    """
    Fetch PPI network from STRING-DB.

    Args:
        genes: List of gene symbols (e.g., ["PARL", "MAVS"])
        species: NCBI taxonomy ID (9606 = Homo sapiens)
        score_threshold: Minimum combined score (0-1)

    Returns:
        Raw STRING-DB network data.
    """
    cache_params = {"genes": sorted(genes), "species": species, "score": score_threshold}
    cached, hit = await cache.get("string-db", cache_params)
    if hit:
        logger.info(f"STRING-DB cache hit for {genes}")
        return cached

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Retry wrapper for STRING-DB (transient failures are common)
            last_err = None
            string_ids = None
            for attempt in range(3):
                try:
                    id_resp = await client.post(
                        f"{settings.STRING_DB_API_BASE}/json/get_string_ids",
                        data={
                            "identifiers": "\r".join(genes),
                            "species": species,
                            "limit": 1,
                            "caller_identity": "kiri-platform",
                        },
                    )
                    id_resp.raise_for_status()
                    string_ids = id_resp.json()
                    last_err = None
                    break
                except httpx.HTTPError as e:
                    last_err = e
                    if attempt < 2:
                        import asyncio
                        wait = (2 ** attempt)
                        logger.warning(f"STRING-DB get_ids attempt {attempt+1}/3 failed, retrying in {wait}s: {e}")
                        await asyncio.sleep(wait)

            if last_err is not None:
                raise last_err

            if not string_ids:
                return {"nodes": [], "edges": [], "source": "STRING-DB", "query_genes": genes}

            identifiers = [item["stringId"] for item in string_ids]

            # Get interaction network (also with retry)
            interactions = None
            for attempt in range(3):
                try:
                    net_resp = await client.post(
                        f"{settings.STRING_DB_API_BASE}/json/network",
                        data={
                            "identifiers": "\r".join(identifiers),
                            "species": species,
                            "required_score": int(score_threshold * 1000),
                            "network_type": "functional",
                            "caller_identity": "kiri-platform",
                        },
                    )
                    net_resp.raise_for_status()
                    interactions = net_resp.json()
                    break
                except httpx.HTTPError as e:
                    last_err = e
                    if attempt < 2:
                        import asyncio
                        wait = (2 ** attempt)
                        logger.warning(f"STRING-DB network attempt {attempt+1}/3 failed, retrying in {wait}s: {e}")
                        await asyncio.sleep(wait)

            if interactions is None:
                raise last_err

    except httpx.HTTPError as e:
        raise KiriExternalAPIError("STRING-DB", f"Failed to fetch PPI network after 3 attempts: {e}")

    # Build node/edge structure
    node_set = set()
    edges = []
    for interaction in interactions:
        gene_a = interaction.get("preferredName_A", interaction.get("stringId_A", ""))
        gene_b = interaction.get("preferredName_B", interaction.get("stringId_B", ""))
        score = interaction.get("score", 0)

        if score < score_threshold:
            continue

        node_set.add(gene_a)
        node_set.add(gene_b)
        edges.append({
            "source": gene_a,
            "target": gene_b,
            "score": round(score, 4),
            "nscore": interaction.get("nscore", 0),
            "fscore": interaction.get("fscore", 0),
            "pscore": interaction.get("pscore", 0),
            "ascore": interaction.get("ascore", 0),
            "escore": interaction.get("escore", 0),
            "dscore": interaction.get("dscore", 0),
            "tscore": interaction.get("tscore", 0),
            "data_source": "STRING-DB",
        })

    nodes = [
        {
            "id": gene,
            "label": gene,
            "is_query": gene in genes,
            "data_source": "STRING-DB",
        }
        for gene in node_set
    ]

    result = {
        "nodes": nodes,
        "edges": edges,
        "source": "STRING-DB",
        "species": species,
        "score_threshold": score_threshold,
        "query_genes": genes,
    }

    await cache.set("string-db", cache_params, result)
    return result


# ── BioGRID ──


async def fetch_biogrid_interactions(genes: list[str]) -> dict[str, Any]:
    """
    Fetch physical interaction evidence from BioGRID.

    Args:
        genes: List of gene symbols.

    Returns:
        BioGRID interaction data with evidence types.
    """
    api_key = settings.BIOGRID_API_KEY
    if not api_key:
        logger.warning("BioGRID API key not configured — skipping BioGRID data")
        return {"nodes": [], "edges": [], "source": "BioGRID", "available": False}

    cache_params = {"genes": sorted(genes), "source": "biogrid"}
    cached, hit = await cache.get("string-db", cache_params)  # reuse 7d TTL
    if hit:
        return cached

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{settings.BIOGRID_API_BASE}/interactions",
                params={
                    "accessKey": api_key,
                    "format": "json",
                    "searchNames": "true",
                    "geneList": "|".join(genes),
                    "organism": 9606,
                    "interSpeciesExcluded": "true",
                    "selfInteractionsExcluded": "true",
                    "evidenceList": "physical",
                    "includeEvidence": "true",
                    "max": 100,
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as e:
        raise KiriExternalAPIError("BioGRID", f"Failed to fetch interactions: {e}")

    node_set: set[str] = set()
    edges = []

    for _interaction_id, interaction in data.items():
        gene_a = interaction.get("OFFICIAL_SYMBOL_A", "")
        gene_b = interaction.get("OFFICIAL_SYMBOL_B", "")
        if not gene_a or not gene_b:
            continue

        node_set.add(gene_a)
        node_set.add(gene_b)
        edges.append({
            "source": gene_a,
            "target": gene_b,
            "evidence_type": interaction.get("EXPERIMENTAL_SYSTEM", ""),
            "pubmed_id": interaction.get("PUBMED_ID", ""),
            "throughput": interaction.get("THROUGHPUT", ""),
            "data_source": "BioGRID",
        })

    nodes = [
        {"id": gene, "label": gene, "is_query": gene in genes, "data_source": "BioGRID"}
        for gene in node_set
    ]

    result = {
        "nodes": nodes,
        "edges": edges,
        "source": "BioGRID",
        "query_genes": genes,
        "available": True,
    }

    await cache.set("string-db", cache_params, result)
    return result


# ── MitoCarta3.0 curated mitochondrial gene list (top-200 high-confidence) ──
# Full list: https://www.broadinstitute.org/mitocarta
# These are human genes with strong evidence for mitochondrial localization.
MITOCARTA_GENES: set[str] = {
    "ABCB10", "ACAT1", "ACO2", "AFG3L2", "AIFM1", "AK2", "ALDH2", "ATP5F1A",
    "ATP5F1B", "ATP5F1C", "ATP5F1D", "ATP5F1E", "ATP5MC1", "ATP5MC2", "ATP5MC3",
    "ATP5ME", "ATP5MF", "ATP5MG", "ATP5PB", "ATP5PD", "ATP5PF", "ATP5PO",
    "BAX", "BCL2", "BNIP3", "BNIP3L", "BCS1L", "CLPB", "CLPP", "CLPX",
    "COX4I1", "COX5A", "COX5B", "COX6A1", "COX6B1", "COX6C", "COX7A2",
    "COX7B", "COX7C", "COX8A", "COX10", "COX15", "COX17", "COX20",
    "CPT1A", "CPT2", "CS", "CYB5R3", "CYC1", "CYCS",
    "DHODH", "DIABLO", "DLD", "DLST", "DNM1L",
    "ETFA", "ETFB", "ETFDH",
    "FH", "FIS1", "FUNDC1",
    "GLUD1", "GOT2", "GPX4", "GLS",
    "HADHA", "HADHB", "HCCS", "HK1", "HK2", "HMGCL", "HSPD1", "HSPE1",
    "IDH2", "IDH3A", "IDH3B", "IDH3G", "IMMT",
    "LETM1", "LONP1", "LRPPRC",
    "MAP1LC3B", "MAVS", "MCL1", "MDH2", "ME2", "MFN1", "MFN2", "MICOS10",
    "MICOS13", "MIEF1", "MIEF2", "MRPL3", "MRPL11", "MRPL12", "MRPL13",
    "MRPS18B", "MRPS22", "MRPS28",
    "NDUFA1", "NDUFA2", "NDUFA3", "NDUFA4", "NDUFA5", "NDUFA6", "NDUFA7",
    "NDUFA8", "NDUFA9", "NDUFA10", "NDUFA11", "NDUFA12", "NDUFA13",
    "NDUFB1", "NDUFB2", "NDUFB3", "NDUFB4", "NDUFB5", "NDUFB6", "NDUFB7",
    "NDUFB8", "NDUFB9", "NDUFB10", "NDUFB11",
    "NDUFC1", "NDUFC2", "NDUFS1", "NDUFS2", "NDUFS3", "NDUFS4", "NDUFS5",
    "NDUFS6", "NDUFS7", "NDUFS8", "NDUFV1", "NDUFV2", "NDUFV3",
    "NRF1", "OGG1", "OMA1", "OPA1", "OXPHOS",
    "PARL", "PC", "PDHA1", "PDHB", "PDHX", "PGAM5", "PHB", "PHB2",
    "PINK1", "PITRM1", "POLG", "POLG2", "PPARGC1A", "PPIF", "PRKN",
    "PRDX3", "PRDX5",
    "SDHA", "SDHB", "SDHC", "SDHD", "SLC25A1", "SLC25A3", "SLC25A4",
    "SLC25A5", "SLC25A6", "SLC25A11", "SLC25A12", "SLC25A13",
    "SOD1", "SOD2", "STARD7", "STOML2", "SUCLG1", "SUCLG2", "SURF1",
    "TFAM", "TIMM13", "TIMM17A", "TIMM22", "TIMM23", "TIMM44", "TIMM50",
    "TOMM20", "TOMM22", "TOMM40", "TOMM70",
    "UQCR10", "UQCR11", "UQCRB", "UQCRC1", "UQCRC2", "UQCRFS1", "UQCRH",
    "UQCRQ",
    "VDAC1", "VDAC2", "VDAC3",
    "YME1L1",
}


def _categorize_evidence(edge: dict) -> str:
    """Categorize edge evidence type for coloring."""
    sources = edge.get("sources", [])
    score = edge.get("string_score", 0)
    evidence = edge.get("evidence", [])

    if len(sources) >= 3:
        return "multi-validated"
    if len(sources) >= 2:
        return "cross-validated"
    if any("physical" in str(e).lower() for e in evidence):
        return "experimental"
    if score >= 0.9:
        return "high-confidence"
    if score >= 0.7:
        return "medium-confidence"
    if "BioGRID" in sources or "IntAct" in sources:
        return "experimental"
    return "predicted"


# ── Merge ──


def merge_ppi_sources(
    string_data: dict[str, Any],
    biogrid_data: dict[str, Any],
    intact_data: dict[str, Any] | None = None,
    annotate_mito: bool = True,
    high_confidence_only: bool = False,
) -> dict[str, Any]:
    """
    Merge STRING-DB, BioGRID, and IntAct results into a unified Cytoscape.js graph.

    Args:
        string_data: STRING-DB network data
        biogrid_data: BioGRID interaction data
        intact_data: IntAct interaction data (optional, new source)
        annotate_mito: Add is_mitochondrial flag from MitoCarta3.0
        high_confidence_only: Filter to score > 0.7 or multi-source validated

    Returns:
        {
            "nodes": [{ id, label, is_query, sources, is_mitochondrial }],
            "edges": [{ source, target, score, evidence, sources, evidence_category }],
            "meta": { total_nodes, total_edges, sources_used, high_confidence_count }
        }
    """
    if intact_data is None:
        intact_data = {"nodes": [], "edges": [], "available": False}

    # Merge nodes from all three sources
    node_map: dict[str, dict] = {}

    for source_name, source_data in [
        ("STRING-DB", string_data),
        ("BioGRID", biogrid_data),
        ("IntAct", intact_data),
    ]:
        for node in source_data.get("nodes", []):
            nid = node["id"]
            if nid in node_map:
                if source_name not in node_map[nid]["sources"]:
                    node_map[nid]["sources"].append(source_name)
                # Preserve is_query from any source
                if node.get("is_query"):
                    node_map[nid]["is_query"] = True
            else:
                node_map[nid] = {
                    "id": nid,
                    "label": node.get("label", nid),
                    "is_query": node.get("is_query", False),
                    "sources": [source_name],
                }

    # Annotate mitochondrial localization
    if annotate_mito:
        for nid, node in node_map.items():
            node["is_mitochondrial"] = nid.upper() in MITOCARTA_GENES

    # Merge edges — dedup by (source, target) pair
    edge_key_map: dict[str, dict] = {}

    for edge in string_data.get("edges", []):
        key = tuple(sorted([edge["source"], edge["target"]]))
        str_key = f"{key[0]}_{key[1]}"
        edge_key_map[str_key] = {
            "source": edge["source"],
            "target": edge["target"],
            "string_score": edge.get("score", 0),
            "evidence": [],
            "pubmed_ids": [],
            "sources": ["STRING-DB"],
        }

    for source_name, source_edges in [
        ("BioGRID", biogrid_data.get("edges", [])),
        ("IntAct", intact_data.get("edges", [])),
    ]:
        for edge in source_edges:
            key = tuple(sorted([edge["source"], edge["target"]]))
            str_key = f"{key[0]}_{key[1]}"
            if str_key in edge_key_map:
                if source_name not in edge_key_map[str_key]["sources"]:
                    edge_key_map[str_key]["sources"].append(source_name)
                # Merge evidence
                ev = edge.get("evidence_type") or edge.get("detection_method", "")
                if ev:
                    edge_key_map[str_key]["evidence"].append(ev)
                # Merge PMIDs
                pmids = edge.get("pubmed_ids") or (
                    [edge["pubmed_id"]] if edge.get("pubmed_id") else []
                )
                edge_key_map[str_key]["pubmed_ids"].extend(pmids)
            else:
                ev = edge.get("evidence_type") or edge.get("detection_method", "")
                pmids = edge.get("pubmed_ids") or (
                    [edge["pubmed_id"]] if edge.get("pubmed_id") else []
                )
                edge_key_map[str_key] = {
                    "source": edge["source"],
                    "target": edge["target"],
                    "string_score": 0,
                    "evidence": [ev] if ev else [],
                    "pubmed_ids": list(pmids),
                    "sources": [source_name],
                }

    # Deduplicate PMIDs per edge and add evidence category
    for edge_data in edge_key_map.values():
        edge_data["pubmed_ids"] = list(set(edge_data["pubmed_ids"]))
        edge_data["evidence_category"] = _categorize_evidence(edge_data)

    # High-confidence filtering
    high_confidence_count = 0
    if high_confidence_only:
        filtered = {}
        for k, edge_data in edge_key_map.items():
            score = edge_data.get("string_score", 0)
            n_sources = len(edge_data.get("sources", []))
            if score >= 0.7 or n_sources >= 2:
                filtered[k] = edge_data
                high_confidence_count += 1
        edge_key_map = filtered
    else:
        high_confidence_count = sum(
            1 for e in edge_key_map.values()
            if e.get("string_score", 0) >= 0.7 or len(e.get("sources", [])) >= 2
        )

    sources_used = []
    if string_data.get("nodes"):
        sources_used.append("STRING-DB")
    if biogrid_data.get("nodes") and biogrid_data.get("available", True):
        sources_used.append("BioGRID")
    if intact_data.get("nodes") and intact_data.get("available", True):
        sources_used.append("IntAct")

    mito_count = sum(1 for n in node_map.values() if n.get("is_mitochondrial"))

    return {
        "nodes": list(node_map.values()),
        "edges": list(edge_key_map.values()),
        "meta": {
            "total_nodes": len(node_map),
            "total_edges": len(edge_key_map),
            "sources_used": sources_used,
            "query_genes": string_data.get("query_genes", []),
            "high_confidence_count": high_confidence_count,
            "mitochondrial_node_count": mito_count,
        },
    }
