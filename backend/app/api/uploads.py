"""
Kiri — Upload API Routes

CRUD endpoints for project file uploads.
Files are stored on disk + metadata in Postgres via ProjectUploadedFile model.
"""

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.responses import success_response, error_response
from app.models.uploaded_file import ProjectUploadedFile
from app.services.upload import save_uploaded_file, get_file_path, delete_file

logger = logging.getLogger("kiri.api.uploads")

upload_router = APIRouter(prefix="/uploads", tags=["uploads"])


# ── Upload File ──


@upload_router.post("/{project_id}/files")
async def upload_file(
    project_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a file to a project. CSV/TSV files are parsed into expression matrices."""
    try:
        result = await save_uploaded_file(project_id, file)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Upload failed for project %s: %s", project_id, e)
        raise HTTPException(status_code=500, detail="Upload failed")

    # Persist to database
    record = ProjectUploadedFile(
        project_id=project_id,
        filename=result["filename"],
        original_name=result["original_name"],
        file_type=result["file_type"],
        file_path=result["file_path"],
        file_size=result["file_size"],
        mime_type=result["mime_type"],
        parsed_data=result["parsed_data"],
        metadata_json={},
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)

    return success_response(
        data={
            "id": str(record.id),
            "filename": record.filename,
            "original_name": record.original_name,
            "file_type": record.file_type,
            "file_size": record.file_size,
            "mime_type": record.mime_type,
            "has_parsed_data": record.parsed_data is not None,
            "parsed_summary": _parsed_summary(record.parsed_data),
            "created_at": record.created_at.isoformat() if record.created_at else None,
        },
        source="kiri-uploads",
        method="File upload",
    )


# ── List Files ──


@upload_router.get("/{project_id}/files")
async def list_files(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List all uploaded files for a project."""
    stmt = (
        select(ProjectUploadedFile)
        .where(ProjectUploadedFile.project_id == project_id)
        .order_by(ProjectUploadedFile.created_at.desc())
    )
    result = await db.execute(stmt)
    files = result.scalars().all()

    return success_response(
        data=[
            {
                "id": str(f.id),
                "filename": f.filename,
                "original_name": f.original_name,
                "file_type": f.file_type,
                "file_size": f.file_size,
                "mime_type": f.mime_type,
                "has_parsed_data": f.parsed_data is not None,
                "parsed_summary": _parsed_summary(f.parsed_data),
                "metadata": f.metadata_json,
                "created_at": f.created_at.isoformat() if f.created_at else None,
            }
            for f in files
        ],
        source="kiri-uploads",
    )


# ── Get File Detail ──


@upload_router.get("/{project_id}/files/{file_id}")
async def get_file_detail(
    project_id: str,
    file_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get file metadata and parsed data (if available)."""
    record = await _get_file_or_404(db, project_id, file_id)

    return success_response(
        data={
            "id": str(record.id),
            "filename": record.filename,
            "original_name": record.original_name,
            "file_type": record.file_type,
            "file_size": record.file_size,
            "mime_type": record.mime_type,
            "parsed_data": record.parsed_data,
            "metadata": record.metadata_json,
            "created_at": record.created_at.isoformat() if record.created_at else None,
        },
        source="kiri-uploads",
    )


# ── Download File ──


@upload_router.get("/{project_id}/files/{file_id}/download")
async def download_file(
    project_id: str,
    file_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Download the original uploaded file."""
    record = await _get_file_or_404(db, project_id, file_id)

    full_path = get_file_path(record.file_path)
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=str(full_path),
        filename=record.original_name,
        media_type=record.mime_type or "application/octet-stream",
    )


# ── Delete File ──


@upload_router.delete("/{project_id}/files/{file_id}")
async def delete_uploaded_file(
    project_id: str,
    file_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a file from disk and database."""
    record = await _get_file_or_404(db, project_id, file_id)

    # Delete from disk
    delete_file(record.file_path)

    # Delete from DB
    await db.delete(record)

    return success_response(
        data={"deleted": True, "id": file_id},
        source="kiri-uploads",
    )


# ── Helpers ──


async def _get_file_or_404(
    db: AsyncSession, project_id: str, file_id: str
) -> ProjectUploadedFile:
    """Look up a file record or raise 404."""
    stmt = select(ProjectUploadedFile).where(
        ProjectUploadedFile.id == file_id,
        ProjectUploadedFile.project_id == project_id,
    )
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    return record


def _parsed_summary(parsed_data: dict | None) -> dict | None:
    """Return a lightweight summary of parsed expression data."""
    if not parsed_data:
        return None
    return {
        "genes": parsed_data.get("genes", []),
        "sample_count": len(parsed_data.get("samples", [])),
        "row_count": parsed_data.get("row_count", 0),
        "col_count": parsed_data.get("col_count", 0),
    }
