"""
Kiri — Request Correlation ID Middleware

Assigns a unique UUID to every request, threading it through logs and
crash reports so you can trace any error back to its origin.
"""

import uuid
import logging
from contextvars import ContextVar
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("kiri.middleware")

# Context variable — accessible anywhere in the async call chain
request_id_var: ContextVar[str] = ContextVar("request_id", default="")


def get_request_id() -> str:
    """Get the current request's correlation ID."""
    return request_id_var.get()


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """
    Injects X-Request-ID into every request/response.

    - If the client sends X-Request-ID, we reuse it.
    - Otherwise we generate a new UUID4.
    - The ID is stored in a ContextVar for use anywhere in the request lifecycle.
    - The ID is added to the response headers.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Reuse client-provided ID or generate a new one
        rid = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request_id_var.set(rid)

        # Store on request state for easy access in route handlers
        request.state.request_id = rid

        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Baseline browser hardening headers on every response."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if request.headers.get("x-forwarded-proto", request.url.scheme) == "https":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
        from app.core.config import settings

        if settings.KIRI_SERVER_MODE:
            response.headers.setdefault("X-Robots-Tag", "noindex, nofollow")
            if request.url.path.startswith("/api/"):
                response.headers.setdefault("Cache-Control", "no-store")
        return response
