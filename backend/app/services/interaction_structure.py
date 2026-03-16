"""
Kiri — Interaction Lab: Protein Structure Service

Fetches predicted protein structures from AlphaFold DB.
Returns structure metadata + PDB file URL for 3D rendering.
"""

import logging
from typing import Any

import httpx

from app.core.cache import cache
from app.core.config import settings
from app.core.errors import KiriExternalAPIError

logger = logging.getLogger("kiri.interaction.structure")

# Known UniProt IDs for PARL-MAVS axis genes (from research_brief.md)
GENE_UNIPROT_MAP = {
    "PARL": "Q9H300",
    "MAVS": "Q7Z434",
    "DDX58": "O95786",
    "IRF3": "Q14653",
    "IFNB1": "P01574",
}


async def fetch_alphafold_structure(uniprot_id: str) -> dict[str, Any]:
    """
    Fetch predicted protein structure from AlphaFold DB.

    Args:
        uniprot_id: UniProt accession (e.g., "Q9H300" for PARL)

    Returns:
        Structure metadata including PDB file URL, pLDDT scores, and model info.
    """
    cleaned = uniprot_id.strip().upper()

    # Check cache (30d TTL)
    cache_params = {"uniprot_id": cleaned}
    cached, hit = await cache.get("alphafold", cache_params)
    if hit:
        logger.info(f"AlphaFold cache hit for {cleaned}")
        return cached

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Fetch prediction metadata
            resp = await client.get(
                f"{settings.ALPHAFOLD_API_BASE}/prediction/{cleaned}",
            )

            if resp.status_code == 404:
                return {
                    "found": False,
                    "uniprot_id": cleaned,
                    "error": f"No AlphaFold prediction found for {cleaned}",
                }

            resp.raise_for_status()
            predictions = resp.json()

    except httpx.HTTPError as e:
        raise KiriExternalAPIError(
            "AlphaFold", f"Failed to fetch structure for {cleaned}: {e}"
        )

    if not predictions:
        return {
            "found": False,
            "uniprot_id": cleaned,
            "error": "No predictions returned",
        }

    # Use the first (latest) prediction
    pred = predictions[0] if isinstance(predictions, list) else predictions

    result = {
        "found": True,
        "uniprot_id": cleaned,
        "entry_id": pred.get("entryId", f"AF-{cleaned}-F1"),
        "gene": pred.get("gene", ""),
        "organism": pred.get("organismScientificName", "Homo sapiens"),
        "model_url": pred.get("pdbUrl", ""),
        "cif_url": pred.get("cifUrl", ""),
        "pae_image_url": pred.get("paeImageUrl", ""),
        "pae_doc_url": pred.get("paeDocUrl", ""),
        "model_created": pred.get("modelCreatedDate", ""),
        "sequence_length": pred.get("uniprotEnd", 0) - pred.get("uniprotStart", 0) + 1,
        "uniprot_start": pred.get("uniprotStart", 1),
        "uniprot_end": pred.get("uniprotEnd", 0),
        "confidence_version": pred.get("latestVersion", 4),
        # pLDDT thresholds for coloring:
        # >90 very high (blue), 70-90 confident (cyan), 50-70 low (yellow), <50 very low (orange)
        "plddt_thresholds": {
            "very_high": 90,
            "confident": 70,
            "low": 50,
            "very_low": 0,
        },
    }

    await cache.set("alphafold", cache_params, result)
    return result


def resolve_uniprot_id(gene_symbol: str) -> str | None:
    """
    Resolve a gene symbol to its UniProt ID using the known mapping.

    Args:
        gene_symbol: HGNC gene symbol (e.g., "PARL")

    Returns:
        UniProt ID or None if unknown.
    """
    return GENE_UNIPROT_MAP.get(gene_symbol.strip().upper())
