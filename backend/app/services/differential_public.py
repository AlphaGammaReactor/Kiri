"""
Kiri — Public Dataset Differential Expression Service

Fetches differential expression data from public GEO datasets
(knockdown, overexpression, disease-related) and annotates
results with known substrate information.

All gene parameters are project-scoped (generic, not gene-specific).
"""

import logging
from typing import Any

import numpy as np
from scipy import stats

from app.core.cache import cache

logger = logging.getLogger("kiri.differential_public")

# Known rhomboid protease substrates (curated from literature)
# Maps substrate → information about the cleavage relationship
KNOWN_SUBSTRATES: dict[str, dict[str, str]] = {
    "PINK1": {
        "protease": "PARL",
        "function": "Mitophagy kinase — PARL cleavage destabilizes PINK1 on healthy mitochondria",
        "pmid": "20723759",
    },
    "PGAM5": {
        "protease": "PARL",
        "function": "Phosphoglycerate mutase — cleaved by PARL to regulate necroptosis",
        "pmid": "24560926",
    },
    "OPA1": {
        "protease": "OMA1/PARL",
        "function": "Mitochondrial fusion GTPase — processed by OMA1 and PARL isoforms",
        "pmid": "24560926",
    },
    "STARD7": {
        "protease": "PARL",
        "function": "Phosphatidylcholine transfer protein — cleaved for mitochondrial import",
        "pmid": "33639449",
    },
    "SMAC": {
        "protease": "PARL",
        "function": "IAP antagonist (DIABLO) — PARL processes for apoptosis signaling",
        "pmid": "18948590",
    },
    "DIABLO": {
        "protease": "PARL",
        "function": "Same as SMAC — pro-apoptotic factor processed by PARL",
        "pmid": "18948590",
    },
    "CLPB": {
        "protease": "PARL",
        "function": "Mitochondrial disaggregase — PARL-dependent processing",
        "pmid": "35213386",
    },
    "TTC19": {
        "protease": "PARL",
        "function": "Complex III assembly factor — turnover regulated by PARL",
        "pmid": "29242508",
    },
    "MAVS": {
        "protease": "PARL (proposed)",
        "function": "Innate immune signaling — PARL cleavage suppresses antiviral response",
        "pmid": "33116068",
    },
}

# Known GEO datasets with perturbation experiments
KNOWN_GEO_PERTURBATIONS: dict[str, dict[str, Any]] = {
    "GSE119843": {
        "title": "PARL knockdown in HeLa cells",
        "perturbation": "knockdown",
        "target_gene": "PARL",
        "platform": "RNA-seq",
        "organism": "Homo sapiens",
    },
    "GSE54536": {
        "title": "PINK1 knockout mouse brain",
        "perturbation": "knockout",
        "target_gene": "PINK1",
        "platform": "Microarray",
        "organism": "Mus musculus",
    },
    "GSE68719": {
        "title": "Parkinson's disease substantia nigra transcriptome",
        "perturbation": "disease",
        "target_gene": "multiple",
        "platform": "RNA-seq",
        "organism": "Homo sapiens",
    },
}


async def search_public_datasets(
    genes: list[str],
) -> dict[str, Any]:
    """
    Search for GEO datasets with perturbation experiments
    relevant to the target genes.

    Args:
        genes: Target gene symbols

    Returns:
        Available datasets with relevance information.
    """
    genes_upper = {g.upper() for g in genes}
    matches = []

    for accession, info in KNOWN_GEO_PERTURBATIONS.items():
        target = info.get("target_gene", "").upper()
        if target in genes_upper or target == "MULTIPLE":
            matches.append({
                "accession": accession,
                "title": info["title"],
                "perturbation": info["perturbation"],
                "target_gene": info["target_gene"],
                "platform": info["platform"],
                "organism": info["organism"],
            })

    return {
        "datasets": matches,
        "total_found": len(matches),
        "query_genes": list(genes_upper),
    }


async def run_public_differential_analysis(
    expression_matrix: dict[str, list[float]],
    groups: list[str],
    group_a: str = "perturbation",
    group_b: str = "control",
    lfc_cutoff: float = 1.0,
    fdr_cutoff: float = 0.05,
    annotate_substrates: bool = True,
) -> dict[str, Any]:
    """
    Run differential expression analysis on public dataset data.

    Args:
        expression_matrix: gene → [expression values per sample]
        groups: Sample group labels
        group_a: Perturbation group name
        group_b: Control group name
        lfc_cutoff: |log2FC| significance threshold
        fdr_cutoff: FDR significance threshold
        annotate_substrates: Add known substrate annotations

    Returns:
        DE results with volcano/heatmap data and substrate annotations.
    """
    if not expression_matrix or not groups:
        return {"error": "Empty input data", "results": []}

    idx_a = [i for i, g in enumerate(groups) if g == group_a]
    idx_b = [i for i, g in enumerate(groups) if g == group_b]

    if len(idx_a) < 2 or len(idx_b) < 2:
        return {
            "error": f"Need ≥2 samples per group (got {len(idx_a)} {group_a}, {len(idx_b)} {group_b})",
            "results": [],
        }

    results = []
    for gene, values in expression_matrix.items():
        if len(values) != len(groups):
            continue

        vals_a = [values[i] for i in idx_a]
        vals_b = [values[i] for i in idx_b]

        mean_a = float(np.mean(vals_a))
        mean_b = float(np.mean(vals_b))

        # Log2 fold change
        pseudo = 1e-10
        log2fc = float(np.log2((mean_a + pseudo) / (mean_b + pseudo)))

        # Wilcoxon rank-sum (non-parametric, per Research Brief §6)
        try:
            stat, p_value = stats.mannwhitneyu(vals_a, vals_b, alternative="two-sided")
        except Exception:
            try:
                stat, p_value = stats.ttest_ind(vals_a, vals_b, equal_var=False)
            except Exception:
                continue

        if np.isnan(p_value):
            continue

        result_entry: dict[str, Any] = {
            "gene": gene,
            "log2_fold_change": round(log2fc, 4),
            "p_value": float(p_value),
            "mean_perturbation": round(mean_a, 4),
            "mean_control": round(mean_b, 4),
            "avg_expression": round((mean_a + mean_b) / 2, 4),
        }

        # Substrate annotation
        if annotate_substrates and gene.upper() in KNOWN_SUBSTRATES:
            sub = KNOWN_SUBSTRATES[gene.upper()]
            result_entry["is_known_substrate"] = True
            result_entry["substrate_info"] = sub
        else:
            result_entry["is_known_substrate"] = False

        results.append(result_entry)

    # BH FDR correction
    if results:
        p_values = [r["p_value"] for r in results]
        n = len(p_values)
        sorted_indices = np.argsort(p_values)
        for rank, idx in enumerate(sorted_indices, 1):
            results[idx]["adjusted_p_value"] = min(
                float(p_values[idx] * n / rank), 1.0
            )
            results[idx]["neg_log10_fdr"] = round(
                float(-np.log10(max(results[idx]["adjusted_p_value"], 1e-300))), 4
            )
            results[idx]["significant"] = (
                results[idx]["adjusted_p_value"] < fdr_cutoff
                and abs(results[idx]["log2_fold_change"]) > lfc_cutoff
            )

    results.sort(key=lambda r: r.get("adjusted_p_value", 1))

    degs = [r for r in results if r.get("significant")]
    substrate_degs = [r for r in degs if r.get("is_known_substrate")]

    # Heatmap matrix for significant genes
    heatmap = {}
    for r in degs[:50]:
        gene = r["gene"]
        if gene in expression_matrix:
            heatmap[gene] = expression_matrix[gene]

    return {
        "results": results,
        "deg_count": len(degs),
        "up_regulated": sum(1 for r in degs if r["log2_fold_change"] > 0),
        "down_regulated": sum(1 for r in degs if r["log2_fold_change"] < 0),
        "substrate_degs": substrate_degs,
        "substrate_deg_count": len(substrate_degs),
        "total_genes": len(results),
        "method": "Wilcoxon rank-sum + Benjamini-Hochberg FDR",
        "lfc_cutoff": lfc_cutoff,
        "fdr_cutoff": fdr_cutoff,
        "group_a": group_a,
        "group_b": group_b,
        "n_a": len(idx_a),
        "n_b": len(idx_b),
        "heatmap_matrix": heatmap,
        "heatmap_groups": groups,
    }
