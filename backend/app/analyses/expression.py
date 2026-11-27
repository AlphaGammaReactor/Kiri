"""
Expression analyses.

Tumour against normal: every sample as a point over a box plot. Wilcoxon
rank-sum (Mann–Whitney U) by default; with matched pairs (tumour and normal
from the same patient), the Wilcoxon signed-rank test on those pairs.
Effect size: difference in medians, and the rank-biserial correlation with a
bootstrap 95% interval.

By stage: Kruskal–Wallis across stages I–IV, then pairwise rank-sum tests
with Benjamini–Hochberg correction.
"""

from __future__ import annotations

import numpy as np
from scipy import stats

from app.analyses.common import bh, check, clean, summary
from app.cohorts.store import Cohort

MIN_GROUP = 20  # below this a group gets a caution
RNG_SEED = 20261126


def _rank_biserial(a: np.ndarray, b: np.ndarray) -> float:
    u = stats.mannwhitneyu(a, b, alternative="two-sided").statistic
    return float(2 * u / (len(a) * len(b)) - 1)


def _boot_rb(a: np.ndarray, b: np.ndarray, reps: int = 400) -> tuple[float, float]:
    rng = np.random.default_rng(RNG_SEED)
    vals = [_rank_biserial(rng.choice(a, len(a)), rng.choice(b, len(b))) for _ in range(reps)]
    lo, hi = np.percentile(vals, [2.5, 97.5])
    return float(lo), float(hi)


def tumour_vs_normal(c: Cohort, gene: str, paired: bool = False) -> dict:
    s = c.samples
    y = c.gene(gene)
    has = ~np.isnan(y)
    tum = (s["type"] == "tumor").to_numpy() & has
    nor = (s["type"] == "normal").to_numpy() & has
    excluded = int((~has).sum())
    a, b = y[tum], y[nor]
    checks = []
    if len(a) < 3 or len(b) < 3:
        return {"kind": "expression_tn", "gene": gene, "error": "too_few_normal", "n_tumour": int(len(a)), "n_normal": int(len(b))}

    pairs = None
    if paired:
        st = s[tum].assign(v=a).groupby("case")["v"].mean()
        sn = s[nor].assign(v=b).groupby("case")["v"].mean()
        common = st.index.intersection(sn.index)
        pairs = {"n": int(len(common))}
        if len(common) >= 5:
            w = stats.wilcoxon(st[common], sn[common])
            test = {"name": "wilcoxon_signed_rank", "statistic": clean(w.statistic), "p": clean(w.pvalue), "n_pairs": int(len(common))}
            pairs["points"] = [[clean(st[k]), clean(sn[k])] for k in common]
        else:
            paired = False
    if not paired:
        u = stats.mannwhitneyu(a, b, alternative="two-sided")
        test = {"name": "wilcoxon_rank_sum", "statistic": clean(u.statistic), "p": clean(u.pvalue)}

    rb = _rank_biserial(a, b)
    lo, hi = _boot_rb(a, b)
    diff = float(np.median(a) - np.median(b))
    effect = {"median_diff": clean(diff), "rank_biserial": clean(rb), "rb_ci": [clean(lo), clean(hi)]}

    # Reliability
    checks.append(check("data", "pass", "data.groups", n_tumour=int(len(a)), n_normal=int(len(b)), excluded=excluded, source=c.source))
    small = min(len(a), len(b))
    checks.append(check("enough", "pass" if small >= MIN_GROUP else "caution", "enough.groups" if small >= MIN_GROUP else "enough.smallGroup", smallest=int(small), min=MIN_GROUP))
    n_tumour_cases = s[tum]["case"].nunique()
    matched = len(set(s[tum]["case"]) & set(s[nor]["case"]))
    checks.append(check("assumptions", "pass" if paired or matched == 0 else "caution",
                        "assume.paired" if paired else ("assume.independent" if matched == 0 else "assume.someMatched"),
                        matched=int(matched), cases=int(n_tumour_cases)))
    checks.append(check("multiple", "info", "multiple.one"))
    strength = abs(rb)
    size_code = "effect.large" if strength >= 0.5 else "effect.medium" if strength >= 0.3 else "effect.small" if strength >= 0.1 else "effect.negligible"
    checks.append(check("effect", "pass" if strength >= 0.1 else "caution", size_code, rb=rb, lo=lo, hi=hi, diff=diff))
    checks.append(check("replication", "info", "replication.notYet"))
    checks.append(check("reproducibility", "pass", "repro.recorded", built=c.built))

    # The same comparison inside each TCGA project, BH-corrected across projects
    per_project = []
    projects = list(dict.fromkeys(s["project"]))
    if len(projects) > 1:
        raw = []
        for pr in projects:
            inp = (s["project"] == pr).to_numpy()
            pa, pb = y[tum & inp], y[nor & inp]
            entry = {"project": pr, "tumour": {**summary(pa), "values": [clean(v) for v in pa]},
                     "normal": {**summary(pb), "values": [clean(v) for v in pb]}, "p": None}
            if len(pa) >= 3 and len(pb) >= 3:
                entry["p"] = clean(stats.mannwhitneyu(pa, pb, alternative="two-sided").pvalue)
                raw.append(entry["p"])
            per_project.append(entry)
        adj = iter(bh(raw))
        for e in per_project:
            e["p_adj"] = clean(next(adj)) if e["p"] is not None else None

    return {
        "kind": "expression_tn", "gene": gene, "units": c.units, "paired": paired, "per_project": per_project,
        "groups": [
            {"key": "tumour", **summary(a), "values": [clean(v) for v in a]},
            {"key": "normal", **summary(b), "values": [clean(v) for v in b]},
        ],
        "pairs": pairs, "test": test, "effect": effect, "excluded": excluded, "matched_cases": int(matched),
        "checks": checks, "data_version": c.data_version(),
    }


def by_stage(c: Cohort, gene: str) -> dict:
    s = c.samples
    y = c.gene(gene)
    tum = (s["type"] == "tumor").to_numpy() & ~np.isnan(y)
    stages = ["I", "II", "III", "IV"]
    groups = []
    for st in stages:
        m = tum & (s["stage"] == st).to_numpy()
        groups.append((st, y[m]))
    groups = [(k, v) for k, v in groups if len(v) > 0]
    missing_stage = int((tum & ~s["stage"].isin(stages).to_numpy()).sum())
    if len(groups) < 2:
        return {"kind": "expression_stage", "gene": gene, "error": "too_few_stages"}
    kw = stats.kruskal(*[v for _, v in groups])
    pairs, raw = [], []
    for i in range(len(groups)):
        for j in range(i + 1, len(groups)):
            p = stats.mannwhitneyu(groups[i][1], groups[j][1], alternative="two-sided").pvalue
            pairs.append({"a": groups[i][0], "b": groups[j][0], "p": clean(p)})
            raw.append(p)
    for pr, adj in zip(pairs, bh(raw)):
        pr["p_adj"] = clean(adj)
    small = min(len(v) for _, v in groups)
    eps2 = (kw.statistic - len(groups) + 1) / (sum(len(v) for _, v in groups) - len(groups))
    checks = [
        check("data", "pass", "data.stages", n=int(sum(len(v) for _, v in groups)), excluded=missing_stage, source=c.source),
        check("enough", "pass" if small >= MIN_GROUP else "caution", "enough.groups" if small >= MIN_GROUP else "enough.smallGroup", smallest=int(small), min=MIN_GROUP),
        check("assumptions", "pass", "assume.kruskal"),
        check("multiple", "pass", "multiple.pairwiseBH", tests=len(pairs)),
        check("effect", "pass" if eps2 >= 0.01 else "caution", "effect.epsilon", eps2=float(max(eps2, 0.0))),
        check("replication", "info", "replication.notYet"),
        check("reproducibility", "pass", "repro.recorded", built=c.built),
    ]
    return {
        "kind": "expression_stage", "gene": gene, "units": c.units,
        "groups": [{"key": k, **summary(v), "values": [clean(x) for x in v]} for k, v in groups],
        "test": {"name": "kruskal_wallis", "statistic": clean(kw.statistic), "p": clean(kw.pvalue)},
        "pairwise": pairs, "effect": {"epsilon_squared": clean(max(eps2, 0.0))}, "excluded": missing_stage,
        "checks": checks, "data_version": c.data_version(),
    }


def by_group(c: Cohort, gene: str) -> dict:
    """Your own table: a value compared across the groups in its group column.
    Two groups: Wilcoxon rank-sum with the rank-biserial r. More: Kruskal–Wallis, then pairwise with BH."""
    s = c.samples
    if "group" not in s.columns:
        return {"kind": "expression_group", "gene": gene, "error": "no_groups"}
    y = c.gene(gene)
    g = s["group"].to_numpy(dtype=object)
    ok = ~np.isnan(y) & np.array([v is not None and v == v and str(v) != "" for v in g])
    names = sorted({str(v) for v in g[ok]}, key=lambda k: (-int((g[ok] == k).sum()), k))[:8]
    groups = [(k, y[ok & (g == k)]) for k in names]
    groups = [(k, v) for k, v in groups if len(v) > 0]
    excluded = int((~ok).sum())
    if len(groups) < 2 or min(len(v) for _, v in groups) < 2:
        return {"kind": "expression_group", "gene": gene, "error": "too_few_groups"}
    small = min(len(v) for _, v in groups)
    n = int(sum(len(v) for _, v in groups))
    common = [
        check("data", "pass", "data.groupsOwn", n=n, groups=len(groups), excluded=excluded, source=c.source),
        check("enough", "pass" if small >= MIN_GROUP else "caution", "enough.groups" if small >= MIN_GROUP else "enough.smallGroup", smallest=int(small), min=MIN_GROUP),
    ]
    tail = [check("replication", "info", "replication.notYet"), check("reproducibility", "pass", "repro.recorded", built=c.built)]
    out = {"kind": "expression_group", "gene": gene, "units": c.units,
           "groups": [{"key": k, **summary(v), "values": [clean(x) for x in v]} for k, v in groups],
           "excluded": excluded, "data_version": c.data_version()}
    if len(groups) == 2:
        (ka, a), (kb, b) = groups
        mw = stats.mannwhitneyu(a, b, alternative="two-sided")
        rb = _rank_biserial(a, b)
        lo, hi = _boot_rb(a, b)
        strength = abs(rb)
        size = "effect.large" if strength >= 0.5 else "effect.medium" if strength >= 0.3 else "effect.small" if strength >= 0.1 else "effect.negligible"
        checks = common + [
            check("assumptions", "pass", "assume.rankSumOwn"),
            check("multiple", "pass", "multiple.one"),
            check("effect", "caution" if mw.pvalue < 0.05 and size == "effect.negligible" else "pass", size, rb=rb, lo=lo, hi=hi),
        ] + tail
        return out | {"test": {"name": "wilcoxon_rank_sum", "statistic": clean(mw.statistic), "p": clean(mw.pvalue)},
                      "pairwise": [{"a": ka, "b": kb, "p": clean(mw.pvalue), "p_adj": clean(mw.pvalue)}],
                      "effect": {"rank_biserial": clean(rb), "ci": [clean(lo), clean(hi)],
                                 "median_diff": clean(float(np.median(a) - np.median(b)))}, "checks": checks}
    kw = stats.kruskal(*[v for _, v in groups])
    pairs, raw = [], []
    for i in range(len(groups)):
        for j in range(i + 1, len(groups)):
            p = stats.mannwhitneyu(groups[i][1], groups[j][1], alternative="two-sided").pvalue
            pairs.append({"a": groups[i][0], "b": groups[j][0], "p": clean(p)})
            raw.append(p)
    for pr, adj in zip(pairs, bh(raw)):
        pr["p_adj"] = clean(adj)
    eps2 = (kw.statistic - len(groups) + 1) / (n - len(groups))
    checks = common + [
        check("assumptions", "pass", "assume.kruskal"),
        check("multiple", "pass", "multiple.pairwiseBH", tests=len(pairs)),
        check("effect", "pass" if eps2 >= 0.01 else "caution", "effect.epsilon", eps2=float(max(eps2, 0.0))),
    ] + tail
    return out | {"test": {"name": "kruskal_wallis", "statistic": clean(kw.statistic), "p": clean(kw.pvalue)},
                  "pairwise": pairs, "effect": {"epsilon_squared": clean(max(eps2, 0.0))}, "checks": checks}


def by_mutation(c: Cohort, gene: str, mutated: str) -> dict:
    """Expression of `gene` in tumours with and without a protein-changing mutation in `mutated`
    (the same gene or another). One tumour per patient; tumours never sequenced are left out."""
    from dataclasses import replace

    s = c.samples.copy()
    s["_m"] = c.mutation(mutated)
    s["_i"] = np.arange(len(s))
    t = s[(s["type"] == "tumor")].sort_values("id").drop_duplicates("case", keep="first")
    keep = t[t["_m"].notna()]
    group = np.array([None] * len(s), dtype=object)
    group[keep["_i"].to_numpy()] = np.where(keep["_m"].to_numpy() >= 0.5, "mutated", "not_mutated")
    sub = replace(c, samples=s.drop(columns=["_m", "_i"]).assign(group=group))
    n_mut = int((keep["_m"] >= 0.5).sum())
    if n_mut < 3:
        return {"kind": "expression_mut", "gene": gene, "gene2": mutated, "error": "too_few_mutated", "n": n_mut, "n_other": int(len(keep) - n_mut)}
    r = by_group(sub, gene)
    if r.get("error"):
        return r | {"kind": "expression_mut", "gene2": mutated}
    # Keep "mutated" first whatever the group sizes, and say where the groups came from.
    r["groups"].sort(key=lambda g: g["key"] != "mutated")
    for ch in r["checks"]:
        if ch["check"] == "data":
            ch.update(code="data.groupsMut", vars={**ch["vars"], "gene2": mutated, "mutated": n_mut, "not_sequenced": int(len(t) - len(keep))})
    return r | {"kind": "expression_mut", "gene2": mutated, "data_version": c.data_version() | {"mutations": "GDC open-access somatic mutations (WXS, masked)"}}
