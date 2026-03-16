"""
Kiri — Project Management API Routes

CRUD endpoints for research projects, protein targets, and data sources.
"""

import uuid
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.responses import success_response, error_response
from app.models.project import Project, ProjectProtein, ProjectDataSource, Snapshot
from app.services.uniprot import fetch_protein_by_gene
from app.services.protein_suggest import suggest_related_proteins
from app.services.validation import validate_gene_symbol
from app.services.recommendations import get_recommendations
from app.services.protein_catalog import get_full_catalog, search_catalog, is_catalog_protein
from app.services.hydration import hydrate_source, HYDRATABLE_SOURCES

logger = logging.getLogger("kiri.api.projects")

projects_router = APIRouter(prefix="/projects", tags=["projects"])
proteins_router = APIRouter(prefix="/proteins", tags=["proteins"])


# ══════════════════════════════
#  Request / Response Schemas
# ══════════════════════════════


class CreateProjectRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="")
    cancer_type: str = Field(default="")


class UpdateProjectRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    cancer_type: str | None = None


class AddProteinRequest(BaseModel):
    gene_symbol: str = Field(..., min_length=1, max_length=50)


class AddDataSourceRequest(BaseModel):
    source_type: str = Field(
        ...,
        pattern=r"^(tcga|geo|custom|cptac|scrna|drugbank|pubchem|chembl|string)$",
    )
    label: str = Field(default="")
    config: dict = Field(default_factory=dict)


# ══════════════════════════════
#  Project CRUD
# ══════════════════════════════


def _serialize_project(project: Project) -> dict[str, Any]:
    """Serialize a Project ORM instance to a JSON-safe dict."""
    return {
        "id": str(project.id),
        "name": project.name,
        "description": project.description,
        "cancer_type": project.cancer_type,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        "proteins": [
            {
                "id": str(p.id),
                "gene_symbol": p.gene_symbol,
                "uniprot_id": p.uniprot_id,
                "protein_name": p.protein_name,
                "organism": p.organism,
                "function_summary": p.function_summary,
                "sequence_length": p.sequence_length,
            }
            for p in project.proteins
        ],
        "data_sources": [
            {
                "id": str(ds.id),
                "source_type": ds.source_type,
                "label": ds.label,
                "config": ds.config,
                "status": ds.status,
                "sample_count": ds.sample_count,
                "added_at": ds.added_at.isoformat() if ds.added_at else None,
                "last_fetched_at": ds.last_fetched_at.isoformat() if ds.last_fetched_at else None,
            }
            for ds in project.data_sources
        ],
        "protein_count": len(project.proteins),
        "source_count": len(project.data_sources),
        "publication_state": getattr(project, "publication_state", None),
        "ui_state": getattr(project, "ui_state", None),
    }


@projects_router.get("")
async def list_projects(db: AsyncSession = Depends(get_db)):
    """List all projects (excluding soft-deleted)."""
    stmt = (
        select(Project)
        .where(Project.is_deleted == False)  # noqa: E712
        .order_by(Project.updated_at.desc())
    )
    result = await db.execute(stmt)
    projects = result.scalars().all()

    return success_response(
        data=[_serialize_project(p) for p in projects],
        source="kiri-projects",
        method="list",
    )


@projects_router.post("")
async def create_project(
    body: CreateProjectRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new research project."""
    project = Project(
        name=body.name,
        description=body.description,
        cancer_type=body.cancer_type,
    )
    db.add(project)
    await db.flush()  # Get the generated ID
    await db.refresh(project)

    logger.info(f"Created project '{project.name}' ({project.id})")

    return success_response(
        data=_serialize_project(project),
        source="kiri-projects",
        method="create",
    )


@projects_router.get("/recommendations")
async def data_source_recommendations(
    cancer_type: str = "OTHER",
):
    """Return recommended data sources for a given cancer type."""
    rec = get_recommendations(cancer_type)
    return success_response(
        data=rec,
        source="kiri-recommendations",
        method="static_mapping",
    )


@projects_router.get("/{project_id}")
async def get_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get a project with its proteins and data sources."""
    project = await _get_project_or_404(project_id, db)
    return success_response(
        data=_serialize_project(project),
        source="kiri-projects",
        method="get",
    )


@projects_router.patch("/{project_id}")
async def update_project(
    project_id: uuid.UUID,
    body: UpdateProjectRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update project metadata."""
    project = await _get_project_or_404(project_id, db)

    if body.name is not None:
        project.name = body.name
    if body.description is not None:
        project.description = body.description
    if body.cancer_type is not None:
        project.cancer_type = body.cancer_type

    await db.flush()
    await db.refresh(project)

    return success_response(
        data=_serialize_project(project),
        source="kiri-projects",
        method="update",
    )


@projects_router.delete("/{project_id}")
async def delete_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a project."""
    project = await _get_project_or_404(project_id, db)
    project.is_deleted = True
    await db.flush()

    return success_response(
        data={"id": str(project_id), "deleted": True},
        source="kiri-projects",
        method="delete",
    )


# ══════════════════════════════
#  Protein Targets
# ══════════════════════════════


@projects_router.post("/{project_id}/proteins")
async def add_protein(
    project_id: uuid.UUID,
    body: AddProteinRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Add a protein target to a project.
    If the gene is in the pre-loaded catalog, uses cached metadata (instant).
    Otherwise validates via HGNC and enriches with UniProt metadata.
    """
    project = await _get_project_or_404(project_id, db)

    # Check duplicate
    for existing in project.proteins:
        if existing.gene_symbol.upper() == body.gene_symbol.upper():
            return error_response(
                errors=[f"Protein '{body.gene_symbol}' already in project"],
                source="kiri-projects",
            )

    # Check if protein is in the pre-loaded catalog (instant, no API call)
    catalog_entry = is_catalog_protein(body.gene_symbol)

    if catalog_entry:
        # Use pre-loaded data — no external API calls needed
        protein = ProjectProtein(
            project_id=project.id,
            gene_symbol=catalog_entry["gene_symbol"],
            uniprot_id=catalog_entry["uniprot_id"],
            protein_name=catalog_entry["protein_name"],
            organism=catalog_entry["organism"],
            function_summary=catalog_entry["function_summary"],
            sequence_length=catalog_entry["sequence_length"],
        )
        source_info = "Kiri Protein Catalog"
        method_info = "Pre-loaded metadata"
    else:
        # Fallback: validate via HGNC + enrich via UniProt
        validation = await validate_gene_symbol(body.gene_symbol)
        if not validation.get("valid", False):
            return error_response(
                errors=[f"Gene symbol '{body.gene_symbol}' not recognized by HGNC"],
                source="kiri-projects",
            )

        uniprot_data = await fetch_protein_by_gene(body.gene_symbol)

        protein = ProjectProtein(
            project_id=project.id,
            gene_symbol=validation.get("symbol", body.gene_symbol.upper()),
            uniprot_id=uniprot_data.get("uniprot_id", "") if uniprot_data else "",
            protein_name=uniprot_data.get("protein_name", "") if uniprot_data else "",
            organism=uniprot_data.get("organism", "Homo sapiens") if uniprot_data else "Homo sapiens",
            function_summary=uniprot_data.get("function_summary", "") if uniprot_data else "",
            sequence_length=uniprot_data.get("sequence_length", 0) if uniprot_data else 0,
        )
        source_info = "MyGene.info + UniProt"
        method_info = "HGNC validation + UniProt enrichment"

    db.add(protein)
    await db.flush()
    await db.refresh(protein)

    logger.info(f"Added protein {protein.gene_symbol} to project {project_id}")

    return success_response(
        data={
            "id": str(protein.id),
            "gene_symbol": protein.gene_symbol,
            "uniprot_id": protein.uniprot_id,
            "protein_name": protein.protein_name,
            "organism": protein.organism,
            "function_summary": protein.function_summary,
            "sequence_length": protein.sequence_length,
        },
        source=source_info,
        method=method_info,
    )


@projects_router.delete("/{project_id}/proteins/{protein_id}")
async def remove_protein(
    project_id: uuid.UUID,
    protein_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Remove a protein target from a project."""
    await _get_project_or_404(project_id, db)

    stmt = select(ProjectProtein).where(
        ProjectProtein.id == protein_id,
        ProjectProtein.project_id == project_id,
    )
    result = await db.execute(stmt)
    protein = result.scalar_one_or_none()

    if not protein:
        raise HTTPException(status_code=404, detail="Protein not found")

    await db.delete(protein)
    await db.flush()

    return success_response(
        data={"id": str(protein_id), "removed": True},
        source="kiri-projects",
    )


@projects_router.get("/{project_id}/proteins/suggest")
async def suggest_proteins(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Suggest related proteins based on PubMed co-occurrence with project targets."""
    project = await _get_project_or_404(project_id, db)

    if not project.proteins:
        return success_response(data=[], source="PubMed")

    query_genes = [p.gene_symbol for p in project.proteins]
    suggestions = await suggest_related_proteins(query_genes)

    # Filter out genes already in the project
    existing = {p.gene_symbol.upper() for p in project.proteins}
    filtered = [s for s in suggestions if s["gene_symbol"].upper() not in existing]

    return success_response(
        data=filtered,
        source="PubMed co-occurrence",
        method="Title co-occurrence analysis",
    )


# ══════════════════════════════
#  Data Sources
# ══════════════════════════════


@projects_router.post("/{project_id}/sources")
async def add_data_source(
    project_id: uuid.UUID,
    body: AddDataSourceRequest,
    db: AsyncSession = Depends(get_db),
):
    """Add a data source to a project."""
    project = await _get_project_or_404(project_id, db)

    source = ProjectDataSource(
        project_id=project.id,
        source_type=body.source_type,
        label=body.label or _default_label(body.source_type, body.config),
        config=body.config,
        status="pending",
    )
    db.add(source)
    await db.flush()
    await db.refresh(source)

    logger.info(f"Added {body.source_type} source to project {project_id}")

    return success_response(
        data={
            "id": str(source.id),
            "source_type": source.source_type,
            "label": source.label,
            "config": source.config,
            "status": source.status,
        },
        source="kiri-projects",
        method="add_source",
    )


@projects_router.delete("/{project_id}/sources/{source_id}")
async def remove_data_source(
    project_id: uuid.UUID,
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Remove a data source from a project."""
    await _get_project_or_404(project_id, db)

    stmt = select(ProjectDataSource).where(
        ProjectDataSource.id == source_id,
        ProjectDataSource.project_id == project_id,
    )
    result = await db.execute(stmt)
    source = result.scalar_one_or_none()

    if not source:
        raise HTTPException(status_code=404, detail="Data source not found")

    await db.delete(source)
    await db.flush()

    return success_response(
        data={"id": str(source_id), "removed": True},
        source="kiri-projects",
    )


@projects_router.post("/{project_id}/sources/{source_id}/hydrate")
async def hydrate_data_source(
    project_id: uuid.UUID,
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Hydrate a data source by fetching data from external APIs."""
    project = await _get_project_or_404(project_id, db)

    stmt = select(ProjectDataSource).where(
        ProjectDataSource.id == source_id,
        ProjectDataSource.project_id == project_id,
    )
    result = await db.execute(stmt)
    source = result.scalar_one_or_none()

    if not source:
        raise HTTPException(status_code=404, detail="Data source not found")

    if source.source_type not in HYDRATABLE_SOURCES:
        # Non-hydratable sources are marked loaded immediately
        source.status = "loaded"
        await db.flush()
        return success_response(
            data={"id": str(source_id), "status": "loaded", "message": "Source does not require hydration"},
            source="kiri-projects",
            method="hydrate",
        )

    try:
        cached = await hydrate_source(source, project, db)
        return success_response(
            data={
                "id": str(source_id),
                "status": source.status,
                "total_count": cached.get("total_count", 0),
                "gene_count": cached.get("gene_count", 0),
            },
            source="kiri-projects",
            method="hydrate",
        )
    except Exception as e:
        logger.error(f"Hydration failed: {e}")
        return error_response(
            errors=[f"Hydration failed: {str(e)}"],
            source="kiri-projects",
        )


@projects_router.get("/{project_id}/sources/{source_id}/data")
async def get_source_data(
    project_id: uuid.UUID,
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get cached data for a data source."""
    await _get_project_or_404(project_id, db)

    stmt = select(ProjectDataSource).where(
        ProjectDataSource.id == source_id,
        ProjectDataSource.project_id == project_id,
    )
    result = await db.execute(stmt)
    source = result.scalar_one_or_none()

    if not source:
        raise HTTPException(status_code=404, detail="Data source not found")

    return success_response(
        data={
            "id": str(source_id),
            "source_type": source.source_type,
            "status": source.status,
            "cached_data": source.cached_data,
            "last_fetched_at": source.last_fetched_at.isoformat() if source.last_fetched_at else None,
        },
        source="kiri-projects",
        method="get_source_data",
    )


@projects_router.get("/{project_id}/sources/{source_id}/status")
async def get_source_status(
    project_id: uuid.UUID,
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get current status of a data source (for polling during hydration)."""
    await _get_project_or_404(project_id, db)

    stmt = select(ProjectDataSource).where(
        ProjectDataSource.id == source_id,
        ProjectDataSource.project_id == project_id,
    )
    result = await db.execute(stmt)
    source = result.scalar_one_or_none()

    if not source:
        raise HTTPException(status_code=404, detail="Data source not found")

    return success_response(
        data={
            "id": str(source_id),
            "status": source.status,
            "sample_count": source.sample_count,
            "last_fetched_at": source.last_fetched_at.isoformat() if source.last_fetched_at else None,
        },
        source="kiri-projects",
        method="get_source_status",
    )


# ══════════════════════════════
#  UniProt Lookup (standalone)
# ══════════════════════════════


@projects_router.get("/lookup/protein/{gene_symbol}")
async def lookup_protein(gene_symbol: str):
    """Look up protein metadata from UniProt (used by the wizard UI)."""
    data = await fetch_protein_by_gene(gene_symbol)
    if not data:
        return error_response(
            errors=[f"No UniProt entry found for '{gene_symbol}'"],
            source="UniProt",
        )
    return success_response(data=data, source="UniProt", method="REST API search")


# ══════════════════════════════
#  Protein Catalog
# ══════════════════════════════


@proteins_router.get("/catalog")
async def protein_catalog():
    """Return the full pre-loaded protein catalog."""
    catalog = get_full_catalog()
    return success_response(
        data=catalog,
        source="Kiri Protein Catalog",
        method="Pre-loaded database",
    )


@proteins_router.get("/search")
async def protein_search(q: str = ""):
    """Search the protein catalog by gene symbol, name, or keywords."""
    results = search_catalog(q)
    return success_response(
        data=results,
        source="Kiri Protein Catalog",
        method="Catalog search",
    )


# ══════════════════════════════
#  Publication State Persistence
# ══════════════════════════════


class SavePublicationStateRequest(BaseModel):
    panels: list = Field(default_factory=list)
    options: dict = Field(default_factory=dict)


@projects_router.get("/{project_id}/publication-state")
async def get_publication_state(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get the saved publication engine state for a project."""
    project = await _get_project_or_404(project_id, db)
    return success_response(
        data=project.publication_state or {"panels": [], "options": {}},
        source="kiri-projects",
        method="get_publication_state",
    )


@projects_router.put("/{project_id}/publication-state")
async def save_publication_state(
    project_id: uuid.UUID,
    body: SavePublicationStateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Save the publication engine state (panels + options) for a project."""
    project = await _get_project_or_404(project_id, db)
    project.publication_state = {"panels": body.panels, "options": body.options}
    await db.flush()

    logger.info(f"Saved publication state for project {project_id} ({len(body.panels)} panels)")

    return success_response(
        data={"saved": True, "panel_count": len(body.panels)},
        source="kiri-projects",
        method="save_publication_state",
    )


# ══════════════════════════════
#  Per-Page UI State Persistence
# ══════════════════════════════


@projects_router.get("/{project_id}/ui-state")
async def get_ui_state(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get all saved per-page UI state for a project."""
    project = await _get_project_or_404(project_id, db)
    return success_response(
        data=getattr(project, "ui_state", None) or {},
        source="kiri-projects",
        method="get_ui_state",
    )


@projects_router.patch("/{project_id}/ui-state")
async def patch_ui_state(
    project_id: uuid.UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Merge per-page UI state. Body keys are page names, values are state dicts.
    Example: {"atlas": {"normalization": "tpm"}, "interaction": {"confidence": 0.7}}
    """
    project = await _get_project_or_404(project_id, db)
    current = getattr(project, "ui_state", None) or {}
    current.update(body)
    project.ui_state = current
    await db.flush()

    return success_response(
        data={"saved": True, "pages": list(current.keys())},
        source="kiri-projects",
        method="patch_ui_state",
    )


# ══════════════════════════════
#  Snapshots & Duplication
# ══════════════════════════════


class CreateSnapshotRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="")


@projects_router.post("/{project_id}/snapshots")
async def create_snapshot(
    project_id: uuid.UUID,
    body: CreateSnapshotRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a snapshot of the current project state."""
    project = await _get_project_or_404(project_id, db)

    state = _serialize_project(project)

    snapshot = Snapshot(
        project_id=project.id,
        name=body.name,
        description=body.description,
        state_json=state,
    )
    db.add(snapshot)
    await db.flush()
    await db.refresh(snapshot)

    logger.info(f"Created snapshot '{body.name}' for project {project_id}")

    return success_response(
        data={
            "id": str(snapshot.id),
            "name": snapshot.name,
            "description": snapshot.description,
            "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
            "protein_count": len(state.get("proteins", [])),
            "source_count": len(state.get("data_sources", [])),
        },
        source="kiri-projects",
        method="create_snapshot",
    )


@projects_router.get("/{project_id}/snapshots")
async def list_snapshots(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """List all snapshots for a project."""
    await _get_project_or_404(project_id, db)

    stmt = (
        select(Snapshot)
        .where(Snapshot.project_id == project_id)
        .order_by(Snapshot.created_at.desc())
    )
    result = await db.execute(stmt)
    snapshots = result.scalars().all()

    return success_response(
        data=[
            {
                "id": str(s.id),
                "name": s.name,
                "description": s.description,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "protein_count": len(s.state_json.get("proteins", [])),
                "source_count": len(s.state_json.get("data_sources", [])),
            }
            for s in snapshots
        ],
        source="kiri-projects",
        method="list_snapshots",
    )


@projects_router.post("/{project_id}/snapshots/{snapshot_id}/restore")
async def restore_snapshot(
    project_id: uuid.UUID,
    snapshot_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Restore a project to a previous snapshot state."""
    project = await _get_project_or_404(project_id, db)

    stmt = select(Snapshot).where(
        Snapshot.id == snapshot_id,
        Snapshot.project_id == project_id,
    )
    result = await db.execute(stmt)
    snapshot = result.scalar_one_or_none()

    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    state = snapshot.state_json

    # Restore project metadata
    project.name = state.get("name", project.name)
    project.description = state.get("description", project.description)
    project.cancer_type = state.get("cancer_type", project.cancer_type)

    # Clear existing proteins + sources, then restore from snapshot
    for p in list(project.proteins):
        await db.delete(p)
    for ds in list(project.data_sources):
        await db.delete(ds)

    await db.flush()

    # Re-add proteins from snapshot
    for p_data in state.get("proteins", []):
        protein = ProjectProtein(
            project_id=project.id,
            gene_symbol=p_data.get("gene_symbol", ""),
            uniprot_id=p_data.get("uniprot_id", ""),
            protein_name=p_data.get("protein_name", ""),
            organism=p_data.get("organism", ""),
            function_summary=p_data.get("function_summary", ""),
            sequence_length=p_data.get("sequence_length", 0),
        )
        db.add(protein)

    # Re-add data sources from snapshot
    for ds_data in state.get("data_sources", []):
        source = ProjectDataSource(
            project_id=project.id,
            source_type=ds_data.get("source_type", ""),
            label=ds_data.get("label", ""),
            config=ds_data.get("config", {}),
            status=ds_data.get("status", "pending"),
        )
        db.add(source)

    await db.flush()
    await db.refresh(project)

    logger.info(f"Restored project {project_id} to snapshot '{snapshot.name}'")

    return success_response(
        data=_serialize_project(project),
        source="kiri-projects",
        method="restore_snapshot",
    )


@projects_router.post("/{project_id}/duplicate")
async def duplicate_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Clone a project with all its proteins and data sources."""
    source_project = await _get_project_or_404(project_id, db)

    new_project = Project(
        name=f"{source_project.name} (Copy)",
        description=source_project.description,
        cancer_type=source_project.cancer_type,
    )
    db.add(new_project)
    await db.flush()

    # Clone proteins
    for p in source_project.proteins:
        clone = ProjectProtein(
            project_id=new_project.id,
            gene_symbol=p.gene_symbol,
            uniprot_id=p.uniprot_id,
            protein_name=p.protein_name,
            organism=p.organism,
            function_summary=p.function_summary,
            sequence_length=p.sequence_length,
        )
        db.add(clone)

    # Clone data sources
    for ds in source_project.data_sources:
        clone = ProjectDataSource(
            project_id=new_project.id,
            source_type=ds.source_type,
            label=ds.label,
            config=ds.config,
            status="pending",
        )
        db.add(clone)

    await db.flush()
    await db.refresh(new_project)

    logger.info(f"Duplicated project {project_id} → {new_project.id}")

    return success_response(
        data=_serialize_project(new_project),
        source="kiri-projects",
        method="duplicate",
    )


# ══════════════════════════════
#  Helpers
# ══════════════════════════════


async def _get_project_or_404(
    project_id: uuid.UUID,
    db: AsyncSession,
) -> Project:
    """Fetch a project or raise 404."""
    stmt = select(Project).where(
        Project.id == project_id,
        Project.is_deleted == False,  # noqa: E712
    )
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _default_label(source_type: str, config: dict) -> str:
    """Generate a default label for a data source."""
    if source_type == "tcga":
        project_id = config.get("project_id")
        if project_id:
            return f"TCGA-{project_id}"
        return "TCGA (GDC)"

    labels = {
        "geo": config.get("accession", "GEO Dataset"),
        "custom": config.get("filename", "Custom Upload"),
        "cptac": "CPTAC",
        "scrna": "Single-Cell Atlas",
        "drugbank": "DrugBank",
        "pubchem": "PubChem (NIH)",
        "chembl": "ChEMBL (EMBL-EBI)",
        "string": "STRING-DB",
    }
    return labels.get(source_type, source_type.upper())
