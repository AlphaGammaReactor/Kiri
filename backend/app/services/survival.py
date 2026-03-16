"""
Kiri Clinical — Survival Analysis Service

Kaplan-Meier survival curves with optimal cutpoint generation via Lifelines.
"""

import logging
from typing import Any

import numpy as np
import pandas as pd
from lifelines import KaplanMeierFitter
from lifelines.statistics import logrank_test

from app.services.gdc import fetch_clinical, fetch_expression
from app.models.clinical import (
    SurvivalResult,
    SurvivalCurveResult,
    AtRiskTable,
    CutpointMethod,
)
from app.core.errors import KiriComputationError

logger = logging.getLogger("kiri.clinical.survival")


async def run_kaplan_meier(
    gene: str,
    project_ids: list[str],
    cutpoint_method: CutpointMethod = CutpointMethod.MAXSTAT,
    custom_cutpoint: float | None = None,
    stage_filter: list[str] | None = None,
    msi_filter: list[str] | None = None,
) -> SurvivalResult:
    """Run Kaplan-Meier survival analysis for a single gene."""
    logger.info(f"Running KM analysis for {gene} in {project_ids}")

    # 1. Fetch data
    clinical_data = await fetch_clinical(project_ids, stage_filter, msi_filter)
    expr_data = await fetch_expression([gene], project_ids, "tpm")
    
    # 2. Build aligned DataFrame
    df = _build_survival_df(clinical_data, expr_data, gene)
    if len(df) < 10:
        raise KiriComputationError("survival", "Insufficient samples with both survival and expression data (n < 10).")

    # 3. Determine cutpoint
    expr_vals = df["expression"].values
    cutpoint_search_data = None
    if cutpoint_method == CutpointMethod.CUSTOM and custom_cutpoint is not None:
        cutpoint = custom_cutpoint
    elif cutpoint_method == CutpointMethod.MAXSTAT:
        cutpoint, cutpoint_search_data = _find_optimal_cutpoint(df)
    else:  # MEDIAN
        cutpoint = np.median(expr_vals)

    # 4. Stratify into High/Low
    df["group"] = np.where(df["expression"] > cutpoint, "High", "Low")
    
    high_df = df[df["group"] == "High"]
    low_df = df[df["group"] == "Low"]

    if len(high_df) == 0 or len(low_df) == 0:
        raise KiriComputationError("survival", "Cutpoint resulted in an empty group. Cannot compute log-rank test.")

    # 5. Compute KM curves
    kmf_high = KaplanMeierFitter()
    kmf_low = KaplanMeierFitter()
    
    kmf_high.fit(high_df["time"], event_observed=high_df["event"], label="High " + gene)
    kmf_low.fit(low_df["time"], event_observed=low_df["event"], label="Low " + gene)

    # 6. Log-rank test
    results = logrank_test(
        high_df["time"], low_df["time"],
        event_observed_A=high_df["event"], event_observed_B=low_df["event"]
    )
    p_value = results.p_value

    # 7. Build At-Risk table (5 points)
    max_t = int(df["time"].max())
    time_points = [0, max_t // 4, max_t // 2, 3 * max_t // 4, max_t]
    
    at_risk_high = [int(n) for n in kmf_high.event_table.reindex(time_points, method="bfill")["at_risk"].fillna(0)]
    at_risk_low = [int(n) for n in kmf_low.event_table.reindex(time_points, method="bfill")["at_risk"].fillna(0)]

    at_risk_table = AtRiskTable(
        time_points=time_points,
        groups={"High": at_risk_high, "Low": at_risk_low}
    )

    # 8. Extract curve data
    def extract_curve(kmf: KaplanMeierFitter) -> SurvivalCurveResult:
        ci = kmf.confidence_interval_
        sf = kmf.survival_function_
        return SurvivalCurveResult(
            group_name=kmf._label,
            n_samples=len(kmf.durations),
            median_survival=kmf.median_survival_time_ if not np.isinf(kmf.median_survival_time_) else None,
            time=sf.index.tolist(),
            survival=sf.iloc[:, 0].tolist(),
            ci_lower=ci.iloc[:, 0].tolist(),
            ci_upper=ci.iloc[:, 1].tolist(),
        )

    return SurvivalResult(
        curves=[extract_curve(kmf_high), extract_curve(kmf_low)],
        p_value=p_value,
        cutpoint_value=float(cutpoint),
        cutpoint_method=cutpoint_method.value,
        at_risk_table=at_risk_table,
        cutpoint_search_data=cutpoint_search_data,
    )


def _build_survival_df(clinical_data: dict, expr_data: dict, gene: str) -> pd.DataFrame:
    """Align clinical events with expression values."""
    records = []
    
    # Create lookup dict for expression
    # Expression sample IDs are sample-level barcodes (e.g., TCGA-AA-3989-01A)
    # Clinical submitter_ids are patient-level (e.g., TCGA-AA-3989)
    # We need to match by patient-level prefix
    expr_vals = expr_data["values"].get(gene, [])
    sample_ids = [s["sample_id"] for s in expr_data["samples"]]
    
    # Build patient-level expression map (truncate to first 3 segments: TCGA-XX-XXXX)
    expr_map = {}
    for sid, val in zip(sample_ids, expr_vals):
        # Extract patient barcode from sample barcode
        parts = sid.split("-")
        patient_id = "-".join(parts[:3]) if len(parts) >= 3 else sid
        # Prefer tumor samples (suffix starts with "01") over normal ("10", "11")
        if patient_id not in expr_map or (len(parts) >= 4 and parts[3].startswith("01")):
            expr_map[patient_id] = val
        # Also store with full sample ID for direct match
        expr_map[sid] = val

    for rec in clinical_data["records"]:
        case_id = rec["case_id"]
        submitter_id = rec["submitter_id"]
        
        # Try matching: submitter_id first, then case_id
        expr = expr_map.get(submitter_id) or expr_map.get(case_id)
        if expr is None:
            continue
            
        # Determine survival time and event status
        vital_status = rec.get("vital_status", "").lower()
        if vital_status == "dead":
            time = rec.get("days_to_death")
            event = 1
        else:
            time = rec.get("days_to_last_follow_up")
            event = 0
            
        if time is not None and time > 0:
            records.append({
                "sample_id": submitter_id,
                "time": time,
                "event": event,
                "expression": expr,
                "stage": rec.get("stage"),
            })
            
    return pd.DataFrame(records)


def _find_optimal_cutpoint(df: pd.DataFrame) -> tuple[float, list[dict]]:
    """
    Find cutpoint that minimizes log-rank p-value (maxstat method restricted to interquartile range).
    Returns (optimal_cutpoint, search_data) where search_data is a list of {cutpoint, p_value} dicts.
    """
    expr = df["expression"].values
    q25 = np.percentile(expr, 25)
    q75 = np.percentile(expr, 75)
    
    candidates = np.linspace(q25, q75, 20)
    best_p = 1.0
    best_cut = np.median(expr)
    search_data = []
    
    for cut in candidates:
        g1 = df[df["expression"] > cut]
        g2 = df[df["expression"] <= cut]
        if len(g1) < 5 or len(g2) < 5:
            continue
            
        res = logrank_test(g1["time"], g2["time"], g1["event"], g2["event"])
        p_val = float(res.p_value)
        search_data.append({"cutpoint": round(float(cut), 4), "p_value": round(p_val, 6)})
        if p_val < best_p:
            best_p = p_val
            best_cut = cut
            
    return float(best_cut), search_data

