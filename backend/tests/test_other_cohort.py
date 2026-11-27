"""Check in another cohort: the same analysis in other TCGA projects, kept apart from the project's own."""
from fastapi.testclient import TestClient


def test_run_in_another_cohort(tmp_path, monkeypatch):
    from app.core.config import settings
    from app.kiri import api as kapi
    from app.kiri.fileformat import Workspace
    from app.main import app

    monkeypatch.setattr(kapi, "_ws", Workspace(tmp_path / "data", "test"))
    monkeypatch.setattr(settings, "KIRI_DATA_DIR", str(tmp_path / "data"))
    cl = TestClient(app)
    assert cl.post("/api/v1/kiri/new", json={"path": str(tmp_path / "p.kiri"), "name": "P", "cancers": ["COAD"]}).status_code == 200

    assert cl.get("/api/v1/kiri/cohort").json()["projects"] == ["TCGA-COAD"]
    other = cl.get("/api/v1/kiri/cohort?projects=TCGA-BRCA,TCGA-BRCA,../x").json()
    assert other["projects"] == ["TCGA-BRCA"] and "TCGA-BRCA" in other["packs"]

    bad = cl.post("/api/v1/kiri/analyses/run", json={"kind": "survival", "gene": "TP53", "projects": ["../etc"]})
    assert bad.status_code == 400 and bad.json()["error"] == "unknown_project"

    r = cl.post("/api/v1/kiri/analyses/run", json={"kind": "survival", "gene": "TP53", "projects": ["TCGA-BRCA"]})
    if r.status_code == 409:  # no bundled data for this cohort offline: it asks for the download of BRCA, not COAD
        assert r.json()["error"] in ("needs_download", "gene_not_in_cohort")
        assert r.json().get("projects", ["TCGA-BRCA"]) == ["TCGA-BRCA"]
        return
    assert r.status_code == 200, r.text
    a = r.json()
    assert a["params"]["projects"] == ["TCGA-BRCA"]
