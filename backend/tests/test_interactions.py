"""Interactions with the online sources replaced by a small stand-in (synthetic test fixture)."""

import numpy as np
import pandas as pd
import pytest

from app.analyses import interactions as I
from app.cohorts.store import Cohort, CohortUnavailable

FAKE = {
    "gene": "MYG", "fetched": "2026-11-27", "string_version": "12.0",
    "partners": [{"gene": "PA", "score": 0.95, "experiments": 0.9, "databases": 0.9, "textmining": 0.5, "coexpression": 0.1,
                  "neighborhood": 0, "fusion": 0, "cooccurrence": 0},
                 {"gene": "PB", "score": 0.6, "experiments": 0.0, "databases": 0.0, "textmining": 0.6, "coexpression": 0.0,
                  "neighborhood": 0, "fusion": 0, "cooccurrence": 0},
                 {"gene": "PC", "score": 0.5, "experiments": 0.3, "databases": 0.0, "textmining": 0.2, "coexpression": 0.2,
                  "neighborhood": 0, "fusion": 0, "cooccurrence": 0}],
    "edges": [["PA", "PB", 0.7]],
    "protein": {"accession": "Q00000", "name": "Test protein", "length": 300, "locations": ["Mitochondrion inner membrane"],
                "features": [{"kind": "tm", "start": 20, "end": 40, "label": "Helical"}, {"kind": "domain", "start": 80, "end": 200, "label": "Peptidase S54"}]},
    "alphafold": {"id": "AF-Q00000-F1", "version": 4, "mean": 80.0, "plddt": [95.0] * 200 + [40.0] * 100},
}


@pytest.fixture(autouse=True)
def _fake(monkeypatch, tmp_path):
    monkeypatch.setattr(I, "BUNDLED", tmp_path / "none")
    calls = {"n": 0}

    def fetch(g):
        calls["n"] += 1
        return dict(FAKE, gene=g)
    monkeypatch.setattr(I, "fetch", fetch)
    return calls


def _cohort(n=120):
    rng = np.random.default_rng(3)
    x = rng.normal(5, 1, n)
    genes = {"MYG": x, "PA": x + rng.normal(0, 0.5, n), "PB": rng.normal(5, 1, n)}  # PC not in the data
    ids = [f"S{i}" for i in range(n)]
    s = pd.DataFrame({"id": ids, "case": ids, "type": ["tumor"] * n, "project": ["T"] * n})
    return Cohort(name="test", projects=["T"], samples=s, source="synthetic", units="log2", built="test", _genes=genes)


def test_interactions_run(tmp_path, _fake):
    r = I.run(_cohort(), "MYG", tmp_path)
    by = {p["gene"]: p for p in r["partners"]}
    assert by["PA"]["rho"] > 0.7 and by["PA"]["p_adj"] < 0.001
    assert by["PC"].get("rho") is None
    assert r["together"] == ["PA"] and r["n"] == 120
    assert r["bands"] == {"very_high": 67, "confident": 0, "low": 0, "very_low": 33}
    codes = {c["code"] for c in r["checks"]}
    assert {"data.inter", "assume.interString", "assume.interText", "data.interCohort", "data.interMissing", "assume.interPlddt"} <= codes
    # cached: the second run does not fetch again
    I.run(None, "MYG", tmp_path)
    assert _fake["n"] == 1
    t = I.table(_cohort(), "MYG", tmp_path)
    assert t["rows"][0][0] == "PA" and len(t["columns"]) == len(t["rows"][0])


def test_interactions_offline(monkeypatch, tmp_path):
    def boom(g):
        raise OSError("network unreachable")
    monkeypatch.setattr(I, "fetch", boom)
    with pytest.raises(CohortUnavailable) as e:
        I.run(None, "MYG", tmp_path)
    assert e.value.code == "needs_internet"
