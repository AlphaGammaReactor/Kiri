"""
Differential expression across the whole transcriptome, then pathway enrichment.

Two groups of samples are compared gene by gene:
- tumour against normal tissue,
- high against low expression of one gene (median split, tumours only),
- two groups from the group column of your own table.

Values are already on a log2 scale (log2(TPM + 1) for TCGA), so the log2 fold
change is the difference in group means. Each gene gets Welch's t-test (no
equal-variance assumption), and p-values are corrected across all tested genes
with Benjamini–Hochberg. Genes expressed at a very low level in both groups are
left out before testing, and the number left out is reported.

Enrichment: over-representation (hypergeometric test) of the up- and down-
regulated genes in each pathway of the bundled library, against all tested
genes as the background, with Benjamini–Hochberg correction.
"""

from __future__ import annotations

import numpy as np
from scipy import stats

from app.analyses.common import bh, check, clean
from app.cohorts.store import Cohort, CohortUnavailable

MIN_GROUP = 10        # below this the comparison is refused
CAUTION_GROUP = 20    # below this a caution
MIN_GENES = 200       # fewer genes than this is not a transcriptome
LOW_EXPR = 1.0        # log2(TPM + 1) < 1 in both groups = not expressed
VOLCANO_MAX = 4000    # points drawn; significant genes are always kept
SEED = 20261127


def matrix(c: Cohort) -> tuple[list[str], np.ndarray]:
    """All genes the cohort has, genes x samples."""
    reader = c.reader
    if reader is not None and hasattr(reader, "matrix"):
        return reader.matrix(c.samples["id"].tolist())
    keys = list(c._genes)
    labels = getattr(c, "labels", {}) or {}
    genes = [labels.get(k, k) for k in keys]
    if len(genes) < MIN_GENES:
        if getattr(c, "own", False):
            raise CohortUnavailable("de_few_genes", n=len(genes), min=MIN_GENES)
        # A bundled sample slice only has the project's genes: the full project is needed.
        raise CohortUnavailable("needs_download", projects=[p for p in c.projects if p.startswith("TCGA-")])
    return genes, np.vstack([c._genes[k] for k in keys]).astype(np.float32)


def _split(c: Cohort, compare: str, gene: str | None, group_a: str | None, group_b: str | None):
    s = c.samples
    if compare == "tn":
        return (s["type"] == "tumor").to_numpy(), (s["type"] == "normal").to_numpy(), "Tumour", "Normal"
    if compare == "gene":
        if not gene:
            raise ValueError("gene")
        y = c.gene(gene)
        tum = (s["type"] == "tumor").to_numpy() & ~np.isnan(y)
        med = float(np.nanmedian(y[tum])) if tum.any() else np.nan
        return tum & (y > med), tum & (y <= med), f"{gene} high", f"{gene} low"
    if compare == "group":
        if "group" not in s:
            raise CohortUnavailable("no_groups")
        g = s["group"].astype(object).where(s["group"].notna(), None)
        levels = [x for x in dict.fromkeys(g) if x not in (None, "")]
        if len(levels) < 2:
            raise CohortUnavailable("too_few_groups", n=len(levels))
        a = group_a if group_a in levels else levels[0]
        b = group_b if group_b in levels and group_b != a else next(x for x in levels if x != a)
        return (g == a).to_numpy(), (g == b).to_numpy(), str(a), str(b)
    raise ValueError(compare)


def run(c: Cohort, compare: str = "tn", gene: str | None = None, group_a: str | None = None, group_b: str | None = None,
        lfc: float = 1.0, q: float = 0.05, sets: dict[str, dict] | None = None) -> dict:
    ma, mb, la, lb = _split(c, compare, gene, group_a, group_b)
    base = {"kind": "de", "compare": compare, "gene": gene, "labels": [la, lb]}
    if compare == "tn":
        # One sample per patient in each group, so no patient counts twice.
        s = c.samples
        ma = ma & ~s.duplicated(subset=["case", "type"]).to_numpy() if "case" in s else ma
        mb = mb & ~s.duplicated(subset=["case", "type"]).to_numpy() if "case" in s else mb
    na, nb = int(ma.sum()), int(mb.sum())
    if na < MIN_GROUP or nb < MIN_GROUP:
        return {**base, "error": "de_small_groups", "n": [na, nb], "min": MIN_GROUP}

    genes, X = matrix(c)
    A, B = X[:, ma], X[:, mb]
    with np.errstate(all="ignore"):
        mean_a, mean_b = np.nanmean(A, axis=1), np.nanmean(B, axis=1)
        expressed = (np.nan_to_num(mean_a) >= LOW_EXPR) | (np.nan_to_num(mean_b) >= LOW_EXPR) if not getattr(c, "own", False) \
            else np.isfinite(mean_a) & np.isfinite(mean_b)
        enough = (np.sum(~np.isnan(A), axis=1) >= MIN_GROUP) & (np.sum(~np.isnan(B), axis=1) >= MIN_GROUP)
        keep = expressed & enough
        t = stats.ttest_ind(A[keep], B[keep], axis=1, equal_var=False, nan_policy="omit")
    tested = [genes[i] for i in np.flatnonzero(keep)]
    fc = (mean_a - mean_b)[keep]
    p = np.asarray(t.pvalue, dtype=float)
    p = np.where(np.isnan(p), 1.0, p)
    padj = np.asarray(bh(p.tolist()))
    up = (padj < q) & (fc >= lfc)
    down = (padj < q) & (fc <= -lfc)

    rows = sorted(({"gene": g, "lfc": clean(f), "mean_a": clean(x), "mean_b": clean(y), "t": clean(tt), "p": clean(pp), "p_adj": clean(qq),
                    "dir": "up" if u else "down" if d else ""}
                   for g, f, x, y, tt, pp, qq, u, d in zip(tested, fc, mean_a[keep], mean_b[keep], np.asarray(t.statistic), p, padj, up, down)),
                  key=lambda r: (r["p_adj"] if r["p_adj"] is not None else 1, -abs(r["lfc"] or 0)))
    rng = np.random.default_rng(SEED)
    sig = [r for r in rows if r["dir"]]
    rest = [r for r in rows if not r["dir"]]
    if len(sig) + len(rest) > VOLCANO_MAX:
        take = max(VOLCANO_MAX - len(sig), 0)
        idx = rng.choice(len(rest), size=min(take, len(rest)), replace=False) if take else []
        rest = [rest[i] for i in sorted(idx)]
    volcano = [[r["gene"], r["lfc"], clean(-np.log10(max(r["p"] or 1, 1e-300))), r["dir"]] for r in sig + rest]

    n_up, n_down = int(up.sum()), int(down.sum())
    checks = [
        check("data.groupsDE", "caution" if min(na, nb) < CAUTION_GROUP else "pass", "groupsDE", a=la, b=lb, na=na, nb=nb),
        check("multiple.bh", "info", "deBH", n=len(tested), q=q),
        check("effect.lfc", "info", "lfc", lfc=lfc),
        check("data.lowExpr", "info", "lowExpr", n=int((~keep).sum()), cut=LOW_EXPR),
    ]
    if compare == "tn":
        checks.append(check("assume.deNormal", "caution", "deNormal"))
    if compare == "gene":
        checks.append(check("assume.deGene", "info", "deGene", g=gene))
    if n_up + n_down == 0:
        checks.append(check("result.noDE", "info", "noDE"))

    out = {**base, "n": [na, nb], "n_tested": len(tested), "n_low": int((~keep).sum()), "n_up": n_up, "n_down": n_down,
           "thresholds": {"lfc": lfc, "q": q}, "volcano": volcano, "top_up": [r for r in rows if r["dir"] == "up"][:30],
           "top_down": [r for r in rows if r["dir"] == "down"][:30], "rows": rows,
           "test": {"name": "welch_t", "correction": "benjamini_hochberg"}, "checks": checks,
           "data_version": c.data_version(), "excluded": int(len(c.samples) - na - nb)}
    out["enrichment"] = enrich([r["gene"] for r in rows if r["dir"] == "up"], [r["gene"] for r in rows if r["dir"] == "down"],
                               tested, sets or {})
    return out


def enrich(up: list[str], down: list[str], universe: list[str], sets: dict[str, dict], min_size: int = 5, max_size: int = 500) -> dict:
    """Hypergeometric over-representation of `up` and `down` in each set, against `universe`."""
    if not sets:
        return {"library": None, "up": [], "down": []}
    uni = {g.upper() for g in universe}
    N = len(uni)
    res = {"library": next(iter(sets.values())).get("library"), "up": [], "down": [], "n_sets": 0}
    tested_sets = []
    for sid, st in sets.items():
        members = uni.intersection(m.upper() for m in st["genes"])
        if min_size <= len(members) <= max_size:
            tested_sets.append((sid, st, members))
    res["n_sets"] = len(tested_sets)
    for key, lst in (("up", up), ("down", down)):
        hits = {g.upper() for g in lst} & uni
        n = len(hits)
        if n == 0:
            continue
        rows = []
        for sid, st, members in tested_sets:
            k = len(members & hits)
            if k == 0:
                continue
            pv = float(stats.hypergeom.sf(k - 1, N, len(members), n))
            rows.append({"id": sid, "name": st["name"], "size": len(members), "k": k, "ratio": clean(k / len(members)),
                         "fold": clean((k / n) / (len(members) / N)), "p": pv, "genes": sorted(members & hits)[:25]})
        adj = bh([r["p"] for r in rows])
        for r, a in zip(rows, adj):
            r["p_adj"] = clean(a)
            r["p"] = clean(r["p"])
        res[key] = sorted(rows, key=lambda r: r["p"])[:25]
    return res
