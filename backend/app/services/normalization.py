"""
Kiri Atlas — Expression Normalization & Differential Expression

Pure computation service — no external API calls.

Normalization: Counts → TPM, Counts → FPKM, passthrough.
Differential Expression: Wilcoxon rank-sum (per Research Brief) with
Benjamini-Hochberg FDR correction (per Research Brief §6).
"""

import logging
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.stats.multitest import multipletests
from pydeseq2.dds import DeseqDataSet
from pydeseq2.ds import DeseqStats

from app.core.errors import KiriComputationError, KiriValidationError

logger = logging.getLogger("kiri.atlas.normalization")


# ══════════════════════════════
#  Normalization
# ══════════════════════════════


def normalize(
    matrix: dict[str, list[float]],
    method: str,
    gene_lengths: dict[str, int] | None = None,
) -> dict[str, list[float]]:
    """
    Normalize expression matrix to the specified method.

    Args:
        matrix: Gene → expression values dict
        method: 'tpm', 'fpkm', 'counts', 'tmm', or 'quantile'
        gene_lengths: Gene → length in bp (required for TPM/FPKM from counts)

    Returns:
        Normalized expression matrix

    Raises:
        KiriValidationError: If gene_lengths missing when required
        KiriComputationError: If normalization fails
    """
    if method == "counts":
        return matrix  # Passthrough for raw counts

    if method in ("tpm", "fpkm") and not gene_lengths:
        raise KiriValidationError(
            f"Gene lengths are required for {method.upper()} normalization. "
            "Provide gene_lengths mapping gene symbol → length in bp.",
            source="normalization",
        )

    try:
        if method == "tpm":
            return _counts_to_tpm(matrix, gene_lengths)
        elif method == "fpkm":
            return _counts_to_fpkm(matrix, gene_lengths)
        elif method == "tmm":
            return _tmm_normalize(matrix)
        elif method == "quantile":
            return _quantile_normalize(matrix)
        else:
            raise KiriValidationError(
                f"Unsupported normalization method: '{method}'. "
                "Supported: 'tpm', 'fpkm', 'counts', 'tmm', 'quantile'.",
                source="normalization",
            )
    except (ValueError, ZeroDivisionError) as e:
        raise KiriComputationError(
            f"Normalization failed: {e}",
            source="normalization",
        )


def _counts_to_tpm(
    matrix: dict[str, list[float]],
    gene_lengths: dict[str, int],
) -> dict[str, list[float]]:
    """
    Convert raw counts to Transcripts Per Million (TPM).

    TPM = (reads / gene_length_kb) / sum(reads / gene_length_kb) * 1e6

    This is the preferred normalization for cross-sample comparison
    (per Research Brief §2, Expression Data section).
    """
    genes = list(matrix.keys())
    if not genes:
        return {}

    n_samples = len(matrix[genes[0]])
    rpk = np.zeros((len(genes), n_samples))

    # Step 1: Reads per kilobase
    for i, gene in enumerate(genes):
        length_kb = gene_lengths.get(gene, 1000) / 1000.0
        rpk[i] = np.array(matrix[gene]) / max(length_kb, 0.001)

    # Step 2: Per-sample scaling factor
    scale_factors = rpk.sum(axis=0)
    scale_factors = np.where(scale_factors == 0, 1, scale_factors)

    # Step 3: TPM
    result = {}
    for i, gene in enumerate(genes):
        tpm_values = (rpk[i] / scale_factors) * 1e6
        result[gene] = [round(v, 4) for v in tpm_values.tolist()]

    return result


def _counts_to_fpkm(
    matrix: dict[str, list[float]],
    gene_lengths: dict[str, int],
) -> dict[str, list[float]]:
    """
    Convert raw counts to Fragments Per Kilobase per Million (FPKM).

    FPKM = (reads * 1e9) / (total_reads * gene_length)
    """
    genes = list(matrix.keys())
    if not genes:
        return {}

    n_samples = len(matrix[genes[0]])

    # Total reads per sample
    total_reads = np.zeros(n_samples)
    for gene in genes:
        total_reads += np.array(matrix[gene])
    total_reads = np.where(total_reads == 0, 1, total_reads)

    result = {}
    for gene in genes:
        length = gene_lengths.get(gene, 1000)
        counts = np.array(matrix[gene])
        fpkm = (counts * 1e9) / (total_reads * max(length, 1))
        result[gene] = [round(v, 4) for v in fpkm.tolist()]

    return result


def _tmm_normalize(
    matrix: dict[str, list[float]],
    trim_m: float = 0.3,
    trim_a: float = 0.05,
) -> dict[str, list[float]]:
    """
    Trimmed Mean of M-values (TMM) normalization (edgeR-style).

    TMM is a between-sample normalization that adjusts for compositional
    differences in RNA-seq libraries. It selects a reference sample,
    computes log-fold-changes (M-values) and log-averages (A-values)
    for each gene relative to the reference, trims extreme values,
    then applies weighted scaling.

    Args:
        matrix: Gene → expression values dict (raw counts preferred)
        trim_m: Fraction of M-values to trim from each tail (default 0.3)
        trim_a: Fraction of A-values to trim from each tail (default 0.05)

    Reference: Robinson & Oshlack, Genome Biology 2010.
    """
    genes = list(matrix.keys())
    if not genes:
        return {}

    n_samples = len(matrix[genes[0]])
    if n_samples < 2:
        return matrix  # Nothing to normalize with a single sample

    # Build counts array: genes × samples
    counts = np.array([matrix[g] for g in genes], dtype=float)

    # Library sizes
    lib_sizes = counts.sum(axis=0)
    lib_sizes = np.where(lib_sizes == 0, 1, lib_sizes)

    # Select reference sample: the one closest to the mean library size
    mean_lib = np.mean(lib_sizes)
    ref_idx = int(np.argmin(np.abs(lib_sizes - mean_lib)))

    # Compute TMM scaling factors for each sample
    scaling_factors = np.ones(n_samples)

    for j in range(n_samples):
        if j == ref_idx:
            continue

        # CPM-like values for comparison
        ref_vals = counts[:, ref_idx] / lib_sizes[ref_idx]
        smp_vals = counts[:, j] / lib_sizes[j]

        # Filter zero-expression genes in either sample
        valid = (ref_vals > 0) & (smp_vals > 0)
        if valid.sum() < 10:
            continue

        rv = ref_vals[valid]
        sv = smp_vals[valid]

        # M-values (log2 fold-change) and A-values (log2 average)
        m_vals = np.log2(sv / rv)
        a_vals = 0.5 * (np.log2(sv) + np.log2(rv))

        # Trim extremes
        n_valid = len(m_vals)
        m_lo = int(np.floor(n_valid * trim_m))
        m_hi = n_valid - m_lo
        a_lo = int(np.floor(n_valid * trim_a))
        a_hi = n_valid - a_lo

        m_order = np.argsort(m_vals)
        a_order = np.argsort(a_vals)

        m_keep = set(m_order[m_lo:m_hi])
        a_keep = set(a_order[a_lo:a_hi])
        keep = np.array(sorted(m_keep & a_keep))

        if len(keep) < 5:
            continue

        # Weighted trimmed mean of M-values
        # Weights: approximate variance of M is (1/count_j + 1/count_ref) for Poisson
        w_rv = counts[:, ref_idx][valid][keep]
        w_sv = counts[:, j][valid][keep]
        w = 1.0 / (1.0 / (w_sv + 1) + 1.0 / (w_rv + 1))

        tmm = np.average(m_vals[keep], weights=w)
        scaling_factors[j] = 2.0 ** tmm

    # Normalize: effective library size = lib_size * scaling_factor
    effective_lib = lib_sizes * scaling_factors
    # Compute CPM using effective library sizes
    result: dict[str, list[float]] = {}
    for i, gene in enumerate(genes):
        normalized = (counts[i] / effective_lib) * 1e6
        result[gene] = [round(float(v), 4) for v in normalized]

    return result


def _quantile_normalize(
    matrix: dict[str, list[float]],
) -> dict[str, list[float]]:
    """
    Quantile normalization.

    Forces all samples to have the same statistical distribution by:
    1. Ranking expression values within each sample
    2. Computing the mean across ranks
    3. Re-assigning values based on original rank order

    This is the standard approach for making microarray and RNA-seq
    datasets comparable (Bolstad et al., Bioinformatics 2003).
    """
    genes = list(matrix.keys())
    if not genes:
        return {}

    n_samples = len(matrix[genes[0]])
    if n_samples < 2:
        return matrix

    # Build DataFrame: genes × samples
    df = pd.DataFrame(matrix, index=[f"s{i}" for i in range(n_samples)]).T
    # df is now genes × samples

    # Step 1: Sort each column (sample) independently, track rank order
    rank_indices = np.argsort(df.values, axis=0)
    sorted_vals = np.sort(df.values, axis=0)

    # Step 2: Compute mean across ranks (row means of sorted matrix)
    rank_means = sorted_vals.mean(axis=1)

    # Step 3: Re-assign — for each sample, replace sorted values with rank means
    normalized = np.empty_like(df.values)
    for col_idx in range(n_samples):
        normalized[rank_indices[:, col_idx], col_idx] = rank_means

    # Rebuild dict
    result: dict[str, list[float]] = {}
    for i, gene in enumerate(genes):
        result[gene] = [round(float(v), 4) for v in normalized[i]]

    return result


# ══════════════════════════════
#  Differential Expression
# ══════════════════════════════


def _is_integer_counts(matrix: dict[str, list[float]], sample_size: int = 100) -> bool:
    """
    Detect whether the expression matrix contains integer raw counts
    or floating-point normalized values (TPM/FPKM/etc).

    Checks a sample of values: if >90% are whole numbers and the range
    suggests count data, returns True.
    """
    all_vals: list[float] = []
    for gene, vals in matrix.items():
        all_vals.extend(vals[:sample_size])
        if len(all_vals) > 500:
            break

    if not all_vals:
        return False

    arr = np.array(all_vals)
    # Check if values are integer-like (no fractional parts)
    int_fraction = np.mean(np.abs(arr - np.round(arr)) < 1e-6)
    # Count data typically has large values (hundreds to thousands)
    median_val = np.median(arr[arr > 0]) if np.any(arr > 0) else 0

    # Integer-like AND median > 10 suggests raw counts
    return float(int_fraction) > 0.90 and float(median_val) > 10.0


def differential_expression(
    matrix: dict[str, list[float]],
    groups: list[str],
    group_a: str = "tumor",
    group_b: str = "normal",
) -> dict[str, Any]:
    """
    Run differential expression analysis between two groups.

    Strategy:
    - If data looks like integer raw counts → use PyDESeq2 (Negative Binomial GLM)
    - If data is floating-point normalized (TPM/FPKM) → use Wilcoxon rank-sum test
      with Benjamini-Hochberg FDR correction (per Research Brief §6)

    Args:
        matrix: Gene → expression values dict
        groups: Group label per sample (same length as expression vectors)
        group_a: Test group label
        group_b: Reference group label

    Returns:
        Differential expression results with corrected p-values
    """
    genes = list(matrix.keys())
    if not genes:
        raise KiriComputationError(
            "Empty expression matrix.", source="differential-expression"
        )

    n_samples = len(groups)
    if n_samples == 0:
        raise KiriComputationError(
            "No samples provided.", source="differential-expression"
        )

    # Validate group assignments match matrix dimensions
    first_gene = genes[0]
    if len(matrix[first_gene]) != n_samples:
        raise KiriComputationError(
            f"Group labels ({n_samples}) don't match expression values "
            f"({len(matrix[first_gene])}).",
            source="differential-expression",
        )

    # Get indices for each group
    idx_a = [i for i, g in enumerate(groups) if g == group_a]
    idx_b = [i for i, g in enumerate(groups) if g == group_b]

    if len(idx_a) < 3:
        raise KiriComputationError(
            f"Insufficient samples in group '{group_a}' (n={len(idx_a)}, need ≥3).",
            source="differential-expression",
            warnings=[f"Group '{group_a}' has only {len(idx_a)} samples."],
        )
    if len(idx_b) < 3:
        raise KiriComputationError(
            f"Insufficient samples in group '{group_b}' (n={len(idx_b)}, need ≥3).",
            source="differential-expression",
            warnings=[f"Group '{group_b}' has only {len(idx_b)} samples."],
        )

    use_deseq2 = _is_integer_counts(matrix)

    if use_deseq2:
        return _de_pydeseq2(matrix, genes, groups, idx_a, idx_b, group_a, group_b)
    else:
        return _de_wilcoxon(matrix, genes, idx_a, idx_b, group_a, group_b)


def _de_pydeseq2(
    matrix: dict[str, list[float]],
    genes: list[str],
    groups: list[str],
    idx_a: list[int],
    idx_b: list[int],
    group_a: str,
    group_b: str,
) -> dict[str, Any]:
    """Run DE using PyDESeq2 for integer count data."""
    n_samples = len(groups)

    # Build counts DataFrame (Samples x Genes)
    counts_dict = {}
    for i in range(n_samples):
        counts_dict[f"sample_{i}"] = {gene: int(round(matrix[gene][i])) for gene in genes}
    counts_df = pd.DataFrame.from_dict(counts_dict, orient='index')

    # Build metadata DataFrame
    metadata_df = pd.DataFrame({"condition": groups}, index=counts_df.index)

    try:
        dds = DeseqDataSet(
            counts=counts_df,
            metadata=metadata_df,
            design_factors="condition",
            refit_cooks=True,
            n_cpus=1,
            quiet=True,
        )
        dds.deseq2()

        stat_res = DeseqStats(
            dds,
            contrast=("condition", group_a, group_b),
            n_cpus=1,
            quiet=True,
        )
        stat_res.summary()
        res_df = stat_res.results_df
    except Exception as e:
        logger.warning(f"PyDESeq2 failed, falling back to Wilcoxon: {e}")
        return _de_wilcoxon(matrix, genes, idx_a, idx_b, group_a, group_b)

    results = []
    for gene in genes:
        values = np.array(matrix[gene])
        vals_a = values[idx_a]
        vals_b = values[idx_b]
        mean_a = float(np.mean(vals_a))
        mean_b = float(np.mean(vals_b))

        gene_stats = res_df.loc[gene]
        results.append({
            "gene": gene,
            "log2_fold_change": round(float(gene_stats.get("log2FoldChange", 0.0) or 0.0), 4),
            "p_value": float(gene_stats.get("pvalue", 1.0) or 1.0),
            "adjusted_p_value": round(float(gene_stats.get("padj", 1.0) or 1.0), 6),
            "mean_a": round(mean_a, 4),
            "mean_b": round(mean_b, 4),
            "avg_expression": round(float(np.mean(values)), 4),
        })

    results.sort(key=lambda x: x["adjusted_p_value"])
    return {
        "results": results,
        "method": "PyDESeq2 (Negative Binomial GLM)",
        "correction": "Benjamini-Hochberg FDR",
        "group_a": group_a,
        "group_b": group_b,
        "n_a": len(idx_a),
        "n_b": len(idx_b),
    }


def _de_wilcoxon(
    matrix: dict[str, list[float]],
    genes: list[str],
    idx_a: list[int],
    idx_b: list[int],
    group_a: str,
    group_b: str,
) -> dict[str, Any]:
    """
    Run DE using Wilcoxon rank-sum test for normalized data (TPM/FPKM).
    Per Research Brief §6 statistical standards.
    """
    results = []
    raw_p_values = []

    for gene in genes:
        values = np.array(matrix[gene], dtype=float)
        vals_a = values[idx_a]
        vals_b = values[idx_b]

        mean_a = float(np.mean(vals_a))
        mean_b = float(np.mean(vals_b))

        # Log2 fold change (add pseudocount to avoid log(0))
        pseudo = 0.01
        lfc = float(np.log2((mean_a + pseudo) / (mean_b + pseudo)))

        # Wilcoxon rank-sum (Mann-Whitney U)
        try:
            stat_result = stats.mannwhitneyu(vals_a, vals_b, alternative="two-sided")
            p_val = float(stat_result.pvalue)
        except ValueError:
            # All values identical or other edge case
            p_val = 1.0

        raw_p_values.append(p_val)
        results.append({
            "gene": gene,
            "log2_fold_change": round(lfc, 4),
            "p_value": p_val,
            "adjusted_p_value": 1.0,  # placeholder, corrected below
            "mean_a": round(mean_a, 4),
            "mean_b": round(mean_b, 4),
            "avg_expression": round(float(np.mean(values)), 4),
        })

    # Benjamini-Hochberg FDR correction
    if raw_p_values:
        _, adj_pvals, _, _ = multipletests(raw_p_values, method="fdr_bh")
        for i, res in enumerate(results):
            res["adjusted_p_value"] = round(float(adj_pvals[i]), 6)

    # Sort by adjusted p-value
    results.sort(key=lambda x: x["adjusted_p_value"])

    return {
        "results": results,
        "method": "Wilcoxon rank-sum (Mann-Whitney U)",
        "correction": "Benjamini-Hochberg FDR",
        "group_a": group_a,
        "group_b": group_b,
        "n_a": len(idx_a),
        "n_b": len(idx_b),
    }


# ══════════════════════════════
#  Cross-Cohort Z-Score Normalization
# ══════════════════════════════


def cross_cohort_zscore(
    datasets: list[dict[str, list[float]]],
    labels: list[str] | None = None,
) -> dict[str, Any]:
    """
    Z-score normalize expression values across multiple datasets
    for comparable visualization. Each dataset is a gene → values dict.

    The combined z-score allows cross-platform comparison (e.g., TCGA RNA-seq
    vs. GEO microarray) by standardizing each gene's expression to mean=0, sd=1
    across ALL samples from ALL datasets.

    Args:
        datasets: List of gene → expression value dicts (one per cohort).
        labels:   Optional cohort labels (e.g., ["TCGA-COAD", "GSE39582"]).

    Returns:
        {
          "genes": ["PARL", "MAVS", ...],
          "cohorts": [
            {
              "label": "TCGA-COAD",
              "sample_count": 521,
              "z_scores": {"PARL": [...], "MAVS": [...]}
            },
            ...
          ],
          "method": "Cross-cohort z-score"
        }
    """
    if not datasets:
        raise KiriValidationError("No datasets provided.", source="normalization")

    if labels and len(labels) != len(datasets):
        raise KiriValidationError(
            f"Labels count ({len(labels)}) doesn't match datasets count ({len(datasets)}).",
            source="normalization",
        )

    if not labels:
        labels = [f"Cohort_{i+1}" for i in range(len(datasets))]

    # Find common genes across all datasets
    gene_sets = [set(d.keys()) for d in datasets]
    common_genes = sorted(set.intersection(*gene_sets)) if gene_sets else []

    if not common_genes:
        raise KiriComputationError(
            "No common genes found across datasets.",
            source="normalization",
        )

    try:
        # Concatenate all values per gene across cohorts
        cohort_sizes = [len(next(iter(d.values()))) for d in datasets]

        result_cohorts = []
        for gene in common_genes:
            # Gather all values across all datasets for this gene
            all_values = []
            for ds in datasets:
                all_values.extend(ds[gene])

            arr = np.array(all_values, dtype=float)
            mean = np.mean(arr)
            std = np.std(arr)
            if std == 0:
                std = 1.0  # avoid division by zero for constant genes

            # Z-score normalize and split back into cohorts
            z_scored = (arr - mean) / std
            offset = 0
            for ci, size in enumerate(cohort_sizes):
                if len(result_cohorts) <= ci:
                    result_cohorts.append({
                        "label": labels[ci],
                        "sample_count": size,
                        "z_scores": {},
                    })
                result_cohorts[ci]["z_scores"][gene] = [
                    round(float(v), 4) for v in z_scored[offset : offset + size]
                ]
                offset += size

        return {
            "genes": common_genes,
            "cohorts": result_cohorts,
            "method": "Cross-cohort z-score",
        }

    except Exception as e:
        raise KiriComputationError(
            f"Z-score normalization failed: {e}",
            source="normalization",
        )

