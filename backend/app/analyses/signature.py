"""
Gene set score: my gene against a process described by a handful of marker
genes (a built-in set or the person's own).

For each patient (one primary tumour sample each) the score is the mean of the
members' z-scores, each gene standardised across the patients analysed. It
needs no genome-wide data, so it works on the bundled sample slices too, and
it is easy to recompute from the data table. (ssGSEA and GSVA rank genes
within each sample and need the whole transcriptome; with small marker sets
they agree closely with the z-score mean: Lee E et al. PLoS Comput Biol 2008.)

What one run reports:
* my gene vs the score (Spearman, 95% CI, bootstrap), as a scatter plot
* my gene vs each member, and the members against each other (heatmap)
* the score in my-gene-high against my-gene-low patients
* survival in four groups: my gene high/low x score high/low
* when the full cohort is downloaded: enrichment of every built-in set along
  all genes ranked by their correlation with my gene (preranked GSEA)

Reliability adds checks a supervisor would ask about: do the members move
together (Cronbach's alpha), does one member drive the link (leave one out),
is the link explained by mitochondrial content or by proliferation (partial
correlation), and is the set mixed or mostly stromal.

Associations in bulk tumour RNA say nothing about cause and effect; the
wording in the app keeps to "linked with".
"""

from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
from lifelines import KaplanMeierFitter
from lifelines.statistics import multivariate_logrank_test
from scipy import stats

from app.analyses.common import bh, check, clean
from app.analyses.genesets import GENESETS, REFERENCE_SET
from app.cohorts.store import Cohort

MIN_MEMBERS = 3
MIN_PATIENTS = 30
MIN_EVENTS_PER_GROUP = 5
RNG_SEED = 20261127
CONTROLS = {"mito_content": REFERENCE_SET, "proliferation": "proliferation"}


# ── helpers ──
def zscore(v: np.ndarray) -> np.ndarray:
    sd = np.nanstd(v)
    return (v - np.nanmean(v)) / sd if sd > 0 else np.zeros_like(v)


def score_of(mat: np.ndarray) -> np.ndarray:
    """Mean of column-wise z-scores (patients x genes); genes with no spread are dropped."""
    keep = np.nanstd(mat, axis=0) > 0
    z = np.column_stack([zscore(mat[:, j]) for j in np.where(keep)[0]]) if keep.any() else np.zeros((len(mat), 1))
    return np.nanmean(z, axis=1)


def cronbach_alpha(mat: np.ndarray) -> float | None:
    k = mat.shape[1]
    if k < 2:
        return None
    z = np.column_stack([zscore(mat[:, j]) for j in range(k)])
    total = z.sum(axis=1)
    var_items = z.var(axis=0, ddof=1).sum()
    var_total = total.var(ddof=1)
    return float(k / (k - 1) * (1 - var_items / var_total)) if var_total > 0 else None


def spearman_ci(rho: float, n: int) -> tuple[float, float]:
    z, se = np.arctanh(np.clip(rho, -0.9999, 0.9999)), np.sqrt((1 + rho**2 / 2) / (n - 3))
    return float(np.tanh(z - 1.96 * se)), float(np.tanh(z + 1.96 * se))


def partial_spearman(x: np.ndarray, y: np.ndarray, z: np.ndarray) -> tuple[float, float]:
    """Spearman correlation of x and y after removing a linear effect of z on the ranks."""
    rx, ry, rz = (stats.rankdata(v) for v in (x, y, z))
    Z = np.column_stack([np.ones_like(rz), rz])
    ex = rx - Z @ np.linalg.lstsq(Z, rx, rcond=None)[0]
    ey = ry - Z @ np.linalg.lstsq(Z, ry, rcond=None)[0]
    r = float(np.corrcoef(ex, ey)[0, 1])
    n = len(x)
    t = r * np.sqrt((n - 3) / max(1e-12, 1 - r**2))
    return r, float(2 * stats.t.sf(abs(t), n - 3))


def _strength(rho: float) -> str:
    a = abs(rho)
    return "negligible" if a < 0.1 else "weak" if a < 0.3 else "moderate" if a < 0.5 else "strong"


# ── preranked GSEA (also used by differential expression) ──
def _es(ranked_vals: np.ndarray, hits: np.ndarray) -> tuple[float, np.ndarray]:
    """Weighted (p = 1) running-sum enrichment score; hits is a boolean mask over the ranked list."""
    w = np.abs(ranked_vals) * hits
    nr = w.sum()
    n_miss = len(ranked_vals) - hits.sum()
    if nr == 0 or n_miss == 0:
        return 0.0, np.zeros(len(ranked_vals))
    run = np.cumsum(np.where(hits, w / nr, -1.0 / n_miss))
    i = int(np.argmax(np.abs(run)))
    return float(run[i]), run


def gsea(ranked: pd.Series, sets: dict[str, list[str]], permutations: int = 1000, seed: int = RNG_SEED,
         min_size: int = 3, curve_for: str | None = None) -> dict:
    """Preranked GSEA (Subramanian et al. PNAS 2005), gene-set permutation.

    ranked: gene -> statistic (e.g. correlation with my gene, or DE t statistic), any order.
    Returns {"results": [{set, size, es, nes, p, p_adj, leading_edge}], "curve": {...} for curve_for}.
    Gene-set permutation ignores correlation between genes, so p-values are optimistic; the app says so.
    """
    r = ranked.dropna()
    r = r[~r.index.duplicated()].sort_values(ascending=False)
    genes = r.index.to_numpy()
    vals = r.to_numpy(float)
    pos = {g: i for i, g in enumerate(genes)}
    n = len(genes)
    rng = np.random.default_rng(seed)
    out, curve = [], None
    null_cache: dict[int, np.ndarray] = {}
    for name, members in sets.items():
        idx = sorted({pos[g] for g in members if g in pos})
        k = len(idx)
        if k < min_size or k >= n:
            out.append({"set": name, "size": k, "es": None, "nes": None, "p": None, "p_adj": None, "leading_edge": []})
            continue
        hits = np.zeros(n, bool)
        hits[idx] = True
        es, run = _es(vals, hits)
        if k not in null_cache:
            null = np.empty(permutations)
            for b in range(permutations):
                h = np.zeros(n, bool)
                h[rng.choice(n, k, replace=False)] = True
                null[b] = _es(vals, h)[0]
            null_cache[k] = null
        null = null_cache[k]
        same = null[null >= 0] if es >= 0 else null[null < 0]
        denom = np.mean(np.abs(same)) if len(same) else np.nan
        nes = es / denom if denom and not np.isnan(denom) else None
        p = (np.sum(same >= es) + 1) / (len(same) + 1) if es >= 0 else (np.sum(same <= es) + 1) / (len(same) + 1)
        peak = int(np.argmax(np.abs(run)))
        lead = [genes[i] for i in idx if (i <= peak if es >= 0 else i >= peak)]
        out.append({"set": name, "size": k, "es": clean(es), "nes": clean(nes), "p": clean(p), "p_adj": None, "leading_edge": lead})
        if name == curve_for:
            step = max(1, n // 400)
            curve = {"x": list(range(0, n, step)), "y": [clean(v) for v in run[::step]], "hits": idx, "n": n,
                     "ranked_min": clean(vals[-1]), "ranked_max": clean(vals[0])}
    ok = [o for o in out if o["p"] is not None]
    for o, q in zip(ok, bh([o["p"] for o in ok])):
        o["p_adj"] = clean(q)
    return {"results": out, "curve": curve, "n_genes": n, "permutations": permutations}


def ranked_by_correlation(c: Cohort, gene: str, cases: list[str] | None = None) -> pd.Series | None:
    """Every expressed gene's Spearman correlation with `gene` across primary tumours (needs a cohort pack)."""
    reader = c.reader
    if reader is None or not hasattr(reader, "parts"):
        return None
    s = c.samples
    t = s[s["type"] == "tumor"].sort_values("id").drop_duplicates("case", keep="first")
    ids = t["id"].tolist()
    common = None
    for _, gidx, _ in reader.parts:
        common = set(gidx) if common is None else common & set(gidx)
    names = sorted(common or [])
    blocks = []
    for mat, gidx, cidx in reader.parts:
        cols = [cidx[i] for i in ids if i in cidx]
        if not cols:
            continue
        rows = np.array([gidx[g] for g in names])
        blocks.append(np.asarray(mat[rows][:, cols], dtype=np.float32))
    if not blocks:
        return None
    m = np.hstack(blocks)  # genes x patients
    keep = (np.median(m, axis=1) >= 1.0) & (m.std(axis=1) > 0)
    m, names = m[keep], [g for g, k in zip(names, keep) if k]
    if gene not in names:
        return None
    ranks = np.apply_along_axis(stats.rankdata, 1, m).astype(np.float32)
    ranks -= ranks.mean(axis=1, keepdims=True)
    ranks /= np.linalg.norm(ranks, axis=1, keepdims=True)
    gi = names.index(gene)
    rho = ranks @ ranks[gi]
    ser = pd.Series(rho, index=names).drop(gene)
    return ser


# ── the analysis ──
def _tumours(c: Cohort, genes: list[str]) -> pd.DataFrame:
    s = c.samples.copy()
    for g in genes:
        s[f"g:{g}"] = c.gene(g)
    t = s[s["type"] == "tumor"].sort_values("id").drop_duplicates("case", keep="first")
    return t


def resolve_members(set_id: str, custom: list[str] | None, gene: str) -> tuple[list[str], str]:
    if set_id == "custom":
        members = [g.strip().upper() for g in (custom or []) if g.strip()]
    else:
        members = list(GENESETS[set_id]["genes"])
    seen, out = set(), []
    for g in members:
        if g not in seen and g != gene:
            seen.add(g)
            out.append(g)
    return out, ("self_removed" if gene in members else "")


def run(c: Cohort, gene: str, set_id: str = "uprmt_markers", custom: list[str] | None = None, with_gsea: bool = True) -> dict:
    base = {"kind": "signature", "gene": gene, "set": set_id}
    members_all, note = resolve_members(set_id, custom, gene)
    present = [g for g in members_all if c.has(g)]
    missing = [g for g in members_all if not c.has(g)]
    if len(present) < MIN_MEMBERS:
        return base | {"error": "too_few_members", "present": present, "missing": missing, "min": MIN_MEMBERS}
    ctrl_sets = {k: [g for g in GENESETS[v]["genes"] if c.has(g) and g != gene and g not in present] for k, v in CONTROLS.items()}
    extra = sorted({g for v in ctrl_sets.values() for g in v})
    t = _tumours(c, [gene] + present + extra)
    n_all = len(t)
    t = t[t[f"g:{gene}"].notna() & t[[f"g:{g}" for g in present]].notna().all(axis=1)]
    n = len(t)
    if n < 10:
        return base | {"error": "too_few_pairs", "n": int(n), "min": 10}
    x = t[f"g:{gene}"].to_numpy(float)
    M = t[[f"g:{g}" for g in present]].to_numpy(float)
    score = score_of(M)

    # my gene vs score
    sp = stats.spearmanr(x, score)
    rho = float(sp.statistic)
    lo, hi = spearman_ci(rho, n)
    slope, intercept = np.polyfit(x, score, 1)
    rng = np.random.default_rng(RNG_SEED)
    boots = np.array([stats.spearmanr(x[i], score[i]).statistic for i in (rng.integers(0, n, n) for _ in range(300))])
    boot_same = float(np.mean(np.sign(boots) == np.sign(rho))) if rho != 0 else None

    # my gene vs each member, and member x member
    per = []
    for j, g in enumerate(present):
        r = stats.spearmanr(x, M[:, j])
        per.append({"gene": g, "rho": clean(r.statistic), "p": clean(r.pvalue)})
    for o, q in zip(per, bh([o["p"] if o["p"] is not None else 1.0 for o in per])):
        o["p_adj"] = clean(q)
    labels = [gene] + present
    full = np.column_stack([x, M])
    cm = stats.spearmanr(full).statistic if full.shape[1] > 2 else np.corrcoef(stats.rankdata(full[:, 0]), stats.rankdata(full[:, 1]))
    cm = np.atleast_2d(cm)
    heat = [[clean(v) for v in row] for row in cm]
    iu = np.triu_indices(len(present), 1)
    mm = cm[1:, 1:][iu]
    mean_inter = float(np.nanmean(mm)) if len(mm) else None
    alpha = cronbach_alpha(M)

    # leave one member out
    loo = []
    for j, g in enumerate(present):
        sub = np.delete(M, j, axis=1)
        loo.append({"gene": g, "rho": clean(stats.spearmanr(x, score_of(sub)).statistic)})
    loo_vals = [o["rho"] for o in loo if o["rho"] is not None]
    loo_flip = any(np.sign(v) != np.sign(rho) for v in loo_vals) if rho != 0 else False
    loo_range = [clean(min(loo_vals)), clean(max(loo_vals))] if loo_vals else None

    # controls: mitochondrial content and proliferation
    controls = {}
    for k, genes in ctrl_sets.items():
        if len(genes) >= MIN_MEMBERS:
            Z = t[[f"g:{g}" for g in genes]].to_numpy(float)
            ok = ~np.isnan(Z).any(axis=1)
            if ok.sum() >= 20:
                zs = score_of(Z[ok])
                pr, pp = partial_spearman(x[ok], score[ok], zs)
                controls[k] = {"rho_partial": clean(pr), "p": clean(pp), "genes": genes,
                               "rho_gene": clean(stats.spearmanr(x[ok], zs).statistic),
                               "rho_score": clean(stats.spearmanr(score[ok], zs).statistic)}

    # score in my-gene-high vs my-gene-low (median split)
    cut = float(np.median(x))
    high = x > cut
    a, b = score[high], score[~high]
    mw = stats.mannwhitneyu(a, b, alternative="two-sided")
    rb = float(2 * mw.statistic / (len(a) * len(b)) - 1)
    groups = [{"key": "high", "n": int(len(a)), **_box(a)}, {"key": "low", "n": int(len(b)), **_box(b)}]

    # survival: my gene high/low x score high/low
    surv = _survival4(t, x, score)

    # enrichment along genes ranked by correlation with my gene (needs the full cohort)
    enr = None
    if with_gsea:
        ranked = ranked_by_correlation(c, gene)
        if ranked is not None and len(ranked) > 500:
            sets = {sid: s["genes"] for sid, s in GENESETS.items()}
            if set_id == "custom":
                sets = {"custom": members_all} | sets
            enr = gsea(ranked, sets, permutations=1000, curve_for=set_id)
            top = ranked.sort_values()
            enr["top_pos"] = [[g, clean(v)] for g, v in top[::-1][:15].items()]
            enr["top_neg"] = [[g, clean(v)] for g, v in top[:15].items()]

    # reliability
    strength = _strength(rho)
    sig = sp.pvalue < 0.05
    meta = GENESETS.get(set_id, {})
    alpha_status = "pass" if alpha is not None and alpha >= 0.6 else "caution" if alpha is not None and alpha >= 0.3 else "problem"
    mito_ctrl = controls.get("mito_content")
    prolif_ctrl = controls.get("proliferation")

    def ctrl_check(key, ctrl, code):
        if not ctrl:
            return check(key, "info", f"{code}.na")
        drop = abs(ctrl["rho_partial"] or 0) < abs(rho) * 0.5 and sig
        return check(key, "caution" if drop else "pass", f"{code}.{'explains' if drop else 'holds'}",
                     rho=rho, rho_partial=ctrl["rho_partial"], p=ctrl["p"], n_genes=len(ctrl["genes"]))

    checks = [
        check("data", "pass" if not missing else "caution", "data.sig" if not missing else "data.sigMissing",
              n=int(n), excluded=int(n_all - n), members=len(present), missing=", ".join(missing), source=c.source),
        check("enough", "pass" if n >= MIN_PATIENTS else "caution", "enough.corr" if n >= MIN_PATIENTS else "enough.corrSmall", n=int(n), min=MIN_PATIENTS),
        check("coherence", alpha_status, f"sig.coherence.{alpha_status}", alpha=alpha, mean_r=mean_inter, k=len(present)),
        check("leave_one_out", "caution" if loo_flip and sig else "pass", "sig.loo.flip" if loo_flip and sig else "sig.loo.ok",
              lo=loo_range[0] if loo_range else None, hi=loo_range[1] if loo_range else None),
        ctrl_check("mito_content", mito_ctrl, "sig.mito"),
        ctrl_check("proliferation", prolif_ctrl, "sig.prolif"),
        check("set_kind", "caution" if meta.get("mixed") or meta.get("stroma") else "pass",
              "sig.mixed" if meta.get("mixed") else "sig.stroma" if meta.get("stroma") else "sig.oneDirection"),
        check("multiple", "pass" if len(present) else "info", "multiple.members", k=len(present)),
        check("effect", "caution" if sig and strength == "negligible" else "pass", f"effect.rho.{strength}", rho=rho, lo=lo, hi=hi),
        check("stability", "pass" if boot_same is None or boot_same >= 0.95 or not sig else "caution", "stability.corrBoot", boot_same=boot_same),
        check("replication", "info", "replication.acrossCancers"),
        check("causality", "info", "sig.association"),
        check("reproducibility", "pass", "repro.recorded", built=c.built),
    ]
    order = np.argsort(t["id"].to_numpy())
    return base | {
        "units": c.units, "n": int(n), "excluded": int(n_all - n), "members": present, "missing": missing, "note": note,
        "set_name": meta.get("name", "Custom set"), "set_name_zh": meta.get("zh", "自定义基因集"), "cite": meta.get("cite", []),
        "score_method": "zmean",
        "rho": clean(rho), "rho_ci": [clean(lo), clean(hi)], "p": clean(sp.pvalue),
        "line": {"slope": clean(slope), "intercept": clean(intercept)},
        "points": [[clean(x[i]), clean(score[i])] for i in order],
        "per_member": per, "heatmap": {"labels": labels, "rho": heat}, "alpha": clean(alpha), "mean_inter": clean(mean_inter),
        "leave_one_out": loo, "controls": controls,
        "groups": {"cut": clean(cut), "items": groups, "test": {"name": "wilcoxon_rank_sum", "p": clean(mw.pvalue)}, "rank_biserial": clean(rb)},
        "survival": surv, "enrichment": enr,
        "checks": checks, "data_version": c.data_version(),
    }


def _box(v: np.ndarray) -> dict:
    q1, med, q3 = np.percentile(v, [25, 50, 75])
    return {"median": clean(med), "q1": clean(q1), "q3": clean(q3), "min": clean(v.min()), "max": clean(v.max()),
            "mean": clean(v.mean()), "values": [clean(z) for z in v]}


def _survival4(t: pd.DataFrame, x: np.ndarray, score: np.ndarray) -> dict | None:
    d = pd.DataFrame({"time": t["os_time"].to_numpy(dtype=float) / 30.4375, "event": t["os_event"].to_numpy(dtype=float),
                      "x": x, "s": score})
    d = d[d["time"].notna() & d["event"].notna() & (d["time"] > 0)]
    if len(d) < 40:
        return {"error": "too_few_patients", "n": int(len(d))}
    gx = d["x"] > d["x"].median()
    gs = d["s"] > d["s"].median()
    d["group"] = np.where(gx, "gene_high", "gene_low")
    d["group"] = d["group"] + np.where(gs, "_score_high", "_score_low")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        lr = multivariate_logrank_test(d["time"], d["group"], d["event"])
    horizon = float(np.nanpercentile(d["time"], 90))
    ticks = [float(v) for v in np.arange(0, horizon + 1e-9, 12 if horizon > 36 else 6)]
    curves, at_risk = {}, {}
    for key in ("gene_high_score_high", "gene_high_score_low", "gene_low_score_high", "gene_low_score_low"):
        g = d[d["group"] == key]
        if len(g) < 2:
            continue
        km = KaplanMeierFitter().fit(g["time"], g["event"])
        sf = km.survival_function_.iloc[:, 0]
        cens = g["time"][g["event"] == 0]
        curves[key] = {"n": int(len(g)), "events": int(g["event"].sum()), "time": [clean(v) for v in sf.index],
                       "surv": [clean(v) for v in sf.values], "censor_times": [clean(v) for v in cens.values],
                       "censor_surv": [clean(km.predict(v)) for v in cens.values], "median": clean(km.median_survival_time_)}
        at_risk[key] = [int((g["time"] >= v).sum()) for v in ticks]
    fewest = min((cv["events"] for cv in curves.values()), default=0)
    return {"curves": curves, "at_risk": {"ticks": ticks, **at_risk}, "logrank": {"statistic": clean(lr.test_statistic), "p": clean(lr.p_value), "df": 3},
            "n": int(len(d)), "fewest_events": int(fewest), "enough": fewest >= MIN_EVENTS_PER_GROUP}


# ── across cancers ──
def across(cohorts: list[Cohort], gene: str, set_id: str, custom: list[str] | None = None) -> dict:
    """The same my-gene vs score correlation in each cohort, with a BH correction across cohorts."""
    members_all, _ = resolve_members(set_id, custom, gene)
    rows = []
    for c in cohorts:
        present = [g for g in members_all if c.has(g)]
        if not c.has(gene) or len(present) < MIN_MEMBERS:
            rows.append({"cohort": c.name, "projects": c.projects, "error": "too_few_members", "n": 0})
            continue
        t = _tumours(c, [gene] + present)
        t = t[t[f"g:{gene}"].notna() & t[[f"g:{g}" for g in present]].notna().all(axis=1)]
        if len(t) < 20:
            rows.append({"cohort": c.name, "projects": c.projects, "error": "too_few_pairs", "n": int(len(t))})
            continue
        x = t[f"g:{gene}"].to_numpy(float)
        s = score_of(t[[f"g:{g}" for g in present]].to_numpy(float))
        r = stats.spearmanr(x, s)
        lo, hi = spearman_ci(float(r.statistic), len(t))
        rows.append({"cohort": c.name, "projects": c.projects, "n": int(len(t)), "rho": clean(r.statistic), "lo": clean(lo), "hi": clean(hi),
                     "p": clean(r.pvalue), "members": len(present)})
    ok = [r for r in rows if r.get("p") is not None]
    for r, q in zip(ok, bh([r["p"] for r in ok])):
        r["p_adj"] = clean(q)
    pos = sum(1 for r in ok if r["rho"] > 0 and r["p_adj"] < 0.05)
    neg = sum(1 for r in ok if r["rho"] < 0 and r["p_adj"] < 0.05)
    return {"rows": rows, "tested": len(ok), "positive": pos, "negative": neg}
