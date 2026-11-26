"""
Kiri — Drug Discovery Services
"""

import logging
from typing import Any

import httpx

from app.core.cache import cache
from app.core.config import settings
from app.core.errors import KiriExternalAPIError

logger = logging.getLogger("kiri.drugs")


async def fetch_drug_interactions(gene_symbol: str) -> list[dict[str, Any]]:
    """
    Fetch drug-gene interactions for a given gene symbol from MyChem.info.
    """
    cache_params = {"gene": gene_symbol.upper()}
    cached, hit = await cache.get("drugs_mychem", cache_params)
    if hit:
        return cached

    url = f"{settings.MYCHEM_API_BASE}/query"
    params = {
        "q": f"drugbank.targets.gene_name:{gene_symbol.upper()}",
        "fields": "drugbank.name,drugbank.id,drugbank.pharmacology,drugbank.indication",
        "size": 20,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning(f"Failed to fetch MyChem data for {gene_symbol}: {e}")
        raise KiriExternalAPIError("MyChem.info", f"Could not fetch drug data for {gene_symbol}: {e}")

    results = []
    for hit in data.get("hits", []):
        db = hit.get("drugbank", {})
        # Some records might be lists
        if isinstance(db, list):
            db = db[0] if db else {}
            
        drug_name = db.get("name", "Unknown Drug")
        drug_id = db.get("id", hit.get("_id", ""))
        pharmacology = db.get("pharmacology") or ""
        indication = db.get("indication") or ""

        # Kiri has no evidence grading for drug-target links. An earlier version
        # labelled rows "High" or "Medium" from the length of the description text.
        evidence_level = "Not graded"
        
        results.append({
            "drug_name": drug_name,
            "drug_id": drug_id,
            "pharmacology": pharmacology,
            "indication": indication,
            "evidence_level": evidence_level,
            "source": "DrugBank via MyChem.info"
        })

    await cache.set("drugs_mychem", cache_params, results)
    return results
