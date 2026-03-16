"""
Kiri Clinical — Synergy Analysis Service

Computes PARL x MAVS interaction terms and 4-way Kaplan-Meier curves.
"""

import logging
import numpy as np
import pandas as pd
from lifelines import CoxPHFitter

from app.services.gdc import fetch_clinical, fetch_expression
from app.models.clinical import SynergyResult, CutpointMethod
from app.services.survival import _build_survival_df
from app.core.errors import KiriComputationError

logger = logging.getLogger("kiri.clinical.synergy")


async def run_synergy_analysis(
    gene_a: str,
    gene_b: str,
    project_ids: list[str],
    cutpoint_method: CutpointMethod = CutpointMethod.MEDIAN,
) -> SynergyResult:
    """Run Synergy analysis (interaction term + 4-way curves)."""
    logger.info(f"Running Synergy analysis for {gene_a} x {gene_b}")

    # 1. Fetch data
    clinical_data = await fetch_clinical(project_ids)
    expr_data = await fetch_expression([gene_a, gene_b], project_ids, "tpm")

    # 2. Build aligned DataFrame
    df_a = _build_survival_df(clinical_data, expr_data, gene_a)
    df_b = _build_survival_df(clinical_data, expr_data, gene_b)
    
    if len(df_a) < 20 or len(df_b) < 20:
        raise KiriComputationError("synergy", "Insufficient samples with complete data.")

    # Merge on sample_id
    df_b = df_b[["sample_id", "expression"]].rename(columns={"expression": f"expr_{gene_b}"})
    df = df_a.rename(columns={"expression": f"expr_{gene_a}"}).merge(df_b, on="sample_id")

    # 3. Fit Interaction Cox Model (Continuous)
    cox_df = df[["time", "event", f"expr_{gene_a}", f"expr_{gene_b}"]].copy()
    cox_df[f"expr_{gene_a}"] = np.log2(cox_df[f"expr_{gene_a}"] + 1)
    cox_df[f"expr_{gene_b}"] = np.log2(cox_df[f"expr_{gene_b}"] + 1)
    cox_df["interaction"] = cox_df[f"expr_{gene_a}"] * cox_df[f"expr_{gene_b}"]
    
    cph = CoxPHFitter(penalizer=0.01)
    try:
        cph.fit(cox_df, duration_col="time", event_col="event")
    except Exception as e:
        raise KiriComputationError("synergy", f"Interaction model failed to fit: {e}")
        
    summary = cph.summary
    interaction_p = summary.loc["interaction", "p"]
    combined_hr = summary.loc["interaction", "exp(coef)"]

    # Simple heuristic for synergy type based on HR direction
    if interaction_p < 0.05:
        synergy_type = "synergistic" if combined_hr > 1.2 or combined_hr < 0.8 else "additive"
    else:
        synergy_type = "independent"

    # 4. Stratify into 4 Groups (High/High, High/Low, Low/High, Low/Low)
    cut_a = np.median(df[f"expr_{gene_a}"])
    cut_b = np.median(df[f"expr_{gene_b}"])
    
    df["group_a"] = np.where(df[f"expr_{gene_a}"] > cut_a, "High", "Low")
    df["group_b"] = np.where(df[f"expr_{gene_b}"] > cut_b, "High", "Low")
    df["group_combined"] = df["group_a"] + " " + gene_a + " + " + df["group_b"] + " " + gene_b

    # 5. Build Curves (reuse KM logic)
    from app.services.survival import KaplanMeierFitter
    # Need to lazy import models to avoid circular deps
    from app.models.clinical import SurvivalCurveResult, AtRiskTable

    curves = []
    fitted_models = []
    
    for group_name in df["group_combined"].unique():
        sub_df = df[df["group_combined"] == group_name]
        if len(sub_df) < 5:
            continue
            
        kmf = KaplanMeierFitter()
        kmf.fit(sub_df["time"], event_observed=sub_df["event"], label=group_name)
        
        ci = kmf.confidence_interval_
        sf = kmf.survival_function_
        
        curves.append(SurvivalCurveResult(
            group_name=group_name,
            n_samples=len(sub_df),
            median_survival=kmf.median_survival_time_ if not np.isinf(kmf.median_survival_time_) else None,
            time=sf.index.tolist(),
            survival=sf.iloc[:, 0].tolist(),
            ci_lower=ci.iloc[:, 0].tolist(),
            ci_upper=ci.iloc[:, 1].tolist(),
        ))
        fitted_models.append({"label": group_name, "kmf": kmf})

    # 6. Compute at-risk table
    max_time = df["time"].max() if len(df) > 0 else 0
    time_points = [float(round(max_time * i / 4)) for i in range(5)]
    at_risk_groups = {}
    
    for model_info in fitted_models:
        kmf = model_info["kmf"]
        counts = []
        for t in time_points:
            idx = kmf.event_table.index
            valid_times = idx[idx <= t]
            if len(valid_times) == 0:
                count = len(kmf.durations)
            else:
                last_time = valid_times[-1]
                count = kmf.event_table.loc[last_time, "at_risk"]
            counts.append(int(count))
        at_risk_groups[str(model_info["label"])] = counts

    at_risk_table = AtRiskTable(time_points=time_points, groups=at_risk_groups)

    return SynergyResult(
        gene_a=gene_a,
        gene_b=gene_b,
        interaction_p_value=interaction_p,
        combined_hr=combined_hr,
        synergy_type=synergy_type,
        curves=curves,
        at_risk_table=at_risk_table,
        concordance_index=cph.concordance_index_,
        n_samples=len(df),
    )
