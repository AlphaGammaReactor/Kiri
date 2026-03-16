"""
Kiri — File Upload Service

Handles file storage on disk and CSV/TSV parsing for expression data.
Files are stored in project-scoped directories under UPLOAD_DIR.
"""

import csv
import io
import logging
import os
import re
import uuid
from pathlib import Path
from typing import Any

from fastapi import UploadFile

logger = logging.getLogger("kiri.upload")

# ── Configuration ──
UPLOAD_DIR = os.environ.get("KIRI_UPLOAD_DIR", "./uploads")
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
ALLOWED_EXPRESSION_EXT = {".csv", ".tsv", ".txt"}
ALLOWED_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp"}
ALLOWED_DOC_EXT = {".pdf", ".xlsx", ".xls", ".docx"}


def _sanitize_filename(name: str) -> str:
    """Remove dangerous characters, keep extension."""
    stem = Path(name).stem
    ext = Path(name).suffix.lower()
    safe = re.sub(r"[^a-zA-Z0-9_\-.]", "_", stem)[:100]
    return f"{safe}_{uuid.uuid4().hex[:8]}{ext}"


def _detect_file_type(ext: str) -> str:
    """Classify a file by its extension."""
    if ext in ALLOWED_EXPRESSION_EXT:
        return "expression"
    if ext in ALLOWED_IMAGE_EXT:
        return "image"
    if ext in ALLOWED_DOC_EXT:
        return "document"
    return "data"


def _detect_mime(ext: str) -> str:
    """Best-guess MIME type from extension."""
    mapping = {
        ".csv": "text/csv",
        ".tsv": "text/tab-separated-values",
        ".txt": "text/plain",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".tiff": "image/tiff",
        ".tif": "image/tiff",
        ".pdf": "application/pdf",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xls": "application/vnd.ms-excel",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    return mapping.get(ext, "application/octet-stream")


async def save_uploaded_file(
    project_id: str,
    file: UploadFile,
) -> dict[str, Any]:
    """
    Save an uploaded file to disk and return metadata.

    Returns dict with:
      filename, original_name, file_type, file_path (relative),
      file_size, mime_type, parsed_data (if expression file)
    """
    original_name = file.filename or "unknown"
    ext = Path(original_name).suffix.lower()

    # Validate extension
    all_allowed = ALLOWED_EXPRESSION_EXT | ALLOWED_IMAGE_EXT | ALLOWED_DOC_EXT | {".data"}
    if ext not in all_allowed and ext:
        # Allow any extension — classify as "data"
        pass

    # Read content
    content = await file.read()
    file_size = len(content)

    if file_size > MAX_FILE_SIZE:
        raise ValueError(f"File too large: {file_size} bytes (max {MAX_FILE_SIZE})")

    if file_size == 0:
        raise ValueError("Empty file")

    # Generate safe filename and project directory
    safe_name = _sanitize_filename(original_name)
    project_dir = Path(UPLOAD_DIR) / project_id
    project_dir.mkdir(parents=True, exist_ok=True)

    file_path = project_dir / safe_name
    file_path.write_bytes(content)

    file_type = _detect_file_type(ext)
    mime_type = _detect_mime(ext)

    # Parse expression data from CSV/TSV
    parsed_data = None
    if file_type == "expression":
        try:
            parsed_data = _parse_expression_file(content, ext)
        except Exception as e:
            logger.warning("Failed to parse expression file %s: %s", original_name, e)
            # File is still saved; parsed_data stays None

    # Relative path for storage in DB
    rel_path = f"{project_id}/{safe_name}"

    return {
        "filename": safe_name,
        "original_name": original_name,
        "file_type": file_type,
        "file_path": rel_path,
        "file_size": file_size,
        "mime_type": mime_type,
        "parsed_data": parsed_data,
    }


def _parse_expression_file(content: bytes, ext: str) -> dict[str, Any]:
    """
    Parse a CSV/TSV expression matrix.

    Expected format:
      gene_symbol, sample1, sample2, ...
      PARL,        12.5,    8.3,    ...
      MAVS,        15.2,    11.0,   ...

    Returns: {
      "genes": ["PARL", "MAVS"],
      "samples": ["sample1", "sample2"],
      "values": {"PARL": [12.5, 8.3], "MAVS": [15.2, 11.0]},
      "row_count": 2,
      "col_count": 2,
    }
    """
    text = content.decode("utf-8", errors="replace")
    delimiter = "\t" if ext == ".tsv" else ","
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)

    rows = list(reader)
    if len(rows) < 2:
        raise ValueError("File must have at least a header row and one data row")

    header = rows[0]
    samples = [h.strip() for h in header[1:] if h.strip()]

    genes: list[str] = []
    values: dict[str, list[float]] = {}

    for row in rows[1:]:
        if not row or not row[0].strip():
            continue
        gene = row[0].strip().upper()
        gene_vals: list[float] = []
        for i, val in enumerate(row[1 : len(samples) + 1]):
            try:
                gene_vals.append(float(val.strip()))
            except (ValueError, IndexError):
                gene_vals.append(0.0)
        # Pad if row is shorter than header
        while len(gene_vals) < len(samples):
            gene_vals.append(0.0)

        genes.append(gene)
        values[gene] = gene_vals

    return {
        "genes": genes,
        "samples": samples,
        "values": values,
        "row_count": len(genes),
        "col_count": len(samples),
    }


def get_file_path(rel_path: str) -> Path:
    """Resolve a relative file path to an absolute Path object."""
    return Path(UPLOAD_DIR) / rel_path


def delete_file(rel_path: str) -> bool:
    """Delete a file from disk. Returns True if deleted, False if not found."""
    full_path = Path(UPLOAD_DIR) / rel_path
    if full_path.exists():
        full_path.unlink()
        # Clean up empty project directory
        parent = full_path.parent
        if parent.exists() and not any(parent.iterdir()):
            parent.rmdir()
        return True
    return False
