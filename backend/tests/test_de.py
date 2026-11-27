"""Differential expression and enrichment, on a wide table imported as your own data (synthetic test fixture)."""

import numpy as np
import pandas as pd

from tests.test_owndata import _client


def _wide(n=40, genes=300, seed=9):
    rng = np.random.default_rng(seed)
    names = [f"G{i:03d}" for i in range(genes)]
    group = np.array(["treated"] * (n // 2) + ["control"] * (n - n // 2))
    X = rng.normal(5, 1, (n, genes))
    X[group == "treated", :20] += 2.5     # 20 genes up in treated
    X[group == "treated", 20:30] -= 2.5   # 10 genes down
    df = pd.DataFrame(X.round(3), columns=names)
    df.insert(0, "group", group)
    df.insert(0, "sample", [f"S{i:02d}" for i in range(n)])
    return df


def test_de_and_enrichment_on_own_table(tmp_path, monkeypatch):
    from app.analyses import pathways

    sets = {"UP_SET": {"name": "Up set", "genes": [f"G{i:03d}" for i in range(0, 20)] + ["G200", "G201"], "library": "hallmark"},
            "DOWN_SET": {"name": "Down set", "genes": [f"G{i:03d}" for i in range(20, 30)] + ["G250"], "library": "hallmark"},
            "NULL_SET": {"name": "Null", "genes": [f"G{i:03d}" for i in range(100, 140)], "library": "hallmark"}}
    monkeypatch.setattr(pathways, "load", lambda lib: sets)
    cl = _client(tmp_path, monkeypatch)
    f = tmp_path / "wide.csv"
    _wide().to_csv(f, index=False)
    pv = cl.post("/api/v1/kiri/import/preview", json={"path": str(f)}).json()
    assert pv["orientation"] == "samples_in_rows" and pv["roles"]["group"] == "group"
    r = cl.post("/api/v1/kiri/import/commit", json={"path": str(f), "roles": pv["roles"], "event_map": {}, "name": "Wide"})
    assert r.status_code == 200, r.text
    run = cl.post("/api/v1/kiri/analyses/run", json={"kind": "de", "compare": "group", "group_a": "treated", "group_b": "control"})
    assert run.status_code == 200, run.text
    res = run.json()["result"]
    assert not res.get("error"), res
    assert res["labels"] == ["treated", "control"] and res["n"] == [20, 20] and res["n_tested"] == 300
    up = {x["gene"] for x in res["top_up"]}
    down = {x["gene"] for x in res["top_down"]}
    true_up, true_down = {f"G{i:03d}" for i in range(20)}, {f"G{i:03d}" for i in range(20, 30)}
    assert true_up <= up and len(up - true_up) <= 1 and true_down <= down and len(down - true_down) <= 1  # noise may add one
    assert res["enrichment"]["up"][0]["id"] == "UP_SET" and res["enrichment"]["up"][0]["p_adj"] < 1e-10
    assert res["enrichment"]["down"][0]["id"] == "DOWN_SET"
    assert all(x["id"] != "NULL_SET" for x in res["enrichment"]["up"])
    assert "rows" not in res and len(res["volcano"]) == 300
    rows = cl.get(f"/api/v1/kiri/analyses/{run.json()['id']}/rows").json()
    assert rows["columns"][0] == "gene" and len(rows["rows"]) == 300


def test_de_refuses_small_groups_and_short_tables(tmp_path, monkeypatch):
    cl = _client(tmp_path, monkeypatch)
    f = tmp_path / "small.csv"
    _wide(n=12, genes=300).to_csv(f, index=False)
    pv = cl.post("/api/v1/kiri/import/preview", json={"path": str(f)}).json()
    cl.post("/api/v1/kiri/import/commit", json={"path": str(f), "roles": pv["roles"], "event_map": {}, "name": "Small"})
    res = cl.post("/api/v1/kiri/analyses/run", json={"kind": "de", "compare": "group"}).json()["result"]
    assert res["error"] == "de_small_groups" and res["n"] == [6, 6]
    f2 = tmp_path / "short.csv"
    _wide(n=40, genes=20).to_csv(f2, index=False)
    pv = cl.post("/api/v1/kiri/import/preview", json={"path": str(f2)}).json()
    cl.post("/api/v1/kiri/import/commit", json={"path": str(f2), "roles": pv["roles"], "event_map": {}, "name": "Short", "orientation": "samples_in_rows"})
    r = cl.post("/api/v1/kiri/analyses/run", json={"kind": "de", "compare": "group"})
    assert r.status_code == 409 and r.json()["error"] == "de_few_genes"
