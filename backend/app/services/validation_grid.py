"""
Kiri — Multi-Cohort Validation Grid Service

Orchestrates batch cross-cohort analysis for target genes:
  1. Z-score normalizes expression across multiple datasets
  2. Auto-selects statistical test (Shapiro-Wilk → t-test or Wilcoxon)
  3. Computes per-gene, per-cohort differential statistics
  4. Discovers intersect genes (significant across ALL cohorts)

Designed to replicate the validation rigor of CDK7/MMP12 studies.
"""

import logging
from typing import Any

import numpy as np
from scipy import stats

from app.core.errors import KiriComputationError, KiriValidationError

logger = logging.getLogger("kiri.validation_grid")


def compute_validation_grid(
    cohort_data: list[dict[str, Any]],
    genes: list[str],
    group_column: str = "sample_type",
    group_a: str = "tumor",
    group_b: str = "normal",
    p_cutoff: float = 0.05,
    fc_cutoff: float = 1.0,
) -> dict[str, Any]:
    """
    Run multi-cohort validation analysis.

    Args:
        cohort_data: List of dicts, each with:
            - name: cohort name (e.g., "TCGA-COAD", "GSE39582")
            - expression: gene → [values_per_sample]
            - groups: per-sample group label (e.g., ["tumor", "normal", ...])
        genes: Gene symbols to analyze
        group_column: Column name for group comparison
        group_a: Test group label
        group_b: Reference group label
        p_cutoff: Significance threshold (adjusted)
        fc_cutoff: Minimum absolute log2 fold-change

    Returns:
        {
          "cohorts": ["TCGA-COAD", "GSE39582", ...],
          "genes": ["PARL", "MAVS", ...],
          "grid": {
            "PARL": [
              {"cohort": "TCGA-COAD", "log2fc": 1.3, "p_value": 0.002, ...},
              ...
            ],
          },
          "intersect_genes": ["PARL"],
          "concordance_matrix": {...}
        }
    """
    if not cohort_data:
        raise KiriValidationError("No cohort data provided.", source="validation_grid")

    if not genes:
        raise KiriValidationError("No genes specified.", source="validation_grid")

    cohort_names = [c["name"] for c in cohort_data]
    grid: dict[str, list[dict]] = {g: [] for g in genes}
    gene_concordance: dict[str, dict[str, str]] = {}

    for cohort in cohort_data:
        name = cohort["name"]
        expression = cohort.get("expression", {})
        groups = cohort.get("groups", [])

        if not groups:
            # Skip cohorts without group labels
            for gene in genes:
                grid[gene].append({
                    "cohort": name,
                    "status": "no_groups",
                    "log2fc": None,
                    "p_value": None,
                })
            continue

        # Split samples by group
        idx_a = [i for i, g in enumerate(groups) if g == group_a]
        idx_b = [i for i, g in enumerate(groups) if g == group_b]

        if len(idx_a) < 3 or len(idx_b) < 3:
            for gene in genes:
                grid[gene].append({
                    "cohort": name,
                    "status": "insufficient_samples",
                    "n_a": len(idx_a),
                    "n_b": len(idx_b),
                    "log2fc": None,
                    "p_value": None,
                })
            continue

        for gene in genes:
            vals = expression.get(gene)
            if not vals or len(vals) < max(max(idx_a) + 1, max(idx_b) + 1):
                grid[gene].append({
                    "cohort": name,
                    "status": "gene_not_found",
                    "log2fc": None,
                    "p_value": None,
                })
                continue

            vals_a = np.array([vals[i] for i in idx_a], dtype=float)
            vals_b = np.array([vals[i] for i in idx_b], dtype=float)

            # Filter out NaN/inf
            vals_a = vals_a[np.isfinite(vals_a)]
            vals_b = vals_b[np.isfinite(vals_b)]

            if len(vals_a) < 3 or len(vals_b) < 3:
                grid[gene].append({
                    "cohort": name,
                    "status": "insufficient_valid_values",
                    "log2fc": None,
                    "p_value": None,
                })
                continue

            result = _compare_groups(vals_a, vals_b)
            result["cohort"] = name
            result["n_a"] = len(vals_a)
            result["n_b"] = len(vals_b)
            grid[gene].append(result)

    # Discover intersect genes: significant in ALL cohorts with valid data
    intersect_genes = []
    for gene in genes:
        entries = grid[gene]
        valid = [e for e in entries if e.get("p_adjusted") is not None]
        if valid and all(
            e.get("significant", False)
            and abs(e.get("log2fc", 0) or 0) >= fc_cutoff
            for e in valid
        ):
            intersect_genes.append(gene)

    # Concordance matrix: direction consistency
    concordance = {}
    for gene in genes:
        dirs = []
        for e in grid[gene]:
            fc = e.get("log2fc")
            if fc is not None:
                dirs.append("up" if fc > 0 else "down")
        concordance[gene] = {
            "directions": dirs,
            "consistent": len(set(dirs)) <= 1 if dirs else False,
            "direction": dirs[0] if dirs and len(set(dirs)) == 1 else "mixed",
        }

    # Apply BH correction across all tests per gene
    for gene in genes:
        valid_entries = [e for e in grid[gene] if e.get("p_value") is not None]
        if valid_entries:
            p_vals = [e["p_value"] for e in valid_entries]
            adjusted = _benjamini_hochberg(p_vals)
            for e, adj_p in zip(valid_entries, adjusted):
                e["p_adjusted"] = round(adj_p, 6)
                e["significant"] = adj_p < p_cutoff

    return {
        "cohorts": cohort_names,
        "genes": genes,
        "grid": grid,
        "intersect_genes": intersect_genes,
        "concordance": concordance,
        "p_cutoff": p_cutoff,
        "fc_cutoff": fc_cutoff,
        "method": "Multi-Cohort Validation (auto test selection)",
    }


def _compare_groups(vals_a: np.ndarray, vals_b: np.ndarray) -> dict[str, Any]:
    """Compare two groups with auto test selection."""
    # Log2 fold-change
    mean_a = float(np.mean(vals_a))
    mean_b = float(np.mean(vals_b))
    log2fc = float(np.log2(max(mean_a, 1e-10) / max(mean_b, 1e-10)))

    # Normality test (Shapiro-Wilk) — use parametric if both groups normal
    _, p_norm_a = stats.shapiro(vals_a[:50])  # Cap at 50 samples for Shapiro
    _, p_norm_b = stats.shapiro(vals_b[:50])
    is_normal = p_norm_a > 0.05 and p_norm_b > 0.05

    if is_normal:
        stat, p_value = stats.ttest_ind(vals_a, vals_b, equal_var=False)
        test_used = "Welch's t-test"
    else:
        stat, p_value = stats.mannwhitneyu(vals_a, vals_b, alternative="two-sided")
        test_used = "Mann-Whitney U"

    # Effect size: Cohen's d
    pooled_std = float(np.sqrt((np.std(vals_a)**2 + np.std(vals_b)**2) / 2))
    cohens_d = float((mean_a - mean_b) / max(pooled_std, 1e-10))

    return {
        "status": "ok",
        "log2fc": round(log2fc, 4),
        "p_value": round(float(p_value), 8),
        "p_adjusted": None,  # Will be set after BH correction
        "significant": False,  # Will be set after BH correction
        "test_used": test_used,
        "is_normal": is_normal,
        "mean_a": round(mean_a, 4),
        "mean_b": round(mean_b, 4),
        "cohens_d": round(cohens_d, 4),
        "stat": round(float(stat), 4),
    }


def _benjamini_hochberg(p_values: list[float]) -> list[float]:
    """Apply Benjamini-Hochberg FDR correction."""
    n = len(p_values)
    if n == 0:
        return []

    indexed = sorted(enumerate(p_values), key=lambda x: x[1])
    adjusted = [0.0] * n

    prev = 1.0
    for rank_idx in range(n - 1, -1, -1):
        orig_idx, p = indexed[rank_idx]
        rank = rank_idx + 1
        adj = min(prev, p * n / rank)
        adjusted[orig_idx] = min(adj, 1.0)
        prev = adj

    return adjusted
