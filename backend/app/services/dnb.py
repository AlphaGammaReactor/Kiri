"""
Kiri — DNB (Dynamic Network Biomarker) Service

Implements a simplified Chen-Liu DNB algorithm for detecting disease
tipping points from expression data. Identifies gene modules whose
correlation and variance structures change significantly across
disease stages (e.g., Normal → Early → Late).

Reference: Chen et al., "Detecting early-warning signals for sudden
deterioration of complex diseases," Sci. Rep. 2012.

Key metric: DNB Score = (SD_i * PCC_i) / PCC_e
  - SD_i:  standard deviation within the module (variance shift)
  - PCC_i: average Pearson correlation WITHIN the module (intra-module)
  - PCC_e: average Pearson correlation BETWEEN the module and all others (inter-module)
A spike in DNB score signals a critical transition point.
"""

import logging
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

from app.core.errors import KiriComputationError, KiriValidationError

logger = logging.getLogger("kiri.dnb")

# Predefined gene modules relevant to innate immunity / cancer signaling
# These represent functionally related gene clusters that are commonly
# co-regulated and relevant for tipping point detection
DEFAULT_MODULES = {
    "innate_immunity": ["DDX58", "IFIH1", "MAVS", "IRF3", "IFNB1", "TBK1", "STING1", "CGAS"],
    "apoptosis": ["BAX", "BCL2", "CASP3", "CASP9", "CYCS", "APAF1", "BID", "MCL1"],
    "cell_cycle": ["CDK1", "CDK2", "CDK4", "CCNB1", "CCND1", "CCNE1", "RB1", "E2F1"],
    "dna_repair": ["BRCA1", "BRCA2", "ATM", "ATR", "TP53", "CHEK1", "CHEK2", "RAD51"],
    "pi3k_akt": ["PIK3CA", "AKT1", "MTOR", "PTEN", "TSC1", "TSC2", "RPTOR", "RICTOR"],
    "mapk": ["KRAS", "BRAF", "MAP2K1", "MAPK1", "MAPK3", "RAF1", "SOS1", "GRB2"],
    "wnt": ["CTNNB1", "APC", "AXIN1", "GSK3B", "WNT3A", "FZD1", "LRP5", "DVL1"],
    "metabolism": ["HIF1A", "LDHA", "PKM", "HK2", "GLUT1", "IDH1", "ACLY", "FASN"],
}


def compute_dnb_score(
    expression_matrix: dict[str, list[float]],
    stage_labels: list[str],
    modules: dict[str, list[str]] | None = None,
) -> dict[str, Any]:
    """
    Compute DNB scores for each gene module across disease stages.

    Args:
        expression_matrix: gene_symbol → [values_per_sample] dict.
        stage_labels: per-sample stage label (e.g., ["normal", "early", "late", ...]).
        modules: optional custom gene modules; defaults to DEFAULT_MODULES.

    Returns:
        {
          "stages": ["normal", "early", "late"],
          "modules": [
            {
              "name": "innate_immunity",
              "genes": ["DDX58", "MAVS", ...],
              "genes_found": 5,
              "scores_by_stage": {"normal": 1.2, "early": 8.7, "late": 3.1},
              "peak_stage": "early",
              "is_tipping_point": true,
              "components": {
                "sd_i": {...}, "pcc_i": {...}, "pcc_e": {...}
              }
            }
          ],
          "composite_scores": {"normal": ..., "early": ..., "late": ...},
          "tipping_point": "early",
          "method": "DNB (Chen et al., 2012)"
        }
    """
    if not expression_matrix:
        raise KiriValidationError("Empty expression matrix.", source="dnb")

    if not stage_labels:
        raise KiriValidationError("No stage labels provided.", source="dnb")

    modules = modules or DEFAULT_MODULES

    # Build DataFrame: genes × samples
    available_genes = set(expression_matrix.keys())
    df = pd.DataFrame(expression_matrix)
    stages = sorted(set(stage_labels))

    if len(stages) < 2:
        raise KiriValidationError(
            "At least 2 distinct stages are required for DNB analysis.",
            source="dnb",
        )

    # Index samples by stage
    stage_indices: dict[str, list[int]] = {}
    for i, s in enumerate(stage_labels):
        stage_indices.setdefault(s, []).append(i)

    # Compute per-module DNB scores
    module_results = []
    composite_scores: dict[str, float] = {s: 0.0 for s in stages}

    for mod_name, mod_genes in modules.items():
        found_genes = [g for g in mod_genes if g in available_genes]
        if len(found_genes) < 3:
            continue  # Need ≥3 genes for meaningful correlation

        mod_df = df[found_genes]
        other_genes = [g for g in available_genes if g not in found_genes]
        other_df = df[[g for g in other_genes if g in df.columns]] if other_genes else pd.DataFrame()

        scores_by_stage: dict[str, float] = {}
        components: dict[str, dict[str, float]] = {"sd_i": {}, "pcc_i": {}, "pcc_e": {}}

        for stage in stages:
            idx = stage_indices[stage]
            if len(idx) < 3:
                scores_by_stage[stage] = 0.0
                components["sd_i"][stage] = 0.0
                components["pcc_i"][stage] = 0.0
                components["pcc_e"][stage] = 0.0
                continue

            stage_mod = mod_df.iloc[idx]

            # SD_i: average standard deviation within module
            sd_i = float(stage_mod.std().mean())

            # PCC_i: average absolute Pearson correlation WITHIN module
            corr_matrix = stage_mod.corr().values
            mask = np.triu(np.ones_like(corr_matrix, dtype=bool), k=1)
            pcc_i_vals = np.abs(corr_matrix[mask])
            pcc_i = float(pcc_i_vals.mean()) if len(pcc_i_vals) > 0 else 0.0

            # PCC_e: average absolute Pearson correlation BETWEEN module and outside
            pcc_e = 0.01  # floor to avoid division by zero
            if len(other_df.columns) > 0:
                stage_other = other_df.iloc[idx]
                cross_corrs = []
                for mg in found_genes:
                    for og in other_df.columns[:20]:  # limit for performance
                        try:
                            r, _ = stats.pearsonr(stage_mod[mg].values, stage_other[og].values)
                            if not np.isnan(r):
                                cross_corrs.append(abs(r))
                        except Exception:
                            pass
                if cross_corrs:
                    pcc_e = max(float(np.mean(cross_corrs)), 0.01)

            # DNB Score = (SD_i * PCC_i) / PCC_e
            dnb_score = (sd_i * pcc_i) / pcc_e
            scores_by_stage[stage] = round(dnb_score, 4)
            components["sd_i"][stage] = round(sd_i, 4)
            components["pcc_i"][stage] = round(pcc_i, 4)
            components["pcc_e"][stage] = round(pcc_e, 4)

        if not scores_by_stage:
            continue

        peak_stage = max(scores_by_stage, key=lambda s: scores_by_stage[s])

        # A module is a tipping point indicator if its peak score is ≥2x the average
        avg_score = np.mean(list(scores_by_stage.values()))
        is_tipping = scores_by_stage[peak_stage] >= 2 * avg_score if avg_score > 0 else False

        for s in stages:
            composite_scores[s] += scores_by_stage.get(s, 0)

        module_results.append({
            "name": mod_name,
            "genes": found_genes,
            "genes_found": len(found_genes),
            "scores_by_stage": scores_by_stage,
            "peak_stage": peak_stage,
            "is_tipping_point": bool(is_tipping),
            "components": components,
        })

    # Round composite scores
    for s in stages:
        composite_scores[s] = round(composite_scores[s], 4)

    # Overall tipping point: stage with highest composite score
    tipping_point = max(composite_scores, key=lambda s: composite_scores[s]) if composite_scores else None

    # Sort modules by peak score descending
    module_results.sort(key=lambda m: max(m["scores_by_stage"].values()), reverse=True)

    # ── Spline interpolation for smooth visualization ──
    spline_data = {}
    if len(stages) >= 3:
        try:
            from scipy.interpolate import CubicSpline as CS

            x_orig = np.arange(len(stages))
            x_smooth = np.linspace(0, len(stages) - 1, 48)

            # Composite scores spline
            composite_vals = [composite_scores.get(s, 0) for s in stages]
            cs = CS(x_orig, composite_vals, bc_type="natural")
            spline_data["composite"] = {
                "x": x_smooth.tolist(),
                "y": [round(float(v), 4) for v in cs(x_smooth)],
                "stages_x": x_orig.tolist(),
            }

            # Per-module splines
            for mod in module_results:
                mod_vals = [mod["scores_by_stage"].get(s, 0) for s in stages]
                cs_mod = CS(x_orig, mod_vals, bc_type="natural")
                spline_data[mod["name"]] = {
                    "x": x_smooth.tolist(),
                    "y": [round(float(v), 4) for v in cs_mod(x_smooth)],
                }
        except Exception as e:
            logger.warning(f"Spline interpolation failed: {e}")

    # ── Critical point detection ──
    critical_transition = None
    if tipping_point and len(stages) >= 3:
        tp_idx = stages.index(tipping_point)
        before = stages[tp_idx - 1] if tp_idx > 0 else None
        after = stages[tp_idx + 1] if tp_idx < len(stages) - 1 else None
        fold_change = None
        if before and composite_scores.get(before, 0) > 0:
            fold_change = round(composite_scores[tipping_point] / composite_scores[before], 2)
        critical_transition = {
            "stage": tipping_point,
            "stage_index": tp_idx,
            "before": before,
            "after": after,
            "fold_change_vs_before": fold_change,
            "composite_score": composite_scores[tipping_point],
        }

    return {
        "stages": stages,
        "modules": module_results,
        "composite_scores": composite_scores,
        "tipping_point": tipping_point,
        "spline_data": spline_data,
        "critical_transition": critical_transition,
        "method": "DNB (Chen et al., 2012)",
    }


def get_default_modules() -> dict[str, list[str]]:
    """Return the default gene modules used for DNB analysis."""
    return DEFAULT_MODULES.copy()

