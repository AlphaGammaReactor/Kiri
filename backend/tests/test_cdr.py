"""PFI and DSS from the TCGA-CDR table, matched to patients by barcode."""
import numpy as np
import pandas as pd
import pytest

from app.analyses import survival
from app.analyses.tables import rows_for
from app.cohorts import cdr
from app.cohorts.store import CohortUnavailable
from tests.test_analyses import make_cohort


@pytest.fixture
def cdr_file(tmp_path, monkeypatch):
    c = make_cohort()
    t = c.samples[c.samples["type"] == "tumor"][["case", "os_time", "os_event"]].drop_duplicates("case")
    rng = np.random.default_rng(3)
    df = pd.DataFrame({"case": t["case"], "type": "COAD",
                       "PFI": t["os_event"].astype(int), "PFI.time": (t["os_time"] * rng.uniform(0.3, 1.0, len(t))).round(),
                       "DSS": t["os_event"].astype(int), "DSS.time": t["os_time"].round()})
    f = tmp_path / "tcga_cdr.tsv.gz"
    df.to_csv(f, sep="\t", index=False)
    monkeypatch.setattr(cdr, "FILE", f)
    cdr.table.cache_clear()
    yield c
    cdr.table.cache_clear()


def test_pfi_runs_and_is_labelled(cdr_file):
    r = survival.run(cdr_file, "G", endpoint="PFI")
    assert r["endpoint"] == "PFI" and "error" not in r
    assert r["data_version"]["endpoint_source"].startswith("TCGA-CDR")
    assert r["checks"][0]["code"] == "data.patientsCdr"
    os_ = survival.run(cdr_file, "G")
    assert os_["endpoint"] == "OS" and os_["groups"]["high"]["n"] == r["groups"]["high"]["n"]
    # PFI times are shorter than OS here, so the curves differ
    assert r["groups"]["high"]["time"] != os_["groups"]["high"]["time"]
    rows = rows_for(cdr_file, "survival", {"gene": "G", "endpoint": "PFI"})
    assert len(rows["rows"]) == r["groups"]["high"]["n"] + r["groups"]["low"]["n"]


def test_missing_table_is_reported(tmp_path, monkeypatch):
    monkeypatch.setattr(cdr, "FILE", tmp_path / "none.tsv.gz")
    cdr.table.cache_clear()
    with pytest.raises(CohortUnavailable) as e:
        survival.run(make_cohort(), "G", endpoint="PFI")
    assert e.value.code == "endpoint_unavailable"
    cdr.table.cache_clear()
