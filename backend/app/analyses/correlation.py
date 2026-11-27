"""
Correlation between two genes across patients: a scatter plot with Spearman's
rank correlation (what Kiri reports) and Pearson's r for comparison. One
primary tumour sample per patient, so no patient counts twice.

Reliability: enough patients, outliers (and whether removing them changes the
answer), effect size, and bootstrap stability of the sign.
"""

from __future__ import annotations

import numpy as np
from scipy import stats

from app.analyses.common import check, clean
from app.cohorts.store import Cohort

MIN_PATIENTS = 30
RNG_SEED = 20261126


def _strength(rho: float) -> str:
    a = abs(rho)
    return "negligible" if a < 0.1 else "weak" if a < 0.3 else "moderate" if a < 0.5 else "strong"


def run(c: Cohort, gene: str, gene2: str) -> dict:
    if gene == gene2:
        return {"kind": "correlation", "gene": gene, "gene2": gene2, "error": "same_gene"}
    s = c.samples.copy()
    s["x"], s["y"] = c.gene(gene), c.gene(gene2)
    t = s[s["type"] == "tumor"].sort_values("id").drop_duplicates("case", keep="first")
    n_all = len(t)
    t = t[t["x"].notna() & t["y"].notna()]
    n = len(t)
    if n < 10:
        return {"kind": "correlation", "gene": gene, "gene2": gene2, "error": "too_few_pairs", "n": int(n), "min": 10}
    x, y = t["x"].to_numpy(float), t["y"].to_numpy(float)
    sp = stats.spearmanr(x, y)
    pe = stats.pearsonr(x, y)
    rho = float(sp.statistic)
    # 95% interval for rho: Fisher z with the Bonett–Wright standard error
    z, se = np.arctanh(np.clip(rho, -0.9999, 0.9999)), np.sqrt((1 + rho**2 / 2) / (n - 3))
    lo, hi = float(np.tanh(z - 1.96 * se)), float(np.tanh(z + 1.96 * se))
    slope, intercept = np.polyfit(x, y, 1)

    # Outliers: points far from both centres (robust z > 3.5 on either axis)
    def rz(v):
        mad = np.median(np.abs(v - np.median(v))) or 1e-9
        return 0.6745 * (v - np.median(v)) / mad
    out = (np.abs(rz(x)) > 3.5) | (np.abs(rz(y)) > 3.5)
    n_out = int(out.sum())
    rho_wo = float(stats.spearmanr(x[~out], y[~out]).statistic) if n_out and (~out).sum() >= 10 else rho

    rng = np.random.default_rng(RNG_SEED)
    boots = []
    for _ in range(300):
        i = rng.integers(0, n, n)
        boots.append(stats.spearmanr(x[i], y[i]).statistic)
    boots = np.asarray(boots)
    same = float(np.mean(np.sign(boots) == np.sign(rho))) if rho != 0 else None

    strength = _strength(rho)
    sig = sp.pvalue < 0.05
    checks = [
        check("data", "pass", "data.corr", n=int(n), excluded=int(n_all - n), source=c.source),
        check("enough", "pass" if n >= MIN_PATIENTS else "caution", "enough.corr" if n >= MIN_PATIENTS else "enough.corrSmall", n=int(n), min=MIN_PATIENTS),
        check("assumptions", "pass" if not n_out or abs(rho_wo - rho) < 0.1 else "caution",
              "assume.spearman" if not n_out else "assume.outliersOk" if abs(rho_wo - rho) < 0.1 else "assume.outliersMatter",
              outliers=n_out, rho_wo=rho_wo),
        check("multiple", "pass", "multiple.onePair"),
        check("effect", "caution" if sig and strength == "negligible" else "pass", f"effect.rho.{strength}", rho=rho, lo=lo, hi=hi),
        check("stability", "pass" if same is None or same >= 0.95 or not sig else "caution", "stability.corrBoot", boot_same=same),
        check("replication", "info", "replication.notYet"),
        check("reproducibility", "pass", "repro.recorded", built=c.built),
    ]
    order = np.argsort(t["id"].to_numpy())
    return {
        "kind": "correlation", "gene": gene, "gene2": gene2, "units": c.units, "n": int(n),
        "rho": clean(rho), "rho_ci": [clean(lo), clean(hi)], "p": clean(sp.pvalue),
        "pearson": {"r": clean(pe.statistic), "p": clean(pe.pvalue)},
        "line": {"slope": clean(slope), "intercept": clean(intercept)},
        "points": [[clean(x[i]), clean(y[i])] for i in order],
        "outliers": n_out, "rho_without_outliers": clean(rho_wo), "excluded": int(n_all - n),
        "checks": checks, "data_version": c.data_version(),
    }
