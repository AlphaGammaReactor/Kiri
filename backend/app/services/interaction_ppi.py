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


# ── Merge ──


def merge_ppi_sources(
    string_data: dict[str, Any],
    biogrid_data: dict[str, Any],
) -> dict[str, Any]:
    """
    Merge STRING-DB and BioGRID results into a unified Cytoscape.js graph.

    Returns:
        {
            "nodes": [{ id, label, is_query, sources }],
            "edges": [{ source, target, score, evidence, sources }],
            "meta": { total_nodes, total_edges, sources_used }
        }
    """
    # Merge nodes
    node_map: dict[str, dict] = {}

    for node in string_data.get("nodes", []):
        nid = node["id"]
        node_map[nid] = {
            "id": nid,
            "label": node.get("label", nid),
            "is_query": node.get("is_query", False),
            "sources": ["STRING-DB"],
        }

    for node in biogrid_data.get("nodes", []):
        nid = node["id"]
        if nid in node_map:
            if "BioGRID" not in node_map[nid]["sources"]:
                node_map[nid]["sources"].append("BioGRID")
        else:
            node_map[nid] = {
                "id": nid,
                "label": node.get("label", nid),
                "is_query": node.get("is_query", False),
                "sources": ["BioGRID"],
            }

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

    for edge in biogrid_data.get("edges", []):
        key = tuple(sorted([edge["source"], edge["target"]]))
        str_key = f"{key[0]}_{key[1]}"
        if str_key in edge_key_map:
            edge_key_map[str_key]["sources"].append("BioGRID")
            if edge.get("evidence_type"):
                edge_key_map[str_key]["evidence"].append(edge["evidence_type"])
            if edge.get("pubmed_id"):
                edge_key_map[str_key]["pubmed_ids"].append(edge["pubmed_id"])
        else:
            edge_key_map[str_key] = {
                "source": edge["source"],
                "target": edge["target"],
                "string_score": 0,
                "evidence": [edge.get("evidence_type", "")] if edge.get("evidence_type") else [],
                "pubmed_ids": [edge.get("pubmed_id", "")] if edge.get("pubmed_id") else [],
                "sources": ["BioGRID"],
            }

    sources_used = []
    if string_data.get("nodes"):
        sources_used.append("STRING-DB")
    if biogrid_data.get("nodes") and biogrid_data.get("available", True):
        sources_used.append("BioGRID")

    return {
        "nodes": list(node_map.values()),
        "edges": list(edge_key_map.values()),
        "meta": {
            "total_nodes": len(node_map),
            "total_edges": len(edge_key_map),
            "sources_used": sources_used,
            "query_genes": string_data.get("query_genes", []),
        },
    }
