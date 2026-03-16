"""
Kiri — Pan-Metric Survival Analysis Service

Runs Cox regression across multiple survival endpoints:
  - OS (Overall Survival)
  - DFS (Disease-Free Survival)
  - PFS (Progression-Free Survival)
  - DSS (Disease-Specific Survival)

Produces a unified forest plot dataset with HR, CI, and p-value
per gene × per metric, suitable for a multi-row forest plot.
"""

import logging
from typing import Any

import numpy as np
import pandas as pd
from lifelines import CoxPHFitter

from app.core.errors import KiriComputationError, KiriValidationError

logger = logging.getLogger("kiri.pan_survival")

# GDC field names for different survival endpoints
SURVIVAL_METRICS = {
    "OS": {
        "time_field": "days_to_death",
        "event_field": "vital_status",
        "event_value": "Dead",
        "label": "Overall Survival",
    },
    "DFS": {
        "time_field": "days_to_recurrence",
        "event_field": "disease_free_status",
        "event_value": "Recurred/Progressed",
        "label": "Disease-Free Survival",
    },
    "PFS": {
        "time_field": "days_to_progression",
        "event_field": "progression_status",
        "event_value": "Progressed",
        "label": "Progression-Free Survival",
    },
    "DSS": {
        "time_field": "days_to_death",
        "event_field": "cause_of_death",
        "event_value": "cancer",
        "label": "Disease-Specific Survival",
    },
}


def compute_pan_survival(
    genes: list[str],
    expression_data: dict[str, list[float]],
    clinical_records: list[dict[str, Any]],
    metrics: list[str] | None = None,
    covariates: list[str] | None = None,
) -> dict[str, Any]:
    """
    Run Cox PH regression for each gene × each survival metric.

    Args:
        genes: Gene symbols to analyze
        expression_data: gene → [values_per_sample]
        clinical_records: Per-sample clinical dicts with survival fields
        metrics: Which survival metrics to run (defaults to all 4)
        covariates: Additional covariates (e.g., ["age", "stage"])

    Returns:
        {
          "genes": ["PARL", "MAVS"],
          "metrics": ["OS", "DFS", "PFS", "DSS"],
          "results": [
            {
              "gene": "PARL",
              "metric": "OS",
              "hr": 1.45,
              "ci_lower": 1.12,
              "ci_upper": 1.88,
              "p_value": 0.005,
              "significant": true,
              "n_events": 45,
              "n_total": 120,
              "concordance": 0.68
            },
            ...
          ],
          "summary": {
            "PARL": {"risk_direction": "risk", "sig_count": 3, "avg_hr": 1.35},
            ...
          }
        }
    """
    if not genes:
        raise KiriValidationError("No genes specified.", source="pan_survival")

    if not clinical_records:
        raise KiriValidationError("No clinical data provided.", source="pan_survival")

    if metrics is None:
        metrics = ["OS", "DFS", "PFS", "DSS"]

    # Validate metrics
    metrics = [m for m in metrics if m in SURVIVAL_METRICS]
    if not metrics:
        raise KiriValidationError("No valid survival metrics specified.", source="pan_survival")

    covariates = covariates or []
    results: list[dict[str, Any]] = []

    for metric in metrics:
        metric_info = SURVIVAL_METRICS[metric]

        # Build survival DataFrame for this metric
        df = _build_survival_df(
            clinical_records,
            expression_data,
            genes,
            covariates,
            metric_info,
        )

        if df is None or len(df) < 20:
            # Not enough data for this metric
            for gene in genes:
                results.append({
                    "gene": gene,
                    "metric": metric,
                    "metric_label": metric_info["label"],
                    "status": "insufficient_data",
                    "hr": None,
                    "ci_lower": None,
                    "ci_upper": None,
                    "p_value": None,
                    "significant": False,
                    "n_events": 0,
                    "n_total": len(df) if df is not None else 0,
                })
            continue

        for gene in genes:
            if gene not in df.columns:
                results.append({
                    "gene": gene,
                    "metric": metric,
                    "metric_label": metric_info["label"],
                    "status": "gene_not_in_data",
                    "hr": None,
                    "ci_lower": None,
                    "ci_upper": None,
                    "p_value": None,
                    "significant": False,
                    "n_events": 0,
                    "n_total": len(df),
                })
                continue

            # Fit univariate Cox for this gene + covariates
            fit_cols = [gene] + [c for c in covariates if c in df.columns]
            fit_df = df[["time", "event"] + fit_cols].dropna()

            if len(fit_df) < 15 or fit_df["event"].sum() < 5:
                results.append({
                    "gene": gene,
                    "metric": metric,
                    "metric_label": metric_info["label"],
                    "status": "too_few_events",
                    "hr": None,
                    "ci_lower": None,
                    "ci_upper": None,
                    "p_value": None,
                    "significant": False,
                    "n_events": int(fit_df["event"].sum()),
                    "n_total": len(fit_df),
                })
                continue

            try:
                cph = CoxPHFitter(penalizer=0.01)
                cph.fit(fit_df, duration_col="time", event_col="event")

                summary = cph.summary
                if gene in summary.index:
                    row = summary.loc[gene]
                    hr = float(row.get("exp(coef)", np.nan))
                    ci_lower = float(row.get("exp(coef) lower 95%", np.nan))
                    ci_upper = float(row.get("exp(coef) upper 95%", np.nan))
                    p_val = float(row.get("p", np.nan))
                else:
                    hr = ci_lower = ci_upper = p_val = None

                results.append({
                    "gene": gene,
                    "metric": metric,
                    "metric_label": metric_info["label"],
                    "status": "ok",
                    "hr": round(hr, 4) if hr else None,
                    "ci_lower": round(ci_lower, 4) if ci_lower else None,
                    "ci_upper": round(ci_upper, 4) if ci_upper else None,
                    "p_value": round(p_val, 6) if p_val else None,
                    "significant": p_val < 0.05 if p_val else False,
                    "n_events": int(fit_df["event"].sum()),
                    "n_total": len(fit_df),
                    "concordance": round(float(cph.concordance_index_), 4),
                })
            except Exception as e:
                logger.warning(f"Cox failed for {gene}/{metric}: {e}")
                results.append({
                    "gene": gene,
                    "metric": metric,
                    "metric_label": metric_info["label"],
                    "status": "fit_failed",
                    "hr": None,
                    "ci_lower": None,
                    "ci_upper": None,
                    "p_value": None,
                    "significant": False,
                    "n_events": 0,
                    "n_total": len(fit_df),
                })

    # Generate per-gene summary
    summary: dict[str, dict[str, Any]] = {}
    for gene in genes:
        gene_results = [r for r in results if r["gene"] == gene and r.get("hr")]
        if gene_results:
            hrs = [r["hr"] for r in gene_results if r["hr"]]
            sig_count = sum(1 for r in gene_results if r.get("significant"))
            avg_hr = float(np.mean(hrs)) if hrs else None
            direction = "risk" if avg_hr and avg_hr > 1 else "protective" if avg_hr and avg_hr < 1 else "neutral"
            summary[gene] = {
                "risk_direction": direction,
                "sig_count": sig_count,
                "total_metrics": len(gene_results),
                "avg_hr": round(avg_hr, 4) if avg_hr else None,
            }
        else:
            summary[gene] = {"risk_direction": "unknown", "sig_count": 0, "total_metrics": 0, "avg_hr": None}

    return {
        "genes": genes,
        "metrics": metrics,
        "metric_labels": {m: SURVIVAL_METRICS[m]["label"] for m in metrics},
        "results": results,
        "summary": summary,
        "method": "Pan-Metric Cox PH (Lifelines)",
    }


def _build_survival_df(
    clinical_records: list[dict],
    expression_data: dict[str, list[float]],
    genes: list[str],
    covariates: list[str],
    metric_info: dict[str, str],
) -> pd.DataFrame | None:
    """Build a DataFrame with time, event, gene expression, and covariates."""
    time_field = metric_info["time_field"]
    event_field = metric_info["event_field"]
    event_value = metric_info["event_value"]

    rows = []
    for i, record in enumerate(clinical_records):
        # Time
        time_val = record.get(time_field) or record.get("days_to_last_follow_up")
        if time_val is None or float(time_val) <= 0:
            continue

        # Event
        event_raw = record.get(event_field, "")
        event = 1 if str(event_raw).lower() == event_value.lower() else 0

        row: dict[str, Any] = {
            "time": float(time_val),
            "event": event,
        }

        # Gene expression
        for gene in genes:
            vals = expression_data.get(gene, [])
            if i < len(vals):
                row[gene] = float(vals[i])

        # Covariates
        for cov in covariates:
            row[cov] = record.get(cov)

        rows.append(row)

    if not rows:
        return None

    df = pd.DataFrame(rows)
    df = df.dropna(subset=["time", "event"])

    # Z-score normalize gene expression
    for gene in genes:
        if gene in df.columns:
            col = df[gene]
            if col.std() > 0:
                df[gene] = (col - col.mean()) / col.std()

    return df
