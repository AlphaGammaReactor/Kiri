"""
Kiri — Drug Target Ranking Service
"""

import logging
from typing import Any

from app.services.drugs import fetch_drug_interactions
from app.services.chembl import get_bioactivities
from app.core.cache import cache

logger = logging.getLogger("kiri.targets")


async def rank_targets(genes: list[str]) -> list[dict[str, Any]]:
    """
    Rank a list of genes based on their druggability and available evidence.
    A higher score indicates a more promising or better-understood drug target.
    Uses DrugBank (via MyChem.info) and ChEMBL bioactivity data. CTD is not
    integrated, so literature associations do not contribute to the score.
    The score is a simple Kiri heuristic, not a published druggability metric.
    """
    if not genes:
        return []

    cache_key = ",".join(sorted(genes))
    cache_params = {"genes": cache_key}
    cached, hit = await cache.get("target_ranking_v3", cache_params)
    if hit:
        return cached

    rankings = []
    
    for gene in genes:
        # Fetch interactions and associations
        drugs = await fetch_drug_interactions(gene)
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
        
        # Points for known drugs (DrugBank/MyChem). Drugs are not evidence-graded.
        score += len(drugs) * 5

        # Points for ChEMBL bioactivity (measured binding affinities)
        potent_hits = sum(
            1 for a in chembl_activities
            if a.get("pchembl_value") and float(a["pchembl_value"]) >= 6.0
        )
        score += min(potent_hits * 3, 30)  # Up to 30 points for potent compounds
        score += min(chembl_count, 20)  # Up to 20 points for total assay coverage
        
        final_score = round(float(score), 2)

        rankings.append({
            "gene": gene,
            "score": final_score,
            "drug_count": len(drugs),
            "high_evidence_drugs": None,
            "ctd_associations": None,
            "chembl_bioactivities": chembl_count,
            "total_references": None,
            "druggability_tier": _get_druggability_tier(final_score),
        })
        
    # Sort descending by score
    rankings.sort(key=lambda x: (-x["score"], x["gene"]))
    
    await cache.set("target_ranking_v3", cache_params, rankings)
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
