"""
Kiri — Interaction Lab API Routes

Endpoints for PPI network, protein structures, cleavage analysis,
interaction context, and citations.
All responses wrapped in the standard Kiri response envelope with provenance.
"""

import uuid
from fastapi import APIRouter, Query, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.responses import success_response
from app.core.errors import KiriValidationError
from app.models.project import Project
from app.services.interaction_ppi import (
    fetch_string_network,
    fetch_biogrid_interactions,
    merge_ppi_sources,
)
from app.services.interaction_structure import (
    fetch_alphafold_structure,
    resolve_uniprot_id,
)
from app.services.interaction_cleavage import analyze_cleavage_motifs
from app.services.interaction_citations import fetch_interaction_citations
from app.services.interaction_context import get_interaction_context

interaction_router = APIRouter(prefix="/interaction", tags=["Interaction Lab"])


# ══════════════════════════════
#  Helper
# ══════════════════════════════

async def _get_project_genes(project_id: str | None, db: AsyncSession) -> list[str]:
    """Helper to fetch genes from a project."""
    if not project_id:
        return []
        
    try:
        pid = uuid.UUID(project_id)
    except ValueError:
        return []

    stmt = (
        select(Project)
        .where(Project.id == pid, Project.is_deleted == False)  # noqa: E712
        .options(selectinload(Project.proteins))
    )
    res = await db.execute(stmt)
    project = res.scalar_one_or_none()
    if not project:
        return []
        
    return [p.gene_symbol for p in project.proteins]


# ══════════════════════════════
#  PPI Network
# ══════════════════════════════


@interaction_router.get("/ppi")
async def get_ppi_network(
    genes: str | None = Query(
        None, description="Comma-separated gene symbols (e.g., PARL,MAVS,DDX58)"
    ),
    project_id: str | None = Query(
        None, description="Optional Kiri Project ID to load genes from"
    ),
    confidence: float = Query(
        0.4, ge=0.0, le=1.0, description="Minimum STRING-DB confidence score"
    ),
    species: int = Query(9606, description="NCBI taxonomy ID (9606 = human)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch and merge PPI network from STRING-DB and BioGRID.
    Returns Cytoscape.js-compatible node/edge JSON.
    """
    gene_list = []
    if genes:
        gene_list = [g.strip().upper() for g in genes.split(",") if g.strip()]
    elif project_id:
        gene_list = await _get_project_genes(project_id, db)
        
    if not gene_list:
        raise KiriValidationError("No genes specified, and no project provided/found.", source="interaction_ppi")

    # Fetch from both sources
    string_data = await fetch_string_network(gene_list, species, confidence)
    biogrid_data = await fetch_biogrid_interactions(gene_list)

    # Merge into unified graph
    merged = merge_ppi_sources(string_data, biogrid_data)

    return success_response(
        data=merged,
        source=", ".join(merged["meta"]["sources_used"]) or "STRING-DB",
        method=f"PPI network (confidence ≥ {confidence})",
        sample_count=merged["meta"]["total_edges"],
    )


# ══════════════════════════════
#  Protein Structure
# ══════════════════════════════


@interaction_router.get("/structure/{identifier}")
async def get_protein_structure(identifier: str):
    """
    Fetch AlphaFold predicted structure for a gene symbol or UniProt ID.

    Accepts either a gene symbol (PARL, MAVS) or UniProt ID (Q9H300).
    """
    # Try resolving as gene symbol first
    uniprot_id = resolve_uniprot_id(identifier)
    if not uniprot_id:
        # Assume it's already a UniProt ID
        uniprot_id = identifier.strip().upper()

    structure = await fetch_alphafold_structure(uniprot_id)

    return success_response(
        data=structure,
        source="AlphaFold DB",
        method="AI-predicted structure (AlphaFold v4)",
    )


# ══════════════════════════════
#  Cleavage Analysis
# ══════════════════════════════


class CleavageRequest(BaseModel):
    uniprot_id: str = Field(..., description="UniProt ID of the substrate (e.g., Q7Z434 for MAVS)")
    motif_pattern: str | None = Field(
        None, description="Regex motif pattern (defaults to PARL consensus)"
    )
    context_window: int = Field(
        8, ge=2, le=20, description="Flanking residues to display"
    )


@interaction_router.post("/cleavage")
async def run_cleavage_analysis(body: CleavageRequest):
    """
    Analyze protein sequence for PARL cleavage motifs.
    Uses Biopython for motif scanning on UniProt sequence data.
    """
    result = await analyze_cleavage_motifs(
        uniprot_id=body.uniprot_id,
        motif_pattern=body.motif_pattern,
        context_window=body.context_window,
    )

    return success_response(
        data=result,
        source="UniProt + Biopython",
        method="Regex motif scan",
        sample_count=result["total_hits"],
    )


# ══════════════════════════════
#  Interaction Context
# ══════════════════════════════


@interaction_router.get("/context")
async def get_context(
    gene_a: str = Query(..., description="First gene symbol"),
    gene_b: str = Query(..., description="Second gene symbol"),
):
    """
    Fetch rich interaction context for a protein pair.

    Returns curated mechanism data (for known axis pairs) or
    derived annotations (GO terms, KEGG pathways, shared biology)
    for any arbitrary pair.
    """
    result = await get_interaction_context(gene_a, gene_b)

    return success_response(
        data=result,
        source="QuickGO + KEGG + Kiri Curated",
        method="Functional annotation + curated mechanism lookup",
        sample_count=len(result.get("shared_go_terms", [])),
    )


# ══════════════════════════════
#  Citation Search
# ══════════════════════════════


@interaction_router.get("/citations")
async def get_interaction_citations_endpoint(
    gene_a: str | None = Query(None, description="First gene symbol"),
    gene_b: str | None = Query(None, description="Second gene symbol"),
    project_id: str | None = Query(None, description="Optional Kiri Project ID to load primary genes from"),
    max_results: int = Query(10, ge=1, le=50, description="Max citations to return"),
    db: AsyncSession = Depends(get_db),
):
    """
    Search PubMed for citations supporting interaction between two genes.
    All PMIDs validated via Trust Layer.
    """
    if not (gene_a and gene_b):
        if project_id:
            project_genes = await _get_project_genes(project_id, db)
            if len(project_genes) >= 2:
                gene_a = gene_a or project_genes[0]
                gene_b = gene_b or project_genes[1]
                
    if not (gene_a and gene_b):
        raise KiriValidationError("Must provide both gene_a and gene_b, or a project ID with at least 2 genes.", source="interaction_citations")

    result = await fetch_interaction_citations(gene_a.upper(), gene_b.upper(), max_results)

    validated_count = sum(1 for c in result["citations"] if c.get("validated"))

    return success_response(
        data=result,
        source="PubMed/NCBI",
        method="Co-occurrence search + PMID validation",
        sample_count=result["total_found"],
        warnings=(
            [f"{len(result['citations']) - validated_count} citation(s) could not be validated"]
            if validated_count < len(result["citations"])
            else []
        ),
    )
