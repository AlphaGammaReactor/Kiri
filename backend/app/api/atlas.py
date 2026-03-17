"""
Kiri Atlas — API Router

Multi-Omics Atlas endpoints for expression data, clinical metadata,
GEO validation datasets, custom uploads, and normalization.

All endpoints use the standard response envelope with Provenance.
Mounted at /api/v1/atlas/
"""

import asyncio
import csv
import io
import logging
import uuid
from typing import Any

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.responses import success_response, error_response
from app.core.errors import KiriValidationError
from app.models.atlas import (
    ExpressionRequest,
    ClinicalRequest,
    GeoRequest,
    NormalizationRequest,
    DifferentialRequest,
    EnrichmentRequest,
    GSEAPrerankedRequest,
    TemporalClusterRequest,
    ImmuneDeconvolutionRequest,
    ValidationGridRequest,
    PanSurvivalRequest,
    CoexpressionRequest,
    MitoCorrelationRequest,
    MitoScoreRequest,
    PanCancerRequest,
    TCGA_PAN_CANCER_PROJECTS,
)
from app.models.project import Project, ProjectDataSource, ProjectProtein
from app.services.gdc import fetch_expression, fetch_clinical
from app.services.geo import fetch_geo_dataset, list_supported_datasets
from app.services.normalization import normalize, differential_expression

logger = logging.getLogger("kiri.atlas.api")

atlas_router = APIRouter(prefix="/atlas", tags=["Multi-Omics Atlas"])


# ══════════════════════════════
#  Helper
# ══════════════════════════════
async def _enrich_from_project(body: Any, db: AsyncSession):
    """Dynamically load genes and DB settings if project_id is provided."""
    if not getattr(body, "project_id", None):
        return

    try:
        pid = uuid.UUID(body.project_id)
    except ValueError:
        return

    # Load project with relations
    stmt = (
        select(Project)
        .where(Project.id == pid, Project.is_deleted == False)  # noqa: E712
        .options(selectinload(Project.proteins), selectinload(Project.data_sources))
    )
    res = await db.execute(stmt)
    project = res.scalar_one_or_none()
    
    if project:
        # Load genes if none provided
        if not body.genes and project.proteins:
            body.genes = [p.gene_symbol for p in project.proteins]
            
        # Optional: Load data source configs if not explicitly overridden
        # e.g., if GDC, find 'tcga'
        if hasattr(body, "project_ids") and body.project_ids == ["TCGA-COAD", "TCGA-READ"]:
            tcga_sources = [ds for ds in project.data_sources if ds.source_type == "tcga"]
            if tcga_sources:
                body.project_ids = [ds.config.get("project_id") for ds in tcga_sources if ds.config.get("project_id")]

# ══════════════════════════════
#  Expression Data (TCGA/GDC)
# ══════════════════════════════


@atlas_router.post("/expression")
async def get_expression(body: ExpressionRequest, db: AsyncSession = Depends(get_db)):
    """
    Fetch expression data for gene set from TCGA via GDC API.

    Returns expression matrix with sample metadata and provenance.
    """
    await _enrich_from_project(body, db)
    
    if not body.genes:
        raise KiriValidationError("No genes specified, and no project provided/found.", source="atlas")

    result = await fetch_expression(
        genes=body.genes,
        project_ids=body.project_ids,
        data_type=f"HTSeq - {'Counts' if body.normalization == 'counts' else 'FPKM'}",
    )

    return success_response(
        data=result,
        source="TCGA-COAD/READ (GDC)",
        method=f"{body.normalization.value.upper()} normalization",
        sample_count=result.get("sample_count", 0),
    )


# ══════════════════════════════
#  Clinical Metadata
# ══════════════════════════════


@atlas_router.post("/clinical")
async def get_clinical(body: ClinicalRequest, db: AsyncSession = Depends(get_db)):
    """
    Fetch clinical metadata (stage, MSI, survival) from GDC.
    """
    await _enrich_from_project(body, db)
    
    msi_values = [m.value for m in body.msi_filter] if body.msi_filter else None
    result = await fetch_clinical(
        project_ids=body.project_ids,
        stage_filter=body.stage_filter,
        msi_filter=msi_values,
    )

    return success_response(
        data=result,
        source="TCGA-COAD/READ (GDC)",
        method="Clinical metadata query",
        sample_count=result.get("total", 0),
    )


# ══════════════════════════════
#  GEO Validation Datasets
# ══════════════════════════════


@atlas_router.post("/geo")
async def get_geo_dataset(body: GeoRequest, db: AsyncSession = Depends(get_db)):
    """
    Fetch expression data from a GEO validation cohort.
    Supported: GSE39582 (585 CRC), GSE33113 (90 Stage II CRC).
    """
    await _enrich_from_project(body, db)
    
    if not body.genes:
        raise KiriValidationError("No genes specified, and no project provided/found.", source="atlas")

    result = await fetch_geo_dataset(
        accession=body.accession,
        genes=body.genes,
    )

    return success_response(
        data=result,
        source=f"GEO:{body.accession}",
        method="Microarray expression (log2)",
        sample_count=result.get("sample_count", 0),
    )


@atlas_router.get("/geo/datasets")
async def get_supported_geo_datasets():
    """List all supported GEO validation datasets."""
    datasets = await list_supported_datasets()
    return success_response(
        data=datasets,
        source="GEO/NCBI",
        method="Dataset registry",
    )


# ══════════════════════════════
#  Custom Upload
# ══════════════════════════════


@atlas_router.post("/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """
    Upload a custom CSV/TSV dataset with expression data.

    Expected format:
    - First column: gene symbols
    - Remaining columns: sample expression values
    - First row: header with sample IDs

    Validates column structure, data types, and gene symbols.
    """
    # Validate file type
    if not file.filename:
        raise KiriValidationError("No filename provided.", source="upload")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ("csv", "tsv", "txt"):
        raise KiriValidationError(
            f"Unsupported file type: '.{ext}'. Upload CSV or TSV files.",
            source="upload",
        )

    # Read file content
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        raise KiriValidationError(
            "File must be UTF-8 encoded.", source="upload"
        )

    # Parse CSV/TSV
    delimiter = "\t" if ext == "tsv" else ","
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows = list(reader)

    if len(rows) < 2:
        raise KiriValidationError(
            "File must have at least a header row and one data row.",
            source="upload",
        )

    # Extract header and data
    header = rows[0]
    if len(header) < 2:
        raise KiriValidationError(
            "File must have at least 2 columns (gene symbol + 1 sample).",
            source="upload",
        )

    sample_ids = header[1:]
    genes = []
    values: dict[str, list[float]] = {}
    warnings = []

    for row_idx, row in enumerate(rows[1:], start=2):
        if len(row) != len(header):
            warnings.append(f"Row {row_idx}: expected {len(header)} columns, got {len(row)} — skipped")
            continue

        gene = row[0].strip().upper()
        genes.append(gene)

        try:
            gene_values = [float(v) for v in row[1:]]
        except ValueError:
            warnings.append(f"Row {row_idx} ({gene}): non-numeric values — skipped")
            continue

        values[gene] = gene_values

    result = {
        "genes": genes,
        "samples": [
            {"sample_id": sid, "sample_type": "", "stage": "", "msi_status": "", "project": "custom"}
            for sid in sample_ids
        ],
        "values": values,
        "normalization": "custom (unknown)",
        "source": f"Custom upload: {file.filename}",
        "sample_count": len(sample_ids),
    }

    return success_response(
        data=result,
        source=f"Custom upload ({file.filename})",
        method="User-provided data",
        sample_count=len(sample_ids),
        warnings=warnings if warnings else None,
    )


# ══════════════════════════════
#  Normalization
# ══════════════════════════════


@atlas_router.post("/normalize")
async def normalize_expression(body: NormalizationRequest):
    """
    Normalize expression matrix to specified method (TPM/FPKM/Counts).
    """
    result = normalize(
        matrix=body.matrix,
        method=body.method.value,
        gene_lengths=body.gene_lengths,
    )

    return success_response(
        data={"values": result, "method": body.method.value},
        source="kiri-compute",
        method=f"{body.method.value.upper()} normalization",
    )


# ══════════════════════════════
#  Differential Expression
# ══════════════════════════════


@atlas_router.post("/differential")
async def run_differential_expression(body: DifferentialRequest):
    """
    Run differential expression analysis between two groups.

    Uses Wilcoxon rank-sum test with Benjamini-Hochberg FDR correction
    (per Research Brief §6 statistical standards).
    """
    result = differential_expression(
        matrix=body.matrix,
        groups=body.groups,
        group_a=body.group_a,
        group_b=body.group_b,
    )

    return success_response(
        data=result,
        source="kiri-compute",
        method=f"{result['method']} ({result['correction']})",
        sample_count=result["n_a"] + result["n_b"],
    )


# ══════════════════════════════
#  Gene Set Enrichment Analysis
# ══════════════════════════════


@atlas_router.post("/enrichment")
async def run_enrichment_analysis(body: EnrichmentRequest, db: AsyncSession = Depends(get_db)):
    """
    Run Over-Representation Analysis (ORA) against gene set libraries.

    Supported libraries: GO (BP/MF/CC), KEGG, Reactome, MSigDB Hallmark.
    Uses gseapy for computation with Kiri caching layer.
    """
    await _enrich_from_project(body, db)

    if not body.genes:
        raise KiriValidationError("No genes specified for enrichment analysis.", source="atlas")

    from app.services.enrichment import run_enrichment

    result = await run_enrichment(
        gene_list=body.genes,
        gene_sets=body.gene_sets,
        organism=body.organism,
        cutoff=body.cutoff,
        top_n=body.top_n,
    )

    return success_response(
        data=result,
        source="gseapy/Enrichr",
        method="Over-Representation Analysis (ORA)",
        sample_count=result.get("gene_count", 0),
    )


@atlas_router.get("/enrichment/libraries")
async def list_enrichment_libraries():
    """List available gene set libraries for enrichment analysis."""
    from app.services.enrichment import get_available_libraries

    libraries = await get_available_libraries()
    return success_response(
        data=libraries,
        source="gseapy",
        method="Library registry",
    )


@atlas_router.post("/enrichment/gsea-preranked")
async def run_gsea_preranked_analysis(body: GSEAPrerankedRequest):
    """
    Run GSEA pre-ranked analysis on a ranked gene list.

    Unlike ORA (which uses a gene list), pre-ranked GSEA uses
    the full ranked gene list to detect coordinated expression shifts.
    """
    if not body.ranked_genes or len(body.ranked_genes) < 15:
        raise KiriValidationError(
            "Need at least 15 ranked genes for GSEA pre-ranked.", source="atlas"
        )

    from app.services.enrichment import run_gsea_preranked

    result = await run_gsea_preranked(
        ranked_genes=body.ranked_genes,
        gene_sets=body.gene_sets,
        permutation_num=body.permutation_num,
        top_n=body.top_n,
    )

    return success_response(
        data=result,
        source="gseapy",
        method="GSEA Pre-Ranked",
        sample_count=result.get("gene_count", 0),
    )


@atlas_router.post("/temporal-clustering")
async def run_temporal_clustering(body: TemporalClusterRequest):
    """
    Run Mfuzz-style temporal expression clustering.

    Groups genes by their expression trajectory across ordered
    disease stages, producing fuzzy cluster memberships.
    """
    from app.services.temporal_clustering import compute_temporal_clusters
    from app.core.errors import KiriComputationError as _KCE

    try:
        result = compute_temporal_clusters(
            expression_matrix=body.expression_matrix,
            stage_labels=body.stage_labels,
            n_clusters=body.n_clusters,
            fuzziness=body.fuzziness,
        )
    except (_KCE, KiriValidationError) as e:
        return error_response(str(e), source="temporal", warnings=[str(e)])
    except ValueError as e:
        logger.warning(f"Temporal clustering ValueError: {e}")
        return error_response(f"Data error: {e}", source="temporal", warnings=[str(e)])

    return success_response(
        data=result,
        source="kiri-compute",
        method=result.get("method", "Temporal clustering"),
        sample_count=result.get("n_genes", 0),
    )


@atlas_router.post("/immune-deconvolution")
async def run_immune_deconvolution_analysis(body: ImmuneDeconvolutionRequest):
    """
    Run CIBERSORT or NNLS immune cell type deconvolution.

    Estimates proportions of 22 immune cell types (LM22) in bulk
    RNA-seq samples using nu-SVR (CIBERSORT) or NNLS.
    """
    expression_matrix = body.expression_matrix
    
    if not expression_matrix and body.project_ids:
        from app.services.cibersort import LM22_MARKERS
        from app.services.gdc import fetch_expression
        
        cibersort_genes = list(LM22_MARKERS.keys())
        expr_result = await fetch_expression(
            project_ids=body.project_ids,
            genes=cibersort_genes,
        )
        if expr_result and "values" in expr_result:
            # fetch_expression returns {"values": {gene: [values]}}
            expression_matrix = expr_result["values"]
            
    if not expression_matrix:
        raise KiriValidationError(
            "Either expression_matrix or project_ids must be provided.", source="atlas"
        )

    from app.services.cibersort import run_immune_deconvolution
    from app.core.errors import KiriComputationError as _KCE

    try:
        result = await run_immune_deconvolution(
            expression_matrix=expression_matrix,
            sample_ids=body.sample_ids,
            method=body.method,
            permutations=body.permutations,
        )
    except (_KCE, KiriValidationError) as e:
        return error_response(str(e), source="cibersort", warnings=[str(e)])
    except ValueError as e:
        logger.warning(f"Immune deconvolution ValueError: {e}")
        return error_response(f"Data error: {e}", source="cibersort", warnings=[str(e)])

    return success_response(
        data=result,
        source="CIBERSORT/LM22",
        method=result.get("method", "CIBERSORT"),
        sample_count=result.get("sample_count", 0),
    )


@atlas_router.post("/validation-grid")
async def run_validation_grid_analysis(body: ValidationGridRequest):
    """
    Run multi-cohort validation analysis.

    Compares gene expression across multiple cohorts with
    auto test selection (t-test or Wilcoxon) and BH correction.
    """
    from app.services.validation_grid import compute_validation_grid

    cohort_data = []
    if body.cohort_data:
        cohort_data = [
            {"name": c.name, "expression": c.expression, "groups": c.groups}
            for c in body.cohort_data
        ]
    elif body.project_ids:
        from app.services.gdc import fetch_expression
        
        expr_result = await fetch_expression(
            project_ids=body.project_ids,
            genes=body.genes,
        )
        
        if expr_result and "values" in expr_result:
            # Group by project to create cohorts natively
            projects = set(s.get("project", "Unknown") for s in expr_result["samples"])
            
            # For each project, extract its expression matrix slice and sample types
            for proj in sorted(projects):
                indices = [i for i, s in enumerate(expr_result["samples"]) if s.get("project") == proj]
                if not indices:
                    continue
                
                expr = {}
                for g, vals in expr_result["values"].items():
                    expr[g] = [vals[i] for i in indices]
                
                groups = [expr_result["samples"][i].get("sample_type", "tumor") for i in indices]
                
                cohort_data.append({
                    "name": proj,
                    "expression": expr,
                    "groups": groups
                })
                
    if len(cohort_data) < 2:
        raise KiriValidationError(
            "Validation grid requires at least 2 valid cohorts. Ensure they contain expression and group data.",
            source="atlas"
        )

    result = compute_validation_grid(
        cohort_data=cohort_data,
        genes=body.genes,
        group_a=body.group_a,
        group_b=body.group_b,
        p_cutoff=body.p_cutoff,
        fc_cutoff=body.fc_cutoff,
    )

    return success_response(
        data=result,
        source="multi-cohort",
        method=result.get("method", "Validation Grid"),
        sample_count=len(result.get("cohorts", [])),
    )


@atlas_router.post("/pan-survival")
async def run_pan_survival_analysis(body: PanSurvivalRequest):
    """
    Run pan-metric survival analysis (OS, DFS, PFS, DSS).

    Returns HR + 95% CI for each gene × each survival metric.
    """
    from app.services.pan_survival import compute_pan_survival

    expression_data = body.expression_data
    clinical_records = body.clinical_records
    
    if (not expression_data or not clinical_records) and body.project_ids:
        from app.services.gdc import fetch_expression, fetch_clinical
        
        expr_result = await fetch_expression(
            project_ids=body.project_ids,
            genes=body.genes,
        )
        clin_result = await fetch_clinical(
            project_ids=body.project_ids,
        )
        
        if expr_result and clin_result and "values" in expr_result and "records" in clin_result:
            expression_data = expr_result["values"]
            
            # Map clin records to submitter_id
            clin_map = {c["submitter_id"]: c for c in clin_result["records"]}
            
            # Generate clinical records aligning with expression samples order
            clinical_records = []
            for s in expr_result["samples"]:
                sid = s["sample_id"]
                
                # Strip sample suffix (e.g., -01A) to get patient ID for map lookup
                patient_id = sid[:12] if sid.startswith("TCGA-") else sid
                clin = clin_map.get(patient_id) or clin_map.get(sid) or {}
                
                # OS metrics from days_to_death/last_follow_up
                vital = clin.get("vital_status", "").lower()
                dtd = clin.get("days_to_death")
                dtl = clin.get("days_to_last_follow_up")
                
                clinical_records.append({
                    "case_id": sid,
                    "vital_status": "Dead" if vital == "dead" else "Alive",
                    "days_to_death": dtd,
                    "days_to_last_follow_up": dtl,
                    # Fallback values for DFS/PFS/DSS if not present
                    "disease_free_status": "Recurred/Progressed" if vital == "dead" else "DiseaseFree",
                    "days_to_recurrence": dtd if dtd is not None else dtl,
                    "progression_status": "Progressed" if vital == "dead" else "ProgressionFree",
                    "days_to_progression": dtd if dtd is not None else dtl,
                    "cause_of_death": "cancer" if vital == "dead" else "alive"
                })
            
    if not expression_data or not clinical_records:
        raise KiriValidationError(
            "Either (expression_data AND clinical_records) OR project_ids must be provided.",
            source="atlas"
        )
        
    result = compute_pan_survival(
        genes=body.genes,
        expression_data=expression_data,
        clinical_records=clinical_records,
        metrics=body.metrics,
        covariates=body.covariates,
    )

    return success_response(
        data=result,
        source="TCGA/GDC",
        method=result.get("method", "Pan-Survival"),
        sample_count=len(clinical_records),
    )


# ══════════════════════════════
#  Mitochondrial Gene Analysis
# ══════════════════════════════


@atlas_router.post("/coexpression")
async def run_coexpression_analysis(body: CoexpressionRequest, db: AsyncSession = Depends(get_db)):
    """
    Run genome-wide co-expression scan + GSEA enrichment.

    For each target gene, computes Pearson correlation against all genes
    in the TCGA-COAD expression matrix, filters by |r| > r_cutoff and p < p_cutoff,
    then runs GSEA pre-ranked against MSigDB Hallmark gene sets.
    Also returns scatter data for core mitochondrial gene correlations.
    """
    await _enrich_from_project(body, db)

    if not body.genes:
        raise KiriValidationError("No genes specified for co-expression analysis.", source="atlas")

    from app.services.mito_coexpression import run_full_coexpression_pipeline

    result = await run_full_coexpression_pipeline(
        genes=body.genes,
        project_ids=body.project_ids,
        r_cutoff=body.r_cutoff,
        p_cutoff=body.p_cutoff,
        top_n=body.top_n,
    )

    return success_response(
        data=result,
        source="TCGA-COAD/READ (GDC)",
        method="Genome-wide Pearson co-expression + GSEA",
        sample_count=result.get("sample_count", 0),
    )


@atlas_router.post("/mito-correlation")
async def run_mito_correlation_analysis(body: MitoCorrelationRequest, db: AsyncSession = Depends(get_db)):
    """
    Compute scatter correlations between target genes and core mitochondrial genes.

    Returns r-value, p-value, regression line, and scatter data for each pair.
    """
    await _enrich_from_project(body, db)

    if not body.genes:
        raise KiriValidationError("No genes specified.", source="atlas")

    from app.services.mito_coexpression import compute_mito_gene_correlations, CORE_MITO_GENES
    from app.services.gdc import fetch_expression

    # Fetch expression for target + mito genes
    mito_genes = body.mito_genes or list(CORE_MITO_GENES.keys())
    all_genes = list(set([g.upper() for g in body.genes] + mito_genes))

    expr_result = await fetch_expression(
        genes=all_genes,
        project_ids=body.project_ids,
    )

    if not expr_result or "values" not in expr_result:
        raise KiriValidationError("Failed to fetch expression data.", source="atlas")

    result = await compute_mito_gene_correlations(
        target_genes=body.genes,
        expression_matrix=expr_result["values"],
        mito_genes=mito_genes,
    )

    return success_response(
        data=result,
        source="TCGA-COAD/READ (GDC)",
        method="Pearson correlation (mitochondrial genes)",
        sample_count=expr_result.get("sample_count", 0),
    )


@atlas_router.post("/mito-score")
async def run_mito_score_analysis(body: MitoScoreRequest, db: AsyncSession = Depends(get_db)):
    """
    Compute ssGSEA mitochondrial function score and compare
    between high/low expression groups.

    Uses MitoCarta3.0 curated gene set for scoring and maxstat
    optimal cutpoint for group stratification.
    """
    await _enrich_from_project(body, db)

    if not body.genes:
        raise KiriValidationError("No genes specified.", source="atlas")

    from app.services.mito_function_score import run_mito_score_pipeline
    from app.core.errors import KiriComputationError as _KCE

    try:
        result = await run_mito_score_pipeline(
            genes=body.genes,
            project_ids=body.project_ids,
            cutpoint_method=body.cutpoint_method,
        )
    except (_KCE, KiriValidationError) as e:
        return error_response(str(e), source="mito-score", warnings=[str(e)])
    except (ValueError, KeyError) as e:
        logger.warning(f"Mito score error: {e}")
        return error_response(f"Data error: {e}", source="mito-score", warnings=[str(e)])

    return success_response(
        data=result,
        source="TCGA-COAD/READ (GDC)",
        method="ssGSEA + maxstat cutpoint",
        sample_count=result.get("sample_count", 0),
    )


# ══════════════════════════════
#  Pan-Cancer Expression Boxplot
# ══════════════════════════════


@atlas_router.post("/pan-cancer-expression")
async def get_pan_cancer_expression(body: PanCancerRequest, db: AsyncSession = Depends(get_db)):
    """
    Fetch expression data for gene(s) across all major TCGA cancer types.

    For each cancer type, returns Normal vs Tumor expression values
    with Wilcoxon rank-sum p-value and log2 fold change.
    Used for GEPIA-style pan-cancer boxplot visualization.
    """
    await _enrich_from_project(body, db)

    if not body.genes:
        raise KiriValidationError("No genes specified.", source="atlas")

    cancer_projects = body.cancer_projects or TCGA_PAN_CANCER_PROJECTS

    from scipy import stats as scipy_stats
    import numpy as np

    async def _fetch_one_project(project_id: str):
        """Fetch expression for a single TCGA project and compute stats."""
        try:
            result = await fetch_expression(
                genes=body.genes,
                project_ids=[project_id],
            )
            if not result or not result.get("samples"):
                return None

            samples = result["samples"]
            values = result["values"]

            # Split samples into normal vs tumor
            normal_idx = [i for i, s in enumerate(samples) if s.get("sample_type") == "normal"]
            tumor_idx = [i for i, s in enumerate(samples) if s.get("sample_type") == "tumor"]

            if not tumor_idx:
                return None  # No tumor samples → skip

            # Build per-gene stats
            gene_stats = []
            for gene in body.genes:
                gene_vals = values.get(gene.upper(), values.get(gene, []))
                if not gene_vals:
                    continue

                normal_vals = [gene_vals[i] for i in normal_idx] if normal_idx else []
                tumor_vals = [gene_vals[i] for i in tumor_idx]

                # Wilcoxon rank-sum test (lightweight, fast)
                p_value = 1.0
                if len(normal_vals) >= 3 and len(tumor_vals) >= 3:
                    try:
                        _, p_value = scipy_stats.ranksums(
                            np.array(tumor_vals), np.array(normal_vals)
                        )
                        p_value = float(p_value)
                    except Exception:
                        p_value = 1.0

                # Log2 fold change
                mean_t = float(np.mean(tumor_vals)) if tumor_vals else 0.0
                mean_n = float(np.mean(normal_vals)) if normal_vals else 0.0
                log2fc = 0.0
                if mean_n > 0 and mean_t > 0:
                    log2fc = float(np.log2(mean_t / mean_n))

                gene_stats.append({
                    "gene": gene.upper(),
                    "normal_values": normal_vals,
                    "tumor_values": tumor_vals,
                    "p_value": round(p_value, 8),
                    "log2fc": round(log2fc, 4),
                    "n_normal": len(normal_vals),
                    "n_tumor": len(tumor_vals),
                    "mean_normal": round(mean_n, 4),
                    "mean_tumor": round(mean_t, 4),
                })

            if not gene_stats:
                return None

            # Short label: TCGA-BRCA → BRCA
            short = project_id.replace("TCGA-", "")

            return {
                "project": project_id,
                "label": short,
                "total_samples": len(samples),
                "genes": gene_stats,
            }
        except Exception as e:
            logger.warning(f"Pan-cancer: failed to fetch {project_id}: {e}")
            return None

    # Fetch all projects concurrently (batched to avoid overload)
    BATCH_SIZE = 8
    all_results = []
    for i in range(0, len(cancer_projects), BATCH_SIZE):
        batch = cancer_projects[i : i + BATCH_SIZE]
        batch_results = await asyncio.gather(
            *[_fetch_one_project(pid) for pid in batch],
            return_exceptions=True,
        )
        for r in batch_results:
            if r is not None and not isinstance(r, Exception):
                all_results.append(r)

    # Sort by label
    all_results.sort(key=lambda x: x["label"])

    return success_response(
        data={
            "cancer_types": all_results,
            "genes": [g.upper() for g in body.genes],
            "total_cancer_types": len(all_results),
        },
        source="TCGA Pan-Cancer (GDC)",
        method="Wilcoxon rank-sum test",
        sample_count=sum(r["total_samples"] for r in all_results),
    )
