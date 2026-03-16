"""
Kiri API — Router Registry

All module routers are registered here and mounted in main.py.
Includes Trust Layer validation endpoints and task status endpoints.
"""

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from app.core.responses import success_response, error_response
from app.core.tasks import create_task, get_task, run_task
from app.services.validation import (
    validate_gene_symbol,
    validate_gene_list,
    validate_pmid,
    validate_pmid_list,
)
from app.api.interaction import interaction_router
from app.api.atlas import atlas_router
from app.api.projects import projects_router, proteins_router
from app.api.clinical import clinical_router
from app.api.discovery import discovery_router
from app.api.export import router as export_router
from app.api.drugs import router as drugs_router
from app.api.pdm import pdm_router
from app.api.cross_validation import cross_validation_router
from app.api.docking import router as docking_router
from app.api.dnb import dnb_router
from app.api.uploads import upload_router
from app.api.auth import router as auth_router

router = APIRouter()

# ── Auth Router (unauthenticated) ──
router.include_router(auth_router)

# ── Module Routers ──
router.include_router(interaction_router)
router.include_router(atlas_router)
router.include_router(projects_router)
router.include_router(proteins_router)
router.include_router(clinical_router)
router.include_router(discovery_router)
router.include_router(export_router)
router.include_router(drugs_router)
router.include_router(pdm_router)
router.include_router(cross_validation_router)
router.include_router(
    docking_router,
    prefix="/docking",
    tags=["docking"]
)
router.include_router(dnb_router)
router.include_router(upload_router)


# ══════════════════════════════
#  Trust Layer — Gene Validation
# ══════════════════════════════


@router.get("/validation/gene/{symbol}")
async def validate_gene(symbol: str):
    """Validate a single gene symbol against HGNC via MyGene.info."""
    result = await validate_gene_symbol(symbol)
    return success_response(
        data=result,
        source="MyGene.info/HGNC",
        method="Symbol lookup",
    )


class GeneListRequest(BaseModel):
    symbols: list[str]


@router.post("/validation/genes")
async def validate_genes(body: GeneListRequest):
    """Validate a list of gene symbols. Returns per-symbol results."""
    result = await validate_gene_list(body.symbols)
    return success_response(
        data=result,
        source="MyGene.info/HGNC",
        method="Batch symbol lookup",
    )


# ══════════════════════════════
#  Trust Layer — PMID Validation
# ══════════════════════════════


@router.get("/validation/pmid/{pmid}")
async def validate_single_pmid(pmid: str):
    """Validate a PubMed ID. Anti-hallucination gate for AI Discovery."""
    result = await validate_pmid(pmid)
    return success_response(
        data=result,
        source="PubMed/NCBI",
        method="eSummary lookup",
    )


class PmidListRequest(BaseModel):
    pmids: list[str]


@router.post("/validation/pmids")
async def validate_pmids(body: PmidListRequest):
    """Batch validate PubMed IDs. Used for AI citation verification."""
    result = await validate_pmid_list(body.pmids)
    return success_response(
        data=result,
        source="PubMed/NCBI",
        method="Batch eSummary lookup",
    )


# ══════════════════════════════
#  Task Status (Background Jobs)
# ══════════════════════════════


@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """Check the status of a background computation task."""
    task = get_task(task_id)
    if not task:
        return error_response(
            errors=[f"Task '{task_id}' not found"],
            source="kiri-tasks",
        )
    return success_response(
        data=task.model_dump(mode="json"),
        source="kiri-tasks",
    )
