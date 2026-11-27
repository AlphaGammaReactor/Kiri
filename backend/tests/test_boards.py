"""Figure boards are stored in the project file and survive closing and reopening it."""
from fastapi.testclient import TestClient


def test_board_round_trip(tmp_path, monkeypatch):
    from app.kiri import api as kapi
    from app.kiri.fileformat import Workspace
    from app.main import app

    monkeypatch.setattr(kapi, "_ws", Workspace(tmp_path / "data", "test"))
    cl = TestClient(app)
    path = str(tmp_path / "p.kiri")
    assert cl.post("/api/v1/kiri/new", json={"path": path, "name": "P", "cancers": ["COAD"]}).status_code == 200
    assert cl.get("/api/v1/kiri/boards").json() == []

    b = cl.post("/api/v1/kiri/boards", json={"title": "Figure 2 for the thesis"}).json()
    assert b["width"] == "double" and b["cols"] == 2 and b["size"] == 7 and b["panels"] == []
    r = cl.put(f"/api/v1/kiri/boards/{b['id']}", json={**b, "panels": ["a1", "a2"], "width": "single", "cols": 1, "letters": "lower"})
    assert r.status_code == 200, r.text
    assert r.json()["panels"] == ["a1", "a2"]
    assert cl.put(f"/api/v1/kiri/boards/{b['id']}", json={**b, "cols": 5}).status_code == 422
    assert cl.put("/api/v1/kiri/boards/nope", json=b).status_code == 404

    cl.post("/api/v1/kiri/close")
    assert cl.post("/api/v1/kiri/open", json={"path": path}).status_code == 200
    boards = cl.get("/api/v1/kiri/boards").json()
    assert len(boards) == 1 and boards[0]["title"] == "Figure 2 for the thesis" and boards[0]["letters"] == "lower"
    assert "type" not in boards[0]

    assert cl.delete(f"/api/v1/kiri/boards/{b['id']}").status_code == 200
    assert cl.get("/api/v1/kiri/boards").json() == []
