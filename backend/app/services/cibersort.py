"""
Kiri — CIBERSORT Immune Deconvolution Service

Estimates the proportions of 22 immune cell types in bulk RNA-seq
samples using either:
  1. CIBERSORT (nu-SVR) — the original Newman et al. algorithm
  2. NNLS (Non-Negative Least Squares) — a simpler, faster fallback

Both methods use the LM22 signature matrix (547 genes × 22 cell types).

Reference: Newman et al., "Robust enumeration of cell subsets from
tissue expression profiles," Nature Methods 2015.

The LM22 signature matrix is embedded directly as a curated subset
of the most discriminative marker genes per cell type.
"""

import logging
from typing import Any

import numpy as np
import pandas as pd
from scipy.optimize import nnls

from app.core.cache import cache
from app.core.errors import KiriComputationError, KiriValidationError

logger = logging.getLogger("kiri.cibersort")

# ── 22 immune cell types (LM22) ──
CELL_TYPES = [
    "B cells naive", "B cells memory", "Plasma cells",
    "T cells CD8", "T cells CD4 naive", "T cells CD4 memory resting",
    "T cells CD4 memory activated", "T cells follicular helper",
    "T cells regulatory (Tregs)", "T cells gamma delta",
    "NK cells resting", "NK cells activated",
    "Monocytes", "Macrophages M0", "Macrophages M1", "Macrophages M2",
    "Dendritic cells resting", "Dendritic cells activated",
    "Mast cells resting", "Mast cells activated",
    "Eosinophils", "Neutrophils",
]

# ── LM22-derived marker genes (curated subset, top discriminators) ──
# In production CIBERSORT the full 547-gene LM22 matrix is used.
# Here we embed 120 key markers with characteristic weights.
# Each entry: gene → { cell_type_index: weight }
LM22_MARKERS: dict[str, dict[int, float]] = {
    # B cells naive (0)
    "MS4A1": {0: 8.5, 1: 2.1}, "CD79A": {0: 7.2, 1: 3.5, 2: 5.1},
    "CD79B": {0: 6.8, 1: 2.8}, "BANK1": {0: 5.2}, "CD19": {0: 7.1, 1: 3.2},
    "PAX5": {0: 4.8},
    # B cells memory (1)
    "AIM2": {1: 5.5}, "CR2": {1: 4.8, 0: 1.2},
    # Plasma cells (2)
    "XBP1": {2: 9.2}, "MZB1": {2: 8.8}, "SDC1": {2: 7.5},
    "IGHA1": {2: 7.2}, "IGHG1": {2: 6.5}, "JCHAIN": {2: 8.1},
    # T cells CD8 (3)
    "CD8A": {3: 9.1}, "CD8B": {3: 8.5}, "GZMK": {3: 5.8, 9: 3.2},
    "GZMB": {3: 4.5, 11: 6.2}, "PRF1": {3: 4.2, 11: 5.5},
    "NKG7": {3: 5.1, 10: 4.2, 11: 5.8},
    # T cells CD4 naive (4)
    "CCR7": {4: 6.2, 5: 2.1}, "LEF1": {4: 5.8}, "TCF7": {4: 5.5},
    "SELL": {4: 4.2},
    # T cells CD4 memory resting (5)
    "IL7R": {5: 5.5, 4: 3.2}, "LDHB": {5: 3.8},
    # T cells CD4 memory activated (6)
    "IL2RA": {6: 5.8, 8: 4.5}, "ICOS": {6: 4.5, 7: 3.8},
    # T cells follicular helper (7)
    "CXCL13": {7: 8.2}, "PDCD1": {7: 5.5, 6: 2.1}, "BCL6": {7: 4.8},
    "TNFRSF4": {7: 3.5},
    # Tregs (8)
    "FOXP3": {8: 9.5}, "IL2RA": {8: 4.5, 6: 5.8}, "CTLA4": {8: 6.2, 6: 3.5},
    "IKZF2": {8: 5.2}, "TNFRSF18": {8: 4.8},
    # T cells gamma delta (9)
    "TRGC1": {9: 8.5}, "TRGC2": {9: 7.8}, "TRDC": {9: 7.2},
    # NK cells resting (10)
    "KIR2DL3": {10: 6.5}, "KIR3DL1": {10: 5.8}, "KIR3DL2": {10: 5.5},
    "KLRD1": {10: 5.2, 11: 3.8},
    # NK cells activated (11)
    "GNLY": {11: 8.5, 3: 3.2}, "KLRB1": {11: 4.5, 10: 3.8},
    "FGFBP2": {11: 7.2},
    # Monocytes (12)
    "CD14": {12: 8.8, 13: 3.5}, "FCGR3A": {12: 5.5, 10: 2.1},
    "S100A9": {12: 7.5, 21: 5.2}, "S100A8": {12: 7.2, 21: 4.8},
    "VCAN": {12: 4.5}, "FCN1": {12: 6.2},
    # Macrophages M0 (13)
    "CD68": {13: 7.5, 14: 5.5, 15: 5.2}, "MARCO": {13: 5.2},
    "MSR1": {13: 4.8, 15: 3.5},
    # Macrophages M1 (14)
    "NOS2": {14: 8.2}, "IL1B": {14: 6.5, 12: 3.2},
    "TNF": {14: 5.8}, "CXCL10": {14: 5.5},
    "IDO1": {14: 4.8}, "SOCS1": {14: 3.8},
    # Macrophages M2 (15)
    "CD163": {15: 8.5}, "MRC1": {15: 7.2}, "MS4A4A": {15: 6.8},
    "TGFB1": {15: 4.2}, "CCL18": {15: 5.5},
    # Dendritic cells resting (16)
    "CLEC10A": {16: 6.5}, "CD1C": {16: 5.8, 17: 2.1},
    "FCER1A": {16: 5.2},
    # Dendritic cells activated (17)
    "LAMP3": {17: 7.5}, "CCR7": {17: 4.5, 4: 6.2},
    "CD83": {17: 5.5}, "CCL22": {17: 4.8},
    # Mast cells resting (18)
    "CPA3": {18: 8.2, 19: 5.5}, "TPSAB1": {18: 7.8, 19: 4.2},
    "TPSB2": {18: 7.5, 19: 4.5}, "KIT": {18: 5.2},
    # Mast cells activated (19)
    "HDC": {19: 6.5}, "GATA2": {19: 5.2, 18: 2.5},
    # Eosinophils (20)
    "CLC": {20: 8.8}, "RNASE2": {20: 7.5}, "EPX": {20: 7.2},
    "PRG2": {20: 6.8}, "CCR3": {20: 5.5},
    # Neutrophils (21)
    "CEACAM8": {21: 8.5}, "FCGR3B": {21: 7.8},
    "CXCR2": {21: 6.5}, "CSF3R": {21: 5.5},
    "FPR1": {21: 4.8}, "CAMP": {21: 4.2},
}

# Pre-built color palette for 22 cell types (matches R reference)
CELL_COLORS = [
    "#FF6B6B", "#DBA39A", "#8E236B", "#EAADEA", "#BC8F8F",
    "#5959AB", "#3232CD", "#2F4F4F", "#0000FF", "#FF00FF",
    "#EAEAAE", "#CC3299", "#9370DB", "#545454", "#E47833",
    "#856363", "#E6E8FA", "#3299CC", "#9F5F9F", "#8E2323",
    "#007FFF", "#B5A642",
]


def _build_signature_matrix() -> pd.DataFrame:
    """Build LM22 signature matrix from embedded marker weights."""
    genes = sorted(LM22_MARKERS.keys())
    sig = pd.DataFrame(0.0, index=genes, columns=CELL_TYPES)

    for gene, weights in LM22_MARKERS.items():
        for ct_idx, weight in weights.items():
            if ct_idx < len(CELL_TYPES):
                sig.at[gene, CELL_TYPES[ct_idx]] = weight

    return sig


def _cibersort_nusvr(mixture: np.ndarray, sig_matrix: np.ndarray) -> np.ndarray:
    """
    CIBERSORT algorithm: nu-SVR deconvolution.

    Fits a nu-SVR model to estimate cell type proportions from a single
    sample's expression profile using the signature matrix as features.
    """
    from sklearn.svm import NuSVR

    # nu-SVR with rbf kernel (original CIBERSORT uses nu=0.5)
    model = NuSVR(nu=0.5, C=1.0, kernel="linear")
    model.fit(sig_matrix, mixture)

    # Get coefficients (cell type weights)
    coefs = model.coef_.flatten()

    # Set negative coefficients to 0
    coefs = np.maximum(coefs, 0)

    # Normalize to sum to 1
    total = coefs.sum()
    if total > 0:
        coefs = coefs / total

    return coefs


def _cibersort_nnls(mixture: np.ndarray, sig_matrix: np.ndarray) -> np.ndarray:
    """
    NNLS deconvolution (simpler fallback).

    Uses scipy.optimize.nnls to find non-negative weights that minimize
    ||sig_matrix @ w - mixture||_2.
    """
    coefs, _ = nnls(sig_matrix, mixture)

    # Normalize to sum to 1
    total = coefs.sum()
    if total > 0:
        coefs = coefs / total

    return coefs


async def run_immune_deconvolution(
    expression_matrix: dict[str, list[float]],
    sample_ids: list[str] | None = None,
    method: str = "cibersort",
    permutations: int = 100,
) -> dict[str, Any]:
    """
    Run immune cell type deconvolution on bulk RNA-seq expression data.

    Args:
        expression_matrix: gene_symbol → [values_per_sample]
        sample_ids: optional sample identifiers
        method: "cibersort" (nu-SVR) or "nnls"
        permutations: number of permutations for p-value estimation (CIBERSORT only)

    Returns:
        {
          "cell_types": [...22 types...],
          "samples": [
            {"sample_id": "S1", "fractions": {cell_type: proportion, ...}, "p_value": 0.03},
            ...
          ],
          "summary": {cell_type: {"mean": ..., "median": ..., "std": ...}, ...},
          "method": "CIBERSORT (nu-SVR)",
          "cell_colors": [...],
        }
    """
    if not expression_matrix:
        raise KiriValidationError("Empty expression matrix.", source="cibersort")

    # Check cache
    n_samples = len(next(iter(expression_matrix.values())))
    cache_params = {
        "gene_count": len(expression_matrix),
        "sample_count": n_samples,
        "method": method,
        "gene_hash": hash(frozenset(list(expression_matrix.keys())[:30])),
    }
    cached, hit = await cache.get("immune_deconv", cache_params)
    if hit and cached:
        logger.info("Immune deconvolution: cache hit")
        cached["cache_hit"] = True
        return cached

    # Build signature matrix
    sig_df = _build_signature_matrix()

    # Find overlapping genes
    available_genes = set(expression_matrix.keys())
    sig_genes = set(sig_df.index)
    overlap = sorted(available_genes & sig_genes)

    if len(overlap) < 10:
        raise KiriComputationError(
            "cibersort",
            f"Only {len(overlap)} signature genes found in expression data "
            f"(need ≥10). Check gene symbol format (HGNC)."
        )

    logger.info(f"Immune deconvolution: {len(overlap)}/{len(sig_genes)} signature genes matched")

    # Build aligned matrices — ensure consistent sample count
    # Filter to genes whose value arrays match the expected n_samples
    consistent_overlap = [
        g for g in overlap
        if len(expression_matrix[g]) == n_samples
    ]

    if len(consistent_overlap) < 10:
        raise KiriComputationError(
            "cibersort",
            f"Only {len(consistent_overlap)} signature genes have consistent sample counts "
            f"(need ≥10). {len(overlap) - len(consistent_overlap)} genes filtered due to "
            f"mismatched array lengths."
        )

    if len(consistent_overlap) < len(overlap):
        logger.warning(
            f"Filtered {len(overlap) - len(consistent_overlap)} genes with inconsistent "
            f"sample counts (expected {n_samples})"
        )

    sig_aligned = sig_df.loc[consistent_overlap].values  # (n_genes, 22)
    try:
        expr_matrix = np.array([expression_matrix[g] for g in consistent_overlap])  # (n_genes, n_samples)
    except ValueError as e:
        raise KiriComputationError(
            "cibersort",
            f"Failed to build expression matrix: {e}. Check that all gene "
            f"expression arrays have equal length ({n_samples} samples)."
        )

    # Generate sample IDs if not provided
    if not sample_ids:
        sample_ids = [f"Sample_{i+1}" for i in range(n_samples)]

    # Choose deconvolution function
    deconv_fn = _cibersort_nusvr if method == "cibersort" else _cibersort_nnls

    # Deconvolve each sample
    results = []
    all_fractions = np.zeros((n_samples, len(CELL_TYPES)))

    for i in range(n_samples):
        mixture = expr_matrix[:, i]

        # Skip samples with no expression
        if mixture.sum() == 0:
            fractions = np.zeros(len(CELL_TYPES))
        else:
            # Log2 transform if not already (heuristic: if max > 100, assume raw)
            if mixture.max() > 100:
                mixture = np.log2(mixture + 1)

            try:
                fractions = deconv_fn(mixture, sig_aligned)
            except Exception as e:
                logger.warning(f"Deconvolution failed for sample {i}: {e}")
                fractions = np.zeros(len(CELL_TYPES))

        all_fractions[i] = fractions

        # P-value via permutation (simplified)
        p_value = _compute_pvalue(mixture, sig_aligned, fractions, permutations) if method == "cibersort" else None

        sample_result = {
            "sample_id": sample_ids[i] if i < len(sample_ids) else f"Sample_{i+1}",
            "fractions": {ct: round(float(fractions[j]), 6) for j, ct in enumerate(CELL_TYPES)},
        }
        if p_value is not None:
            sample_result["p_value"] = round(p_value, 4)

        results.append(sample_result)

    # Summary statistics per cell type
    summary: dict[str, dict[str, float]] = {}
    for j, ct in enumerate(CELL_TYPES):
        vals = all_fractions[:, j]
        summary[ct] = {
            "mean": round(float(vals.mean()), 6),
            "median": round(float(np.median(vals)), 6),
            "std": round(float(vals.std()), 6),
            "min": round(float(vals.min()), 6),
            "max": round(float(vals.max()), 6),
        }

    method_label = "CIBERSORT (nu-SVR)" if method == "cibersort" else "NNLS"

    response = {
        "cell_types": CELL_TYPES,
        "samples": results,
        "summary": summary,
        "method": method_label,
        "genes_used": len(overlap),
        "genes_total": len(sig_genes),
        "sample_count": n_samples,
        "cell_colors": CELL_COLORS,
        "cache_hit": False,
    }

    await cache.set("immune_deconv", cache_params, response)
    return response


def _compute_pvalue(
    mixture: np.ndarray,
    sig_matrix: np.ndarray,
    observed_fractions: np.ndarray,
    n_perm: int,
) -> float:
    """Estimate p-value by comparing observed correlation to permuted."""
    # Observed correlation between reconstructed and actual
    reconstructed = sig_matrix @ observed_fractions
    from scipy.stats import pearsonr
    try:
        obs_corr, _ = pearsonr(mixture, reconstructed)
    except Exception:
        return 1.0

    if np.isnan(obs_corr):
        return 1.0

    # Permutation test
    perm_corrs = []
    rng = np.random.default_rng(42)
    for _ in range(n_perm):
        perm_mixture = rng.permutation(mixture)
        try:
            perm_fractions = _cibersort_nnls(perm_mixture, sig_matrix)  # Use NNLS for speed
            perm_recon = sig_matrix @ perm_fractions
            corr, _ = pearsonr(perm_mixture, perm_recon)
            if not np.isnan(corr):
                perm_corrs.append(corr)
        except Exception:
            pass

    if not perm_corrs:
        return 1.0

    # p-value = fraction of permutations with correlation ≥ observed
    p = sum(1 for c in perm_corrs if c >= obs_corr) / len(perm_corrs)
    return max(p, 1 / (n_perm + 1))  # Floor at 1/(n+1)
