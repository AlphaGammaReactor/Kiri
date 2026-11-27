"""Importing your own table into a project, and analysing it."""

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient


def _client(tmp_path, monkeypatch):
    from app.kiri import api as kapi
    from app.kiri.fileformat import Workspace
    from app.main import app

    monkeypatch.setattr(kapi, "_ws", Workspace(tmp_path / "data", "test"))
    cl = TestClient(app)
    r = cl.post("/api/v1/kiri/new", json={"path": str(tmp_path / "own.kiri"), "name": "Own", "template": "own_table"})
    assert r.status_code == 200, r.text
    return cl


def _clinical(n=120, seed=4):
    rng = np.random.default_rng(seed)
    parl = rng.normal(6, 1.2, n)
    rows = []
    for i in range(n):
        rate = 0.02 * (2.0 if parl[i] > 6 else 1.0)
        t, cens = rng.exponential(1 / rate), rng.uniform(5, 90)
        ev = "死亡" if t <= cens else "存活"
        if i < 3:
            ev = "1"
        time = "—" if i in (10, 11) else f"{min(t, cens):.1f}"
        rows.append([f"P-{i:04d}", time, ev, "高" if parl[i] > 6 else "低", f"{parl[i]:.3f}", f"{-0.5 * parl[i] + rng.normal(0, .5):.3f}", ""])
    return pd.DataFrame(rows, columns=["病人编号", "随访月数", "结局", "PARL分组", "PARL", "MAVS", "备注"])


def test_import_chinese_csv_and_analyse(tmp_path, monkeypatch):
    cl = _client(tmp_path, monkeypatch)
    f = tmp_path / "临床随访_2026.csv"
    _clinical().to_csv(f, index=False, encoding="gb18030")
    pv = cl.post("/api/v1/kiri/import/preview", json={"path": str(f)}).json()
    assert pv["encoding"] == "gb18030" and pv["orientation"] == "samples_in_rows"
    assert pv["roles"]["病人编号"] == "sample_id" and pv["roles"]["随访月数"] == "time" and pv["roles"]["结局"] == "event"
    assert pv["roles"]["PARL分组"] == "group" and pv["roles"]["PARL"] == "value" and pv["roles"]["备注"] == "unused"
    assert pv["event_values"] == {"1": 1, "存活": 0, "死亡": 1}
    codes = {c["code"] for c in pv["checks"]}
    assert {"event_mixed", "no_time"} <= codes
    r = cl.post("/api/v1/kiri/import/commit", json={"path": str(f), "roles": pv["roles"], "event_map": pv["event_values"], "name": "临床随访"})
    assert r.status_code == 200, r.text
    ds = r.json()
    assert ds["n_samples"] == 120 and ds["has_survival"] and ds["groups"] == ["低", "高"]
    cs = cl.get("/api/v1/kiri/cohort").json()
    assert cs["own"]["name"] == "临床随访" and cs["projects"] == [ds["id"]]
    assert cl.get("/api/v1/kiri/project").json()["project"]["targets"] == ["PARL", "MAVS"]
    s = cl.post("/api/v1/kiri/analyses/run", json={"kind": "survival", "gene": "parl"}).json()
    assert not s["result"].get("error") and s["result"]["cox"]["hr"] > 1, s
    g = cl.post("/api/v1/kiri/analyses/run", json={"kind": "expression_group", "gene": "PARL"}).json()["result"]
    assert g["test"]["name"] == "wilcoxon_rank_sum" and g["test"]["p"] < 1e-6 and {x["key"] for x in g["groups"]} == {"低", "高"}
    c = cl.post("/api/v1/kiri/analyses/run", json={"kind": "correlation", "gene": "PARL", "gene2": "MAVS"}).json()["result"]
    assert c["rho"] < -0.5 and c["n"] == 120
    rows = cl.get(f"/api/v1/kiri/analyses/{s['id']}/rows").json()
    assert len(rows["rows"]) == 118  # two rows without a survival time are left out
    assert cl.get(f"/api/v1/kiri/datasets/{ds['id']}/genes?q=MA").json()["items"] == ["MAVS"]


def test_import_expression_matrix_tsv_and_excel(tmp_path, monkeypatch):
    cl = _client(tmp_path, monkeypatch)
    rng = np.random.default_rng(1)
    genes = ["TP53", "MDM2", "GAPDH", "ACTB", "EGFR", "MYC"]
    m = pd.DataFrame(rng.lognormal(3, 1, (len(genes), 8)), index=genes, columns=[f"S{i}" for i in range(8)])
    m.index.name = "gene"
    f = tmp_path / "matrix.tsv"
    m.to_csv(f, sep="\t")
    pv = cl.post("/api/v1/kiri/import/preview", json={"path": str(f)}).json()
    assert pv["orientation"] == "genes_in_rows" and pv["n_genes"] == 6 and pv["n_samples"] == 8
    r = cl.post("/api/v1/kiri/import/commit", json={"path": str(f), "orientation": "genes_in_rows", "scale": "linear"}).json()
    assert r["n_values"] == 6 and r["units"] == "log2(value + 1)" and not r["has_survival"]
    c = cl.post("/api/v1/kiri/analyses/run", json={"kind": "correlation", "gene": "TP53", "gene2": "MDM2"}).json()
    assert c["result"].get("error") == "too_few_pairs"  # 8 samples is too few, and says so
    x = tmp_path / "clin.xlsx"
    _clinical(40).to_excel(x, index=False)
    pv = cl.post("/api/v1/kiri/import/preview", json={"path": str(x)}).json()
    assert pv["encoding"] == "excel" and pv["roles"]["PARL"] == "value"
    assert cl.post("/api/v1/kiri/import/preview", json={"path": str(tmp_path / "nope.csv")}).json()["error"] == "import_not_found"
