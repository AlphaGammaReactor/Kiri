"""
Kiri — Cross-Validation API Routes

Endpoints for bridging dry-lab (Atlas) and wet-lab (PDM) evidence.
- Variable sync: gene→evidence linkage map
- Overlay: per-gene wet-lab evidence retrieval
- Concordance: project-wide evidence agreement report
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.responses import success_response
from app.services.cross_validation import (
    variable_sync,
    overlay_data,
    concordance_report,
)

cross_validation_router = APIRouter(
    prefix="/cross-validation", tags=["Cross-Validation"]
)


@cross_validation_router.get("/sync")
async def get_variable_sync(project_id: str, db: AsyncSession = Depends(get_db)):
    """
    Get the gene→evidence linkage map for a project.
    Shows which genes have dry-lab data, wet-lab data, or both.
    """
    result = await variable_sync(project_id, db)
    return success_response(
        data=result,
        source="kiri-cross-validation",
        method="Variable sync",
    )


@cross_validation_router.get("/overlay")
async def get_overlay_data(
    project_id: str, gene_symbol: str, db: AsyncSession = Depends(get_db)
):
    """
    Get all wet-lab evidence for a specific gene in a project.
    Used to overlay alongside dry-lab data from Atlas.
    """
    result = await overlay_data(project_id, gene_symbol, db)
    return success_response(
        data=result,
        source="kiri-cross-validation",
        method="Data overlay",
    )


@cross_validation_router.get("/concordance")
async def get_concordance_report(project_id: str, db: AsyncSession = Depends(get_db)):
    """
    Generate a concordance report: which genes have both dry-lab and
    wet-lab evidence, and how strong is the agreement.
    """
    result = await concordance_report(project_id, db)
    return success_response(
        data=result,
        source="kiri-cross-validation",
        method="Concordance analysis",
    )
