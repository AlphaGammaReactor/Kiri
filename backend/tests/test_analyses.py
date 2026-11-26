"""Survival and expression analyses on a synthetic cohort with known effects."""

import numpy as np
import pandas as pd
import pytest

from app.analyses import expression, survival
from app.cohorts.store import Cohort


def make_cohort(n=300, n_normal=40, hr=2.0, shift=1.0, seed=1):
    rng = np.random.default_rng(seed)
    rows, gene = [], []
    for i in range(n):
        x = rng.normal(5, 1)
        rate = 0.02 * (hr if x > 5 else 1.0)
        t = rng.exponential(1 / rate) * 30.4375
        cens = rng.uniform(0, 120) * 30.4375
        rows.append({"id": f"TCGA-AA-{i:04d}-01A", "case": f"TCGA-AA-{i:04d}", "type": "tumor", "project": "TCGA-COAD",
                     "stage": ["I", "II", "III", "IV"][i % 4], "age": float(rng.integers(30, 85)), "sex": "female",
                     "os_time": float(min(t, cens)), "os_event": int(t <= cens)})
        gene.append(x + (0.8 if i % 4 == 3 else 0))
    for i in range(n_normal):
        rows.append({"id": f"TCGA-AA-{i:04d}-11A", "case": f"TCGA-AA-{i:04d}", "type": "normal", "project": "TCGA-COAD",
                     "stage": "", "age": None, "sex": "", "os_time": None, "os_event": None})
        gene.append(rng.normal(5 - shift, 1))
    s = pd.DataFrame(rows)
    return Cohort("TEST", ["TCGA-COAD"], s, "synthetic", "log2(TPM + 1)", "2026-11-26", {"G": np.array(gene)})


def codes(res):
    return {c["check"]: (c["status"], c["code"]) for c in res["checks"]}


def test_tumour_vs_normal_finds_shift():
    r = expression.tumour_vs_normal(make_cohort(), "G")
    assert r["test"]["name"] == "wilcoxon_rank_sum"
    assert r["test"]["p"] < 1e-6
    assert r["effect"]["median_diff"] > 0.5
    assert r["groups"][0]["n"] == 300 and r["groups"][1]["n"] == 40
    assert codes(r)["assumptions"] == ("caution", "assume.someMatched")


def test_paired():
    r = expression.tumour_vs_normal(make_cohort(), "G", paired=True)
    assert r["paired"] and r["test"]["name"] == "wilcoxon_signed_rank"
    assert r["pairs"]["n"] == 40


def test_too_few_normal():
    r = expression.tumour_vs_normal(make_cohort(n_normal=2), "G")
    assert r["error"] == "too_few_normal"


def test_by_stage():
    r = expression.by_stage(make_cohort(), "G")
    assert [g["key"] for g in r["groups"]] == ["I", "II", "III", "IV"]
    assert r["test"]["p"] < 0.001
    assert len(r["pairwise"]) == 6
    assert all(p["p_adj"] >= p["p"] for p in r["pairwise"])


@pytest.mark.parametrize("cut", ["median", "quartile", "optimal"])
def test_survival_detects_hazard(cut):
    r = survival.run(make_cohort(), "G", cut=cut, adjust=["age", "stage"])
    assert r["cox"]["hr"] > 1.3
    assert r["logrank"]["p"] < 0.05
    assert r["groups"]["high"]["n"] + r["groups"]["low"]["n"] <= 300
    assert len(r["at_risk"]["ticks"]) == len(r["at_risk"]["high"])
    assert r["cox_adjusted"]["covariates"] == ["high", "age", "stage_n"]
    if cut == "optimal":
        assert r["p_report"] >= r["cut_info"]["p_min"]
        assert codes(r)["multiple"][1] == "multiple.optimalAdjusted"


def test_survival_null_is_not_significant_and_flags_instability():
    r = survival.run(make_cohort(hr=1.0, seed=3), "G")
    assert 0.6 < r["cox"]["hr"] < 1.6
    assert codes(r)["effect"][1] == "effect.hrIncludes1"


def test_results_are_json_safe():
    import json
    json.dumps(survival.run(make_cohort(), "G"), allow_nan=False)
    json.dumps(expression.tumour_vs_normal(make_cohort(), "G"), allow_nan=False)
    json.dumps(expression.by_stage(make_cohort(), "G"), allow_nan=False)
