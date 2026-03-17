"""
Kiri — Mitochondrial Co-Expression Analysis Service

Genome-wide Pearson correlation scan for PARL/MAVS against all genes,
GSEA enrichment on correlated gene sets, and pairwise mitochondrial
gene scatter correlations.

Scientific rationale (A→B→C indirect proof):
  A = PARL (protease)
  B = MAVS (substrate, mitochondrial outer membrane)
  C = Mitochondrial function
"""

import logging
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

from app.core.cache import cache
from app.services.gdc import fetch_expression

logger = logging.getLogger("kiri.mito.coexpression")

# ── Core mitochondrial genes (HGNC symbols) ──
# These map common aliases to official HGNC symbols
CORE_MITO_GENES = {
    "PPARGC1A": "PGC1α",   # Mitochondrial biogenesis master regulator
    "TFAM": "TFAM",         # Mitochondrial transcription factor A
    "BNIP3": "BNIP3",       # Mitophagy receptor
    "PINK1": "PINK1",       # Mitophagy kinase (PTEN-induced kinase 1)
    "PRKN": "Parkin",       # E3 ubiquitin ligase for mitophagy
    "MAP1LC3B": "LC3B",     # Autophagosome marker
    "SOD1": "SOD1",         # Cu/Zn superoxide dismutase (cytoplasmic ROS)
    "SOD2": "SOD2",         # Mn superoxide dismutase (mitochondrial ROS)
}

# Pathways of interest for GSEA enrichment plotting
MITO_PATHWAYS_OF_INTEREST = [
    "HALLMARK_OXIDATIVE_PHOSPHORYLATION",
    "HALLMARK_MTORC1_SIGNALING",
    "HALLMARK_REACTIVE_OXYGEN_SPECIES_PATHWAY",
    "HALLMARK_APOPTOSIS",
    "HALLMARK_P53_PATHWAY",
    "HALLMARK_GLYCOLYSIS",
    "HALLMARK_FATTY_ACID_METABOLISM",
    "HALLMARK_ADIPOGENESIS",
]


async def compute_coexpression_scan(
    target_gene: str,
    expression_matrix: dict[str, list[float]],
    top_n: int = 200,
    r_cutoff: float = 0.3,
    p_cutoff: float = 0.05,
) -> dict[str, Any]:
    """
    Genome-wide Pearson correlation scan.

    For each gene in the expression matrix, compute Pearson r and p-value
    against the target gene. Filter by |r| > r_cutoff and p < p_cutoff.

    Returns:
        Dict with correlated genes (sorted by |r|), ranked gene dict for GSEA,
        and summary statistics.
    """
    target_upper = target_gene.strip().upper()
    target_vals = expression_matrix.get(target_upper)

    if target_vals is None:
        logger.warning(f"Target gene {target_upper} not found in expression matrix")
        return {"error": f"Gene {target_upper} not found in expression matrix", "correlated_genes": []}

    target_arr = np.array(target_vals, dtype=float)
    n_samples = len(target_arr)

    if n_samples < 10:
        return {"error": "Insufficient samples (n < 10)", "correlated_genes": []}

    correlated = []
    ranked_genes: dict[str, float] = {}

    for gene, values in expression_matrix.items():
        if gene == target_upper:
            continue
        if len(values) != n_samples:
            continue

        gene_arr = np.array(values, dtype=float)

        # Skip genes with zero variance
        if np.std(gene_arr) < 1e-10 or np.std(target_arr) < 1e-10:
            continue

        try:
            r, p = stats.pearsonr(target_arr, gene_arr)
        except Exception:
            continue

        if np.isnan(r) or np.isnan(p):
            continue

        # Store for GSEA ranking (all genes, not just significant)
        ranked_genes[gene] = float(r)

        if abs(r) >= r_cutoff and p < p_cutoff:
            correlated.append({
                "gene": gene,
                "r": round(float(r), 4),
                "p_value": float(p),
                "direction": "positive" if r > 0 else "negative",
            })

    # Sort by absolute correlation
    correlated.sort(key=lambda x: abs(x["r"]), reverse=True)
    correlated = correlated[:top_n]

    return {
        "target_gene": target_upper,
        "n_samples": n_samples,
        "total_genes_scanned": len(expression_matrix) - 1,
        "correlated_genes": correlated,
        "n_correlated": len(correlated),
        "r_cutoff": r_cutoff,
        "p_cutoff": p_cutoff,
        "ranked_genes": ranked_genes,
    }


async def compute_coexpression_gsea(
    ranked_genes: dict[str, float],
    pathways_of_interest: list[str] | None = None,
    permutation_num: int = 100,
) -> dict[str, Any]:
    """
    Run GSEA pre-ranked on correlated gene ranking against MSigDB Hallmark.

    Returns enrichment results with full running enrichment score (RES)
    curves for mitochondrial-related pathways.
    """
    if not ranked_genes or len(ranked_genes) < 15:
        return {"all_terms": [], "highlighted_terms": [], "total_terms": 0, "total_significant": 0, "method": "GSEA Pre-Ranked (MSigDB Hallmark)", "gene_count": 0, "error": "Need ≥15 ranked genes for GSEA"}

    if pathways_of_interest is None:
        pathways_of_interest = MITO_PATHWAYS_OF_INTEREST

    try:
        import gseapy as gp
    except ImportError:
        logger.error("gseapy not installed — GSEA unavailable")
        return {"all_terms": [], "highlighted_terms": [], "total_terms": 0, "total_significant": 0, "method": "GSEA Pre-Ranked (MSigDB Hallmark)", "gene_count": 0, "error": "gseapy not installed"}

    # Build ranked Series
    rnk = pd.Series(ranked_genes).sort_values(ascending=False)

    try:
        pre = gp.prerank(
            rnk=rnk,
            gene_sets="MSigDB_Hallmark_2020",
            permutation_num=permutation_num,
            outdir=None,
            no_plot=True,
            min_size=5,
            max_size=500,
            verbose=False,
            seed=42,
        )
    except Exception as e:
        logger.warning(f"GSEA pre-ranked failed: {e}")
        return {"all_terms": [], "highlighted_terms": [], "total_terms": 0, "total_significant": 0, "method": "GSEA Pre-Ranked (MSigDB Hallmark)", "gene_count": 0, "error": str(e)}

    all_terms = []
    highlighted_terms = []

    if pre.res2d is not None and not pre.res2d.empty:
        df = pre.res2d.copy()

        for _, row in df.iterrows():
            term_name = str(row.get("Term", row.get("term", "Unknown")))
            nes = float(row.get("NES", row.get("nes", 0)))
            pval = float(row.get("NOM p-val", row.get("pval", 1)))
            fdr = float(row.get("FDR q-val", row.get("fdr", 1)))

            le_raw = row.get("Lead_genes", row.get("lead_genes", ""))
            lead_genes = str(le_raw).split(";") if le_raw else []

            gene_set_size = 0
            try:
                gene_set_size = int(row.get("Gene %", row.get("matched_size", 0)))
            except (ValueError, TypeError):
                pass

            term = {
                "term": term_name,
                "nes": round(nes, 4),
                "p_value": round(pval, 6),
                "fdr": round(fdr, 6),
                "lead_genes": lead_genes[:20],
                "gene_set_size": gene_set_size,
                "significant": fdr < 0.25,
            }
            all_terms.append(term)

            # Check if this is a pathway of interest
            term_upper = term_name.upper().replace(" ", "_")
            if any(poi in term_upper or term_upper in poi for poi in pathways_of_interest):
                highlighted_terms.append(term)

    # Sort by absolute NES
    all_terms.sort(key=lambda t: abs(t["nes"]), reverse=True)
    highlighted_terms.sort(key=lambda t: abs(t["nes"]), reverse=True)

    return {
        "all_terms": all_terms[:30],
        "highlighted_terms": highlighted_terms,
        "total_terms": len(all_terms),
        "total_significant": sum(1 for t in all_terms if t["significant"]),
        "method": "GSEA Pre-Ranked (MSigDB Hallmark)",
        "gene_count": len(ranked_genes),
    }


async def compute_mito_gene_correlations(
    target_genes: list[str],
    expression_matrix: dict[str, list[float]],
    mito_genes: list[str] | None = None,
) -> dict[str, Any]:
    """
    Compute pairwise Pearson correlations between target genes
    and core mitochondrial genes.

    Returns scatter data for each pair with fitted regression line.
    """
    if mito_genes is None:
        mito_genes = list(CORE_MITO_GENES.keys())

    n_samples = None
    correlations = []

    for target in target_genes:
        target_upper = target.strip().upper()
        target_vals = expression_matrix.get(target_upper)
        if target_vals is None:
            logger.warning(f"Target gene {target_upper} not in expression matrix")
            continue

        target_arr = np.array(target_vals, dtype=float)
        if n_samples is None:
            n_samples = len(target_arr)

        for mito_gene in mito_genes:
            mito_upper = mito_gene.strip().upper()
            mito_vals = expression_matrix.get(mito_upper)
            if mito_vals is None:
                logger.info(f"Mito gene {mito_upper} not in expression matrix — skipping")
                continue

            mito_arr = np.array(mito_vals, dtype=float)
            if len(mito_arr) != len(target_arr):
                continue

            # Skip zero-variance
            if np.std(target_arr) < 1e-10 or np.std(mito_arr) < 1e-10:
                continue

            try:
                r, p = stats.pearsonr(target_arr, mito_arr)
            except Exception:
                continue

            if np.isnan(r) or np.isnan(p):
                continue

            # Fit linear regression for visualization
            slope, intercept, _, _, _ = stats.linregress(target_arr, mito_arr)

            # Generate fitted line points
            x_min, x_max = float(np.min(target_arr)), float(np.max(target_arr))
            fit_x = [round(x_min, 4), round(x_max, 4)]
            fit_y = [round(slope * x_min + intercept, 4), round(slope * x_max + intercept, 4)]

            # Sample scatter points (cap at 300 for payload size)
            indices = list(range(len(target_arr)))
            if len(indices) > 300:
                rng = np.random.default_rng(42)
                indices = sorted(rng.choice(indices, 300, replace=False).tolist())

            scatter_x = [round(float(target_arr[i]), 4) for i in indices]
            scatter_y = [round(float(mito_arr[i]), 4) for i in indices]

            display_name = CORE_MITO_GENES.get(mito_upper, mito_upper)

            correlations.append({
                "target_gene": target_upper,
                "mito_gene": mito_upper,
                "mito_gene_display": display_name,
                "r": round(float(r), 4),
                "p_value": float(p),
                "n_samples": len(target_arr),
                "slope": round(float(slope), 4),
                "intercept": round(float(intercept), 4),
                "fit_x": fit_x,
                "fit_y": fit_y,
                "scatter_x": scatter_x,
                "scatter_y": scatter_y,
            })

    return {
        "correlations": correlations,
        "n_pairs": len(correlations),
        "n_samples": n_samples or 0,
        "mito_genes_queried": mito_genes,
        "core_mito_gene_labels": CORE_MITO_GENES,
    }


async def run_full_coexpression_pipeline(
    genes: list[str],
    project_ids: list[str],
    r_cutoff: float = 0.3,
    p_cutoff: float = 0.05,
    top_n: int = 200,
) -> dict[str, Any]:
    """
    Full co-expression pipeline: fetch expression → scan → GSEA → mito correlations.

    This is the main entry point called by the API endpoint.
    """
    # Check cache
    cache_params = {
        "type": "mito_coexpression",
        "genes": sorted([g.upper() for g in genes]),
        "projects": sorted(project_ids),
        "r_cutoff": r_cutoff,
        "p_cutoff": p_cutoff,
    }
    cached, hit = await cache.get("mito_coexpression", cache_params)
    if hit and cached:
        logger.info("Mito co-expression: cache hit")
        cached["cache_hit"] = True
        return cached

    # 1. Fetch genome-wide expression (target genes + all mito genes)
    all_genes = list(set(
        [g.upper() for g in genes]
        + list(CORE_MITO_GENES.keys())
    ))

    expr_result = await fetch_expression(
        genes=all_genes,
        project_ids=project_ids,
    )

    if not expr_result or "values" not in expr_result:
        return {"error": "Failed to fetch expression data from GDC"}

    expression_matrix = expr_result["values"]

    # 2. Run co-expression scan for each target gene
    scans = {}
    for gene in genes:
        scan = await compute_coexpression_scan(
            target_gene=gene,
            expression_matrix=expression_matrix,
            top_n=top_n,
            r_cutoff=r_cutoff,
            p_cutoff=p_cutoff,
        )
        scans[gene.upper()] = scan

    # 3. Run GSEA on ranked genes from first target
    gsea_results = {}
    for gene in genes:
        gene_upper = gene.upper()
        ranked = scans.get(gene_upper, {}).get("ranked_genes", {})
        if ranked:
            gsea = await compute_coexpression_gsea(ranked)
            gsea_results[gene_upper] = gsea

    # 4. Compute mito gene correlations
    mito_correlations = await compute_mito_gene_correlations(
        target_genes=genes,
        expression_matrix=expression_matrix,
    )

    result = {
        "coexpression_scans": scans,
        "gsea_results": gsea_results,
        "mito_correlations": mito_correlations,
        "sample_count": expr_result.get("sample_count", 0),
        "source": expr_result.get("source", "TCGA-COAD/READ"),
        "cache_hit": False,
    }

    await cache.set("mito_coexpression", cache_params, result)
    return result
