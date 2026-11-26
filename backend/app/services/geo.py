"""
Kiri Atlas — GEO Dataset Loader

Verifies GEO accessions for independent validation cohorts. Expression download
is not implemented yet, and no values are generated in its place.
Primary targets: GSE39582 (585 CRC samples), GSE33113 (90 Stage II CRC).

Uses the NCBI GEO API (GEOquery-style) with the Kiri caching layer (24h TTL).
"""

import logging
from typing import Any

import httpx

from app.core.errors import KiriDataUnavailableError, KiriExternalAPIError, KiriValidationError

logger = logging.getLogger("kiri.atlas.geo")

GEO_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
GEO_TIMEOUT = 30.0

# Supported GEO datasets with metadata
SUPPORTED_DATASETS = {
    "GSE39582": {
        "title": "Colon Cancer Molecular Subtypes (Marisa et al., 2013)",
        "platform": "Affymetrix U133 Plus 2.0",
        "samples": 585,
        "cancer_type": "CRC",
        "use": "Primary validation cohort",
    },
    "GSE33113": {
        "title": "Stage II Colon Cancer (de Sousa e Melo et al., 2011)",
        "platform": "Affymetrix U133 Plus 2.0",
        "samples": 90,
        "cancer_type": "Stage II CRC",
        "use": "Stage-specific validation",
    },
}


async def fetch_geo_dataset(
    accession: str,
    genes: list[str],
) -> dict[str, Any]:
    """
    Fetch expression data from a GEO dataset for specified genes.

    Args:
        accession: GEO accession ID (e.g., 'GSE39582')
        genes: List of gene symbols to extract

    Returns:
        Expression matrix + sample metadata in Kiri format

    Raises:
        KiriValidationError: If accession is not in supported datasets
        KiriExternalAPIError: If GEO API is unreachable
    """
    accession = accession.upper().strip()

    if accession not in SUPPORTED_DATASETS:
        raise KiriValidationError(
            f"GEO dataset '{accession}' is not yet supported. "
            f"Supported: {', '.join(SUPPORTED_DATASETS.keys())}",
            source="geo-validation",
        )

    # Verify dataset exists via NCBI esearch
    try:
        dataset_info = await _verify_geo_accession(accession)
    except httpx.HTTPError as e:
        raise KiriExternalAPIError("GEO/NCBI", f"Failed to query GEO: {e}")

    # Kiri does not yet download and parse GEO series matrices. Until it does,
    # it must not return numbers for a GEO dataset: an earlier version generated
    # random values here that were tuned to agree with TCGA.
    raise KiriDataUnavailableError(
        "geo",
        f"GEO dataset {accession} ({dataset_info['count']} NCBI record(s) found) cannot be "
        "loaded yet: Kiri has no GEO expression download. No values were generated.",
    )


async def _verify_geo_accession(accession: str) -> dict:
    """Verify a GEO accession exists via NCBI E-utilities."""
    async with httpx.AsyncClient(timeout=GEO_TIMEOUT) as client:
        resp = await client.get(
            f"{GEO_BASE}/esearch.fcgi",
            params={
                "db": "gds",
                "term": f"{accession}[Accession]",
                "retmode": "json",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    result = data.get("esearchresult", {})
    count = int(result.get("count", 0))

    if count == 0:
        raise KiriValidationError(
            f"GEO accession '{accession}' not found in NCBI database.",
            source="geo-validation",
        )

    return {
        "accession": accession,
        "ncbi_ids": result.get("idlist", []),
        "count": count,
    }


async def list_supported_datasets() -> list[dict]:
    """Return metadata about supported GEO datasets."""
    return [
        {"accession": k, **v}
        for k, v in SUPPORTED_DATASETS.items()
    ]
