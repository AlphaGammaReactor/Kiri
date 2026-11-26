"""
The hosted test build: one shared password in front of everything, uploads off.
"""
import time

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core import gate
from app.core.config import Settings, settings
from app.core.guards import require_private_data_allowed

PASSWORD = "correct-horse-battery"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "KIRI_SERVER_MODE", True)
    monkeypatch.setattr(settings, "KIRI_ACCESS_PASSWORD", PASSWORD)
    monkeypatch.setattr(settings, "KIRI_ACCESS_MAX_ATTEMPTS", 3)
    gate.attempts._fails.clear()

    app = FastAPI()

    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    @app.get("/api/v1/secret")
    async def secret():
        return {"secret": "data"}

    @app.post("/api/v1/uploads/x/files", dependencies=[Depends(require_private_data_allowed)])
    async def upload():
        return {"stored": True}

    @app.get("/{path:path}")
    async def page(path: str):
        return {"page": path}

    app.add_middleware(gate.AccessGateMiddleware)
    return TestClient(app, follow_redirects=False)


def sign_in(client):
    resp = client.post("/gate/login", data={"password": PASSWORD})
    assert resp.status_code == 303
    return resp


class TestClosedByDefault:
    def test_pages_show_only_the_password_page(self, client):
        resp = client.get("/projects/123")
        assert resp.status_code == 401
        assert "Kiri" in resp.text and 'name="password"' in resp.text
        assert "page" not in resp.headers.get("content-type", "") or "projects" not in resp.text

    def test_api_is_refused_as_json(self, client):
        resp = client.get("/api/v1/secret")
        assert resp.status_code == 401
        assert "secret" not in resp.json()

    def test_writes_are_refused(self, client):
        assert client.post("/api/v1/uploads/x/files").status_code == 401
        assert client.delete("/anything").status_code == 401

    def test_health_is_open_and_says_nothing_else(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200 and resp.json() == {"status": "ok"}

    def test_robots_disallows_everything(self, client):
        assert "Disallow: /" in client.get("/robots.txt").text

    def test_gate_page_headers(self, client):
        resp = client.get("/")
        assert resp.headers["x-frame-options"] == "DENY"
        assert resp.headers["cache-control"] == "no-store"
        assert "noindex" in resp.headers["x-robots-tag"]
        assert "default-src 'none'" in resp.headers["content-security-policy"]


class TestSignIn:
    def test_wrong_password_is_refused(self, client):
        resp = client.post("/gate/login", data={"password": "nope"})
        assert resp.status_code == 401
        assert 'data-state="wrong"' in resp.text
        assert "set-cookie" not in resp.headers

    def test_empty_password_is_refused(self, client):
        assert client.post("/gate/login", data={}).status_code == 401

    def test_right_password_opens_everything(self, client):
        resp = sign_in(client)
        cookie = resp.headers["set-cookie"]
        assert "HttpOnly" in cookie and "SameSite=Lax" in cookie
        assert PASSWORD not in cookie
        assert client.get("/api/v1/secret").json() == {"secret": "data"}
        assert client.get("/projects/123").json() == {"page": "projects/123"}

    def test_cookie_is_secure_behind_https(self, client):
        resp = client.post("/gate/login", data={"password": PASSWORD}, headers={"x-forwarded-proto": "https"})
        assert "Secure" in resp.headers["set-cookie"]

    def test_lockout_after_repeated_wrong_passwords(self, client):
        for _ in range(3):
            client.post("/gate/login", data={"password": "nope"})
        resp = client.post("/gate/login", data={"password": PASSWORD})
        assert resp.status_code == 429  # even the right password waits out the lockout
        assert 'data-state="locked"' in resp.text

    def test_oversized_login_body_is_refused(self, client):
        assert client.post("/gate/login", data={"password": "x" * 10_000}).status_code == 413

    def test_sign_out(self, client):
        sign_in(client)
        client.post("/gate/logout")
        client.cookies.clear()
        assert client.get("/api/v1/secret").status_code == 401


class TestCookie:
    @pytest.fixture(autouse=True)
    def _password(self, monkeypatch):
        monkeypatch.setattr(settings, "KIRI_ACCESS_PASSWORD", PASSWORD)

    def test_forged_and_malformed_cookies_fail(self):
        good = gate.make_cookie()
        expires, sig = good.split(".")
        assert gate.cookie_is_valid(good)
        assert not gate.cookie_is_valid(f"{int(expires) + 1}.{sig}")   # tampered expiry
        assert not gate.cookie_is_valid(f"{expires}.{'0' * len(sig)}")
        for bad in (None, "", "abc", "1.2.3", f"{expires}", "x.y"):
            assert not gate.cookie_is_valid(bad)

    def test_cookie_expires(self):
        cookie = gate.make_cookie(now=time.time() - 8 * 86400)
        assert not gate.cookie_is_valid(cookie)

    def test_changing_the_password_signs_everyone_out(self, monkeypatch):
        cookie = gate.make_cookie()
        monkeypatch.setattr(settings, "KIRI_ACCESS_PASSWORD", "a-different-password")
        assert not gate.cookie_is_valid(cookie)


class TestUploadsOffInServerMode:
    def test_private_data_routes_are_refused_even_when_signed_in(self, client):
        sign_in(client)
        resp = client.post("/api/v1/uploads/x/files")
        assert resp.status_code == 403
        assert "sample and public data" in resp.json()["detail"]

    def test_private_data_routes_work_locally(self, client, monkeypatch):
        sign_in(client)
        monkeypatch.setattr(settings, "KIRI_SERVER_MODE", False)
        assert client.post("/api/v1/uploads/x/files").json() == {"stored": True}


class TestSettingsFailClosed:
    def test_server_mode_refuses_to_start_without_a_password(self, tmp_path):
        with pytest.raises(ValueError):
            Settings(KIRI_SERVER_MODE=True, KIRI_ACCESS_PASSWORD="", KIRI_DATA_DIR=str(tmp_path), _env_file=None)

    def test_server_mode_refuses_a_short_password(self, tmp_path):
        with pytest.raises(ValueError):
            Settings(KIRI_SERVER_MODE=True, KIRI_ACCESS_PASSWORD="short", KIRI_DATA_DIR=str(tmp_path), _env_file=None)

    def test_no_secret_has_a_usable_default(self, tmp_path):
        a = Settings(KIRI_DATA_DIR=str(tmp_path / "a"), _env_file=None)
        b = Settings(KIRI_DATA_DIR=str(tmp_path / "b"), _env_file=None)
        assert len(a.JWT_SECRET_KEY) >= 32 and a.JWT_SECRET_KEY != b.JWT_SECRET_KEY
        assert a.INVITE_CODE == "" and a.HOST == "127.0.0.1" and a.DEBUG is False
        # and the generated key survives a restart
        assert Settings(KIRI_DATA_DIR=str(tmp_path / "a"), _env_file=None).JWT_SECRET_KEY == a.JWT_SECRET_KEY

    def test_default_database_is_sqlite_in_the_data_folder(self, tmp_path):
        s = Settings(KIRI_DATA_DIR=str(tmp_path), _env_file=None)
        assert s.is_sqlite and s.DATABASE_URL.endswith("/kiri.db")
