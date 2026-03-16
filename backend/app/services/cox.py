"""
Kiri Clinical — Cox Proportional Hazards Service

Multivariate survival analysis via Lifelines.
"""

import logging
import numpy as np
import pandas as pd
from lifelines import CoxPHFitter

from app.services.gdc import fetch_clinical, fetch_expression
from app.models.clinical import CoxResult, HazardRatioResult
from app.core.errors import KiriComputationError

logger = logging.getLogger("kiri.clinical.cox")


async def run_cox_regression(
    genes: list[str],
    covariates: list[str],
    project_ids: list[str],
    stage_filter: list[str] | None = None,
    msi_filter: list[str] | None = None,
) -> CoxResult:
    """Run Cox PH multivariate regression."""
    logger.info(f"Running Cox regression for {genes} + {covariates}")

    # 1. Fetch data
    clinical_data = await fetch_clinical(project_ids, stage_filter, msi_filter)
    expr_data = await fetch_expression(genes, project_ids, "tpm")
    
    if len(genes) == 0:
        raise KiriComputationError("cox", "At least one gene must be provided.")

    # 2. Build aligned DataFrame
    df = _build_cox_df(clinical_data, expr_data, genes, covariates)
    if len(df) < 20: # Cox needs more samples
        raise KiriComputationError("cox", "Insufficient samples with complete data (n < 20).")

    # 3. Fit Cox Model
    cph = CoxPHFitter(penalizer=0.01) # Small penalizer for stability
    
    try:
        cph.fit(df, duration_col="time", event_col="event")
    except Exception as e:
        raise KiriComputationError("cox", f"Cox model convergence failed: {e}")

    # 4. Extract results
    hr_table = cph.summary
    results = []
    
    for idx, row in hr_table.iterrows():
        var_name = str(idx)
        # Convert ordinal encoded names back to friendly labels if needed, or keep generic
        results.append(HazardRatioResult(
            variable=var_name,
            hr=row["exp(coef)"],
            ci_lower=row["exp(coef) lower 95%"],
            ci_upper=row["exp(coef) upper 95%"],
            p_value=row["p"],
            significant=row["p"] < 0.05,
        ))

    return CoxResult(
        hazard_ratios=results,
        concordance_index=cph.concordance_index_,
        n_samples=len(df),
        n_events=int(df["event"].sum()),
    )


def _build_cox_df(clinical_data: dict, expr_data: dict, genes: list[str], covariates: list[str]) -> pd.DataFrame:
    """Align clinical events with expression values and encode covariates."""
    records = []
    
    # Create lookup dict for expression
    # Expression sample IDs are sample-level barcodes (e.g., TCGA-AA-3989-01A)
    # Clinical submitter_ids are patient-level (e.g., TCGA-AA-3989)
    sample_ids = [s["sample_id"] for s in expr_data["samples"]]
    expr_maps: dict[str, dict[str, float]] = {}
    for gene in genes:
        gene_vals = expr_data["values"].get(gene, [])
        gene_map: dict[str, float] = {}
        for sid, val in zip(sample_ids, gene_vals):
            parts = sid.split("-")
            patient_id = "-".join(parts[:3]) if len(parts) >= 3 else sid
            if patient_id not in gene_map or (len(parts) >= 4 and parts[3].startswith("01")):
                gene_map[patient_id] = val
            gene_map[sid] = val
        expr_maps[gene] = gene_map

    for rec in clinical_data["records"]:
        case_id = rec["case_id"]
        submitter_id = rec["submitter_id"]
        
        row_data = {"time": None, "event": None}
        
        # Add expression (must have all genes)
        has_all_expr = True
        for gene in genes:
            expr = expr_maps[gene].get(submitter_id) or expr_maps[gene].get(case_id)
            if expr is None:
                has_all_expr = False
                break
            # Log2 transform for better numerical stability in Cox
            row_data[gene] = np.log2(expr + 1)
            
        if not has_all_expr:
            continue
            
        # Determine survival 
        vital_status = rec.get("vital_status", "").lower()
        if vital_status == "dead":
            row_data["time"] = rec.get("days_to_death")
            row_data["event"] = 1
        else:
            row_data["time"] = rec.get("days_to_last_follow_up")
            row_data["event"] = 0
            
        if row_data["time"] is None or row_data["time"] <= 0:
            continue
            
        # Add covariates
        if "stage" in covariates:
            stage = rec.get("stage", "").lower()
            # Basic ordinal encoding for stage (I=1, II=2, III=3, IV=4)
            val = 0
            if "iv" in stage: val = 4
            elif "iii" in stage: val = 3
            elif "ii" in stage: val = 2
            elif "i" in stage: val = 1
            row_data["Stage_Ordinal"] = val
            
        if "age" in covariates:
            age_days = rec.get("age_at_index")
            if age_days is not None:
                # Convert days to years
                row_data["Age"] = float(age_days) / 365.25
                
        if "gender" in covariates:
            gender = rec.get("gender", "").lower()
            if gender == "male":
                row_data["Gender_Male"] = 1
            elif gender == "female":
                row_data["Gender_Male"] = 0
            
        # Note: MSI requires a separate GDC query or synthetic insertion for MVP.
        # Assuming we might add it later, we safely ignore it if missing in rec.
        
        records.append(row_data)
            
    df = pd.DataFrame(records).dropna() # Ensure no NaNs remain
    return df
