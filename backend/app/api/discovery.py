from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from app.core.responses import success_response, error_response
from app.services.discovery_llm import discovery_llm
from app.services.validation import validate_pmid_list

discovery_router = APIRouter(prefix="/discovery", tags=["Discovery"])

class LiteratureRequest(BaseModel):
    query: str
    context: Optional[str] = None

@discovery_router.post("/literature")
async def get_literature_insights(body: LiteratureRequest):
    """
    Run the LLM to get literature insights, then validate all generated PMIDs
    to prevent hallucinations and quarantine unverifiable claims.
    """
    try:
        # 1. Run LLM
        llm_result = await discovery_llm.mine_literature(query=body.query, context=body.context)
        
        # 2. Extract all PMIDs
        all_pmids = set()
        for claim in llm_result.claims:
            for pmid in claim.get("pmids", []):
                all_pmids.add(str(pmid))
                
        # 3. Validate PMIDs
        validation_result = await validate_pmid_list(list(all_pmids))
        quarantined = set(validation_result.get("quarantined", []))
        
        # 4. Annotate claims
        annotated_claims = []
        has_quarantined_claims = False
        
        for claim in llm_result.claims:
            claim_pmids = [str(p) for p in claim.get("pmids", [])]
            verified_pmids = [p for p in claim_pmids if p not in quarantined]
            
            # If a claim had PMIDs but NONE of them were valid, it's quarantined.
            is_quarantined = len(verified_pmids) == 0 and len(claim_pmids) > 0
            
            if is_quarantined:
                has_quarantined_claims = True
                
            annotated_claims.append({
                "text": claim.get("text", ""),
                "pmids": claim_pmids,
                "verified_pmids": verified_pmids,
                "confidence": claim.get("confidence", 0.0),
                "is_quarantined": is_quarantined
            })
            
        return success_response(
            data={
                "summary": llm_result.summary,
                "novelty_score": llm_result.novelty_score,
                "claims": annotated_claims,
                "validation_stats": {
                    "total_pmids": len(all_pmids),
                    "valid": len(all_pmids) - len(quarantined),
                    "quarantined": len(quarantined)
                }
            },
            source="Gemini+PubMed",
            method="AI Literature Mining",
            warnings=["Some claims were quarantined due to invalid PMIDs"] if has_quarantined_claims else []
        )
    except Exception as e:
        return error_response(errors=[str(e)], source="discovery-llm")

@discovery_router.post("/validate")
async def validate_pmids_endpoint(pmids: list[str]):
    """Standalone PMID validation endpoint."""
    validation_result = await validate_pmid_list(pmids)
    return success_response(
        data=validation_result,
        source="PubMed/NCBI",
        method="Batch eSummary lookup"
    )
