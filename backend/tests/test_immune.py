"""Immune context on a synthetic cohort (test fixture): my gene is planted to follow CD8 T cells."""

import numpy as np
import pandas as pd

from app.analyses import immune
from app.cohorts.store import Cohort


def _cohort(n=200, with_markers=True):
    rng = np.random.default_rng(7)
    immune_level = rng.normal(0, 1, n)          # overall immune content
    cd8 = immune_level + rng.normal(0, 0.7, n)  # CD8 on top of it
    genes = {}
    for cell in immune.CELLS:
        base = cd8 if cell["id"] in ("cd8",) else immune_level + rng.normal(0, 0.8, n)
        for g in cell["genes"]:
            if with_markers or g == "PTPRC":
                genes[g] = 5 + base + rng.normal(0, 0.4, n)
    genes["PTPRC"] = 5 + immune_level + rng.normal(0, 0.3, n)
    genes["MYGENE"] = 4 + cd8 + rng.normal(0, 0.6, n)
    ids = [f"S{i:04d}" for i in range(n)]
    s = pd.DataFrame({"id": ids, "case": ids, "type": ["tumor"] * n, "project": ["TEST"] * n})
    return Cohort(name="test", projects=["TEST"], samples=s, source="synthetic", units="log2", built="test", _genes=genes)


def test_immune_finds_cd8():
    r = immune.run(_cohort(), "MYGENE")
    assert "error" not in r, r
    by = {x["id"]: x for x in r["rows"]}
    assert r["top"] == "cd8"
    assert by["cd8"]["rho"] > 0.6 and by["cd8"]["p_adj"] < 0.001
    # after removing overall immune content, CD8 still stands out and the others shrink
    assert by["cd8"]["rho_adj"] > 0.4
    assert abs(by["b"]["rho_adj"]) < abs(by["b"]["rho"])
    assert len(r["points"]["x"]) == 200 and "cd8" in r["points"]["cells"]
    codes = {c["code"] for c in r["checks"]}
    assert {"data.immune", "assume.immuneProxy", "assume.immuneOverall", "multiple.immune", "effect.immune"} <= codes
    t = immune.table(_cohort(), "MYGENE")
    assert t["columns"][:2] == ["sample", "MYGENE"] and len(t["rows"]) == 200


def test_immune_needs_markers():
    r = immune.run(_cohort(with_markers=False), "MYGENE")
    assert r["error"] == "immune_few_markers"
