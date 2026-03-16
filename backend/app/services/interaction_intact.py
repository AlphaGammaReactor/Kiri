"""
Kiri — Interaction Lab: IntAct API Integration

Fetches physical molecular interaction data from the IntAct database
(EMBL-EBI). Returns node/edge structure compatible with the existing
PPI merge pipeline (STRING-DB + BioGRID + IntAct).

All results cached via the Kiri cache layer (7d TTL).
"""

import logging
from typing import Any

import httpx

from app.core.cache import cache
from app.core.errors import KiriExternalAPIError

logger = logging.getLogger("kiri.interaction.intact")

INTACT_SEARCH_URL = "https://www.ebi.ac.uk/intact/ws/interaction/findInteractor"


async def fetch_intact_interactions(
    genes: list[str],
    species: int = 9606,
    max_results: int = 200,
) -> dict[str, Any]:
    """
    Fetch physical interaction data from IntAct for a list of gene symbols.

    Args:
        genes: List of gene symbols (e.g., ["PARL", "MAVS"])
        species: NCBI taxonomy ID (9606 = Homo sapiens)
        max_results: Maximum interactions to retrieve per gene

    Returns:
        {
            "nodes": [{ id, label, is_query, data_source }],
            "edges": [{ source, target, detection_method, interaction_type, pmid, data_source }],
            "source": "IntAct",
            "query_genes": [...],
            "available": bool

        }
    """
    cache_params = {"genes": sorted(genes), "species": species, "source": "intact"}
    cached, hit = await cache.get("intact", cache_params)
    if hit and cached:
        logger.info(f"IntAct cache hit for {genes}")
        return cached

    node_set: set[str] = set()
    edges: list[dict[str, Any]] = []

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            for gene in genes:
                gene_upper = gene.strip().upper()

                last_err = None
                for attempt in range(3):
                    try:
                        resp = await client.get(
                            f"{INTACT_SEARCH_URL}/{gene_upper}",
                            params={
                                "Format": "json",
                                "taxId": species,
                                "first": 0,
                                "number": max_results,
                            },
                            headers={"Accept": "application/json"},
                        )
                        resp.raise_for_status()
                        last_err = None
                        break
                    except httpx.HTTPError as e:
                        last_err = e
                        if attempt < 2:
                            import asyncio
                            wait = 2 ** attempt
                            logger.warning(
                                f"IntAct attempt {attempt+1}/3 failed for {gene_upper}, "
                                f"retrying in {wait}s: {e}"
                            )
                            await asyncio.sleep(wait)

                if last_err is not None:
                    logger.warning(f"IntAct failed for {gene_upper} after 3 attempts: {last_err}")
                    continue

                try:
                    data = resp.json()
                except Exception:
                    logger.warning(f"IntAct returned non-JSON for {gene_upper}")
                    continue

                # IntAct returns a list of interaction objects
                interactions = data if isinstance(data, list) else data.get("content", [])

                for interaction in interactions:
                    # Extract interactor identifiers
                    interactor_a = _extract_gene_symbol(interaction, "interactorA")
                    interactor_b = _extract_gene_symbol(interaction, "interactorB")

                    if not interactor_a or not interactor_b:
                        continue

                    node_set.add(interactor_a)
                    node_set.add(interactor_b)

                    # Extract evidence metadata
                    detection = interaction.get("detectionMethod", "")
                    interaction_type = interaction.get("type", "")
                    pmids = _extract_pmids(interaction)

                    edges.append({
                        "source": interactor_a,
                        "target": interactor_b,
                        "detection_method": detection,
                        "interaction_type": interaction_type,
                        "pubmed_ids": pmids,
                        "data_source": "IntAct",
                    })

    except Exception as e:
        logger.warning(f"IntAct API unexpected error: {e}")
        return {
            "nodes": [],
            "edges": [],
            "source": "IntAct",
            "query_genes": genes,
            "available": False,
        }

    # Deduplicate edges by (source, target) pair
    seen_pairs: set[str] = set()
    unique_edges: list[dict] = []
    for edge in edges:
        pair_key = "_".join(sorted([edge["source"], edge["target"]]))
        if pair_key not in seen_pairs:
            seen_pairs.add(pair_key)
            unique_edges.append(edge)

    nodes = [
        {
            "id": gene,
            "label": gene,
            "is_query": gene in [g.upper() for g in genes],
            "data_source": "IntAct",
        }
        for gene in node_set
    ]

    result = {
        "nodes": nodes,
        "edges": unique_edges,
        "source": "IntAct",
        "query_genes": genes,
        "available": True,
    }

    await cache.set("intact", cache_params, result)
    return result


def _extract_gene_symbol(interaction: dict, key: str) -> str:
    """
    Extract gene symbol from an IntAct interaction object.

    IntAct returns interactors in various formats; we try
    preferredName → geneName → shortName.
    """
    interactor = interaction.get(key, {})
    if isinstance(interactor, str):
        return interactor.upper()

    # Try multiple fields
    for field in ["preferredName", "geneName", "shortName", "identifier"]:
        val = interactor.get(field)
        if val and isinstance(val, str):
            # Strip species prefix if present (e.g., "9606:PARL")
            if ":" in val:
                val = val.split(":")[-1]
            return val.upper()

    return ""


def _extract_pmids(interaction: dict) -> list[str]:
    """Extract PubMed IDs from an IntAct interaction object."""
    pmids = []

    # Try publication field
    pubs = interaction.get("publications", [])
    if isinstance(pubs, list):
        for pub in pubs:
            if isinstance(pub, dict):
                pmid = pub.get("pmid") or pub.get("pubmedId")
                if pmid:
                    pmids.append(str(pmid))
            elif isinstance(pub, str) and pub.isdigit():
                pmids.append(pub)

    # Try identifiers field
    identifiers = interaction.get("identifiers", [])
    if isinstance(identifiers, list):
        for ident in identifiers:
            if isinstance(ident, dict) and ident.get("database") == "pubmed":
                pmids.append(str(ident.get("identifier", "")))

    return list(set(pmids))
