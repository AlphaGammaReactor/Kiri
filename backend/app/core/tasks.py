"""
Kiri — Background Task Manager

Production: Celery + Redis (broker + result backend).
Development: Graceful fallback to in-memory when Redis is unavailable.
Heavy bio-computation NEVER blocks the request thread.
"""

import logging
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable

from pydantic import BaseModel, Field

logger = logging.getLogger("kiri.tasks")


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class TaskResult(BaseModel):
    """Tracks the status and result of a background computation."""

    task_id: str
    status: TaskStatus = TaskStatus.PENDING
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    result: Any | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = None


# ── Celery App ──────────────────────────────────────────────

_celery_app = None
_using_celery = False

# In-memory fallback store (used when Celery/Redis unavailable)
_task_store: dict[str, TaskResult] = {}


def _init_celery() -> bool:
    """
    Try to initialize a Celery app connected to Redis.
    Returns True if Celery is available, False otherwise.
    """
    global _celery_app, _using_celery

    if _celery_app is not None:
        return _using_celery

    try:
        from app.core.config import settings
        redis_url = getattr(settings, "REDIS_URL", None)
        use_celery = getattr(settings, "USE_CELERY", False)

        if not redis_url or not use_celery:
            logger.info("Tasks: No REDIS_URL configured or USE_CELERY=False, using in-memory fallback")
            _using_celery = False
            return False

        from celery import Celery

        _celery_app = Celery(
            "kiri",
            broker=redis_url,
            backend=redis_url,
        )
        _celery_app.conf.update(
            task_serializer="json",
            result_serializer="json",
            accept_content=["json"],
            timezone="UTC",
            enable_utc=True,
            task_track_started=True,
            result_expires=86400,  # 24h
            worker_hijack_root_logger=False,
            broker_connection_retry_on_startup=True,
        )

        # Quick connectivity check
        _celery_app.connection_for_read().ensure_connection(max_retries=1)
        _using_celery = True
        logger.info("Tasks: Celery + Redis connected")
        return True

    except Exception as e:
        logger.warning(f"Tasks: Celery unavailable ({e}), using in-memory fallback")
        _celery_app = None
        _using_celery = False
        return False


def get_celery_app():
    """Return the Celery app instance (or None if in fallback mode)."""
    _init_celery()
    return _celery_app


# ── Celery Task ─────────────────────────────────────────────

def _register_celery_task():
    """Register the worker task with Celery. Only called when Celery is available."""
    app = get_celery_app()
    if app is None:
        return None

    @app.task(bind=True, name="kiri.run_background_task")
    def _celery_run_task(self, task_id: str, func_module: str, func_name: str, *args, **kwargs):
        """
        Execute a function as a Celery task.
        The function is identified by module path + name for serializability.
        """
        import importlib
        try:
            self.update_state(state="STARTED", meta={"task_id": task_id})
            module = importlib.import_module(func_module)
            func = getattr(module, func_name)
            result = func(*args, **kwargs)
            return {"task_id": task_id, "result": result, "status": "completed"}
        except Exception as e:
            logger.error(f"Celery task {task_id} failed: {e}")
            return {"task_id": task_id, "error": str(e), "status": "failed"}

    return _celery_run_task


# ── Public API (same interface regardless of backend) ───────


def create_task() -> TaskResult:
    """Register a new background task and return its tracking object."""
    task_id = str(uuid.uuid4())
    task = TaskResult(task_id=task_id)

    if not _init_celery():
        # In-memory mode
        _task_store[task_id] = task

    return task


def get_task(task_id: str) -> TaskResult | None:
    """Retrieve task status by ID."""
    if _using_celery and _celery_app:
        try:
            from celery.result import AsyncResult
            result = AsyncResult(task_id, app=_celery_app)

            status_map = {
                "PENDING": TaskStatus.PENDING,
                "STARTED": TaskStatus.RUNNING,
                "SUCCESS": TaskStatus.COMPLETED,
                "FAILURE": TaskStatus.FAILED,
                "REVOKED": TaskStatus.FAILED,
            }

            task_status = status_map.get(result.status, TaskStatus.PENDING)
            task = TaskResult(
                task_id=task_id,
                status=task_status,
                progress=1.0 if task_status == TaskStatus.COMPLETED else 0.0,
            )

            if result.ready():
                task.completed_at = datetime.now(timezone.utc)
                if result.successful():
                    task.result = result.result
                else:
                    task.error = str(result.result)

            return task
        except Exception as e:
            logger.warning(f"Celery get_task error: {e}")
            return None
    else:
        return _task_store.get(task_id)


def update_task_progress(task_id: str, progress: float) -> None:
    """Update progress for an in-memory task (0.0 to 1.0)."""
    task = _task_store.get(task_id)
    if task:
        task.progress = min(max(progress, 0.0), 1.0)


async def run_task(task_id: str, func: Callable, *args: Any, **kwargs: Any) -> None:
    """
    Execute a function as a background task, updating status in the store.

    In Celery mode: dispatches to the worker queue.
    In fallback mode: runs inline (via FastAPI BackgroundTasks).
    """
    if _using_celery and _celery_app:
        try:
            celery_task = _register_celery_task()
            if celery_task:
                celery_task.apply_async(
                    args=(task_id, func.__module__, func.__name__, *args),
                    kwargs=kwargs,
                    task_id=task_id,
                )
                logger.info(f"Task {task_id}: dispatched to Celery")
                return
        except Exception as e:
            logger.warning(f"Celery dispatch failed ({e}), running in-process")

    # Fallback: run in-process
    task = _task_store.get(task_id)
    if not task:
        logger.error(f"Task {task_id} not found in store")
        return

    task.status = TaskStatus.RUNNING
    logger.info(f"Task {task_id}: started (in-process)")

    try:
        result = await func(*args, **kwargs) if callable(func) else None
        task.result = result
        task.status = TaskStatus.COMPLETED
        task.progress = 1.0
        task.completed_at = datetime.now(timezone.utc)
        logger.info(f"Task {task_id}: completed")
    except Exception as e:
        task.status = TaskStatus.FAILED
        task.error = str(e)
        task.completed_at = datetime.now(timezone.utc)
        logger.error(f"Task {task_id}: failed — {e}")
