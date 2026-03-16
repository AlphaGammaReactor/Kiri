"""
Kiri Research Platform — FastAPI Application

The main entry point for the backend server.
Configures CORS, mounts routers, registers error handlers,
and initializes the caching layer.
"""

import logging
from datetime import datetime, timezone, timedelta

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.cache import cache
from app.core.errors import register_error_handlers
from app.core.database import init_db, close_db
from app.core.middleware import CorrelationIdMiddleware
from app.api import router as api_router

# Ensure ORM models are imported so Base.metadata knows about them
import app.models.project  # noqa: F401
import app.models.crash_report  # noqa: F401
import app.models.uploaded_file  # noqa: F401
import app.models.user  # noqa: F401

# ── Structured Logging ──
from app.core.logging import setup_logging, get_logger

setup_logging(json_logs=not settings.DEBUG, log_level="DEBUG" if settings.DEBUG else "INFO")
logger = get_logger("kiri")


# ── Lifespan (startup / shutdown) ──
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup, clean up on shutdown."""
    # Startup
    logger.info("🌿 Kiri starting up...")
    await cache.initialize(settings.REDIS_URL)
    logger.info(f"   Cache: {'Redis' if cache.is_redis else 'In-Memory (dev mode)'}")
    await init_db()
    logger.info("   Database: connected")
    logger.info(f"   CORS: {settings.CORS_ORIGINS}")
    logger.info("🌿 Kiri ready.")
    yield
    # Shutdown
    logger.info("🌿 Kiri shutting down.")
    await close_db()


app = FastAPI(
    title="Kiri API",
    description="Kiri Research Platform — Backend API",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# ── Middleware ──
app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Error Handlers ──
register_error_handlers(app)


# ── Health Check (Extended) ──
@app.get("/api/health")
async def health(deep: bool = False) -> dict:
    """
    Extended health check — reports service status, cache type,
    database connectivity, and recent crash statistics.

    Pass ?deep=true to also check external API reachability (slower).
    """
    health_status = {
        "status": "ok",
        "service": "kiri-backend",
        "version": "0.1.0",
        "cache": "redis" if cache.is_redis else "in-memory",
        "database": "unknown",
        "crash_stats": None,
    }

    # Check database connectivity
    try:
        from sqlalchemy import text
        from app.core.database import async_session_factory

        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
            health_status["database"] = "connected"
    except Exception as e:
        health_status["database"] = f"error: {str(e)[:100]}"
        health_status["status"] = "degraded"

    # Crash report statistics (last 24h)
    try:
        from sqlalchemy import func, select
        from app.models.crash_report import CrashReport
        from app.core.database import async_session_factory

        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

        async with async_session_factory() as session:
            total_result = await session.execute(
                select(func.count(CrashReport.id)).where(
                    CrashReport.timestamp >= cutoff
                )
            )
            total = total_result.scalar() or 0

            critical_result = await session.execute(
                select(func.count(CrashReport.id)).where(
                    CrashReport.timestamp >= cutoff,
                    CrashReport.severity == "critical",
                )
            )
            critical = critical_result.scalar() or 0

            unresolved_result = await session.execute(
                select(func.count(CrashReport.id)).where(
                    CrashReport.resolved == False,  # noqa: E712
                )
            )
            unresolved = unresolved_result.scalar() or 0

            health_status["crash_stats"] = {
                "last_24h": total,
                "critical_24h": critical,
                "unresolved_total": unresolved,
            }
    except Exception:
        health_status["crash_stats"] = {"error": "Could not query crash reports"}

    # Check Redis connectivity
    try:
        redis_status = "unknown"
        if cache.is_redis and hasattr(cache, '_redis') and cache._redis:
            pong = await cache._redis.ping()
            redis_status = "connected" if pong else "error: no pong"
        elif cache.is_redis:
            redis_status = "connected"
        else:
            redis_status = "in-memory (fallback)"
        health_status["redis"] = redis_status
    except Exception as e:
        health_status["redis"] = f"error: {str(e)[:100]}"

    # Deep check: external API reachability (opt-in, adds ~5-10s)
    if deep:
        external_apis = {}
        import httpx as httpx_client
        for api_name, url in [
            ("GDC", f"{settings.GDC_API_BASE}/status"),
            ("PubMed", f"{settings.PUBMED_API_BASE}/esearch.fcgi?db=pubmed&retmax=0&term=test"),
        ]:
            try:
                async with httpx_client.AsyncClient(timeout=3.0) as client_http:
                    resp = await client_http.get(url)
                    external_apis[api_name] = "reachable" if resp.status_code < 500 else f"error: HTTP {resp.status_code}"
            except Exception:
                external_apis[api_name] = "unreachable"
        health_status["external_apis"] = external_apis

    return health_status


# ── Cache Monitoring ──
@app.get("/api/cache-stats")
async def cache_stats() -> dict:
    """Cache hit/miss monitoring endpoint — per-source breakdown."""
    return {"status": "success", "data": cache.stats()}


# ── Crash Report API ──
@app.get("/api/crash-reports")
async def list_crash_reports(limit: int = 20, severity: str | None = None):
    """List recent crash reports for the IDE agent's /audit and /fix workflows."""
    from sqlalchemy import select
    from app.core.database import async_session_factory
    from app.models.crash_report import CrashReport

    async with async_session_factory() as session:
        stmt = select(CrashReport).order_by(CrashReport.timestamp.desc()).limit(limit)
        if severity:
            stmt = stmt.where(CrashReport.severity == severity)
        result = await session.execute(stmt)
        reports = result.scalars().all()

        return {
            "status": "success",
            "data": [
                {
                    "id": str(r.id),
                    "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                    "exception_type": r.exception_type,
                    "exception_message": r.exception_message,
                    "endpoint": r.endpoint,
                    "method": r.method,
                    "severity": r.severity,
                    "http_status": r.http_status,
                    "request_id": r.request_id,
                    "resolved": r.resolved,
                }
                for r in reports
            ],
            "count": len(reports),
        }


# ── Mount API Router ──
app.include_router(api_router, prefix="/api/v1")
