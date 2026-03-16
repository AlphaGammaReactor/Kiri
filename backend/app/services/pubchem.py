"""
Kiri — PubChem Compound Service

Searches and retrieves compound data from PubChem (NIH/NCBI).
Provides compound properties, descriptions, and cross-references.
"""

import logging
from typing import Any

import httpx

from app.core.cache import cache
from app.core.config import settings
from app.core.errors import KiriExternalAPIError

logger = logging.getLogger("kiri.pubchem")


async def search_compounds(query: str, max_results: int = 10) -> list[dict[str, Any]]:
    """
    Search PubChem for compounds by name, SMILES, or InChI.

    Args:
        query: Compound name, SMILES string, or InChI key.
        max_results: Maximum results to return.

    Returns:
        List of compound summaries with CID, name, formula, and properties.
    """
    cache_params = {"query": query.strip().lower(), "max": max_results}
    cached, hit = await cache.get("pubchem_search", cache_params)
    if hit:
        return cached

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Step 1: Search for CIDs by name
            search_resp = await client.get(
                f"{settings.PUBCHEM_API_BASE}/compound/name/{query}/cids/JSON",
            )

            if search_resp.status_code == 404:
                # Try as SMILES
                search_resp = await client.post(
                    f"{settings.PUBCHEM_API_BASE}/compound/smiles/cids/JSON",
                    data={"smiles": query},
                )

            if search_resp.status_code == 404:
                return []

            search_resp.raise_for_status()
            data = search_resp.json()
            cids = data.get("IdentifierList", {}).get("CID", [])[:max_results]

            if not cids:
                return []

            # Step 2: Fetch properties for found CIDs
            cids_str = ",".join(str(c) for c in cids)
            props_resp = await client.get(
                f"{settings.PUBCHEM_API_BASE}/compound/cid/{cids_str}/property/"
                "MolecularFormula,MolecularWeight,XLogP,TPSA,"
                "HBondDonorCount,HBondAcceptorCount,IUPACName,"
                "CanonicalSMILES,InChIKey/JSON",
            )
            props_resp.raise_for_status()
            props_data = props_resp.json()

    except httpx.HTTPError as e:
        raise KiriExternalAPIError("PubChem", f"Failed to search compounds: {e}")

    results = []
    for prop in props_data.get("PropertyTable", {}).get("Properties", []):
        results.append({
            "cid": prop.get("CID"),
            "name": query.title(),
            "iupac_name": prop.get("IUPACName", ""),
            "molecular_formula": prop.get("MolecularFormula", ""),
            "molecular_weight": prop.get("MolecularWeight", 0),
            "xlogp": prop.get("XLogP"),
            "tpsa": prop.get("TPSA"),
            "hbond_donors": prop.get("HBondDonorCount", 0),
            "hbond_acceptors": prop.get("HBondAcceptorCount", 0),
            "canonical_smiles": prop.get("CanonicalSMILES", ""),
            "inchi_key": prop.get("InChIKey", ""),
            "source": "PubChem (NIH/NCBI)",
        })

    await cache.set("pubchem_search", cache_params, results)
    return results


async def get_compound_description(cid: int) -> dict[str, Any]:
    """
    Get the pharmacological description of a compound by CID.

    Returns:
        Dict with title, description, and cross-references.
    """
    cache_params = {"cid": cid}
    cached, hit = await cache.get("pubchem_desc", cache_params)
    if hit:
        return cached

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{settings.PUBCHEM_API_BASE}/compound/cid/{cid}/description/JSON",
            )
            if resp.status_code == 404:
                return {"cid": cid, "descriptions": [], "source": "PubChem"}
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as e:
        raise KiriExternalAPIError("PubChem", f"Failed to get description for CID {cid}: {e}")

    descriptions = []
    for info in data.get("InformationList", {}).get("Information", []):
        desc_text = info.get("Description", "")
        if desc_text:
            descriptions.append({
                "title": info.get("Title", ""),
                "description": desc_text,
                "source_name": info.get("DescriptionSourceName", ""),
                "url": info.get("DescriptionURL", ""),
            })

    result = {
        "cid": cid,
        "descriptions": descriptions[:5],  # Cap at 5 descriptions
        "source": "PubChem (NIH/NCBI)",
    }

    await cache.set("pubchem_desc", cache_params, result)
    return result


async def get_compounds_for_gene(gene_symbol: str, max_results: int = 10) -> list[dict[str, Any]]:
    """
    Find PubChem compounds that are associated with a gene target.
    Uses the PubChem PUG REST API to search for bioassays linked to the gene.
    """
    cache_params = {"gene": gene_symbol.upper(), "max": max_results}
    cached, hit = await cache.get("pubchem_gene", cache_params)
    if hit:
        return cached

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            # Search for compounds via gene name in assay descriptions
            resp = await client.get(
                f"{settings.PUBCHEM_API_BASE}/compound/name/{gene_symbol}/cids/JSON",
                params={"name_type": "word"},
            )

            if resp.status_code == 404:
                # Fallback: search compounds as a drug target name
                return await search_compounds(gene_symbol, max_results)

            resp.raise_for_status()
            data = resp.json()
            cids = data.get("IdentifierList", {}).get("CID", [])[:max_results]

            if not cids:
                return await search_compounds(gene_symbol, max_results)

            # Fetch properties
            cids_str = ",".join(str(c) for c in cids)
            props_resp = await client.get(
                f"{settings.PUBCHEM_API_BASE}/compound/cid/{cids_str}/property/"
                "MolecularFormula,MolecularWeight,XLogP,TPSA,"
                "HBondDonorCount,HBondAcceptorCount,IUPACName,"
                "CanonicalSMILES,InChIKey/JSON",
            )
            props_resp.raise_for_status()
            props_data = props_resp.json()

    except httpx.HTTPError as e:
        logger.warning(f"PubChem gene lookup failed for {gene_symbol}: {e}")
        return []

    results = []
    for prop in props_data.get("PropertyTable", {}).get("Properties", []):
        results.append({
            "cid": prop.get("CID"),
            "name": prop.get("IUPACName", f"CID-{prop.get('CID', '')}"),
            "iupac_name": prop.get("IUPACName", ""),
            "molecular_formula": prop.get("MolecularFormula", ""),
            "molecular_weight": prop.get("MolecularWeight", 0),
            "xlogp": prop.get("XLogP"),
            "tpsa": prop.get("TPSA"),
            "hbond_donors": prop.get("HBondDonorCount", 0),
            "hbond_acceptors": prop.get("HBondAcceptorCount", 0),
            "canonical_smiles": prop.get("CanonicalSMILES", ""),
            "inchi_key": prop.get("InChIKey", ""),
            "target_gene": gene_symbol.upper(),
            "source": "PubChem (NIH/NCBI)",
        })

    await cache.set("pubchem_gene", cache_params, results)
    return results
