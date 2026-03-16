"""
Kiri — DNB (Dynamic Network Biomarker) API Routes

Endpoints for tipping point detection via the DNB algorithm.
- POST /dnb/analyze — run DNB analysis on expression data
- GET  /dnb/modules — list available gene modules
"""

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.responses import success_response
from app.core.errors import KiriValidationError
from app.services.dnb import compute_dnb_score, get_default_modules

dnb_router = APIRouter(prefix="/dnb", tags=["DNB Analysis"])


class DNBRequest(BaseModel):
    """Request body for DNB analysis."""
    expression_matrix: dict[str, list[float]] = Field(
        ..., description="Gene → expression values dict"
    )
    stage_labels: list[str] = Field(
        ..., description="Per-sample stage label (e.g., ['normal', 'early', 'late'])"
    )
    modules: dict[str, list[str]] | None = Field(
        None, description="Optional custom gene modules; uses defaults if omitted"
    )


@dnb_router.post("/analyze")
async def run_dnb_analysis(body: DNBRequest):
    """
    Run DNB (Dynamic Network Biomarker) analysis.

    Computes DNB scores across disease stages to detect critical
    transition points. Uses intra-module correlation, inter-module
    correlation, and variance shifts.
    """
    result = compute_dnb_score(
        expression_matrix=body.expression_matrix,
        stage_labels=body.stage_labels,
        modules=body.modules,
    )

    return success_response(
        data=result,
        source="kiri-dnb",
        method="DNB (Chen et al., 2012)",
    )


@dnb_router.get("/modules")
async def list_dnb_modules():
    """List available default gene modules for DNB analysis."""
    modules = get_default_modules()
    return success_response(
        data={
            "modules": [
                {"name": name, "genes": genes, "gene_count": len(genes)}
                for name, genes in modules.items()
            ],
            "total": len(modules),
        },
        source="kiri-dnb",
        method="Module registry",
    )
