"""
Kiri — Project System ORM Models

SQLAlchemy models for the Project Management System.
A Project owns protein targets and data sources.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Project(Base):
    """A persistent research context that owns proteins and data sources."""

    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    cancer_type: Mapped[str] = mapped_column(String(50), default="")

    # Future auth: nullable until user system is implemented
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, default=None, index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    # Publication engine state (panels + options), persisted for reload survival
    publication_state: Mapped[dict | None] = mapped_column(
        JSON, nullable=True, default=None
    )

    # Per-page UI state (filters, selections, tab states) — keyed by page name
    ui_state: Mapped[dict | None] = mapped_column(
        JSON, nullable=True, default=None
    )

    # Relationships
    proteins: Mapped[list["ProjectProtein"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    data_sources: Mapped[list["ProjectDataSource"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    collaborators: Mapped[list["ProjectCollaborator"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    snapshots: Mapped[list["Snapshot"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="noload",
    )


class ProjectProtein(Base):
    """A protein target within a project, validated via HGNC + UniProt."""

    __tablename__ = "project_proteins"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    gene_symbol: Mapped[str] = mapped_column(String(50), nullable=False)
    uniprot_id: Mapped[str] = mapped_column(String(20), default="")
    protein_name: Mapped[str] = mapped_column(String(255), default="")
    organism: Mapped[str] = mapped_column(String(100), default="Homo sapiens")
    function_summary: Mapped[str] = mapped_column(Text, default="")
    sequence_length: Mapped[int] = mapped_column(Integer, default=0)
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationship
    project: Mapped["Project"] = relationship(back_populates="proteins")


class ProjectDataSource(Base):
    """A data source attached to a project (TCGA, GEO, custom upload, etc.)."""

    __tablename__ = "project_data_sources"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    source_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # "tcga" | "geo" | "custom" | "cptac" | "scrna" | "drugbank" | "pubchem" | "chembl" | "string"
    label: Mapped[str] = mapped_column(String(255), default="")
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # "pending" | "connecting" | "downloading" | "loaded" | "error"
    sample_count: Mapped[int] = mapped_column(Integer, default=0)
    cached_data: Mapped[dict | None] = mapped_column(
        JSON, nullable=True, default=None
    )  # Hydrated data from external APIs
    last_fetched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationship
    project: Mapped["Project"] = relationship(back_populates="data_sources")


class ProjectCollaborator(Base):
    """
    Tracks who has access to a project and with what role.
    Enables future multi-user collaboration.

    Roles:
    - owner: full control (delete project, manage collaborators)
    - editor: can modify project (add proteins, data sources, run analyses)
    - viewer: read-only access to project and results
    """

    __tablename__ = "project_collaborators"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )  # Nullable until auth system is implemented
    email: Mapped[str] = mapped_column(
        String(255), nullable=True
    )  # For invite-by-email before user exists
    role: Mapped[str] = mapped_column(
        String(20), default="viewer"
    )  # "owner" | "editor" | "viewer"
    invited_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    # Relationship
    project: Mapped["Project"] = relationship(back_populates="collaborators")


class Snapshot(Base):
    """
    A point-in-time capture of a project's state.
    Stores serialized project data (proteins, sources, settings)
    for versioning, undo, and duplication.
    """

    __tablename__ = "project_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    state_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationship
    project: Mapped["Project"] = relationship(back_populates="snapshots")
