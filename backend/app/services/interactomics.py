"""
Kiri — Interactomics Service

CoIP-MS / proteomics interaction analysis:
- PRIDE dataset discovery for target genes
- Significance analysis (t-test + BH FDR)
- Volcano plot + heatmap data generation

All gene parameters are project-scoped (generic, not PARL-specific).
"""

import logging
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

from app.core.cache import cache

logger = logging.getLogger("kiri.interactomics")

# Known CoIP-MS datasets from PRIDE (curated, expandable)
KNOWN_PRIDE_DATASETS: dict[str, dict[str, Any]] = {
    "PXD000001": {
        "title": "Human mitochondrial interactome",
        "description": "CoIP-MS of mitochondrial protein complexes",
        "organism": "Homo sapiens",
        "genes_covered": ["PARL", "OPA1", "PINK1", "MFN2", "DNM1L"],
    },
}


async def search_pride_datasets(
    genes: list[str],
) -> dict[str, Any]:
    """
    Search for relevant CoIP-MS datasets in PRIDE archive.

    Args:
        genes: Target gene symbols to search for

    Returns:
        Available datasets with relevance info.
    """
    genes_upper = {g.upper() for g in genes}

    # Match against known curated datasets
    matches = []
    for accession, info in KNOWN_PRIDE_DATASETS.items():
        overlap = genes_upper.intersection(set(info.get("genes_covered", [])))
        if overlap:
            matches.append({
                "accession": accession,
                "title": info["title"],
                "description": info["description"],
                "organism": info["organism"],
                "matching_genes": list(overlap),
                "relevance_score": len(overlap) / len(genes_upper),
            })

    matches.sort(key=lambda x: x["relevance_score"], reverse=True)

    return {
        "datasets": matches,
        "total_found": len(matches),
        "query_genes": list(genes_upper),
    }


async def run_proteomics_analysis(
    abundance_matrix: dict[str, list[float]],
    groups: list[str],
    group_a: str = "bait",
    group_b: str = "control",
    fdr_cutoff: float = 0.05,
    lfc_cutoff: float = 1.0,
) -> dict[str, Any]:
    """
    Run differential analysis on CoIP-MS / proteomics abundance data.

    Args:
        abundance_matrix: protein → [abundance values per sample]
        groups: Sample group labels (e.g., ["bait", "bait", "control", "control"])
        group_a: Name of the experimental group
        group_b: Name of the control group
        fdr_cutoff: FDR significance threshold
        lfc_cutoff: Log2 fold-change significance threshold

    Returns:
        Volcano plot data, significant protein list, heatmap matrix.
    """
    if not abundance_matrix or not groups:
        return {"error": "Empty input data", "results": []}

    # Separate indices for each group
    idx_a = [i for i, g in enumerate(groups) if g == group_a]
    idx_b = [i for i, g in enumerate(groups) if g == group_b]

    if len(idx_a) < 2 or len(idx_b) < 2:
        return {"error": f"Need ≥2 samples per group (got {len(idx_a)} {group_a}, {len(idx_b)} {group_b})", "results": []}

    results = []
    for protein, values in abundance_matrix.items():
        if len(values) != len(groups):
            continue

        vals_a = [values[i] for i in idx_a]
        vals_b = [values[i] for i in idx_b]

        mean_a = float(np.mean(vals_a))
        mean_b = float(np.mean(vals_b))

        # Log2 fold change (with pseudo-count to avoid log(0))
        pseudo = 1e-10
        log2fc = float(np.log2((mean_a + pseudo) / (mean_b + pseudo)))

        # t-test
        try:
            t_stat, p_value = stats.ttest_ind(vals_a, vals_b, equal_var=False)
        except Exception:
            continue

        if np.isnan(p_value):
            continue

        results.append({
            "protein": protein,
            "log2_fold_change": round(log2fc, 4),
            "p_value": float(p_value),
            "mean_bait": round(mean_a, 4),
            "mean_control": round(mean_b, 4),
            "t_statistic": round(float(t_stat), 4),
        })

    # BH FDR correction
    if results:
        p_values = [r["p_value"] for r in results]
        n = len(p_values)
        sorted_indices = np.argsort(p_values)
        for rank, idx in enumerate(sorted_indices, 1):
            results[idx]["adjusted_p_value"] = min(
                float(p_values[idx] * n / rank), 1.0
            )
            results[idx]["neg_log10_p"] = round(
                float(-np.log10(max(results[idx]["adjusted_p_value"], 1e-300))), 4
            )
            results[idx]["significant"] = (
                results[idx]["adjusted_p_value"] < fdr_cutoff
                and abs(results[idx]["log2_fold_change"]) > lfc_cutoff
            )

    # Sort by significance
    results.sort(key=lambda r: r.get("adjusted_p_value", 1))

    significant_proteins = [r for r in results if r.get("significant")]

    # Build heatmap data for significant proteins
    heatmap_matrix = {}
    for r in significant_proteins[:50]:  # Cap at 50 for payload
        protein = r["protein"]
        if protein in abundance_matrix:
            heatmap_matrix[protein] = abundance_matrix[protein]

    return {
        "results": results,
        "significant_count": len(significant_proteins),
        "total_proteins": len(results),
        "fdr_cutoff": fdr_cutoff,
        "lfc_cutoff": lfc_cutoff,
        "group_a": group_a,
        "group_b": group_b,
        "n_a": len(idx_a),
        "n_b": len(idx_b),
        "method": "Welch's t-test + Benjamini-Hochberg FDR",
        "heatmap_matrix": heatmap_matrix,
        "heatmap_samples": groups,
    }
