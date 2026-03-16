"""
Kiri — ChEMBL Bioactivity Service

Fetches bioactivity data (IC50, Ki, Kd) from ChEMBL (EMBL-EBI).
Provides experimentally measured binding affinities for drug-target pairs.
"""

import logging
from typing import Any

import httpx

from app.core.cache import cache
from app.core.config import settings
from app.core.errors import KiriExternalAPIError

logger = logging.getLogger("kiri.chembl")

CHEMBL_HEADERS = {"Accept": "application/json"}


async def resolve_target(gene_symbol: str) -> dict[str, Any] | None:
    """
    Resolve a gene symbol to its ChEMBL target ID.

    Args:
        gene_symbol: HGNC gene symbol (e.g., "EGFR")

    Returns:
        Target metadata including chembl_id, or None if not found.
    """
    cache_params = {"gene": gene_symbol.upper(), "op": "resolve"}
    cached, hit = await cache.get("chembl_target", cache_params)
    if hit:
        return cached

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{settings.CHEMBL_API_BASE}/target/search.json",
                params={
                    "q": gene_symbol.upper(),
                    "limit": 5,
                },
                headers=CHEMBL_HEADERS,
            )

            if resp.status_code == 404:
                return None

            resp.raise_for_status()
            data = resp.json()

    except httpx.HTTPError as e:
        raise KiriExternalAPIError("ChEMBL", f"Failed to resolve target {gene_symbol}: {e}")

    targets = data.get("targets", [])
    if not targets:
        return None

    # Prefer single-protein targets for the gene symbol (most specific)
    best = None
    for t in targets:
        pref_name = (t.get("pref_name") or "").upper()
        target_type = t.get("target_type", "")
        if gene_symbol.upper() in pref_name and target_type == "SINGLE PROTEIN":
            best = t
            break

    if not best:
        best = targets[0]

    result = {
        "chembl_id": best.get("target_chembl_id", ""),
        "pref_name": best.get("pref_name", ""),
        "target_type": best.get("target_type", ""),
        "organism": best.get("organism", ""),
        "gene_symbol": gene_symbol.upper(),
        "source": "ChEMBL (EMBL-EBI)",
    }

    await cache.set("chembl_target", cache_params, result)
    return result


async def get_bioactivities(
    gene_symbol: str,
    activity_type: str | None = None,
    max_results: int = 20,
) -> dict[str, Any]:
    """
    Fetch bioactivity data (IC50, Ki, Kd, EC50) for a gene target from ChEMBL.

    Args:
        gene_symbol: HGNC gene symbol.
        activity_type: Optional filter (e.g., "IC50", "Ki").
        max_results: Maximum activities to return.

    Returns:
        Dict with target info and list of bioactivities.
    """
    cache_params = {
        "gene": gene_symbol.upper(),
        "type": activity_type or "all",
        "max": max_results,
    }
    cached, hit = await cache.get("chembl_activity", cache_params)
    if hit:
        return cached

    # Resolve gene to ChEMBL target ID
    target = await resolve_target(gene_symbol)
    if not target or not target.get("chembl_id"):
        return {
            "gene_symbol": gene_symbol.upper(),
            "target": None,
            "activities": [],
            "total_count": 0,
            "source": "ChEMBL (EMBL-EBI)",
        }

    chembl_id = target["chembl_id"]

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            params: dict[str, Any] = {
                "target_chembl_id": chembl_id,
                "limit": max_results,
                "offset": 0,
            }
            # Filter by standard activity types common in drug discovery
            if activity_type:
                params["standard_type"] = activity_type
            else:
                params["standard_type__in"] = "IC50,Ki,Kd,EC50"

            resp = await client.get(
                f"{settings.CHEMBL_API_BASE}/activity.json",
                params=params,
                headers=CHEMBL_HEADERS,
            )

            if resp.status_code == 404:
                return {
                    "gene_symbol": gene_symbol.upper(),
                    "target": target,
                    "activities": [],
                    "total_count": 0,
                    "source": "ChEMBL (EMBL-EBI)",
                }

            resp.raise_for_status()
            data = resp.json()

    except httpx.HTTPError as e:
        raise KiriExternalAPIError(
            "ChEMBL", f"Failed to fetch bioactivities for {gene_symbol}: {e}"
        )

    activities = []
    for act in data.get("activities", []):
        std_value = act.get("standard_value")
        activities.append({
            "molecule_chembl_id": act.get("molecule_chembl_id", ""),
            "molecule_name": act.get("molecule_pref_name") or act.get("canonical_smiles", "Unknown"),
            "activity_type": act.get("standard_type", ""),
            "value": float(std_value) if std_value else None,
            "units": act.get("standard_units", ""),
            "relation": act.get("standard_relation", "="),
            "assay_type": act.get("assay_type", ""),
            "assay_description": act.get("assay_description", ""),
            "pmid": act.get("document_chembl_id", ""),
            "pchembl_value": act.get("pchembl_value"),
            "data_validity_comment": act.get("data_validity_comment", ""),
            "source": "ChEMBL (EMBL-EBI)",
        })

    # Sort by pChEMBL value (higher = more potent) if available
    activities.sort(
        key=lambda a: float(a["pchembl_value"]) if a.get("pchembl_value") else 0,
        reverse=True,
    )

    result = {
        "gene_symbol": gene_symbol.upper(),
        "target": target,
        "activities": activities,
        "total_count": data.get("page_meta", {}).get("total_count", len(activities)),
        "source": "ChEMBL (EMBL-EBI)",
    }

    await cache.set("chembl_activity", cache_params, result)
    return result


async def get_bioactivities_multi(
    genes: list[str],
    max_per_gene: int = 10,
) -> dict[str, Any]:
    """
    Fetch bioactivities for multiple genes. Returns a dict keyed by gene symbol.
    """
    results = {}
    for gene in genes:
        results[gene.upper()] = await get_bioactivities(gene, max_results=max_per_gene)
    return results
