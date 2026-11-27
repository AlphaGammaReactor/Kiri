"""Bench data: qPCR ΔΔCt and plain measurements, on small hand-made tables (test fixtures)."""

import math

from app.analyses import bench

QPCR = """Sample\tGroup\tGene\tCt
C1\tControl\tGAPDH\t18.0
C1\tControl\tGAPDH\t18.2
C1\tControl\tMAVS\t25.0
C1\tControl\tMAVS\t25.2
C2\tControl\tGAPDH\t18.1
C2\tControl\tMAVS\t25.3
C3\tControl\tGAPDH\t17.9
C3\tControl\tMAVS\t24.9
K1\tsiPARL\tGAPDH\t18.0
K1\tsiPARL\tMAVS\t23.0
K2\tsiPARL\tGAPDH\t18.2
K2\tsiPARL\tMAVS\t23.3
K3\tsiPARL\tGAPDH\t18.1
K3\tsiPARL\tMAVS\tUndetermined
K4\tsiPARL\tGAPDH\t17.8
K4\tsiPARL\tMAVS\t22.7
"""


def test_qpcr_ddct():
    r = bench.run("qpcr", QPCR)
    assert "error" not in r, r
    assert r["ref"] == "GAPDH" and r["control"] == "Control" and r["targets"] == ["MAVS"]
    g = {x["group"]: x for x in r["panels"][0]["groups"]}
    assert g["Control"]["n"] == 3 and abs(g["Control"]["mean"]) < 1e-9  # control centred on 0
    assert g["siPARL"]["n"] == 3  # the undetermined sample has no ΔCt
    # ΔCt control ≈ 7.0, siPARL ≈ 5.0 → about 2 cycles → ~4-fold up
    assert 1.8 < g["siPARL"]["mean"] < 2.3 and 3.5 < g["siPARL"]["fold"] < 5
    assert g["siPARL"]["p"] < 0.01
    codes = {c["code"] for c in r["checks"]}
    assert {"data.bench", "assume.benchLog", "assume.benchRef"} <= codes


def test_qpcr_errors():
    assert bench.run("qpcr", "a\tb\tc\td")["error"] == "bench_empty"
    r = bench.run("qpcr", QPCR, ref="ACTB")
    assert r["error"] == "bench_no_ref" and r["genes"] == ["GAPDH", "MAVS"]


def test_values_three_groups_and_csv():
    text = "group,value\n" + "\n".join(f"{g},{v}" for g, vs in {"WT": [1.0, 1.1, 0.9, 1.05], "KO": [2.0, 2.2, 1.9, 2.1], "KO+R": [1.1, 1.0, 1.2, 0.95]}.items() for v in vs)
    r = bench.run("values", text, control="WT")
    p = r["panels"][0]
    g = {x["group"]: x for x in p["groups"]}
    assert r["groups"] == ["WT", "KO", "KO+R"] and p["test"] == "welch_anova_holm"
    assert g["KO"]["p_adj"] < 0.01 and g["KO+R"]["p_adj"] > 0.05 and p["overall_p"] < 0.001
    rl = bench.run("values", text, control="WT", log=True)
    assert math.isclose(rl["panels"][0]["groups"][0]["values"][0], 0.0, abs_tol=1e-9)
