"""
Kiri — Global Error Handling with Crash Report Persistence

Catches all exceptions, writes structured crash reports to the database,
and returns consistent error envelopes to the client.
"""

import logging
import traceback as tb

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.responses import error_response
from app.core.middleware import get_request_id

logger = logging.getLogger("kiri.errors")


async def _persist_crash_report(
    request: Request,
    exc: Exception,
    severity: str = "error",
    http_status: int = 500,
    endpoint: str = "",
    module: str = "",
) -> None:
    """Write a crash report to the database (fire-and-forget)."""
    try:
        from app.core.database import async_session_factory
        from app.models.crash_report import CrashReport

        # Safely extract request payload
        payload = None
        try:
            if request.method in ("POST", "PUT", "PATCH"):
                body = await request.body()
                if body:
                    import json
                    payload = json.loads(body.decode("utf-8", errors="replace"))
        except Exception:
            payload = {"_error": "Could not parse request body"}

        report = CrashReport(
            exception_type=type(exc).__name__,
            exception_message=str(exc)[:2000],
            traceback=tb.format_exc()[:5000],
            endpoint=endpoint or str(request.url.path),
            method=request.method,
            module=module,
            request_id=get_request_id(),
            request_payload=payload,
            user_agent=request.headers.get("user-agent", "")[:512],
            severity=severity,
            http_status=http_status,
        )

        async with async_session_factory() as session:
            session.add(report)
            await session.commit()
            logger.info(f"Crash report saved: {report.id} [{severity}] {type(exc).__name__}")

    except Exception as persist_err:
        # Never let crash reporting itself crash the response
        logger.error(f"Failed to persist crash report: {persist_err}")


def register_error_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the FastAPI app."""

    @app.exception_handler(KiriValidationError)
    async def validation_error_handler(request: Request, exc: KiriValidationError):
        logger.warning(f"[{get_request_id()[:8]}] Validation error: {exc.message}")
        await _persist_crash_report(
            request, exc, severity="warning", http_status=422, module=exc.source
        )
        return JSONResponse(
            status_code=422,
            content=error_response(
                errors=[exc.message],
                source=exc.source,
                warnings=exc.warnings,
            ),
        )

    @app.exception_handler(KiriExternalAPIError)
    async def external_api_error_handler(request: Request, exc: KiriExternalAPIError):
        logger.error(f"[{get_request_id()[:8]}] External API error ({exc.service}): {exc.message}")
        await _persist_crash_report(
            request, exc, severity="error", http_status=502, module=exc.service
        )
        return JSONResponse(
            status_code=502,
            content=error_response(
                errors=[f"External service '{exc.service}' error: {exc.message}"],
                source=exc.service,
            ),
        )

    @app.exception_handler(KiriComputationError)
    async def computation_error_handler(request: Request, exc: KiriComputationError):
        logger.warning(f"[{get_request_id()[:8]}] Computation error: {exc.message}")
        await _persist_crash_report(
            request, exc, severity="warning", http_status=422, module=exc.source
        )
        return JSONResponse(
            status_code=422,
            content=error_response(
                errors=[f"Computation failed: {exc.message}"],
                source=exc.source,
                warnings=exc.warnings,
            ),
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception):
        logger.critical(
            f"[{get_request_id()[:8]}] Unhandled exception: {exc}\n{tb.format_exc()}"
        )
        await _persist_crash_report(
            request, exc, severity="critical", http_status=500
        )
        return JSONResponse(
            status_code=500,
            content=error_response(
                errors=["An unexpected internal error occurred. This has been logged."],
                source="kiri-internal",
            ),
        )


# ── Custom Exception Classes ──


class KiriValidationError(Exception):
    """Raised when input validation fails (e.g., invalid gene symbol)."""

    def __init__(self, message: str, source: str = "kiri", warnings: list[str] | None = None):
        self.message = message
        self.source = source
        self.warnings = warnings or []
        super().__init__(message)


class KiriExternalAPIError(Exception):
    """Raised when an external API (GDC, STRING-DB, PubMed, etc.) fails."""

    def __init__(self, service: str, message: str):
        self.service = service
        self.message = message
        super().__init__(f"{service}: {message}")


class KiriComputationError(Exception):
    """Raised when a bio-computation step fails (e.g., survival analysis with 0 events)."""

    def __init__(self, source: str, message: str, warnings: list[str] | None = None):
        self.source = source
        self.message = message
        self.warnings = warnings or []
        super().__init__(message)
