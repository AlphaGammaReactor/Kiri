"""Copy number: states, expression by copy number state, and the pack's int8 matrix."""
import gzip

import numpy as np
import pytest

from app.analyses import expression
from app.analyses.tables import rows_for
from app.cohorts import copynumber
from app.cohorts.store import CohortUnavailable
from tests.test_analyses import make_cohort


def test_states():
    assert [copynumber.state_of(x) for x in (0, 1, 2, 3, 4, 5, 9)] == ["deletion", "loss", "normal", "gain", "gain", "amplification", "amplification"]
    assert copynumber.state_of(float("nan")) is None


def test_expression_by_copies():
    c = make_cohort()
    y = c.gene("G")
    rng = np.random.default_rng(5)
    # More copies where expression is higher, a few tumours without a call
    cn = np.clip(np.round(2 + (y - 5) * 1.5 + rng.normal(0, 0.4, len(y))), 0, 8)
    cn[::25] = np.nan
    c.copies = {"G": [None if np.isnan(v) else int(v) for v in cn]}
    r = expression.by_copies(c, "G", "G")
    assert r["kind"] == "expression_cn"
    keys = [g["key"] for g in r["groups"]]
    assert keys == sorted(keys, key=copynumber.STATES.index) and "normal" in keys
    assert r["dosage"]["rho"] > 0.5 and r["test"]["p"] < 1e-6
    rows = rows_for(c, "expression_cn", {"gene": "G", "gene2": "G"})
    assert rows["columns"][3] == "copies" and len(rows["rows"]) == sum(g["n"] for g in r["groups"])
    with pytest.raises(CohortUnavailable):
        c.copy_number("OTHER")


def test_pack_matrix(tmp_path):
    raw = tmp_path / "x.gene-level_ascat3.tsv.gz"
    with gzip.open(raw, "wt") as f:
        f.write("Ensembl_ID\tTCGA-AA-0001-01A\tTCGA-AA-0002-01A\n")
        f.write("ENSG01.3\t2\t5\nENSG02.1\t\t1\n")
    copynumber.convert(raw, {"ENSG01": "MYC", "ENSG02": "PTEN"}, tmp_path)
    rd = copynumber.CopyReader([tmp_path])
    assert rd.has("MYC") and not rd.has("TP53")
    v = rd.values("PTEN", ["TCGA-AA-0001-01B", "TCGA-AA-0002-01A", "TCGA-ZZ-0000-01A"])
    assert np.isnan(v[0]) and v[1] == 1 and np.isnan(v[2])
    assert list(rd.values("MYC", ["TCGA-AA-0002-01A"])) == [5]
