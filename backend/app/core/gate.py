"""
Kiri — Access gate for the hosted test build

In server mode the whole site (pages, assets and API) sits behind one shared
password. A visitor who has not entered it sees only the password page.

* The password is compared in constant time.
* A correct password sets a signed, HttpOnly, SameSite=Lax cookie that expires
  after KIRI_ACCESS_SESSION_DAYS. The cookie holds an expiry time and an HMAC,
  never the password. Changing the password invalidates every cookie.
* Wrong attempts are counted per client address, with a lockout.
* /api/health stays open so the host can check that the app is alive. It
  reveals nothing but "ok".

This is an ASGI middleware, so it also covers static files and any route added
later. It is deliberately not a FastAPI dependency that each route must opt in to.
"""

import hashlib
import hmac
import json
import re
import time
from pathlib import Path
from urllib.parse import parse_qs

from app.core.config import settings

COOKIE_NAME = "kiri_gate"
LOGIN_PATH = "/gate/login"
LOGOUT_PATH = "/gate/logout"
OPEN_PATHS = {"/api/health", "/robots.txt"}
MAX_BODY_BYTES = 4096

_VERIFY_NAME = re.compile(r"[A-Za-z0-9_.-]{1,80}\.txt")
_VERIFY_BODY = re.compile(r"[A-Za-z0-9_-]{1,200}")


def _verification_files(spec: str) -> dict[str, bytes]:
    """Parse KIRI_VERIFICATION_FILES. Only plain tokens in root-level .txt files."""
    files: dict[str, bytes] = {}
    for item in spec.split(";"):
        name, _, body = item.strip().partition(":")
        if _VERIFY_NAME.fullmatch(name) and _VERIFY_BODY.fullmatch(body) and name != "robots.txt":
            files["/" + name] = body.encode()
    return files


VERIFICATION_FILES = _verification_files(settings.KIRI_VERIFICATION_FILES)

_PAGE = (Path(__file__).parent / "gate_page.html").read_text(encoding="utf-8")
# The mascot on the password page. Public artwork, so it is served before the password.
GATE_IMAGE_PATH = "/gate/kiri.jpg"
_GATE_IMAGE = (Path(__file__).parent / "gate_kiri.jpg").read_bytes()


def _signing_key() -> bytes:
    # Derived from the signing secret and the password, so rotating either one
    # signs everybody out.
    return hashlib.sha256(
        b"kiri-gate\x00" + settings.JWT_SECRET_KEY.encode() + b"\x00" + settings.KIRI_ACCESS_PASSWORD.encode()
    ).digest()


def make_cookie(now: float | None = None) -> str:
    expires = int((now or time.time()) + settings.KIRI_ACCESS_SESSION_DAYS * 86400)
    sig = hmac.new(_signing_key(), str(expires).encode(), hashlib.sha256).hexdigest()
    return f"{expires}.{sig}"


def cookie_is_valid(value: str | None, now: float | None = None) -> bool:
    if not value or "." not in value:
        return False
    expires_s, _, sig = value.partition(".")
    if not expires_s.isdigit():
        return False
    expected = hmac.new(_signing_key(), expires_s.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return False
    return int(expires_s) > (now or time.time())


def password_matches(candidate: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(candidate.encode("utf-8")).digest(),
        hashlib.sha256(settings.KIRI_ACCESS_PASSWORD.encode("utf-8")).digest(),
    )


class _Attempts:
    """Wrong-password counter per client address, with a lockout."""

    def __init__(self):
        self._fails: dict[str, tuple[int, float]] = {}  # address -> (count, locked_until)

    def locked_for(self, address: str, now: float) -> int:
        count, locked_until = self._fails.get(address, (0, 0.0))
        if locked_until > now:
            return int(locked_until - now) + 1
        if locked_until and locked_until <= now:
            self._fails.pop(address, None)
        return 0

    def record_failure(self, address: str, now: float) -> None:
        if len(self._fails) > 10_000:  # bound memory if someone sprays addresses
            self._fails = {a: v for a, v in self._fails.items() if v[1] > now}
        count, _ = self._fails.get(address, (0, 0.0))
        count += 1
        locked_until = 0.0
        if count >= settings.KIRI_ACCESS_MAX_ATTEMPTS:
            locked_until = now + settings.KIRI_ACCESS_LOCKOUT_MINUTES * 60
        self._fails[address] = (count, locked_until)

    def clear(self, address: str) -> None:
        self._fails.pop(address, None)


attempts = _Attempts()


def _headers(scope) -> dict[str, str]:
    return {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}


def _client_address(scope, headers: dict[str, str]) -> str:
    # Behind the host's proxy the real client is the last address the proxy added.
    forwarded = headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    client = scope.get("client")
    return client[0] if client else "unknown"


def _cookies(headers: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in headers.get("cookie", "").split(";"):
        name, sep, value = part.strip().partition("=")
        if sep:
            out[name] = value
    return out


def _is_https(scope, headers: dict[str, str]) -> bool:
    return headers.get("x-forwarded-proto", scope.get("scheme", "http")) == "https"


async def _send(send, status: int, body: bytes, content_type: str, extra: list[tuple[bytes, bytes]] | None = None):
    headers = [
        (b"content-type", content_type.encode()),
        (b"content-length", str(len(body)).encode()),
        (b"cache-control", b"no-store"),
        (b"x-robots-tag", b"noindex, nofollow"),
        (b"x-frame-options", b"DENY"),
        (b"x-content-type-options", b"nosniff"),
        (b"referrer-policy", b"no-referrer"),
        (
            b"content-security-policy",
            b"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        ),
    ]
    await send({"type": "http.response.start", "status": status, "headers": headers + (extra or [])})
    await send({"type": "http.response.body", "body": body})


def _page(state: str = "", minutes: int = 0) -> bytes:
    return _PAGE.replace("{{STATE}}", state).replace("{{MINUTES}}", str(minutes)).encode("utf-8")


class AccessGateMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "lifespan":
            return await self.app(scope, receive, send)
        if scope["type"] != "http":
            # No websocket is served without the cookie either.
            headers = _headers(scope)
            if cookie_is_valid(_cookies(headers).get(COOKIE_NAME)):
                return await self.app(scope, receive, send)
            await send({"type": "websocket.close", "code": 1008})
            return

        path = scope.get("path", "")
        method = scope.get("method", "GET")
        headers = _headers(scope)

        if method in ("GET", "HEAD") and path in VERIFICATION_FILES:
            return await _send(send, 200, VERIFICATION_FILES[path], "text/plain")

        if method in ("GET", "HEAD") and path == GATE_IMAGE_PATH:
            return await _send(send, 200, _GATE_IMAGE, "image/jpeg")

        if path in OPEN_PATHS:
            if path == "/robots.txt":
                return await _send(send, 200, b"User-agent: *\nDisallow: /\n", "text/plain; charset=utf-8")
            return await self.app(scope, receive, send)

        if path == LOGIN_PATH and method == "POST":
            return await self._login(scope, receive, send, headers)

        if path == LOGOUT_PATH and method == "POST":
            clear = f"{COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax".encode()
            return await _send(send, 303, b"", "text/plain", [(b"location", b"/"), (b"set-cookie", clear)])

        if cookie_is_valid(_cookies(headers).get(COOKIE_NAME)):
            return await self.app(scope, receive, send)

        if path.startswith("/api/"):
            body = json.dumps({"status": "error", "errors": ["Enter the test-build password first."]}).encode()
            return await _send(send, 401, body, "application/json")
        if method not in ("GET", "HEAD"):
            return await _send(send, 401, b"", "text/plain")
        return await _send(send, 401, _page(), "text/html; charset=utf-8")

    async def _login(self, scope, receive, send, headers):
        now = time.time()
        address = _client_address(scope, headers)

        wait = attempts.locked_for(address, now)
        if wait:
            return await _send(send, 429, _page("locked", wait // 60 + 1), "text/html; charset=utf-8")

        body = b""
        while True:
            message = await receive()
            body += message.get("body", b"")
            if len(body) > MAX_BODY_BYTES:
                return await _send(send, 413, _page("wrong"), "text/html; charset=utf-8")
            if not message.get("more_body"):
                break

        fields = parse_qs(body.decode("utf-8", errors="replace"))
        candidate = (fields.get("password") or [""])[0]

        if not password_matches(candidate):
            attempts.record_failure(address, now)
            wait = attempts.locked_for(address, now)
            if wait:
                return await _send(send, 429, _page("locked", wait // 60 + 1), "text/html; charset=utf-8")
            return await _send(send, 401, _page("wrong"), "text/html; charset=utf-8")

        attempts.clear(address)
        max_age = settings.KIRI_ACCESS_SESSION_DAYS * 86400
        cookie = f"{COOKIE_NAME}={make_cookie(now)}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax"
        if _is_https(scope, headers):
            cookie += "; Secure"
        return await _send(
            send, 303, b"", "text/plain", [(b"location", b"/"), (b"set-cookie", cookie.encode())]
        )
