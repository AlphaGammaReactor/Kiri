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

    return {
        "kind": "expression_tn", "gene": gene, "units": c.units, "paired": paired,
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
