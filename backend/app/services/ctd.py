"""
Kiri — CTD Integration Service
"""

import logging
from typing import Any

from app.core.cache import cache

logger = logging.getLogger("kiri.ctd")


async def fetch_chemical_disease_associations(gene_symbol: str) -> list[dict[str, Any]]:
    """
    Fetch chemical-disease-gene associations.
    As CTD lacks a robust JSON API for direct on-the-fly queries without CSV parsing,
    this service provides calibrated mock data matching expected CTD formats 
    for the MVP/Phase 7 UI development.
    """
    cache_params = {"gene": gene_symbol.upper()}
    cached, hit = await cache.get("ctd_mock", cache_params)
    if hit:
        return cached

    # Generate synthetic associations calibrated to biological reality
    gene = gene_symbol.upper()
    associations = []
    
    if gene == "EGFR":
        associations = [
            {"chemical": "Gefitinib", "disease": "Carcinoma, Non-Small-Cell Lung", "interaction": "Gefitinib decreases the expression of EGFR mRNA", "reference_count": 42},
            {"chemical": "Arsenic", "disease": "Neoplasms", "interaction": "Arsenic results in increased phosphorylation of EGFR protein", "reference_count": 15},
        ]
    elif gene == "PARL":
        associations = [
            {"chemical": "Rotenone", "disease": "Parkinson Disease", "interaction": "Rotenone affects the localization of PARL protein", "reference_count": 5},
            {"chemical": "Paraquat", "disease": "Neurotoxicity Syndromes", "interaction": "Paraquat increases the abundance of PARL mRNA", "reference_count": 2},
        ]
    elif gene == "MAVS":
        associations = [
            {"chemical": "Poly I:C", "disease": "Virus Diseases", "interaction": "Poly I:C results in increased activity of MAVS protein", "reference_count": 28},
            {"chemical": "Lipopolysaccharides", "disease": "Inflammation", "interaction": "Lipopolysaccharides results in increased expression of MAVS mRNA", "reference_count": 12},
        ]
    else:
        associations = [
            {"chemical": "Acetaminophen", "disease": "Liver Diseases", "interaction": f"Acetaminophen results in altered expression of {gene} mRNA", "reference_count": 1},
        ]

    await cache.set("ctd_mock", cache_params, associations)
    return associations
