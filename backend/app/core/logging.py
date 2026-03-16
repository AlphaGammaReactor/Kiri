"""
Kiri — Structured Logging Configuration

Configures structlog for machine-readable JSON logs in production
and human-readable colored logs in development.

Every log entry automatically includes:
  - timestamp (ISO 8601)
  - log level
  - logger name
  - request_id (from CorrelationId middleware ContextVar)
"""

import logging
import sys

import structlog
from app.core.middleware import get_request_id


def add_request_id(logger, method_name, event_dict):
    """Inject the current request's correlation ID into every log entry."""
    rid = get_request_id()
    if rid:
        event_dict["request_id"] = rid
    return event_dict


def setup_logging(*, json_logs: bool = False, log_level: str = "INFO"):
    """
    Configure structured logging for the application.

    Args:
        json_logs: If True, emit machine-readable JSON to stdout.
                   If False, emit human-readable colored console output.
        log_level: Minimum log level (DEBUG, INFO, WARNING, ERROR, CRITICAL).
    """
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        add_request_id,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if json_logs:
        # Production: machine-readable JSON
        renderer = structlog.processors.JSONRenderer()
    else:
        # Development: human-readable with colors
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Quiet noisy libraries
    for noisy in ("httpx", "httpcore", "uvicorn.access", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str = "kiri"):
    """Get a structlog-bound logger."""
    return structlog.get_logger(name)
