"""
Kiri — Protein Co-occurrence Suggestion Service

Suggests related proteins based on PubMed literature co-occurrence.
Used during project creation to recommend additional targets.
"""

import logging
import re
from typing import Any

import httpx

from app.core.cache import cache
from app.core.config import settings
from app.core.errors import KiriExternalAPIError

logger = logging.getLogger("kiri.suggest")

PUBMED_TIMEOUT = 15.0

# Common gene symbols that appear in many papers — filter these out
_NOISE_GENES = {
    "THE", "AND", "FOR", "NOT", "ARE", "WAS", "HAS", "CAN", "ALL",
    "SET", "MAP", "RAN", "GAP", "REST", "MET", "IMPACT", "LARGE",
    "MICE", "CELL", "LINE", "GENE", "TYPE", "LIKE", "RISK", "FAST",
    "CLIP", "MARK", "TRAP", "TANK", "CHIP", "PEAK", "STAT",
}

# Simple pattern to match potential gene symbols in text
_GENE_PATTERN = re.compile(r"\b([A-Z][A-Z0-9]{1,10})\b")


async def suggest_related_proteins(
    query_genes: list[str],
    max_suggestions: int = 10,
) -> list[dict[str, Any]]:
    """
    Suggest proteins co-occurring with the query genes in PubMed literature.

    Strategy:
    1. Search PubMed for papers mentioning the query gene(s)
    2. Extract potential gene symbols from titles
    3. Count co-occurrence frequency
    4. Return top suggestions ranked by frequency
    """
    cache_params = {"genes": sorted(g.upper() for g in query_genes), "max": max_suggestions}
    cached, hit = await cache.get("pubmed_suggest", cache_params)
    if hit:
        return cached

    query_upper = {g.upper() for g in query_genes}
    gene_search = " OR ".join(f"{g}[Title/Abstract]" for g in query_genes)

    try:
        # Step 1: Search PubMed for relevant papers
        async with httpx.AsyncClient(timeout=PUBMED_TIMEOUT) as client:
            # Get PMIDs
            search_resp = await client.get(
                f"{settings.PUBMED_API_BASE}/esearch.fcgi",
                params={
                    "db": "pubmed",
                    "term": gene_search,
                    "retmax": "100",
                    "retmode": "json",
                    "sort": "relevance",
                },
            )
            search_resp.raise_for_status()
            search_data = search_resp.json()

            pmids = search_data.get("esearchresult", {}).get("idlist", [])
            if not pmids:
                return []

            # Step 2: Fetch titles and abstracts
            summary_resp = await client.get(
                f"{settings.PUBMED_API_BASE}/esummary.fcgi",
                params={
                    "db": "pubmed",
                    "id": ",".join(pmids[:50]),
                    "retmode": "json",
                },
            )
            summary_resp.raise_for_status()
            summary_data = summary_resp.json()

    except httpx.HTTPError as e:
        raise KiriExternalAPIError(
            "PubMed", f"Failed to fetch co-occurrence data: {e}"
        )

    # Step 3: Extract gene symbols from titles
    co_occurrence: dict[str, int] = {}
    result_items = summary_data.get("result", {})

    for pmid in pmids[:50]:
        entry = result_items.get(pmid, {})
        title = entry.get("title", "")

        # Find potential gene symbols in the title
        matches = _GENE_PATTERN.findall(title)
        for match in matches:
            if (
                match not in query_upper
                and match not in _NOISE_GENES
                and len(match) >= 2
            ):
                co_occurrence[match] = co_occurrence.get(match, 0) + 1

    # Step 4: Rank by frequency and return top suggestions
    ranked = sorted(co_occurrence.items(), key=lambda x: x[1], reverse=True)

    suggestions = []
    for symbol, count in ranked[:max_suggestions]:
        suggestions.append({
            "gene_symbol": symbol,
            "co_occurrence_count": count,
            "source": "PubMed co-occurrence",
        })

    await cache.set("pubmed_suggest", cache_params, suggestions)
    return suggestions
