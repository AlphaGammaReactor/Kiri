"""
Kiri — Interactomics API Router

Phase 9 endpoints for advanced interaction/regulatory network analysis:
- Enhanced PPI network (STRING + BioGRID + IntAct, mito annotations)
- Co-expression heatmap matrix
- CoIP-MS / proteomics analysis
- Public dataset differential expression
- Substrate cleavage prediction
- Regulatory network construction

Mounted at /api/v1/interactomics/
"""

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.responses import success_response, error_response
from app.core.errors import KiriValidationError
from app.models.project import Project
from app.models.interactomics import (
    EnhancedPPIRequest,
    CoexpressionHeatmapRequest,
    ProteomicsRequest,
    PublicDERequest,
    SubstrateScanRequest,
    RegulatoryNetworkRequest,
)

logger = logging.getLogger("kiri.interactomics.api")

interactomics_router = APIRouter(prefix="/interactomics", tags=["Interactomics"])


# ══════════════════════════════
#  Helper
# ══════════════════════════════

async def _get_project_genes(project_id: str | None, db: AsyncSession) -> list[str]:
    """Load gene symbols from a project if ID is provided."""
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
    if project and project.proteins:
        return [p.gene_symbol for p in project.proteins]
    return []


async def _enrich_genes(body: Any, db: AsyncSession) -> list[str]:
    """Get genes from request body or from project."""
    if body.genes:
        return [g.strip().upper() for g in body.genes if g.strip()]
    project_id = getattr(body, "project_id", None)
    if project_id:
        return await _get_project_genes(project_id, db)
    return []


# ══════════════════════════════
#  Enhanced PPI Network
# ══════════════════════════════


@interactomics_router.post("/network")
async def get_enhanced_ppi_network(
    body: EnhancedPPIRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Enhanced PPI network with STRING-DB + BioGRID + IntAct,
    MitoCarta3.0 annotations, and high-confidence filtering.
    """
    gene_list = await _enrich_genes(body, db)
    if not gene_list:
        raise KiriValidationError(
            "No genes specified, and no project provided/found.",
            source="interactomics",
        )

    from app.services.interaction_ppi import (
        fetch_string_network,
        fetch_biogrid_interactions,
        merge_ppi_sources,
    )
    from app.services.interaction_intact import fetch_intact_interactions

    # Fetch from all three sources
    string_data = await fetch_string_network(gene_list, confidence=body.confidence)
    biogrid_data = await fetch_biogrid_interactions(gene_list)

    intact_data = None
    if body.include_intact:
        intact_data = await fetch_intact_interactions(gene_list)

    # Merge into unified graph
    merged = merge_ppi_sources(
        string_data,
        biogrid_data,
        intact_data=intact_data,
        annotate_mito=body.annotate_mito,
        high_confidence_only=body.high_confidence_only,
    )

    return success_response(
        data=merged,
        source=", ".join(merged["meta"]["sources_used"]) or "STRING-DB",
        method=f"Enhanced PPI (confidence ≥ {body.confidence}"
               + (", high-confidence only" if body.high_confidence_only else "")
               + (", MitoCarta annotated" if body.annotate_mito else "")
               + ")",
        sample_count=merged["meta"]["total_edges"],
    )


# ══════════════════════════════
#  Co-expression Heatmap
# ══════════════════════════════


@interactomics_router.post("/coexpression-heatmap")
async def get_coexpression_heatmap(
    body: CoexpressionHeatmapRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Co-expression heatmap matrix for top correlated genes.
    Returns a gene × gene correlation matrix.
    """
    gene_list = await _enrich_genes(body, db)
    if not gene_list:
        raise KiriValidationError("No genes specified.", source="interactomics")

    from app.services.mito_coexpression import run_full_coexpression_pipeline

    result = await run_full_coexpression_pipeline(
        genes=gene_list,
        project_ids=body.project_ids,
        r_cutoff=body.r_cutoff,
        p_cutoff=body.p_cutoff,
        top_n=body.top_n,
    )

    # Build heatmap matrix from co-expression scans
    heatmap_genes = set()
    for gene, scan in result.get("coexpression_scans", {}).items():
        heatmap_genes.add(gene)
        for corr_gene in scan.get("correlated_genes", [])[:body.top_n]:
            heatmap_genes.add(corr_gene.get("gene", ""))

    heatmap_genes.discard("")

    # Build correlation matrix
    corr_lookup: dict[str, dict[str, float]] = {}
    for gene, scan in result.get("coexpression_scans", {}).items():
        corr_lookup[gene] = {}
        for corr in scan.get("correlated_genes", []):
            corr_lookup[gene][corr.get("gene", "")] = corr.get("r", 0)

    matrix: dict[str, dict[str, float]] = {}
    gene_list_sorted = sorted(heatmap_genes)
    for g1 in gene_list_sorted:
        matrix[g1] = {}
        for g2 in gene_list_sorted:
            if g1 == g2:
                matrix[g1][g2] = 1.0
            else:
                r = corr_lookup.get(g1, {}).get(g2)
                if r is None:
                    r = corr_lookup.get(g2, {}).get(g1, 0)
                matrix[g1][g2] = r

    return success_response(
        data={
            "genes": gene_list_sorted,
            "matrix": matrix,
            "r_cutoff": body.r_cutoff,
            "coexpression_scans": result.get("coexpression_scans"),
            "sample_count": result.get("sample_count", 0),
        },
        source="TCGA-COAD/READ (GDC)",
        method=f"Co-expression heatmap (|r| ≥ {body.r_cutoff})",
        sample_count=result.get("sample_count", 0),
    )


# ══════════════════════════════
#  CoIP-MS / Proteomics
# ══════════════════════════════


@interactomics_router.post("/proteomics")
async def run_proteomics_analysis_endpoint(
    body: ProteomicsRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Run CoIP-MS / proteomics differential analysis.
    Accepts user-uploaded abundance matrix or searches PRIDE.
    """
    gene_list = await _enrich_genes(body, db)

    from app.services.interactomics import (
        run_proteomics_analysis,
        search_pride_datasets,
    )

    # If no data provided, search PRIDE for datasets
    if not body.abundance_matrix or not body.groups:
        if gene_list:
            datasets = await search_pride_datasets(gene_list)
            return success_response(
                data={
                    "mode": "discovery",
                    "available_datasets": datasets,
                    "message": "No abundance data provided. Upload a proteomics matrix or select a PRIDE dataset.",
                },
                source="PRIDE",
                method="Dataset discovery",
            )
        raise KiriValidationError(
            "Provide abundance_matrix + groups, or genes for dataset discovery.",
            source="interactomics",
        )

    result = await run_proteomics_analysis(
        abundance_matrix=body.abundance_matrix,
        groups=body.groups,
        group_a=body.group_a,
        group_b=body.group_b,
        fdr_cutoff=body.fdr_cutoff,
        lfc_cutoff=body.lfc_cutoff,
    )

    return success_response(
        data=result,
        source="CoIP-MS (user data)",
        method=result.get("method", "Proteomics analysis"),
        sample_count=result.get("n_a", 0) + result.get("n_b", 0),
    )


# ══════════════════════════════
#  Public Differential Expression
# ══════════════════════════════


@interactomics_router.post("/differential-public")
async def run_public_de_endpoint(
    body: PublicDERequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Run differential expression on public GEO datasets.
    Annotates with known substrate information.
    """
    gene_list = await _enrich_genes(body, db)

    from app.services.differential_public import (
        run_public_differential_analysis,
        search_public_datasets,
    )

    # If no expression data, search for available datasets
    if not body.expression_matrix or not body.groups:
        if gene_list:
            datasets = await search_public_datasets(gene_list)
            return success_response(
                data={
                    "mode": "discovery",
                    "available_datasets": datasets,
                    "message": "No expression data provided. Select a GEO dataset to analyze.",
                },
                source="GEO/NCBI",
                method="Dataset discovery",
            )
        raise KiriValidationError(
            "Provide expression_matrix + groups, or genes for dataset discovery.",
            source="interactomics",
        )

    result = await run_public_differential_analysis(
        expression_matrix=body.expression_matrix,
        groups=body.groups,
        group_a=body.group_a,
        group_b=body.group_b,
        lfc_cutoff=body.lfc_cutoff,
        fdr_cutoff=body.fdr_cutoff,
        annotate_substrates=body.annotate_substrates,
    )

    return success_response(
        data=result,
        source="Public GEO dataset",
        method=result.get("method", "Differential expression"),
        sample_count=result.get("n_a", 0) + result.get("n_b", 0),
    )


# ══════════════════════════════
#  Substrate Prediction
# ══════════════════════════════


@interactomics_router.post("/substrate-scan")
async def run_substrate_scan_endpoint(
    body: SubstrateScanRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Scan mitochondrial proteins for rhomboid protease cleavage motifs
    within transmembrane domains.
    """
    gene_list = await _enrich_genes(body, db)

    from app.services.substrate_prediction import scan_substrates

    result = await scan_substrates(
        target_genes=gene_list or None,
        motif_pattern=body.motif_pattern,
        scan_all_mitocarta=body.scan_all_mitocarta,
    )

    return success_response(
        data=result,
        source="MitoCarta3.0 + UniProt",
        method=result.get("method", "Substrate prediction"),
        sample_count=result.get("total_scanned", 0),
    )


# ══════════════════════════════
#  Regulatory Network
# ══════════════════════════════


@interactomics_router.post("/regulatory-network")
async def build_regulatory_network_endpoint(
    body: RegulatoryNetworkRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Build integrated regulatory network from multi-omics evidence.
    Combines PPI, co-expression, DE, and substrate data.
    """
    gene_list = await _enrich_genes(body, db)
    if not gene_list:
        raise KiriValidationError(
            "No genes specified for regulatory network.",
            source="interactomics",
        )

    from app.services.interaction_ppi import (
        fetch_string_network,
        fetch_biogrid_interactions,
        merge_ppi_sources,
    )
    from app.services.interaction_intact import fetch_intact_interactions
    from app.services.regulatory_network import build_regulatory_network

    # Gather evidence from available sources
    ppi_data = None
    coexpr_data = None
    de_data = None
    substrate_data = None

    if body.include_ppi:
        string_data = await fetch_string_network(gene_list, confidence=0.4)
        biogrid_data = await fetch_biogrid_interactions(gene_list)
        intact_data = await fetch_intact_interactions(gene_list)
        ppi_data = merge_ppi_sources(
            string_data, biogrid_data,
            intact_data=intact_data,
            high_confidence_only=True,
        )

    if body.include_coexpression:
        from app.services.mito_coexpression import run_full_coexpression_pipeline
        coexpr_result = await run_full_coexpression_pipeline(
            genes=gene_list,
            project_ids=body.project_ids,
            r_cutoff=0.6,
            p_cutoff=0.05,
            top_n=50,
        )
        coexpr_data = coexpr_result.get("coexpression_scans")

    if body.include_substrates:
        from app.services.substrate_prediction import scan_substrates
        substrate_data = await scan_substrates(
            target_genes=gene_list,
            scan_all_mitocarta=True,
        )

    result = await build_regulatory_network(
        target_genes=gene_list,
        ppi_data=ppi_data,
        coexpression_data=coexpr_data,
        de_data=de_data,
        substrate_data=substrate_data,
        score_threshold=body.score_threshold,
    )

    return success_response(
        data=result,
        source="Multi-omics integration",
        method="Regulatory network (PPI + co-expression + substrate prediction)",
        sample_count=result.get("meta", {}).get("total_nodes", 0),
    )
