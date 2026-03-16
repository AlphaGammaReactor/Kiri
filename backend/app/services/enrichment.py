"""
Kiri — Enrichment Engine Service

Universal gene-set enrichment analysis via gseapy.
Supports ORA (Over-Representation Analysis) and pre-ranked GSEA
against GO, KEGG, Reactome, and MSigDB Hallmark gene sets.

Cached results via the Kiri cache layer.
"""

import logging
from typing import Any

from app.core.cache import cache

logger = logging.getLogger("kiri.enrichment")

# ── Supported gene set libraries ──
GENE_SET_LIBRARIES = {
    "go_bp": "GO_Biological_Process_2023",
    "go_mf": "GO_Molecular_Function_2023",
    "go_cc": "GO_Cellular_Component_2023",
    "kegg": "KEGG_2021_Human",
    "reactome": "Reactome_2022",
    "hallmark": "MSigDB_Hallmark_2020",
}

# Human-readable labels for the frontend
LIBRARY_LABELS = {
    "go_bp": "GO Biological Process",
    "go_mf": "GO Molecular Function",
    "go_cc": "GO Cellular Component",
    "kegg": "KEGG Pathways",
    "reactome": "Reactome Pathways",
    "hallmark": "MSigDB Hallmarks",
}


async def run_enrichment(
    gene_list: list[str],
    gene_sets: list[str] | None = None,
    organism: str = "human",
    cutoff: float = 0.05,
    top_n: int = 20,
) -> dict[str, Any]:
    """
    Run Over-Representation Analysis (ORA) using gseapy.enrich().

    Args:
        gene_list: Input gene symbols (e.g., ['PARL', 'MAVS', 'TP53'])
        gene_sets: Library keys from GENE_SET_LIBRARIES (defaults to all)
        organism: Organism name (default: 'human')
        cutoff: Adjusted p-value cutoff for significance
        top_n: Max enriched terms to return per library

    Returns:
        Dict with enriched terms per library, sorted by adjusted p-value.
    """
    if not gene_list:
        return {"results": {}, "gene_count": 0, "libraries": []}

    # Normalize gene symbols
    genes_upper = [g.strip().upper() for g in gene_list if g.strip()]

    # Determine which libraries to query
    if gene_sets:
        selected = {k: v for k, v in GENE_SET_LIBRARIES.items() if k in gene_sets}
    else:
        selected = GENE_SET_LIBRARIES.copy()

    if not selected:
        selected = GENE_SET_LIBRARIES.copy()

    # Check cache
    cache_params = {
        "genes": sorted(genes_upper),
        "libraries": sorted(selected.keys()),
        "cutoff": cutoff,
        "organism": organism,
    }
    cached, hit = await cache.get("enrichment", cache_params)
    if hit and cached:
        logger.info("Enrichment: cache hit")
        cached["cache_hit"] = True
        return cached

    # Run enrichment via gseapy (in-thread, generally fast for ORA)
    results: dict[str, list[dict]] = {}
    near_miss_terms: dict[str, list[dict]] = {}
    total_significant = 0

    try:
        import gseapy as gp
    except ImportError:
        logger.error("gseapy not installed — enrichment unavailable")
        return {
            "results": {},
            "gene_count": len(genes_upper),
            "libraries": list(selected.keys()),
            "error": "gseapy not installed",
        }

    def _extract_term(row: Any, is_near_miss: bool = False) -> dict[str, Any]:
        """Extract a term record from a gseapy result row."""
        term_data: dict[str, Any] = {
            "term": str(row.get("term", row.get("Term", "Unknown"))),
            "p_value": float(row.get("p_value", row.get("P-value", 0))),
            "adjusted_p_value": float(row.get("adjusted_p_value", row.get("Adjusted P-value", 0))),
        }
        if is_near_miss:
            term_data["near_miss"] = True
        if "overlap" in row.index:
            term_data["overlap"] = str(row["overlap"])
        if "odds_ratio" in row.index:
            term_data["odds_ratio"] = float(row["odds_ratio"]) if row["odds_ratio"] else None
        if "combined_score" in row.index:
            term_data["combined_score"] = float(row["combined_score"]) if row["combined_score"] else None
        if "genes" in row.index:
            genes_str = str(row["genes"])
            term_data["genes"] = genes_str.split(";") if ";" in genes_str else genes_str.split(",")
        return term_data

    for lib_key, lib_name in selected.items():
        try:
            enr = gp.enrich(
                gene_list=genes_upper,
                gene_sets=lib_name,
                organism=organism,
                outdir=None,  # Don't write files
                no_plot=True,
                cutoff=1.0,   # Get all, filter ourselves
                verbose=False,
            )

            if enr.results is not None and not enr.results.empty:
                df = enr.results.copy()

                # Standardize column names (gseapy output varies by version)
                col_map = {}
                for col in df.columns:
                    cl = col.lower().replace(" ", "_")
                    if "term" in cl:
                        col_map[col] = "term"
                    elif "adjusted" in cl and "p" in cl:
                        col_map[col] = "adjusted_p_value"
                    elif cl in ("p-value", "p_value", "pvalue"):
                        col_map[col] = "p_value"
                    elif "overlap" in cl:
                        col_map[col] = "overlap"
                    elif "odds" in cl:
                        col_map[col] = "odds_ratio"
                    elif "combined" in cl and "score" in cl:
                        col_map[col] = "combined_score"
                    elif "gene" in cl and ("list" in cl or "overlap" in cl or cl == "genes"):
                        col_map[col] = "genes"

                if col_map:
                    df = df.rename(columns=col_map)

                # Filter by adjusted p-value
                if "adjusted_p_value" in df.columns:
                    df_sig = df[df["adjusted_p_value"] <= cutoff].head(top_n)
                elif "p_value" in df.columns:
                    df_sig = df[df["p_value"] <= cutoff].head(top_n)
                else:
                    df_sig = df.head(top_n)

                terms = [_extract_term(row) for _, row in df_sig.iterrows()]
                results[lib_key] = terms
                total_significant += len(terms)

                # Near-miss: if zero significant, return top-5 closest terms
                if len(terms) == 0 and "adjusted_p_value" in df.columns:
                    df_sorted = df.sort_values("adjusted_p_value").head(5)
                    near_miss_terms[lib_key] = [
                        _extract_term(row, is_near_miss=True)
                        for _, row in df_sorted.iterrows()
                    ]
            else:
                results[lib_key] = []

        except Exception as e:
            logger.warning(f"Enrichment failed for {lib_name}: {e}")
            results[lib_key] = []

    response = {
        "results": results,
        "near_miss_terms": near_miss_terms,
        "gene_count": len(genes_upper),
        "input_genes": genes_upper,
        "libraries": list(selected.keys()),
        "library_labels": {k: LIBRARY_LABELS.get(k, k) for k in selected},
        "cutoff": cutoff,
        "total_significant": total_significant,
        "small_gene_list": len(genes_upper) < 15,
        "cache_hit": False,
    }

    # Cache the result
    await cache.set("enrichment", cache_params, response)

    return response


async def get_available_libraries() -> list[dict[str, str]]:
    """Return the list of supported gene set libraries."""
    return [
        {"key": k, "name": v, "label": LIBRARY_LABELS.get(k, k)}
        for k, v in GENE_SET_LIBRARIES.items()
    ]


async def run_gsea_preranked(
    ranked_genes: dict[str, float],
    gene_sets: list[str] | None = None,
    permutation_num: int = 100,
    min_size: int = 5,
    max_size: int = 500,
    top_n: int = 20,
) -> dict[str, Any]:
    """
    Run GSEA pre-ranked analysis using gseapy.prerank().

    Unlike ORA, pre-ranked GSEA uses the full ranked gene list
    (not just significantly changed genes) to detect coordinated
    shifts in gene set expression.

    Args:
        ranked_genes: gene_symbol → ranking metric (e.g., -log10(p) * sign(logFC))
        gene_sets: Library keys from GENE_SET_LIBRARIES (defaults to all)
        permutation_num: Number of permutations for significance estimation
        min_size: Minimum gene set size
        max_size: Maximum gene set size
        top_n: Max enriched terms to return per library

    Returns:
        Dict with GSEA results including NES, p-values, FDR, leading edge genes,
        and running enrichment score (RES) curves for visualization.
    """
    if not ranked_genes or len(ranked_genes) < 15:
        return {"results": {}, "gene_count": len(ranked_genes), "error": "Need ≥15 ranked genes"}

    # Determine which libraries to query
    if gene_sets:
        selected = {k: v for k, v in GENE_SET_LIBRARIES.items() if k in gene_sets}
    else:
        selected = GENE_SET_LIBRARIES.copy()

    if not selected:
        selected = GENE_SET_LIBRARIES.copy()

    # Check cache
    cache_params = {
        "type": "gsea_preranked",
        "gene_count": len(ranked_genes),
        "gene_hash": hash(frozenset(list(ranked_genes.items())[:50])),
        "libraries": sorted(selected.keys()),
    }
    cached, hit = await cache.get("gsea_preranked", cache_params)
    if hit and cached:
        logger.info("GSEA pre-ranked: cache hit")
        cached["cache_hit"] = True
        return cached

    try:
        import gseapy as gp
        import pandas as pd
    except ImportError:
        logger.error("gseapy not installed — GSEA unavailable")
        return {"results": {}, "gene_count": len(ranked_genes), "error": "gseapy not installed"}

    # Build ranked Series
    rnk = pd.Series(ranked_genes).sort_values(ascending=False)

    results: dict[str, list[dict]] = {}
    total_significant = 0

    for lib_key, lib_name in selected.items():
        try:
            pre = gp.prerank(
                rnk=rnk,
                gene_sets=lib_name,
                permutation_num=permutation_num,
                outdir=None,
                no_plot=True,
                min_size=min_size,
                max_size=max_size,
                verbose=False,
                seed=42,
            )

            if pre.res2d is not None and not pre.res2d.empty:
                df = pre.res2d.copy()

                terms = []
                for _, row in df.head(top_n).iterrows():
                    nes = float(row.get("NES", row.get("nes", 0)))
                    pval = float(row.get("NOM p-val", row.get("pval", 1)))
                    fdr = float(row.get("FDR q-val", row.get("fdr", 1)))
                    term_name = str(row.get("Term", row.get("term", "Unknown")))

                    # Leading edge genes
                    le_raw = row.get("Lead_genes", row.get("lead_genes", ""))
                    lead_genes = str(le_raw).split(";") if le_raw else []

                    terms.append({
                        "term": term_name,
                        "nes": round(nes, 4),
                        "p_value": round(pval, 6),
                        "fdr": round(fdr, 6),
                        "lead_genes": lead_genes[:20],  # Cap for payload size
                        "gene_set_size": int(row.get("Gene %", row.get("matched_size", 0))),
                        "significant": fdr < 0.25,
                    })

                # Sort by absolute NES descending
                terms.sort(key=lambda t: abs(t["nes"]), reverse=True)
                results[lib_key] = terms
                total_significant += sum(1 for t in terms if t["significant"])
            else:
                results[lib_key] = []

        except Exception as e:
            logger.warning(f"GSEA pre-ranked failed for {lib_name}: {e}")
            results[lib_key] = []

    response = {
        "results": results,
        "gene_count": len(ranked_genes),
        "libraries": list(selected.keys()),
        "library_labels": {k: LIBRARY_LABELS.get(k, k) for k in selected},
        "total_significant": total_significant,
        "method": "GSEA Pre-Ranked",
        "cache_hit": False,
    }

    await cache.set("gsea_preranked", cache_params, response)
    return response

