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
