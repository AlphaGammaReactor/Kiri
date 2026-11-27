"""DepMap dependency: per-lineage summary, the project's lineage marked, aliases, unknown genes."""
import json

import pandas as pd
import pytest

from app.analyses import dependency
from app.cohorts.store import CohortUnavailable


@pytest.fixture
def table(tmp_path, monkeypatch):
    rows = []
    for g, base in (("KRAS", -0.9), ("PARL", -0.1)):
        for lin, n, shift in (("All", 1000, 0), ("Bowel", 60, -0.3), ("Breast", 50, 0.2), ("Thyroid", 6, 0)):
            m = base + shift
            rows.append({"gene": g, "lineage": lin, "n": n, "q10": m - 0.4, "q25": m - 0.2, "q50": m, "q75": m + 0.2, "q90": m + 0.4,
                         "dep": 0.95 if m <= -0.9 else 0.6 if m <= -0.5 else 0.02})
    pd.DataFrame(rows).to_csv(tmp_path / "depmap_lineage.tsv.gz", sep="\t", index=False)
    (tmp_path / "depmap_release.json").write_text(json.dumps({"release": "DepMap 24Q4 Public"}))
    monkeypatch.setattr(dependency, "DIR", tmp_path)
    dependency._table.cache_clear(); dependency.release.cache_clear()
    yield
    dependency._table.cache_clear(); dependency.release.cache_clear()


def test_run_marks_lineage(table):
    r = dependency.run("KRAS", ["TCGA-COAD", "TCGA-READ"])
    assert [x["lineage"] for x in r["rows"]][0] == "Bowel" and r["focus"]["lineage"] == "Bowel" and r["focus"]["mine"]
    assert r["common_essential"] is True
    assert {c["check"] for c in r["checks"]} >= {"data", "enough", "assumptions"}
    assert dependency.table("KRAS", ["TCGA-COAD"])["rows"][0][0] == "Bowel *"


def test_alias_and_unknown(table):
    r = dependency.run("PSARL", ["TCGA-BRCA"])
    assert r["data_version"]["renamed"] == {"PSARL": "PARL"} and r["focus"]["lineage"] == "Breast" and not r["common_essential"]
    with pytest.raises(CohortUnavailable):
        dependency.run("NOT_A_GENE_XYZ", [])


def test_lineage_map():
    assert dependency.lineages_for(["TCGA-COAD", "TCGA-READ"]) == ["Bowel"]


def test_opentargets_evidence(tmp_path, monkeypatch):
    from app.analyses import opentargets as ot
    pd.DataFrame([{"cancer": "COADREAD", "gene": "APC", "score": 0.9, "somatic_mutation": 0.95, "literature": 0.8},
                  {"cancer": "COADREAD", "gene": "KRAS", "score": 0.85, "somatic_mutation": 0.9, "literature": 0.0},
                  {"cancer": "BRCA", "gene": "KRAS", "score": 0.4, "somatic_mutation": 0.3, "literature": 0.1}]).to_csv(tmp_path / "opentargets_cancer.tsv.gz", sep="\t", index=False)
    (tmp_path / "opentargets_release.json").write_text(json.dumps({"release": "Open Targets Platform 25.6", "diseases": {"COADREAD": {"id": "EFO_x", "name": "colorectal adenocarcinoma"}}}))
    monkeypatch.setattr(ot, "DIR", tmp_path); ot._table.cache_clear(); ot.release.cache_clear()
    e = ot.evidence("KRAS", ["TCGA-COAD", "TCGA-READ"])
    assert e["rank"] == 2 and e["linked"] == 2 and e["types"] == {"somatic_mutation": 0.9} and e["disease"] == "colorectal adenocarcinoma"
    assert ot.evidence("PARL", ["TCGA-COAD"])["score"] is None
    assert ot.evidence("KRAS", ["TCGA-COAD", "TCGA-BRCA"]) is not None and ot.code_for(["TCGA-LUAD", "TCGA-BRCA"]) is None
    ot._table.cache_clear(); ot.release.cache_clear()
