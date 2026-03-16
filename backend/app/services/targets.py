"""
Kiri — Drug Target Ranking Service
"""

import logging
from typing import Any

from app.services.drugs import fetch_drug_interactions
from app.services.ctd import fetch_chemical_disease_associations
from app.services.chembl import get_bioactivities
from app.core.cache import cache

logger = logging.getLogger("kiri.targets")


async def rank_targets(genes: list[str]) -> list[dict[str, Any]]:
    """
    Rank a list of genes based on their druggability and available evidence.
    A higher score indicates a more promising or better-understood drug target.
    Incorporates DrugBank (MyChem), CTD, and ChEMBL bioactivity data.
    """
    if not genes:
        return []

    cache_key = ",".join(sorted(genes))
    cache_params = {"genes": cache_key}
    cached, hit = await cache.get("target_ranking_v2", cache_params)
    if hit:
        return cached

    rankings = []
    
    for gene in genes:
        # Fetch interactions and associations
        drugs = await fetch_drug_interactions(gene)
        ctd = await fetch_chemical_disease_associations(gene)
        
        # Fetch ChEMBL bioactivity
        try:
            chembl_data = await get_bioactivities(gene, max_results=20)
            chembl_count = chembl_data.get("total_count", 0)
            chembl_activities = chembl_data.get("activities", [])
        except Exception:
            chembl_count = 0
            chembl_activities = []
        
        # Calculate score
        score = 0
        
        # Points for known drugs (DrugBank/MyChem)
        high_evidence_drugs = sum(1 for d in drugs if d.get("evidence_level") == "High")
        medium_evidence_drugs = sum(1 for d in drugs if d.get("evidence_level") == "Medium")
        low_evidence_drugs = sum(1 for d in drugs if d.get("evidence_level") == "Low")
        
        score += (high_evidence_drugs * 10)
        score += (medium_evidence_drugs * 5)
        score += (low_evidence_drugs * 2)
        
        # Points for CTD associations
        total_references = sum(c.get("reference_count", 0) for c in ctd)
        score += min(total_references, 50)  # Cap literature evidence at 50 points
        
        # Points for ChEMBL bioactivity (measured binding affinities)
        potent_hits = sum(
            1 for a in chembl_activities
            if a.get("pchembl_value") and float(a["pchembl_value"]) >= 6.0
        )
        score += min(potent_hits * 3, 30)  # Up to 30 points for potent compounds
        score += min(chembl_count, 20)  # Up to 20 points for total assay coverage
        
        # Tie breaker
        tie_breaker = 1.0 / (ord(gene[0].upper()) + 1)
        
        final_score = round(score + tie_breaker, 2)
        
        rankings.append({
            "gene": gene,
            "score": final_score,
            "drug_count": len(drugs),
            "high_evidence_drugs": high_evidence_drugs,
            "ctd_associations": len(ctd),
            "chembl_bioactivities": chembl_count,
            "total_references": total_references,
            "druggability_tier": _get_druggability_tier(final_score),
        })
        
    # Sort descending by score
    rankings.sort(key=lambda x: x["score"], reverse=True)
    
    await cache.set("target_ranking_v2", cache_params, rankings)
    return rankings


def _get_druggability_tier(score: float) -> str:
    if score >= 50:
        return "Tier 1 (Established)"
    elif score >= 20:
        return "Tier 2 (Emerging)"
    elif score >= 5:
        return "Tier 3 (Experimental)"
    else:
        return "Tier 4 (Novel/Unknown)"
