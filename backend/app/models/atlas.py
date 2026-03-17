"""
Kiri Atlas — Pydantic Models

Request/response models for the Multi-Omics Atlas module.
All expression data flows through these strictly-typed schemas.
"""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ── Enums ──


class NormalizationMethod(str, Enum):
    TPM = "tpm"
    FPKM = "fpkm"
    COUNTS = "counts"


class DataSourceType(str, Enum):
    TCGA = "tcga"
    GEO = "geo"
    CUSTOM = "custom"


class SampleType(str, Enum):
    TUMOR = "tumor"
    NORMAL = "normal"


class MsiStatus(str, Enum):
    MSI_H = "MSI-H"
    MSI_L = "MSI-L"
    MSS = "MSS"


# ── Request Models ──


class ExpressionRequest(BaseModel):
    """Request to fetch expression data from TCGA via GDC."""

    genes: list[str] | None = Field(
        default=None,
        description="Gene symbols to query (HGNC format, e.g., ['PARL', 'MAVS'])",
    )
    project_id: str | None = Field(
        default=None,
        description="Optional Kiri Project ID to load genes from",
    )
    project_ids: list[str] = Field(
        default=["TCGA-COAD", "TCGA-READ"],
        description="GDC project IDs to query",
    )
    normalization: NormalizationMethod = Field(
        default=NormalizationMethod.TPM,
        description="Expression normalization method",
    )
    sample_types: list[SampleType] | None = Field(
        default=None,
        description="Filter by sample type (tumor/normal). None = both.",
    )


class ClinicalRequest(BaseModel):
    """Request to fetch clinical metadata."""

    project_id: str | None = Field(
        default=None,
        description="Optional Kiri Project ID to load clinical metadata context from",
    )
    project_ids: list[str] = Field(
        default=["TCGA-COAD", "TCGA-READ"],
        description="GDC project IDs",
    )
    stage_filter: list[str] | None = Field(
        default=None,
        description="Filter by AJCC stage (e.g., ['Stage I', 'Stage II'])",
    )
    msi_filter: list[MsiStatus] | None = Field(
        default=None,
        description="Filter by MSI status",
    )


class GeoRequest(BaseModel):
    """Request to fetch GEO dataset."""

    accession: str = Field(
        ..., pattern=r"^GSE\d+$",
        description="GEO accession ID (e.g., GSE39582)",
    )
    genes: list[str] | None = Field(
        default=None,
        description="Gene symbols to extract",
    )
    project_id: str | None = Field(
        default=None,
        description="Optional Kiri Project ID to load genes from",
    )


class NormalizationRequest(BaseModel):
    """Request to normalize an expression matrix."""

    matrix: dict[str, list[float]] = Field(
        ..., description="Gene → expression values dict",
    )
    method: NormalizationMethod = Field(
        ..., description="Target normalization method",
    )
    gene_lengths: dict[str, int] | None = Field(
        default=None,
        description="Gene → length in bp (required for TPM/FPKM from counts)",
    )


class EnrichmentRequest(BaseModel):
    """Request to run gene set enrichment analysis (ORA)."""

    genes: list[str] = Field(
        ..., description="Gene symbols to analyze (HGNC format)",
        min_length=1,
    )
    gene_sets: list[str] | None = Field(
        default=None,
        description="Library keys: go_bp, go_mf, go_cc, kegg, reactome, hallmark. None = all.",
    )
    organism: str = Field(
        default="human",
        description="Organism for enrichment analysis",
    )
    cutoff: float = Field(
        default=0.05,
        ge=0.0,
        le=1.0,
        description="Adjusted p-value cutoff for significance",
    )
    top_n: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum enriched terms to return per library",
    )
    project_id: str | None = Field(
        default=None,
        description="Optional Kiri Project ID to load genes from",
    )


class GSEAPrerankedRequest(BaseModel):
    """Request to run GSEA pre-ranked analysis."""

    ranked_genes: dict[str, float] = Field(
        ..., description="Gene symbol → ranking metric (e.g., -log10(p) * sign(logFC))",
    )
    gene_sets: list[str] | None = Field(
        default=None,
        description="Library keys. None = all.",
    )
    permutation_num: int = Field(
        default=100, ge=10, le=1000,
        description="Number of permutations for significance estimation",
    )
    top_n: int = Field(
        default=20, ge=1, le=100,
        description="Max enriched terms per library",
    )


class TemporalClusterRequest(BaseModel):
    """Request to run temporal expression clustering."""

    expression_matrix: dict[str, list[float]] = Field(
        ..., description="Gene → expression values per sample",
    )
    stage_labels: list[str] = Field(
        ..., description="Per-sample stage/time label in order",
    )
    n_clusters: int = Field(
        default=6, ge=2, le=12,
        description="Number of clusters to form",
    )
    fuzziness: float = Field(
        default=2.0, ge=1.1, le=5.0,
        description="Fuzzy membership exponent (higher = softer boundaries)",
    )


class ImmuneDeconvolutionRequest(BaseModel):
    """Request to run CIBERSORT immune cell deconvolution."""

    expression_matrix: dict[str, list[float]] | None = Field(
        default=None, description="Gene → expression values per sample (for custom data)",
    )
    project_ids: list[str] | None = Field(
        default=None, description="GDC project IDs to fetch expression for LM22 genes",
    )
    sample_ids: list[str] | None = Field(
        default=None,
        description="Optional sample identifiers",
    )
    method: str = Field(
        default="cibersort",
        description="Deconvolution method: 'cibersort' (nu-SVR) or 'nnls'",
    )
    permutations: int = Field(
        default=100, ge=10, le=1000,
        description="Permutation count for p-value estimation (CIBERSORT only)",
    )


class CohortInput(BaseModel):
    """Single cohort input for validation grid."""

    name: str = Field(..., description="Cohort name (e.g., 'TCGA-COAD')")
    expression: dict[str, list[float]] = Field(
        ..., description="Gene → expression values per sample",
    )
    groups: list[str] = Field(
        ..., description="Per-sample group labels (e.g., ['tumor', 'normal', ...])",
    )


class ValidationGridRequest(BaseModel):
    """Request to run multi-cohort validation analysis."""

    cohort_data: list[CohortInput] | None = Field(
        default=None, description="List of cohorts with expression + group data",
    )
    project_ids: list[str] | None = Field(
        default=None, description="GDC project IDs to use as cohorts",
    )
    genes: list[str] = Field(
        ..., description="Gene symbols to validate across cohorts",
        min_length=1,
    )
    group_a: str = Field(default="tumor", description="Test group")
    group_b: str = Field(default="normal", description="Reference group")
    p_cutoff: float = Field(default=0.05, ge=0.001, le=0.10)
    fc_cutoff: float = Field(default=1.0, ge=0.0, le=5.0)


class PanSurvivalRequest(BaseModel):
    """Request to run pan-metric survival analysis."""

    genes: list[str] = Field(
        ..., description="Gene symbols to analyze",
        min_length=1,
    )
    expression_data: dict[str, list[float]] | None = Field(
        default=None, description="Gene → expression values (custom data)",
    )
    clinical_records: list[dict[str, Any]] | None = Field(
        default=None, description="Per-sample clinical dicts (custom data)",
    )
    project_ids: list[str] | None = Field(
        default=None, description="GDC project IDs to fetch data for",
    )
    metrics: list[str] | None = Field(
        default=None,
        description="Survival metrics to compute: OS, DFS, PFS, DSS",
    )
    covariates: list[str] | None = Field(
        default=None,
        description="Additional covariates (e.g., ['age', 'stage'])",
    )


class DifferentialRequest(BaseModel):
    """Request to run differential expression analysis."""

    matrix: dict[str, list[float]] = Field(
        ..., description="Gene → expression values dict",
    )
    groups: list[str] = Field(
        ..., description="Group label per sample (e.g., ['tumor', 'normal', ...])",
    )
    group_a: str = Field(
        default="tumor", description="Test group",
    )
    group_b: str = Field(
        default="normal", description="Reference group",
    )


# ── Response Models ──


class SampleMeta(BaseModel):
    """Metadata for a single sample."""

    sample_id: str
    sample_type: str = ""
    stage: str = ""
    msi_status: str = ""
    project: str = ""


class ExpressionData(BaseModel):
    """Expression matrix with sample metadata."""

    genes: list[str] = Field(description="Gene symbols (rows)")
    samples: list[SampleMeta] = Field(description="Sample metadata (columns)")
    values: dict[str, list[float]] = Field(
        description="Gene → expression values (one value per sample)",
    )
    normalization: str = Field(description="Normalization method used")
    source: str = Field(description="Data source identifier")


class DifferentialResult(BaseModel):
    """Result of differential expression analysis for one gene."""

    gene: str
    log2_fold_change: float
    p_value: float
    adjusted_p_value: float
    mean_a: float = Field(description="Mean expression in test group")
    mean_b: float = Field(description="Mean expression in reference group")


class DifferentialResponse(BaseModel):
    """Full differential expression analysis result."""

    results: list[DifferentialResult]
    method: str = Field(description="Statistical test used")
    correction: str = Field(description="Multiple testing correction method")
    group_a: str
    group_b: str
    n_a: int = Field(description="Sample count in test group")
    n_b: int = Field(description="Sample count in reference group")


# ── Mitochondrial Analysis Request Models ──


class CoexpressionRequest(BaseModel):
    """Request for genome-wide co-expression scan + GSEA."""

    genes: list[str] = Field(
        ..., description="Target genes (e.g., ['PARL', 'MAVS'])",
        min_length=1,
    )
    project_ids: list[str] = Field(
        default=["TCGA-COAD", "TCGA-READ"],
        description="GDC project IDs",
    )
    r_cutoff: float = Field(
        default=0.3, ge=0.1, le=0.9,
        description="Minimum absolute Pearson r for filtering",
    )
    p_cutoff: float = Field(
        default=0.05, ge=0.001, le=0.10,
        description="Maximum p-value for filtering",
    )
    top_n: int = Field(
        default=200, ge=10, le=1000,
        description="Maximum correlated genes to return",
    )
    project_id: str | None = Field(
        default=None,
        description="Optional Kiri Project ID",
    )


class MitoCorrelationRequest(BaseModel):
    """Request for PARL/MAVS × mitochondrial gene scatter correlations."""

    genes: list[str] = Field(
        ..., description="Target genes",
        min_length=1,
    )
    project_ids: list[str] = Field(
        default=["TCGA-COAD", "TCGA-READ"],
        description="GDC project IDs",
    )
    mito_genes: list[str] | None = Field(
        default=None,
        description="Custom mitochondrial gene list (defaults to 8 core genes)",
    )
    project_id: str | None = Field(
        default=None,
        description="Optional Kiri Project ID",
    )


class MitoScoreRequest(BaseModel):
    """Request for ssGSEA mitochondrial function score + high/low comparison."""

    genes: list[str] = Field(
        ..., description="Genes to split high/low on",
        min_length=1,
    )
    project_ids: list[str] = Field(
        default=["TCGA-COAD", "TCGA-READ"],
        description="GDC project IDs",
    )
    cutpoint_method: str = Field(
        default="maxstat",
        description="Cutpoint method: 'maxstat' or 'median'",
    )
    project_id: str | None = Field(
        default=None,
        description="Optional Kiri Project ID",
    )


# ── Major TCGA Cancer Types for Pan-Cancer Analysis ──

TCGA_PAN_CANCER_PROJECTS: list[str] = [
    "TCGA-ACC", "TCGA-BLCA", "TCGA-BRCA", "TCGA-CESC", "TCGA-CHOL",
    "TCGA-COAD", "TCGA-DLBC", "TCGA-ESCA", "TCGA-GBM", "TCGA-HNSC",
    "TCGA-KICH", "TCGA-KIRC", "TCGA-KIRP", "TCGA-LAML", "TCGA-LGG",
    "TCGA-LIHC", "TCGA-LUAD", "TCGA-LUSC", "TCGA-MESO", "TCGA-OV",
    "TCGA-PAAD", "TCGA-PCPG", "TCGA-PRAD", "TCGA-READ", "TCGA-SARC",
    "TCGA-SKCM", "TCGA-STAD", "TCGA-TGCT", "TCGA-THCA", "TCGA-THYM",
    "TCGA-UCEC", "TCGA-UCS", "TCGA-UVM",
]


class PanCancerRequest(BaseModel):
    """Request for pan-cancer expression boxplot data."""

    genes: list[str] = Field(
        ..., description="Gene symbols to query across cancer types",
        min_length=1,
    )
    cancer_projects: list[str] | None = Field(
        default=None,
        description="TCGA project IDs to query. Defaults to all 33 major types.",
    )
    project_id: str | None = Field(
        default=None,
        description="Optional Kiri Project ID to load genes from",
    )
