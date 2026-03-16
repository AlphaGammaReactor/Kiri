"""
Kiri — PDM Vault API Routes

CRUD endpoints for the Publication & Data Management vault.
Manages assay records, lab images, and animal experiments.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.responses import success_response, error_response
from app.models.pdm import Assay, LabImage, AnimalExperiment

pdm_router = APIRouter(prefix="/pdm", tags=["PDM Vault"])


# ══════════════════════════════
#  Pydantic Request/Response Models
# ══════════════════════════════

class AssayCreate(BaseModel):
    project_id: str
    assay_type: str = Field(..., pattern=r"^(cck8|wound_healing|colony_formation)$")
    title: str = ""
    gene_symbol: str = ""
    conditions: dict = {}
    results: dict = {}
    notes: str = ""


class AssayUpdate(BaseModel):
    title: str | None = None
    gene_symbol: str | None = None
    conditions: dict | None = None
    results: dict | None = None
    notes: str | None = None


class LabImageCreate(BaseModel):
    project_id: str
    image_type: str = Field(..., pattern=r"^(western_blot|immunofluorescence|ihc)$")
    title: str = ""
    gene_symbol: str = ""
    file_path: str = ""
    tags: list[str] = []
    metadata_json: dict = {}
    notes: str = ""


class AnimalExperimentCreate(BaseModel):
    project_id: str
    model_type: str = Field(..., pattern=r"^(xenograft|pdx|syngeneic|transgenic)$")
    title: str = ""
    gene_symbol: str = ""
    groups: dict = {}
    measurements: dict = {}
    notes: str = ""


class AnimalExperimentUpdate(BaseModel):
    title: str | None = None
    gene_symbol: str | None = None
    groups: dict | None = None
    measurements: dict | None = None
    notes: str | None = None


def _row_to_dict(row) -> dict:
    """Convert an ORM row to a JSON-serializable dict."""
    d = {}
    for col in row.__table__.columns:
        val = getattr(row, col.name)
        if isinstance(val, uuid.UUID):
            val = str(val)
        d[col.name] = val
    return d


# ══════════════════════════════
#  Assay Endpoints
# ══════════════════════════════

@pdm_router.get("/assays")
async def list_assays(project_id: str, db: AsyncSession = Depends(get_db)):
    """List all assays for a project."""
    stmt = (
        select(Assay)
        .where(Assay.project_id == uuid.UUID(project_id))
        .order_by(Assay.created_at.desc())
    )
    result = await db.execute(stmt)
    assays = result.scalars().all()
    return success_response(
        data=[_row_to_dict(a) for a in assays],
        source="kiri-pdm",
        method="Assay listing",
        sample_count=len(assays),
    )


@pdm_router.post("/assays")
async def create_assay(body: AssayCreate, db: AsyncSession = Depends(get_db)):
    """Create a new assay record."""
    assay = Assay(
        project_id=uuid.UUID(body.project_id),
        assay_type=body.assay_type,
        title=body.title,
        gene_symbol=body.gene_symbol,
        conditions=body.conditions,
        results=body.results,
        notes=body.notes,
    )
    db.add(assay)
    await db.flush()
    return success_response(
        data=_row_to_dict(assay),
        source="kiri-pdm",
        method="Assay creation",
    )


@pdm_router.patch("/assays/{assay_id}")
async def update_assay(assay_id: str, body: AssayUpdate, db: AsyncSession = Depends(get_db)):
    """Update an existing assay record."""
    stmt = select(Assay).where(Assay.id == uuid.UUID(assay_id))
    result = await db.execute(stmt)
    assay = result.scalar_one_or_none()
    if not assay:
        raise HTTPException(status_code=404, detail="Assay not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(assay, field, value)

    await db.flush()
    return success_response(
        data=_row_to_dict(assay),
        source="kiri-pdm",
        method="Assay update",
    )


@pdm_router.delete("/assays/{assay_id}")
async def delete_assay(assay_id: str, db: AsyncSession = Depends(get_db)):
    """Delete an assay record."""
    stmt = select(Assay).where(Assay.id == uuid.UUID(assay_id))
    result = await db.execute(stmt)
    assay = result.scalar_one_or_none()
    if not assay:
        raise HTTPException(status_code=404, detail="Assay not found")

    await db.delete(assay)
    await db.flush()
    return success_response(
        data={"deleted": True, "id": assay_id},
        source="kiri-pdm",
        method="Assay deletion",
    )


# ══════════════════════════════
#  Lab Image Endpoints
# ══════════════════════════════

@pdm_router.get("/images")
async def list_images(project_id: str, db: AsyncSession = Depends(get_db)):
    """List all lab images for a project."""
    stmt = (
        select(LabImage)
        .where(LabImage.project_id == uuid.UUID(project_id))
        .order_by(LabImage.created_at.desc())
    )
    result = await db.execute(stmt)
    images = result.scalars().all()
    return success_response(
        data=[_row_to_dict(i) for i in images],
        source="kiri-pdm",
        method="Image listing",
        sample_count=len(images),
    )


@pdm_router.post("/images")
async def create_image(body: LabImageCreate, db: AsyncSession = Depends(get_db)):
    """Create a new lab image record."""
    image = LabImage(
        project_id=uuid.UUID(body.project_id),
        image_type=body.image_type,
        title=body.title,
        gene_symbol=body.gene_symbol,
        file_path=body.file_path,
        tags=body.tags,
        metadata_json=body.metadata_json,
        notes=body.notes,
    )
    db.add(image)
    await db.flush()
    return success_response(
        data=_row_to_dict(image),
        source="kiri-pdm",
        method="Image creation",
    )


@pdm_router.delete("/images/{image_id}")
async def delete_image(image_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a lab image record."""
    stmt = select(LabImage).where(LabImage.id == uuid.UUID(image_id))
    result = await db.execute(stmt)
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    await db.delete(image)
    await db.flush()
    return success_response(
        data={"deleted": True, "id": image_id},
        source="kiri-pdm",
        method="Image deletion",
    )


# ══════════════════════════════
#  Animal Experiment Endpoints
# ══════════════════════════════

@pdm_router.get("/animal-models")
async def list_animal_experiments(project_id: str, db: AsyncSession = Depends(get_db)):
    """List all animal experiments for a project."""
    stmt = (
        select(AnimalExperiment)
        .where(AnimalExperiment.project_id == uuid.UUID(project_id))
        .order_by(AnimalExperiment.created_at.desc())
    )
    result = await db.execute(stmt)
    experiments = result.scalars().all()
    return success_response(
        data=[_row_to_dict(e) for e in experiments],
        source="kiri-pdm",
        method="Animal experiment listing",
        sample_count=len(experiments),
    )


@pdm_router.post("/animal-models")
async def create_animal_experiment(body: AnimalExperimentCreate, db: AsyncSession = Depends(get_db)):
    """Create a new animal experiment record."""
    experiment = AnimalExperiment(
        project_id=uuid.UUID(body.project_id),
        model_type=body.model_type,
        title=body.title,
        gene_symbol=body.gene_symbol,
        groups=body.groups,
        measurements=body.measurements,
        notes=body.notes,
    )
    db.add(experiment)
    await db.flush()
    return success_response(
        data=_row_to_dict(experiment),
        source="kiri-pdm",
        method="Animal experiment creation",
    )


@pdm_router.patch("/animal-models/{experiment_id}")
async def update_animal_experiment(
    experiment_id: str, body: AnimalExperimentUpdate, db: AsyncSession = Depends(get_db)
):
    """Update an existing animal experiment."""
    stmt = select(AnimalExperiment).where(AnimalExperiment.id == uuid.UUID(experiment_id))
    result = await db.execute(stmt)
    experiment = result.scalar_one_or_none()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(experiment, field, value)

    await db.flush()
    return success_response(
        data=_row_to_dict(experiment),
        source="kiri-pdm",
        method="Animal experiment update",
    )


@pdm_router.delete("/animal-models/{experiment_id}")
async def delete_animal_experiment(experiment_id: str, db: AsyncSession = Depends(get_db)):
    """Delete an animal experiment record."""
    stmt = select(AnimalExperiment).where(AnimalExperiment.id == uuid.UUID(experiment_id))
    result = await db.execute(stmt)
    experiment = result.scalar_one_or_none()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    await db.delete(experiment)
    await db.flush()
    return success_response(
        data={"deleted": True, "id": experiment_id},
        source="kiri-pdm",
        method="Animal experiment deletion",
    )
