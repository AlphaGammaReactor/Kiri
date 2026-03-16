"""
Kiri — Response Envelope

Every API response wraps data in a standard envelope with provenance metadata.
This is the Trust Layer's foundational data contract.
"""

from datetime import datetime, timezone
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Provenance(BaseModel):
    """Metadata about where the data came from and how it was produced."""

    source: str = Field(
        ..., description="Data source (e.g., 'TCGA-COAD', 'STRING-DB', 'PubMed')"
    )
    method: str = Field(
        default="", description="Analysis method (e.g., 'TPM normalization', 'log-rank test')"
    )
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="When this data was fetched/computed",
    )
    sample_count: int | None = Field(
        default=None, description="Number of samples used (n=)"
    )
    version: str = Field(
        default="kiri-0.1.0", description="Kiri version that produced this result"
    )
    cache_hit: bool = Field(
        default=False, description="Whether this response came from cache"
    )


class ApiResponse(BaseModel, Generic[T]):
    """
    Standard response envelope for all Kiri API endpoints.

    Every response includes:
    - status: 'success' or 'error'
    - data: the actual payload
    - provenance: where the data came from
    - warnings: non-fatal issues (e.g., some samples excluded)
    - errors: error details if status is 'error'
    """

    status: str = Field(default="success", description="'success' or 'error'")
    data: T | None = Field(default=None, description="Response payload")
    provenance: Provenance | None = Field(
        default=None, description="Data provenance metadata"
    )
    warnings: list[str] = Field(
        default_factory=list, description="Non-fatal warnings"
    )
    errors: list[str] = Field(
        default_factory=list, description="Error messages"
    )


def success_response(
    data: Any,
    source: str = "kiri",
    method: str = "",
    sample_count: int | None = None,
    warnings: list[str] | None = None,
    cache_hit: bool = False,
) -> dict:
    """Helper to build a success response with provenance."""
    return ApiResponse(
        status="success",
        data=data,
        provenance=Provenance(
            source=source,
            method=method,
            sample_count=sample_count,
            cache_hit=cache_hit,
        ),
        warnings=warnings or [],
    ).model_dump(mode="json")


def error_response(
    errors: list[str],
    source: str = "kiri",
    warnings: list[str] | None = None,
) -> dict:
    """Helper to build an error response."""
    return ApiResponse(
        status="error",
        data=None,
        provenance=Provenance(source=source),
        errors=errors,
        warnings=warnings or [],
    ).model_dump(mode="json")
