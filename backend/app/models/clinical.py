"""
Kiri Clinical — Pydantic Models

Request/response models for the Clinical & Prognostic Suite module.
Strict schemas for Survival Analysis, Cox Regression, and Synergy.
"""

from enum import Enum

from pydantic import BaseModel, Field


# ── Enums ──

class CutpointMethod(str, Enum):
    MAXSTAT = "maxstat"
    MEDIAN = "median"
    CUSTOM = "custom"


class SynergyType(str, Enum):
    SYNERGISTIC = "synergistic"
    ANTAGONISTIC = "antagonistic"
    ADDITIVE = "additive"
    UNKNOWN = "unknown"


# ── Common ──

class DateRange(BaseModel):
    start: float | None = None
    end: float | None = None


# ── Request Models ──

class SurvivalRequest(BaseModel):
    """Request for Kaplan-Meier survival analysis."""
    genes: list[str] = Field(
        ..., min_length=1, max_length=5,
        description="Gene symbols to stratify by (typically 1 for KM)"
    )
    project_ids: list[str] = Field(
        default=["TCGA-COAD", "TCGA-READ"],
        description="GDC project IDs"
    )
    cutpoint_method: CutpointMethod = Field(
        default=CutpointMethod.MAXSTAT,
        description="Method to find high/low expression threshold"
    )
    custom_cutpoint: float | None = Field(
        default=None,
        description="Value if method is CUSTOM"
    )
    stage_filter: list[str] | None = Field(default=None)
    msi_filter: list[str] | None = Field(default=None)


class CoxRequest(BaseModel):
    """Request for Cox Proportional Hazards regression."""
    genes: list[str] = Field(..., min_length=1)
    covariates: list[str] = Field(
        default=["stage", "msi"],
        description="Clinical covariates to include (e.g., 'stage', 'msi')"
    )
    project_ids: list[str] = Field(default=["TCGA-COAD", "TCGA-READ"])
    stage_filter: list[str] | None = Field(default=None)
    msi_filter: list[str] | None = Field(default=None)


class SynergyRequest(BaseModel):
    """Request for PARL×MAVS synergy score analysis."""
    gene_a: str = Field(default="PARL")
    gene_b: str = Field(default="MAVS")
    project_ids: list[str] = Field(default=["TCGA-COAD", "TCGA-READ"])
    cutpoint_method: CutpointMethod = Field(default=CutpointMethod.MEDIAN)


# ── Response Models ──

class SurvivalCurveResult(BaseModel):
    """One survival curve (e.g., 'High PARL')."""
    group_name: str
    n_samples: int
    median_survival: float | None = Field(description="Median survival in days")
    time: list[float]
    survival: list[float]
    ci_lower: list[float]
    ci_upper: list[float]


class AtRiskTable(BaseModel):
    """At-risk counts at regular time intervals."""
    time_points: list[float]
    groups: dict[str, list[int]] = Field(
        description="group_name -> list of counts at each time_point"
    )


class CutpointSearchPoint(BaseModel):
    """One candidate cutpoint tested during MaxStat optimization."""
    cutpoint: float
    p_value: float


class SurvivalResult(BaseModel):
    """Full Kaplan-Meier result."""
    curves: list[SurvivalCurveResult]
    p_value: float = Field(
        description=(
            "Log-rank p-value. For the optimal (maxstat) cutpoint this is the "
            "p-value adjusted for having searched many cutpoints."
        )
    )
    p_value_unadjusted: float | None = Field(
        default=None,
        description="Nominal log-rank p-value at the chosen cutpoint, before adjustment (maxstat only)",
    )
    p_value_method: str = Field(default="log-rank", description="How p_value was obtained")
    hr_note: str | None = Field(
        default=None,
        description="Caveat about the hazard ratio (it is optimistic after a cutpoint search)",
    )
    cutpoint_value: float
    cutpoint_method: str
    at_risk_table: AtRiskTable
    hr: float | None = Field(default=None, description="Hazard Ratio (High vs Low)")
    hr_ci_lower: float | None = Field(default=None, description="HR 95% CI lower bound")
    hr_ci_upper: float | None = Field(default=None, description="HR 95% CI upper bound")
    cutpoint_search_data: list[CutpointSearchPoint] | None = Field(
        default=None,
        description="MaxStat search landscape — cutpoint vs p-value pairs"
    )


class HazardRatioResult(BaseModel):
    """HR result for one covariate/gene in Cox model."""
    variable: str
    hr: float
    ci_lower: float
    ci_upper: float
    p_value: float
    significant: bool


class CoxResult(BaseModel):
    """Full Cox regression result."""
    hazard_ratios: list[HazardRatioResult]
    concordance_index: float
    n_samples: int
    n_events: int


class SynergyResult(BaseModel):
    """Full synergy score result."""
    gene_a: str
    gene_b: str
    interaction_p_value: float
    combined_hr: float
    synergy_type: str
    curves: list[SurvivalCurveResult]
    at_risk_table: AtRiskTable
    concordance_index: float
    n_samples: int
