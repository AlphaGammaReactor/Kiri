"""PanCanAtlas subtypes and ABSOLUTE purity: expression by subtype, purity as a Cox covariate."""
import numpy as np
import pandas as pd
import pytest

from app.analyses import expression, survival
from app.analyses.tables import rows_for
from app.cohorts import pancan
from tests.test_analyses import make_cohort


@pytest.fixture
def tables(tmp_path, monkeypatch):
    ids = [f"TCGA-AA-{i:04d}-01" for i in range(300)]
    sub = ["COAD.CIN" if i % 3 == 0 else "COAD.MSI" if i % 3 == 1 else "COAD.GS" for i in range(300)]
    sub[5] = "COAD.HM-SNV"  # a subtype with one tumour: left out and named
    pd.DataFrame({"sample": ids[:290], "cancer": "COAD", "subtype": sub[:290]}).to_csv(tmp_path / "tcga_subtypes.tsv.gz", sep="\t", index=False)
    rng = np.random.default_rng(3)
    pd.DataFrame({"sample": ids[:280], "purity": rng.uniform(0.3, 0.9, 280).round(3), "ploidy": 2.0}).to_csv(tmp_path / "tcga_purity.tsv.gz", sep="\t", index=False)
    monkeypatch.setattr(pancan, "DIR", tmp_path)
    pancan._table.cache_clear()
    yield
    pancan._table.cache_clear()


def test_short():
    assert pancan.short("BRCA.LumA") == "LumA" and pancan.short("GBM_LGG.G-CIMP-high") == "G-CIMP-high" and pancan.short("x") == "x"


def test_expression_by_subtype(tables):
    c = make_cohort()
    y = c.gene("G")
    for i in range(300):  # MSI tumours express more
        if i % 3 == 1:
            y[i] += 1.5
    r = expression.by_subtype(c, "G")
    assert r["kind"] == "expression_subtype"
    keys = {g["key"] for g in r["groups"]}
    assert keys == {"CIN", "MSI", "GS"}
    assert r["test"]["p"] < 1e-6
    data = next(ch for ch in r["checks"] if ch["check"] == "data")
    assert data["code"] == "data.groupsSubtype" and data["vars"]["no_subtype"] == 10 and data["vars"]["small"] == "HM-SNV"
    rows = rows_for(c, "expression_subtype", {"gene": "G"})
    assert len(rows["rows"]) == 290


def test_no_subtypes_for_unknown_ids(tables):
    c = make_cohort()
    c.samples["id"] = c.samples["id"].str.replace("TCGA-AA", "TCGA-ZZ")
    r = expression.by_subtype(c, "G")
    assert r["error"] == "no_subtypes"


def test_purity_covariate(tables):
    r = survival.run(make_cohort(), "G", adjust=["purity"])
    adj = r["cox_adjusted"]
    assert adj["covariates"] == ["high", "purity"] and adj["n"] == 280
    assert adj["hr"] > 1
