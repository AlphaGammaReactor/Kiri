"""
Kiri — ProjectUploadedFile ORM Model

Tracks files uploaded to a project (expression data, images, documents).
Files are stored on disk; metadata + parsed data live in Postgres.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ProjectUploadedFile(Base):
    """A file uploaded to a project — expression matrices, images, documents."""

    __tablename__ = "project_uploaded_files"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    filename: Mapped[str] = mapped_column(
        String(255), nullable=False
    )  # Sanitized name on disk
    original_name: Mapped[str] = mapped_column(
        String(255), nullable=False
    )  # User's original filename
    file_type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # "expression" | "image" | "document" | "data"
    file_path: Mapped[str] = mapped_column(
        Text, nullable=False
    )  # Relative path from UPLOAD_DIR
    file_size: Mapped[int] = mapped_column(
        BigInteger, default=0
    )  # Bytes
    mime_type: Mapped[str] = mapped_column(
        String(100), default=""
    )
    parsed_data: Mapped[dict | None] = mapped_column(
        JSON, nullable=True, default=None
    )  # Parsed expression matrix for CSV/TSV
    metadata_json: Mapped[dict] = mapped_column(
        JSON, default=dict
    )  # User annotations, gene associations
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationship
    project: Mapped["Project"] = relationship()  # noqa: F821
