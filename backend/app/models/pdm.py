"""
Kiri — PDM Vault ORM Models

SQLAlchemy models for the Publication & Data Management vault.
Stores wet-lab experimental data linked to projects:
- Assay records (CCK8, Wound Healing, Colony Formation)
- Lab images (Western Blot, IF, IHC)
- Animal model experiments (tumor growth, body weight)
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Float,
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


class Assay(Base):
    """
    A wet-lab assay record within a project.
    Supports CCK8 (proliferation), Wound Healing, and Colony Formation.
    """

    __tablename__ = "pdm_assays"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assay_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "cck8" | "wound_healing" | "colony_formation"
    title: Mapped[str] = mapped_column(String(255), default="")
    gene_symbol: Mapped[str] = mapped_column(String(50), default="")
    conditions: Mapped[dict] = mapped_column(
        JSON, default=dict
    )  # e.g., {"cell_line": "HCT116", "treatment": "siPARL", "duration_hours": 72}
    results: Mapped[dict] = mapped_column(
        JSON, default=dict
    )  # e.g., {"timepoints": [0, 24, 48, 72], "values": {"control": [...], "siPARL": [...]}}
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class LabImage(Base):
    """
    A lab image (Western Blot, IF, IHC) stored within a project.
    File upload is manual; this stores metadata and a file_path reference.
    """

    __tablename__ = "pdm_images"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    image_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "western_blot" | "immunofluorescence" | "ihc"
    title: Mapped[str] = mapped_column(String(255), default="")
    gene_symbol: Mapped[str] = mapped_column(String(50), default="")
    file_path: Mapped[str] = mapped_column(String(512), default="")
    tags: Mapped[list] = mapped_column(
        JSON, default=list
    )  # e.g., ["PARL", "MAVS", "siRNA", "HCT116"]
    metadata_json: Mapped[dict] = mapped_column(
        JSON, default=dict
    )  # e.g., {"antibody": "anti-PARL", "exposure": "30s", "loading_control": "β-actin"}
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AnimalExperiment(Base):
    """
    An animal model experiment within a project.
    Tracks tumor growth curves, body weight, and group comparisons.
    """

    __tablename__ = "pdm_animal_experiments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    model_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "xenograft" | "pdx" | "syngeneic" | "transgenic"
    title: Mapped[str] = mapped_column(String(255), default="")
    gene_symbol: Mapped[str] = mapped_column(String(50), default="")
    groups: Mapped[dict] = mapped_column(
        JSON, default=dict
    )  # e.g., {"control": {"n": 6}, "treatment": {"n": 6, "agent": "siPARL"}}
    measurements: Mapped[dict] = mapped_column(
        JSON, default=dict
    )  # e.g., {"timepoints": [0, 7, 14, 21], "tumor_volume": {"control": [...], "treatment": [...]}, "body_weight": {...}}
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
