"""
Immune context: which immune cell types rise and fall with my gene across tumours.

Each cell type gets a marker score per tumour: the mean of the z-scored log expression of its
marker genes (Danaher et al. 2017, J Immunother Cancer 5:18, open access CC BY 4.0, where the
markers were chosen because they track each other across TCGA and match flow and IHC data).
My gene is then compared with each score by Spearman correlation, with Benjamini–Hochberg
correction across the cell types.

A marker score is a relative amount for comparing tumours with each other. It is not a cell
count and it cannot compare one cell type with another. Because tumours with more immune cells
have more of every immune cell, each correlation is also given after removing overall immune
content (partial Spearman on the CD45 / PTPRC score).
"""

from __future__ import annotations

import numpy as np
from scipy import stats

from app.analyses.common import bh, check, clean
from app.analyses.signature import _tumours, cronbach_alpha, partial_spearman, score_of, spearman_ci
from app.cohorts.store import Cohort

CITATION = "Danaher P et al. Gene expression markers of Tumor Infiltrating Leukocytes. J Immunother Cancer 2017;5:18"
MIN_TUMOURS = 20
POINTS = 500
RNG_SEED = 20171

# Danaher et al. 2017, Table 2 (final marker genes per cell type). TPSAB1 stands for TPSAB1/TPSB2.
CELLS: list[dict] = [
    {"id": "cd45", "name": "All immune cells (CD45)", "zh": "全部免疫细胞（CD45）", "genes": ["PTPRC"]},
    {"id": "t", "name": "T cells", "zh": "T 细胞", "genes": ["CD2", "CD3D", "CD3E", "CD3G", "CD6", "SH2D1A", "TRAT1"]},
    {"id": "cd8", "name": "CD8 T cells", "zh": "CD8 T 细胞", "genes": ["CD8A", "CD8B"]},
    {"id": "exhausted", "name": "Exhausted CD8 T cells", "zh": "耗竭 CD8 T 细胞", "genes": ["CD244", "EOMES", "LAG3", "PTGER4"]},
    {"id": "treg", "name": "Regulatory T cells", "zh": "调节性 T 细胞", "genes": ["FOXP3"]},
    {"id": "th1", "name": "Th1 cells", "zh": "Th1 细胞", "genes": ["TBX21"]},
    {"id": "cytotoxic", "name": "Cytotoxic cells", "zh": "细胞毒性细胞", "genes": ["CTSW", "GNLY", "GZMA", "GZMB", "GZMH", "KLRB1", "KLRD1", "KLRK1", "NKG7", "PRF1"]},
    {"id": "nk", "name": "NK cells", "zh": "NK 细胞", "genes": ["NCR1", "XCL1", "XCL2"]},
    {"id": "nkdim", "name": "NK CD56dim cells", "zh": "NK CD56dim 细胞", "genes": ["IL21R", "KIR2DL3", "KIR3DL1", "KIR3DL2"]},
    {"id": "b", "name": "B cells", "zh": "B 细胞", "genes": ["BLK", "CD19", "FCRL2", "MS4A1", "FAM30A", "TNFRSF17", "TCL1A", "SPIB", "PNOC"]},
    {"id": "macrophage", "name": "Macrophages", "zh": "巨噬细胞", "genes": ["CD163", "CD68", "CD84", "MS4A4A"]},
    {"id": "dc", "name": "Dendritic cells", "zh": "树突状细胞", "genes": ["CCL13", "CD209", "HSD11B1"]},
    {"id": "mast", "name": "Mast cells", "zh": "肥大细胞", "genes": ["CPA3", "HDC", "MS4A2", "TPSAB1"]},
    {"id": "neutrophil", "name": "Neutrophils", "zh": "中性粒细胞", "genes": ["CEACAM3", "CSF3R", "FCAR", "FCGR3B", "FPR1", "S100A12", "SIGLEC5"]},
]
ALIASES = {"FAM30A": ["KIAA0125"]}
MARKERS = sorted({g for c in CELLS for g in c["genes"]})


def _present(c: Cohort, g: str) -> str | None:
    for name in [g] + ALIASES.get(g, []):
        if c.has(name):
            return name
    return None


def cohort_genes(gene: str) -> list[str]:
    return [gene] + [g for g in MARKERS if g != gene]


def scores(c: Cohort, gene: str):
    """Tumours with my gene, and a marker score per cell type (None when no marker is in the data)."""
    found = {g: _present(c, g) for g in MARKERS}
    cols = sorted({v for v in found.values() if v and v != gene})
    t = _tumours(c, [gene] + cols)
    t = t[t[f"g:{gene}"].notna()]
    out = {}
    for cell in CELLS:
        have = [found[g] for g in cell["genes"] if found[g] and found[g] != gene]
        if not have:
            out[cell["id"]] = None
            continue
        M = t[[f"g:{g}" for g in have]].to_numpy(float)
        out[cell["id"]] = {"have": have, "missing": [g for g in cell["genes"] if not found[g]], "score": score_of(M),
                           "alpha": cronbach_alpha(M[~np.isnan(M).any(axis=1)]) if len(have) > 1 else None,
                           "self": gene in cell["genes"]}
    return t, out


def run(c: Cohort, gene: str) -> dict:
    base = {"kind": "immune", "gene": gene}
    t, sc = scores(c, gene)
    n = len(t)
    if n < MIN_TUMOURS:
        return base | {"error": "too_few_pairs", "n": int(n), "min": MIN_TUMOURS}
    have = [k for k, v in sc.items() if v]
    if len(have) < 3:
        return base | {"error": "immune_few_markers", "found": len(have), "markers": MARKERS}
    x = t[f"g:{gene}"].to_numpy(float)
    cd45 = sc["cd45"]["score"] if sc.get("cd45") else None

    rows = []
    for cell in CELLS:
        s = sc[cell["id"]]
        if not s:
            rows.append({"id": cell["id"], "name": cell["name"], "zh": cell["zh"], "markers": cell["genes"],
                         "have": [], "missing": cell["genes"], "rho": None})
            continue
        ok = ~np.isnan(s["score"])
        r = stats.spearmanr(x[ok], s["score"][ok])
        rho = float(r.statistic)
        lo, hi = spearman_ci(rho, int(ok.sum()))
        row = {"id": cell["id"], "name": cell["name"], "zh": cell["zh"], "markers": cell["genes"],
               "have": s["have"], "missing": s["missing"], "rho": clean(rho), "lo": clean(lo), "hi": clean(hi),
               "p": clean(r.pvalue), "alpha": clean(s["alpha"]), "self": s["self"], "n": int(ok.sum())}
        if cd45 is not None and cell["id"] != "cd45":
            ok2 = ok & ~np.isnan(cd45)
            pr, pp = partial_spearman(x[ok2], s["score"][ok2], cd45[ok2])
            row |= {"rho_adj": clean(pr), "p_adj_partial": clean(pp)}
        rows.append(row)
    tested = [r for r in rows if r["rho"] is not None]
    for r, q in zip(tested, bh([r["p"] if r["p"] is not None else 1.0 for r in tested])):
        r["p_adj"] = clean(q)
    adj = [r for r in tested if r.get("p_adj_partial") is not None]
    for r, q in zip(adj, bh([r["p_adj_partial"] for r in adj])):
        r["q_partial"] = clean(q)

    sig = [r for r in tested if r["id"] != "cd45" and (r.get("p_adj") or 1) < 0.05]
    pos = sorted([r for r in sig if r["rho"] > 0], key=lambda r: -r["rho"])
    neg = sorted([r for r in sig if r["rho"] < 0], key=lambda r: r["rho"])
    top = max(sig, key=lambda r: abs(r["rho"])) if sig else None
    overall = next((r for r in tested if r["id"] == "cd45"), None)

    rng = np.random.default_rng(RNG_SEED)
    keep = np.sort(rng.choice(n, POINTS, replace=False)) if n > POINTS else np.arange(n)
    points = {"x": [clean(v) for v in x[keep]],
              "cells": {k: [clean(v) for v in sc[k]["score"][keep]] for k in have}}

    stability = None
    if top:
        s = sc[top["id"]]["score"]
        ok = ~np.isnan(s)
        xs, ys = x[ok], s[ok]
        m = len(xs)
        boots = np.array([stats.spearmanr(xs[i], ys[i]).statistic for i in (rng.integers(0, m, m) for _ in range(200))])
        stability = float(np.mean(np.sign(boots) == np.sign(top["rho"])))

    incoherent = [r for r in tested if r.get("alpha") is not None and r["alpha"] < 0.5]
    single = [r for r in tested if len(r["have"]) == 1 and r["id"] != "cd45"]
    tracks = overall is not None and abs(overall["rho"] or 0) >= 0.3
    missing_cells = [r for r in rows if r["rho"] is None]

    def names(rs: list[dict], key: str = "name") -> str:
        return ", ".join(r[key] for r in rs) or "–"

    checks = [
        check("data", "pass", "data.immune", n=n, cohort=c.name, k=len(have), K=len(CELLS)),
        check("enough", "pass" if n >= 50 else "caution", "enough.immune" if n >= 50 else "enough.immuneFew", n=n),
        check("assumptions", "caution", "assume.immuneProxy"),
        check("assumptions", "caution" if tracks else "pass", "assume.immuneOverall" if tracks else "assume.immuneOverallLow",
              rho=round(overall["rho"], 2) if overall and overall["rho"] is not None else "–", g=gene),
        check("multiple", "pass", "multiple.immune", k=len(tested)),
        check("effect", "pass" if top else "caution", "effect.immune" if top else "effect.immuneNone",
              cell=top["name"] if top else "", cell_zh=top["zh"] if top else "", rho=round(top["rho"], 2) if top else ""),
    ]
    if stability is not None:
        checks.append(check("stability", "pass" if stability >= 0.95 else "caution", "stability.immune", pct=round(stability * 100)))
    if incoherent or single:
        checks.append(check("assumptions", "caution", "assume.immuneMarkers", list=names(incoherent), list_zh=names(incoherent, "zh"),
                            single=names(single), single_zh=names(single, "zh")))
    if missing_cells:
        checks.append(check("data", "caution", "data.immuneMissing", list=names(missing_cells), list_zh=names(missing_cells, "zh")))
    return base | {"n": int(n), "rows": rows, "pos": [r["id"] for r in pos], "neg": [r["id"] for r in neg],
                   "top": top["id"] if top else None, "overall_rho": overall["rho"] if overall else None,
                   "points": points, "checks": checks, "citation": CITATION}


def table(c: Cohort, gene: str) -> dict:
    """One line per tumour: my gene and every marker score (the numbers behind the figure)."""
    t, sc = scores(c, gene)
    ids = [k for k, v in sc.items() if v]
    out = []
    for i, (_, row) in enumerate(t.iterrows()):
        out.append([row["id"], clean(row[f"g:{gene}"])] + [clean(sc[k]["score"][i]) for k in ids])
    return {"columns": ["sample", gene] + [f"{k}_score" for k in ids], "rows": out}
