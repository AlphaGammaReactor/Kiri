"""
Kiri Clinical — Random Survival Forest Service

Machine Learning survival prediction using scikit-survival.
"""

import logging
import numpy as np
import pandas as pd
from sksurv.ensemble import RandomSurvivalForest
from sksurv.metrics import concordance_index_censored
import sksurv.util

from app.services.gdc import fetch_clinical, fetch_expression
from app.models.clinical import RSFResult, FeatureImportance
from app.core.errors import KiriComputationError
from app.services.cox import _build_cox_df

logger = logging.getLogger("kiri.clinical.rsf")


async def run_random_survival_forest(
    genes: list[str],
    project_ids: list[str],
    n_estimators: int = 100,
    max_depth: int | None = 5,
) -> RSFResult:
    """Run Random Survival Forest analysis."""
    logger.info(f"Running RSF for {genes}")

    if not genes:
        raise KiriComputationError("rsf", "At least one gene must be provided.")

    # 1. Fetch data
    clinical_data = await fetch_clinical(project_ids)
    expr_data = await fetch_expression(genes, project_ids, "tpm")

    # 2. Build aligned DataFrame (reuse Cox builder without covariates)
    df = _build_cox_df(clinical_data, expr_data, genes, covariates=[])
    if len(df) < 20: 
        raise KiriComputationError("rsf", "Insufficient samples with complete data (n < 20).")

    # 3. Format target for scikit-survival
    # sksurv requires a structured array: (event_indicator, time)
    y = sksurv.util.Surv.from_arrays(
        event=df["event"].astype(bool).values,
        time=df["time"].values
    )
    
    # Extract features (genes)
    X = df[genes]

    # 4. Fit Model
    rsf = RandomSurvivalForest(
        n_estimators=n_estimators,
        max_depth=max_depth,
        min_samples_split=10,
        min_samples_leaf=5,
        n_jobs=-1,  # Use all cores
        random_state=42
    )
    
    try:
        rsf.fit(X, y)
    except Exception as e:
        raise KiriComputationError("rsf", f"RSF model training failed: {e}")

    # 5. Calculate Concordance Index
    pred = rsf.predict(X)
    cindex = concordance_index_censored(df["event"].astype(bool).values, df["time"].values, pred)[0]

    # 6. Approximation of Feature Importance (Permutation)
    # Using simple prediction variance drop or basic permutation if time permits.
    # For MVP, we'll do a quick manual permutation to avoid importing heavy sklearn tools.
    baseline_c = cindex
    importances = []
    
    rng = np.random.default_rng(42)
    for gene in genes:
        X_shuff = X.copy()
        rng.shuffle(X_shuff[gene].values)
        pred_shuff = rsf.predict(X_shuff)
        c_shuff = concordance_index_censored(df["event"].astype(bool).values, df["time"].values, pred_shuff)[0]
        # Importance is the drop in C-index
        importances.append(FeatureImportance(
            feature=gene,
            importance=max(0.0, baseline_c - c_shuff)
        ))
        
    # Sort importances descending
    importances.sort(key=lambda x: x.importance, reverse=True)

    return RSFResult(
        feature_importances=importances,
        concordance_index=cindex,
        n_samples=len(df),
        n_estimators=n_estimators,
    )
