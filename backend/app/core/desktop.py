"""
Kiri — Desktop engine guard

In the desktop app the engine listens on 127.0.0.1 only, but any program or
web page on the same computer could still reach that port. The app shell
starts the engine with a fresh random token (KIRI_DESKTOP_TOKEN) on every
launch and sends it with every request in the X-Kiri-Token header. Requests
without it are refused. /api/health stays open so the shell can see the
engine come up. CORS preflights (OPTIONS) pass, since browsers never attach
custom headers to them; the real request that follows still needs the token.
"""

import hmac

from app.core.config import settings

HEADER = b"x-kiri-token"
OPEN_PATHS = {"/api/health"}


class DesktopTokenMiddleware:
    def __init__(self, app):
        self.app = app
        self.token = settings.KIRI_DESKTOP_TOKEN.encode()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"] in OPEN_PATHS or scope["method"] == "OPTIONS":
            return await self.app(scope, receive, send)
        sent = b""
        for name, value in scope.get("headers", []):
            if name == HEADER:
                sent = value
                break
        if not hmac.compare_digest(sent, self.token):
            await send({"type": "http.response.start", "status": 401,
                        "headers": [(b"content-type", b"application/json")]})
            await send({"type": "http.response.body", "body": b'{"detail":"engine token missing or wrong"}'})
            return
        return await self.app(scope, receive, send)
