"""
Kiri — Crash Report ORM Model

Stores structured crash reports for every unhandled exception,
enabling trend analysis and IDE agent auto-prioritization.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CrashReport(Base):
    """
    Persistent crash report — written by error handlers on every exception.

    Used by the /audit and /status workflows to identify recurring issues.
    """

    __tablename__ = "crash_reports"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # When
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    # What
    exception_type: Mapped[str] = mapped_column(String(255), nullable=False)
    exception_message: Mapped[str] = mapped_column(Text, default="")
    traceback: Mapped[str] = mapped_column(Text, default="")

    # Where
    endpoint: Mapped[str] = mapped_column(String(255), default="", index=True)
    method: Mapped[str] = mapped_column(String(10), default="")
    module: Mapped[str] = mapped_column(String(255), default="")

    # Context
    request_id: Mapped[str] = mapped_column(String(36), default="", index=True)
    request_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    user_agent: Mapped[str] = mapped_column(String(512), default="")

    # Severity & classification
    severity: Mapped[str] = mapped_column(
        String(20), default="error"
    )  # "warning" | "error" | "critical"
    http_status: Mapped[int] = mapped_column(Integer, default=500)

    # Resolution tracking
    resolved: Mapped[bool] = mapped_column(default=False)
    resolution_notes: Mapped[str] = mapped_column(Text, default="")
