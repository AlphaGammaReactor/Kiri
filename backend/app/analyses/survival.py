"""
Survival: Kaplan–Meier curves for high against low expression, the log-rank
test, and a Cox model for the hazard ratio (optionally adjusted for age and
stage). One tumour sample per patient (the first primary tumour sample).

Cutpoint: the median by default. Quartiles compare the top and bottom
quarters. "Optimal" searches the 25th–75th percentiles and reports the p-value
adjusted for that search (Miller–Siegmund), never the raw minimum.

The Reliability panel also re-runs the analysis at other cutpoints and on
bootstrap resamples, and tests proportional hazards.
"""

from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
from lifelines import CoxPHFitter, KaplanMeierFitter
from lifelines.statistics import logrank_test, proportional_hazard_test

from app.analyses.common import check, clean
from app.cohorts.store import Cohort
from app.services.cutpoint import adjusted_min_pvalue

MIN_EVENTS_PER_GROUP = 10
RNG_SEED = 20261126


def _patients(c: Cohort, gene: str) -> tuple[pd.DataFrame, dict]:
    s = c.samples.copy()
    s["expr"] = c.gene(gene)
    t = s[(s["type"] == "tumor")].sort_values("id").drop_duplicates("case", keep="first")
    n_all = len(t)
    t = t[t["expr"].notna()]
    no_expr = n_all - len(t)
    ok = t["os_time"].notna() & t["os_event"].notna() & (t["os_time"] > 0)
    no_surv = int((~ok).sum())
    t = t[ok].copy()
    t["time"] = t["os_time"] / 30.4375  # months
    t["event"] = t["os_event"].astype(int)
    return t, {"patients": int(n_all), "no_expression": int(no_expr), "no_survival": no_surv}


def _split(t: pd.DataFrame, cut: str) -> tuple[pd.DataFrame, float, dict]:
    if cut == "quartile":
        lo, hi = t["expr"].quantile([0.25, 0.75])
        g = t[(t["expr"] <= lo) | (t["expr"] >= hi)].copy()
        g["high"] = (g["expr"] >= hi).astype(int)
        return g, float(hi), {"low": float(lo), "high": float(hi)}
    if cut == "optimal":
        best = (1.0, None)
        tried = 0
        for q in np.linspace(0.25, 0.75, 41):
            v = t["expr"].quantile(q)
            hi = t["expr"] > v
            if hi.sum() < 10 or (~hi).sum() < 10:
                continue
            tried += 1
            p = logrank_test(t.loc[hi, "time"], t.loc[~hi, "time"], t.loc[hi, "event"], t.loc[~hi, "event"]).p_value
            if p < best[0]:
                best = (p, float(v))
        v = best[1] if best[1] is not None else float(t["expr"].median())
        g = t.copy()
        g["high"] = (g["expr"] > v).astype(int)
        return g, v, {"p_min": best[0], "tried": tried, "p_adjusted": adjusted_min_pvalue(best[0], 0.25)}
    v = float(t["expr"].median())
    g = t.copy()
    g["high"] = (g["expr"] > v).astype(int)
    return g, v, {}


def _cox(g: pd.DataFrame, adjust: list[str]) -> dict:
    cols = ["time", "event", "high"]
    d = g.copy()
    if "age" in adjust:
        d = d[d["age"].notna()]
        cols.append("age")
    if "stage" in adjust:
        d = d[d["stage"].isin(["I", "II", "III", "IV"])].copy()
        d["stage_n"] = d["stage"].map({"I": 1, "II": 2, "III": 3, "IV": 4})
        cols.append("stage_n")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        m = CoxPHFitter().fit(d[cols], "time", "event")
        ph = proportional_hazard_test(m, d[cols], time_transform="rank")
    r = m.summary.loc["high"]
    return {
        "hr": clean(r["exp(coef)"]), "lo": clean(r["exp(coef) lower 95%"]), "hi": clean(r["exp(coef) upper 95%"]),
        "p": clean(r["p"]), "n": int(len(d)), "covariates": [c for c in cols if c not in ("time", "event")],
        "ph_p": clean(ph.summary.loc["high", "p"]) if "high" in ph.summary.index else None,
    }


def _curve(t: pd.Series, e: pd.Series) -> dict:
    km = KaplanMeierFitter().fit(t, e)
    sf = km.survival_function_.iloc[:, 0]
    ci = km.confidence_interval_
    censored = t[e == 0]
    return {
        "time": [clean(x) for x in sf.index], "surv": [clean(x) for x in sf.values],
        "lo": [clean(x) for x in ci.iloc[:, 0].values], "hi": [clean(x) for x in ci.iloc[:, 1].values],
        "censor_times": [clean(x) for x in censored.values],
        "censor_surv": [clean(km.predict(x)) for x in censored.values],
        "median": clean(km.median_survival_time_),
    }


def _stability(main_sig: bool, stab: list, same_dir: int, same_sig: int, boot_same) -> dict:
    """Does the answer hold at other cutpoints? A significant result should stay significant;
    a null result should not turn significant at some other cutpoint."""
    any_sig = sum(1 for s in stab if s["p"] is not None and s["p"] < 0.05)
    v = {"same_direction": same_dir, "significant": any_sig, "of": len(stab), "boot_same": boot_same}
    if main_sig:
        status = "pass" if same_sig >= 4 else "caution" if same_dir >= 4 else "problem"
        return check("stability", status, "stability.cutpoints", **v)
    return check("stability", "pass" if any_sig == 0 else "caution",
                 "stability.nullHolds" if any_sig == 0 else "stability.nullSomeSig", **v)


def run(c: Cohort, gene: str, cut: str = "median", adjust: list[str] | None = None) -> dict:
    adjust = adjust or []
    t, counts = _patients(c, gene)
    if len(t) < 20:
        return {"kind": "survival", "gene": gene, "error": "too_few_patients", "n": int(len(t))}
    g, value, cutinfo = _split(t, cut)
    hi, lo = g[g["high"] == 1], g[g["high"] == 0]
    lr = logrank_test(hi["time"], lo["time"], hi["event"], lo["event"])
    cox = _cox(g, [])
    adj = _cox(g, adjust) if adjust else None
    horizon = float(np.nanpercentile(g["time"], 90))
    ticks = [float(x) for x in np.arange(0, horizon + 1e-9, 12 if horizon > 36 else 6)]
    at_risk = {k: [int((d["time"] >= x).sum()) for x in ticks] for k, d in (("high", hi), ("low", lo))}
    p_report = cutinfo.get("p_adjusted", lr.p_value) if cut == "optimal" else lr.p_value

    # Stability: other cutpoints and bootstrap
    stab = []
    for q in (0.33, 0.4, 0.5, 0.6, 0.67):
        v = t["expr"].quantile(q)
        h = t["expr"] > v
        p = logrank_test(t.loc[h, "time"], t.loc[~h, "time"], t.loc[h, "event"], t.loc[~h, "event"]).p_value
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            d = t.assign(high=h.astype(int))[["time", "event", "high"]]
            hr = float(np.exp(CoxPHFitter().fit(d, "time", "event").params_["high"]))
        stab.append({"quantile": q, "hr": clean(hr), "p": clean(p)})
    rng = np.random.default_rng(RNG_SEED)
    boot = []
    base = g[["time", "event", "high"]].reset_index(drop=True)
    for _ in range(100):
        d = base.iloc[rng.integers(0, len(base), len(base))]
        if d["high"].nunique() < 2:
            continue
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            try:
                boot.append(float(np.exp(CoxPHFitter().fit(d, "time", "event").params_["high"])))
            except Exception:
                continue
    direction = 1 if (cox["hr"] or 1) >= 1 else -1
    same_dir = sum(1 for s in stab if (s["hr"] >= 1) == (direction == 1))
    same_sig = sum(1 for s in stab if (s["hr"] >= 1) == (direction == 1) and s["p"] < 0.05)
    boot_same = float(np.mean([(b >= 1) == (direction == 1) for b in boot])) if boot else None

    events = {"high": int(hi["event"].sum()), "low": int(lo["event"].sum())}
    excl = counts["no_expression"] + counts["no_survival"]
    checks = [
        check("data", "pass", "data.patients", n=int(len(g)), excluded=int(excl), no_survival=counts["no_survival"], source=c.source),
        check("enough", "pass" if min(events.values()) >= MIN_EVENTS_PER_GROUP else "caution",
              "enough.events" if min(events.values()) >= MIN_EVENTS_PER_GROUP else "enough.fewEvents",
              high=events["high"], low=events["low"], min=MIN_EVENTS_PER_GROUP),
        check("assumptions", "pass" if (cox["ph_p"] is None or cox["ph_p"] >= 0.05) else "caution",
              "assume.ph" if (cox["ph_p"] is None or cox["ph_p"] >= 0.05) else "assume.phViolated", p=cox["ph_p"]),
        check("multiple", "pass" if cut != "optimal" else "caution",
              "multiple.fixedCut" if cut != "optimal" else "multiple.optimalAdjusted",
              tried=cutinfo.get("tried", 1), p_raw=cutinfo.get("p_min"), p_adj=cutinfo.get("p_adjusted")),
        check("effect", "pass" if (cox["lo"] or 0) > 1 or (cox["hi"] or 2) < 1 else "caution",
              "effect.hrExcludes1" if (cox["lo"] or 0) > 1 or (cox["hi"] or 2) < 1 else "effect.hrIncludes1",
              hr=cox["hr"], lo=cox["lo"], hi=cox["hi"]),
        _stability(p_report < 0.05, stab, same_dir, same_sig, boot_same),
        check("replication", "info", "replication.notYet"),
        check("reproducibility", "pass", "repro.recorded", built=c.built),
    ]
    return {
        "kind": "survival", "gene": gene, "endpoint": "OS", "cut": cut, "cut_value": clean(value), "cut_info": {k: clean(v) if isinstance(v, float) else v for k, v in cutinfo.items()},
        "groups": {"high": {"n": int(len(hi)), "events": events["high"], **_curve(hi["time"], hi["event"])},
                   "low": {"n": int(len(lo)), "events": events["low"], **_curve(lo["time"], lo["event"])}},
        "at_risk": {"ticks": ticks, **at_risk},
        "logrank": {"statistic": clean(lr.test_statistic), "p": clean(lr.p_value)}, "p_report": clean(p_report),
        "cox": cox, "cox_adjusted": adj, "stability": {"cutpoints": stab, "bootstrap_same_direction": clean(boot_same)},
        "counts": counts, "checks": checks, "data_version": c.data_version(),
    }
