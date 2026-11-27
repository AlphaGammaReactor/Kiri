"""Data folder, cohort removal and problem reports."""

import json

from fastapi.testclient import TestClient


def test_storage_lists_and_removes_cohorts(tmp_path, monkeypatch):
    from app.core.config import settings
    from app.main import app

    monkeypatch.setattr(settings, "KIRI_DATA_DIR", str(tmp_path))
    d = tmp_path / "cohorts" / "TCGA-READ"
    d.mkdir(parents=True)
    (d / "expr.npy").write_bytes(b"x" * 1000)
    (d / "ready.json").write_text(json.dumps({"project": "TCGA-READ", "genes": 10, "samples": 5}))
    cl = TestClient(app)
    r = cl.get("/api/v1/kiri/storage").json()
    assert r["data_dir"] == str(tmp_path)
    assert r["cohorts"][0]["project"] == "TCGA-READ" and r["cohorts"][0]["ready"] and r["cohorts"][0]["samples"] == 5
    assert r["cohort_bytes"] >= 1000 and r["free_bytes"] > 0
    assert cl.delete("/api/v1/kiri/storage/cohort", params={"project": "../x"}).status_code == 400
    assert cl.delete("/api/v1/kiri/storage/cohort", params={"project": "TCGA-READ"}).json() == {"ok": True}
    assert not d.exists()


def test_report_shows_what_is_sent_and_nothing_private(monkeypatch):
    from app.main import app
    from app.kiri import system_api

    opened = []
    monkeypatch.setattr(system_api.webbrowser, "open", opened.append)
    cl = TestClient(app)
    body = {"text": "Survival stopped\nmore detail", "lang": "zh", "level": "learn", "screen": "survival", "error": "gene_not_in_cohort"}
    d = cl.post("/api/v1/kiri/report/preview", json=body).json()["diagnostics"]
    assert "lang zh" in d and "last error gene_not_in_cohort" in d and "/" not in d.split("\n")[1]
    r = cl.post("/api/v1/kiri/report/open", json=body).json()
    assert opened == [r["url"]] and r["url"].startswith(system_api.ISSUES) and "Survival%20stopped" in r["url"]
