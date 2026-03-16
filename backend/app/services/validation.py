"""
Kiri Trust Layer — Validation Services

Gene symbol validation (HGNC), PMID validation (PubMed), and input sanitization.
These run BEFORE any computation — bad input never reaches the analysis pipeline.
"""

import logging
import re
from typing import Any

import httpx

from app.core.cache import cache
from app.core.errors import KiriExternalAPIError, KiriValidationError

logger = logging.getLogger("kiri.trust")


# ── Gene Symbol Validation ──


async def validate_gene_symbol(symbol: str) -> dict[str, Any]:
    """
    Validate a gene symbol against HGNC via MyGene.info.

    Returns:
        dict with 'valid', 'symbol', 'name', 'hgnc' fields.

    Raises:
        KiriValidationError if the symbol is malformed.
        KiriExternalAPIError if MyGene.info is unreachable.
    """
    # Basic format check
    cleaned = symbol.strip().upper()
    if not re.match(r"^[A-Z0-9\-]+$", cleaned):
        raise KiriValidationError(
            f"Invalid gene symbol format: '{symbol}'. Expected uppercase alphanumeric (e.g., PARL, MAVS).",
            source="hgnc-validation",
        )

    # Check cache first
    cached, hit = await cache.get("mygene", {"symbol": cleaned})
    if hit:
        return cached

    # Query MyGene.info
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://mygene.info/v3/query",
                params={
                    "q": f"symbol:{cleaned}",
                    "species": "human",
                    "fields": "symbol,name,HGNC,alias",
                    "size": 3,
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as e:
        raise KiriExternalAPIError("MyGene.info", f"Failed to validate gene symbol: {e}")

    hits = data.get("hits", [])
    if not hits:
        result = {
            "valid": False,
            "symbol": cleaned,
            "name": None,
            "hgnc": None,
            "suggestion": None,
        }
    else:
        top = hits[0]
        result = {
            "valid": True,
            "symbol": top.get("symbol", cleaned),
            "name": top.get("name", ""),
            "hgnc": top.get("HGNC", ""),
            "aliases": top.get("alias", []) if isinstance(top.get("alias"), list) else [],
        }

    # Cache the result
    await cache.set("mygene", {"symbol": cleaned}, result)
    return result


async def validate_gene_list(symbols: list[str]) -> dict[str, Any]:
    """
    Validate a list of gene symbols. Returns per-symbol results.

    Returns:
        dict with 'valid_genes', 'invalid_genes', 'all_valid'
    """
    results = {}
    valid = []
    invalid = []

    for sym in symbols:
        try:
            result = await validate_gene_symbol(sym)
            results[sym] = result
            if result["valid"]:
                valid.append(result["symbol"])
            else:
                invalid.append(sym)
        except KiriValidationError:
            invalid.append(sym)
            results[sym] = {"valid": False, "symbol": sym, "error": "format"}

    return {
        "results": results,
        "valid_genes": valid,
        "invalid_genes": invalid,
        "all_valid": len(invalid) == 0,
    }


# ── PMID Validation ──


async def validate_pmid(pmid: str) -> dict[str, Any]:
    """
    Validate a PubMed ID by checking it exists in PubMed.
    This is the anti-hallucination gate for the AI Discovery module.

    Returns:
        dict with 'valid', 'pmid', 'title', 'authors', 'journal', 'year'
    """
    cleaned = pmid.strip()

    # Basic format check — PMIDs are numeric
    if not re.match(r"^\d+$", cleaned):
        return {
            "valid": False,
            "pmid": cleaned,
            "error": "PMID must be numeric",
        }

    # Check cache
    cached, hit = await cache.get("pubmed", {"pmid": cleaned})
    if hit:
        return cached

    # Query PubMed
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
                params={
                    "db": "pubmed",
                    "id": cleaned,
                    "retmode": "json",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as e:
        raise KiriExternalAPIError("PubMed", f"Failed to validate PMID: {e}")

    result_data = data.get("result", {})
    article = result_data.get(cleaned, {})

    if "error" in article or not article.get("title"):
        result = {
            "valid": False,
            "pmid": cleaned,
            "error": "PMID not found in PubMed",
        }
    else:
        authors = article.get("authors", [])
        result = {
            "valid": True,
            "pmid": cleaned,
            "title": article.get("title", ""),
            "authors": [a.get("name", "") for a in authors[:5]],
            "journal": article.get("fulljournalname", article.get("source", "")),
            "year": article.get("pubdate", "")[:4],
            "doi": article.get("elocationid", ""),
        }

    await cache.set("pubmed", {"pmid": cleaned}, result)
    return result


async def validate_pmid_list(pmids: list[str]) -> dict[str, Any]:
    """
    Validate a list of PMIDs. Returns per-PMID results.
    Used to batch-check AI-generated citations.

    Returns:
        dict with 'results', 'valid_count', 'invalid_count', 'quarantined'
    """
    results = {}
    valid_count = 0
    quarantined = []

    for pmid in pmids:
        result = await validate_pmid(pmid)
        results[pmid] = result
        if result.get("valid"):
            valid_count += 1
        else:
            quarantined.append(pmid)

    return {
        "results": results,
        "valid_count": valid_count,
        "invalid_count": len(quarantined),
        "quarantined": quarantined,
        "all_valid": len(quarantined) == 0,
    }
