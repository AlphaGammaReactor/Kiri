"""
Kiri — Interactomics Module: Pydantic Models

Request/response models for Phase 9 endpoints:
- Enhanced PPI Network
- Co-expression Heatmap
- Proteomics (CoIP-MS)
- Public Differential Expression
- Substrate Prediction
- Regulatory Network
"""

from typing import Any
from pydantic import BaseModel, Field


class EnhancedPPIRequest(BaseModel):
    """Enhanced PPI network with IntAct + mito annotations."""
    genes: list[str] = Field(default=[], description="Gene symbols (falls back to project proteins)")
    project_id: str | None = None
    confidence: float = Field(default=0.4, ge=0, le=1, description="Minimum STRING confidence")
    high_confidence_only: bool = Field(default=False, description="Filter to score > 0.7 or multi-source")
    include_biogrid: bool = Field(default=True, description="Include BioGRID data source")
    include_intact: bool = Field(default=True, description="Include IntAct data source")
    annotate_mito: bool = Field(default=True, description="Annotate with MitoCarta3.0 localization")


class CoexpressionHeatmapRequest(BaseModel):
    """Co-expression heatmap matrix request."""
    genes: list[str] = Field(default=[], description="Gene symbols")
    project_id: str | None = None
    project_ids: list[str] = Field(default=["TCGA-COAD", "TCGA-READ"])
    r_cutoff: float = Field(default=0.6, ge=0, le=1, description="Minimum |Pearson r|")
    p_cutoff: float = Field(default=0.05, ge=0, le=1)
    top_n: int = Field(default=50, ge=5, le=500, description="Top co-expressed genes for heatmap")


class ProteomicsRequest(BaseModel):
    """CoIP-MS / proteomics analysis request."""
    genes: list[str] = Field(default=[], description="Gene symbols")
    project_id: str | None = None
    abundance_matrix: dict[str, list[float]] | None = Field(
        default=None,
        description="protein → [abundance per sample] (user-uploaded data)"
    )
    groups: list[str] | None = Field(
        default=None,
        description="Sample group labels (e.g., ['bait', 'bait', 'control', 'control'])"
    )
    group_a: str = Field(default="bait", description="Experimental group name")
    group_b: str = Field(default="control", description="Control group name")
    fdr_cutoff: float = Field(default=0.05, ge=0, le=1)
    lfc_cutoff: float = Field(default=1.0, ge=0)
    pride_accession: str | None = Field(default=None, description="PRIDE dataset accession")


class PublicDERequest(BaseModel):
    """Public dataset differential expression request."""
    genes: list[str] = Field(default=[], description="Gene symbols")
    project_id: str | None = None
    expression_matrix: dict[str, list[float]] | None = Field(
        default=None,
        description="gene → [expression values per sample]"
    )
    groups: list[str] | None = Field(
        default=None,
        description="Sample group labels"
    )
    group_a: str = Field(default="perturbation")
    group_b: str = Field(default="control")
    lfc_cutoff: float = Field(default=1.0, ge=0)
    fdr_cutoff: float = Field(default=0.05, ge=0, le=1)
    geo_accessions: list[str] | None = Field(default=None, description="Specific GEO datasets")
    annotate_substrates: bool = Field(default=True, description="Add known substrate annotations")


class SubstrateScanRequest(BaseModel):
    """Mitochondrial substrate prediction request."""
    genes: list[str] = Field(default=[], description="Gene symbols to scan")
    project_id: str | None = None
    motif_pattern: str | None = Field(default=None, description="Custom cleavage motif regex")
    scan_all_mitocarta: bool = Field(default=True, description="Scan all known TM mito proteins")


class RegulatoryNetworkRequest(BaseModel):
    """Regulatory network construction request."""
    genes: list[str] = Field(default=[], description="Central gene symbols")
    project_id: str | None = None
    project_ids: list[str] = Field(default=["TCGA-COAD", "TCGA-READ"])
    include_ppi: bool = Field(default=True)
    include_coexpression: bool = Field(default=True)
    include_de: bool = Field(default=True)
    include_substrates: bool = Field(default=True)
    score_threshold: float = Field(default=0.5, ge=0, le=1)
