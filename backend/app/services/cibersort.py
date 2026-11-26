"""
Kiri — Immune Deconvolution Service

Estimates the proportions of 22 immune cell types in bulk expression samples
with nu-SVR (the method CIBERSORT uses) or NNLS, against the LM22 signature
matrix (547 genes x 22 cell types; Newman et al., Nature Methods 2015).

Kiri does not ship LM22. Its licence does not allow redistribution, so the
user installs their own copy (free for academics from cibersortx.stanford.edu)
as ``<KIRI_DATA_DIR>/signatures/LM22.txt``. Without that file this service
refuses to run. An earlier version embedded about 120 marker genes with
hand-typed weights and presented the output as CIBERSORT; that is removed.

This is an independent implementation of the published method, not the
official CIBERSORT program, and results are labelled that way.
"""

import hashlib
import logging
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from scipy.optimize import nnls

from app.core.cache import cache
from app.core.config import settings
from app.core.errors import KiriComputationError, KiriDataUnavailableError, KiriValidationError

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

# Pre-built color palette for 22 cell types (matches R reference)
CELL_COLORS = [
    "#FF6B6B", "#DBA39A", "#8E236B", "#EAADEA", "#BC8F8F",
    "#5959AB", "#3232CD", "#2F4F4F", "#0000FF", "#FF00FF",
    "#EAEAAE", "#CC3299", "#9370DB", "#545454", "#E47833",
    "#856363", "#E6E8FA", "#3299CC", "#9F5F9F", "#8E2323",
    "#007FFF", "#B5A642",
]


def signature_path() -> Path:
    return Path(settings.KIRI_DATA_DIR) / "signatures" / "LM22.txt"


def load_signature_matrix() -> pd.DataFrame:
    """
    Load the user-installed LM22 signature matrix (tab-separated, genes in rows,
    the 22 cell types in columns).
    """
    path = signature_path()
    if not path.is_file():
        raise KiriDataUnavailableError(
            "immune-deconvolution",
            "Immune deconvolution needs the LM22 signature matrix, which Kiri cannot ship. "
            f"Download LM22 from cibersortx.stanford.edu and save it as {path}. "
            "No cell fractions were generated.",
        )
    try:
        sig = pd.read_csv(path, sep="\t", index_col=0)
    except Exception as e:
        raise KiriValidationError(f"Could not read the signature matrix at {path}: {e}", source="cibersort")

    sig.index = sig.index.astype(str).str.upper()
    sig = sig.apply(pd.to_numeric, errors="coerce").dropna(how="any")
    sig = sig[~sig.index.duplicated(keep="first")]
    if sig.shape[1] != len(CELL_TYPES) or sig.shape[0] < 100:
        raise KiriValidationError(
            f"The signature matrix at {path} has {sig.shape[0]} genes x {sig.shape[1]} columns; "
            f"LM22 has 547 genes x {len(CELL_TYPES)} cell types.",
            source="cibersort",
        )
    # Column names differ slightly between LM22 releases; Kiri uses its own labels in LM22 order.
    sig.columns = CELL_TYPES
    return sig


def _zscore(x: np.ndarray) -> np.ndarray:
    sd = x.std()
    return (x - x.mean()) / sd if sd > 0 else x - x.mean()


def _cibersort_nusvr(mixture: np.ndarray, sig_matrix: np.ndarray) -> np.ndarray:
    """
    nu-SVR deconvolution as described by Newman et al. 2015: linear kernel,
    mixture and signature standardised, nu tried at 0.25, 0.5 and 0.75 and the
    fit with the lowest RMSE kept. Negative weights are set to 0 and the rest
    normalised to sum to 1.
    """
    from sklearn.svm import NuSVR

    x = _zscore(sig_matrix)
    y = _zscore(mixture)

    best_w, best_rmse = None, np.inf
    for nu in (0.25, 0.5, 0.75):
        model = NuSVR(nu=nu, C=1.0, kernel="linear")
        model.fit(x, y)
        w = np.maximum(model.coef_.flatten(), 0)
        total = w.sum()
        if total <= 0:
            continue
        w = w / total
        rmse = float(np.sqrt(np.mean((x @ w - y) ** 2)))
        if rmse < best_rmse:
            best_w, best_rmse = w, rmse

    if best_w is None:
        return np.zeros(sig_matrix.shape[1])
    return best_w


def _cibersort_nnls(mixture: np.ndarray, sig_matrix: np.ndarray) -> np.ndarray:
    """NNLS deconvolution: non-negative weights minimising ||S w - m||, normalised to sum to 1."""
    coefs, _ = nnls(sig_matrix, mixture)
    total = coefs.sum()
    if total > 0:
        coefs = coefs / total
    return coefs


def _fit_correlation(mixture: np.ndarray, sig_matrix: np.ndarray, fractions: np.ndarray) -> float:
    recon = sig_matrix @ fractions
    if np.std(recon) == 0 or np.std(mixture) == 0:
        return 0.0
    r = float(np.corrcoef(mixture, recon)[0, 1])
    return 0.0 if np.isnan(r) else r


def _null_correlations(
    expr_matrix: np.ndarray, sig_matrix: np.ndarray, n_perm: int, seed: int = 0
) -> np.ndarray:
    """
    Null distribution of the fit correlation, as in CIBERSORT: each permutation
    draws a random mixture from all expression values in the dataset and
    deconvolves it with the same nu-SVR. The seed only fixes the resampling so
    that a run is reproducible; it does not create data.
    """
    rng = np.random.default_rng(seed)
    pool = expr_matrix.flatten()
    n_genes = sig_matrix.shape[0]
    null = np.empty(n_perm)
    for k in range(n_perm):
        random_mixture = rng.choice(pool, size=n_genes, replace=True)
        w = _cibersort_nusvr(random_mixture, sig_matrix)
        null[k] = _fit_correlation(random_mixture, sig_matrix, w)
    return np.sort(null)


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
          "method": "nu-SVR deconvolution with LM22 ...",
          "cell_colors": [...],
        }
    """
    if not expression_matrix:
        raise KiriValidationError("Empty expression matrix.", source="cibersort")

    # Check cache
    n_samples = len(next(iter(expression_matrix.values())))
    # Key the cache on the full content, so two different datasets can never share a result.
    digest = hashlib.sha256()
    for gene in sorted(expression_matrix):
        digest.update(str(gene).encode())
        digest.update(np.asarray(expression_matrix[gene], dtype=float).tobytes())
    cache_params = {
        "data": digest.hexdigest(),
        "samples": list(sample_ids or []),
        "method": method,
        "permutations": permutations,
    }
    cached, hit = await cache.get("immune_deconv_v2", cache_params)
    if hit and cached:
        logger.info("Immune deconvolution: cache hit")
        cached["cache_hit"] = True
        return cached

    # Build signature matrix
    sig_df = load_signature_matrix()

    # Find overlapping genes
    expression_matrix = {str(g).upper(): v for g, v in expression_matrix.items()}
    available_genes = set(expression_matrix.keys())
    sig_genes = set(sig_df.index)
    overlap = sorted(available_genes & sig_genes)

    min_genes = len(sig_genes) // 2
    if len(overlap) < min_genes:
        raise KiriComputationError(
            "cibersort",
            f"Only {len(overlap)} of {len(sig_genes)} signature genes were found in the expression "
            f"data (at least {min_genes} are needed). Check that genes are HGNC symbols."
        )

    logger.info(f"Immune deconvolution: {len(overlap)}/{len(sig_genes)} signature genes matched")

    # Build aligned matrices — ensure consistent sample count
    # Filter to genes whose value arrays match the expected n_samples
    consistent_overlap = [
        g for g in overlap
        if len(expression_matrix[g]) == n_samples
    ]

    if len(consistent_overlap) < min_genes:
        raise KiriComputationError(
            "cibersort",
            f"Only {len(consistent_overlap)} signature genes have a value for every sample "
            f"(at least {min_genes} are needed)."
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

    expr_matrix = np.asarray(expr_matrix, dtype=float)
    if not np.isfinite(expr_matrix).all():
        raise KiriValidationError("The expression data contains missing or non-numeric values.", source="cibersort")

    # LM22 is in linear space. Like CIBERSORT, treat data whose maximum is below 50
    # as log2 and convert it back.
    assumed_log2 = bool(expr_matrix.max() < 50)
    if assumed_log2:
        expr_matrix = np.power(2.0, expr_matrix)

    null = None
    if method == "cibersort" and permutations > 0:
        null = _null_correlations(expr_matrix, sig_aligned, permutations)

    # Deconvolve each sample
    results = []
    failed_samples: list[str] = []
    all_fractions = np.full((n_samples, len(CELL_TYPES)), np.nan)

    for i in range(n_samples):
        mixture = expr_matrix[:, i]
        sid = sample_ids[i] if i < len(sample_ids) else f"Sample_{i+1}"

        fractions = None
        if mixture.sum() > 0:
            try:
                fractions = deconv_fn(mixture, sig_aligned)
            except Exception as e:
                logger.warning(f"Deconvolution failed for sample {sid}: {e}")

        if fractions is None or fractions.sum() == 0:
            # A sample that cannot be deconvolved is reported as failed, not as all zeros.
            failed_samples.append(sid)
            results.append({"sample_id": sid, "fractions": None, "failed": True})
            continue

        all_fractions[i] = fractions
        r = _fit_correlation(mixture, sig_aligned, fractions)
        sample_result = {
            "sample_id": sid,
            "fractions": {ct: round(float(fractions[j]), 6) for j, ct in enumerate(CELL_TYPES)},
            "correlation": round(r, 4),
        }
        if null is not None:
            # Empirical p-value with the +1 correction, so it is never reported as 0.
            p_value = (1 + int(np.sum(null >= r))) / (len(null) + 1)
            sample_result["p_value"] = round(float(p_value), 4)

        results.append(sample_result)

    if len(failed_samples) == n_samples:
        raise KiriComputationError("cibersort", "Deconvolution failed for every sample.")

    # Summary statistics per cell type
    summary: dict[str, dict[str, float]] = {}
    for j, ct in enumerate(CELL_TYPES):
        vals = all_fractions[:, j]
        vals = vals[~np.isnan(vals)]
        summary[ct] = {
            "mean": round(float(vals.mean()), 6),
            "median": round(float(np.median(vals)), 6),
            "std": round(float(vals.std()), 6),
            "min": round(float(vals.min()), 6),
            "max": round(float(vals.max()), 6),
        }

    method_label = (
        "nu-SVR deconvolution with LM22 (CIBERSORT method, Kiri implementation)"
        if method == "cibersort" else "NNLS deconvolution with LM22"
    )

    response = {
        "cell_types": CELL_TYPES,
        "samples": results,
        "summary": summary,
        "method": method_label,
        "genes_used": len(overlap),
        "genes_total": len(sig_genes),
        "sample_count": n_samples,
        "failed_samples": failed_samples,
        "input_assumed_log2": assumed_log2,
        "permutations": permutations if null is not None else 0,
        "cell_colors": CELL_COLORS,
        "cache_hit": False,
    }

    await cache.set("immune_deconv_v2", cache_params, response)
    return response
