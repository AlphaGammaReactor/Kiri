"""
The password-gated product website (app.site): gate, pages, and Mac download lookup.
"""
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from app import site
from app.core import gate
from app.core.config import settings

PASSWORD = "correct-horse-battery"
SITE = Path(__file__).resolve().parents[2] / "website" / "public"


def _asset(name, size=50_000_000):
    return {"name": name, "browser_download_url": f"https://example.test/{name}", "size": size}


def test_pick_prefers_apple_silicon_and_offers_intel():
    releases = [
        {"draft": True, "tag_name": "v0.2.0", "assets": [_asset("Kiri_0.2.0_aarch64.dmg")]},
        {"draft": False, "tag_name": "v0.1.0", "assets": [_asset("Kiri_0.1.0_x64.dmg"), _asset("Kiri_0.1.0_aarch64.dmg"), _asset("latest.json")]},
    ]
    picked = site.pick_mac_assets(releases)
    assert picked["mac"]["file"] == "Kiri_0.1.0_aarch64.dmg"
    assert picked["mac"]["version"] == "0.1.0"
    assert picked["mac_intel"]["file"] == "Kiri_0.1.0_x64.dmg"


def test_pick_falls_back_to_any_dmg_and_none():
    only = [{"draft": False, "tag_name": "v1", "assets": [_asset("Kiri.dmg")]}]
    assert site.pick_mac_assets(only)["mac"]["file"] == "Kiri.dmg"
    assert site.pick_mac_assets(only)["mac_intel"] is None
    assert site.pick_mac_assets([{"draft": False, "assets": [_asset("x.zip")]}]) is None
    assert site.pick_mac_assets([]) is None


@pytest.fixture
def client(monkeypatch):
    if not (SITE / "index.html").is_file():
        pytest.skip("website not built (python website/src/build.py)")
    monkeypatch.setattr(settings, "KIRI_SERVER_MODE", True)
    monkeypatch.setattr(settings, "KIRI_ACCESS_PASSWORD", PASSWORD)
    monkeypatch.setattr(settings, "KIRI_SITE_DIR", str(SITE))
    monkeypatch.setitem(site._cache, "at", 1e18)  # never call GitHub in tests
    monkeypatch.setitem(site._cache, "value", None)
    gate.attempts._fails.clear()
    return TestClient(site.app)


def test_site_is_gated_then_served(client):
    assert client.get("/").status_code == 401
    assert client.get("/api/health").status_code == 200
    assert client.get("/gate/kiri.jpg").status_code == 200
    r = client.post("/gate/login", data={"password": PASSWORD}, follow_redirects=False)
    assert r.status_code == 303
    home = client.get("/")
    assert home.status_code == 200 and "Download Kiri" in home.text
    assert client.get("/zh/").status_code == 200
    assert client.get("/install-mac").status_code == 200
    assert client.get("/no-such-page").status_code == 404
    assert client.get("/../backend/app/site.py").status_code in (404, 401)


def test_no_release_means_coming_soon(client):
    client.post("/gate/login", data={"password": PASSWORD})
    assert client.get("/api/release").json() == {"mac": None, "mac_intel": None}
    r = client.get("/download/mac", follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"] == "/install-mac.html"
