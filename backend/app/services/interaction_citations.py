"""
Kiri — Interaction Lab: Citation Linker Service

Searches PubMed for citations supporting protein-protein interactions.
Validates all PMIDs via the Trust Layer before returning.
"""

import logging
from typing import Any

import httpx

from app.core.cache import cache
from app.core.errors import KiriExternalAPIError
from app.services.validation import validate_pmid

logger = logging.getLogger("kiri.interaction.citations")


async def fetch_interaction_citations(
    gene_a: str,
    gene_b: str,
    max_results: int = 10,
) -> dict[str, Any]:
    """
    Search PubMed for papers mentioning both genes in the context of interaction.

    Args:
        gene_a: First gene symbol (e.g., "PARL")
        gene_b: Second gene symbol (e.g., "MAVS")
        max_results: Maximum citations to return

    Returns:
        {
            "gene_a": str,
            "gene_b": str,
            "total_found": int,
            "citations": [
                {
                    "pmid": str,
                    "title": str,
                    "authors": list,
                    "journal": str,
                    "year": str,
                    "validated": bool
                }
            ]
        }
    """
    clean_a = gene_a.strip().upper()
    clean_b = gene_b.strip().upper()

    cache_params = {"gene_a": clean_a, "gene_b": clean_b, "max": max_results}
    cached, hit = await cache.get("pubmed", cache_params)
    if hit:
        return cached

    # Build PubMed search query — co-occurrence of both genes
    query = f"({clean_a}[Title/Abstract]) AND ({clean_b}[Title/Abstract]) AND (interaction[Title/Abstract] OR binding[Title/Abstract] OR cleavage[Title/Abstract] OR complex[Title/Abstract])"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Search for PMIDs
            search_resp = await client.get(
                "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
                params={
                    "db": "pubmed",
                    "term": query,
                    "retmax": max_results,
                    "retmode": "json",
                    "sort": "relevance",
                },
            )
            search_resp.raise_for_status()
            search_data = search_resp.json()

    except httpx.HTTPError as e:
        raise KiriExternalAPIError("PubMed", f"Failed to search citations: {e}")

    id_list = search_data.get("esearchresult", {}).get("idlist", [])
    total_count = int(search_data.get("esearchresult", {}).get("count", 0))

    if not id_list:
        result = {
            "gene_a": clean_a,
            "gene_b": clean_b,
            "total_found": 0,
            "citations": [],
        }
        await cache.set("pubmed", cache_params, result)
        return result

    # Validate each PMID via Trust Layer (also fetches metadata)
    citations = []
    for pmid in id_list:
        try:
            validated = await validate_pmid(pmid)
            if validated.get("valid"):
                citations.append({
                    "pmid": validated["pmid"],
                    "title": validated.get("title", ""),
                    "authors": validated.get("authors", []),
                    "journal": validated.get("journal", ""),
                    "year": validated.get("year", ""),
                    "doi": validated.get("doi", ""),
                    "validated": True,
                })
            else:
                citations.append({
                    "pmid": pmid,
                    "title": "",
                    "authors": [],
                    "journal": "",
                    "year": "",
                    "doi": "",
                    "validated": False,
                })
        except Exception as e:
            logger.warning(f"Failed to validate PMID {pmid}: {e}")
            citations.append({
                "pmid": pmid,
                "title": "",
                "validated": False,
            })

    result = {
        "gene_a": clean_a,
        "gene_b": clean_b,
        "total_found": total_count,
        "citations": citations,
    }

    await cache.set("pubmed", cache_params, result)
    return result
