"""HTTP API for analyses on the open project, used by the desktop app.

An analysis runs against the project's cohort (bundled sample slice, or a
downloaded cohort pack), and its parameters, result and data version are
stored in the .kiri file, so reopening the project shows the same numbers.
"""

from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.analyses import expression, survival
from app.cohorts import packs
from app.cohorts.store import CohortUnavailable, cohort_for, slice_for
from app.core.config import settings
from app.kiri.api import ws
from app.kiri.fileformat import KiriFileError, now

router = APIRouter(prefix="/kiri", tags=["analyses"])
_run_lock = threading.Lock()


def _data_dir() -> Path:
    return Path(settings.KIRI_DATA_DIR)


def _projects(project: dict) -> list[str]:
    ds = [d for d in project.get("datasets", []) if d.startswith("TCGA-")]
    return ds or [f"TCGA-{c}" for c in project.get("cancers", [])]


class RunBody(BaseModel):
    kind: Literal["survival", "expression_tn", "expression_stage"]
    gene: str
    cut: Literal["median", "quartile", "optimal"] = "median"
    adjust: list[Literal["age", "stage"]] = Field(default_factory=list)
    paired: bool = False
    replace: Optional[str] = None  # analysis id to overwrite (changing options)


def _row(r) -> dict:
    return {"id": r[0], "kind": r[1], "params": json.loads(r[2]), "result": json.loads(r[3]) if r[3] else None,
            "data_versions": json.loads(r[4]) if r[4] else None, "created_at": r[5], "updated_at": r[6]}


@router.get("/cohort")
def cohort_status():
    """What data the open project can use right now."""
    try:
        op = ws().require()
    except KiriFileError as e:
        return JSONResponse(status_code=409, content={"error": e.code})
    projects = _projects(op.project())
    sl = slice_for(projects) if projects else None
    return {
        "projects": projects,
        "sample_slice": sl,
        "packs": {p: {"ready": packs.is_ready(_data_dir(), p), **packs.progress_of(p)} for p in projects},
    }


@router.post("/cohort/download")
def download(project: str):
    if not project.startswith("TCGA-"):
        return JSONResponse(status_code=400, content={"error": "unknown_project"})
    packs.start_download(_data_dir(), project)
    return packs.progress_of(project)


@router.get("/analyses")
def list_analyses():
    try:
        op = ws().require()
    except KiriFileError as e:
        return JSONResponse(status_code=409, content={"error": e.code})
    rows = op.con.execute("SELECT id, kind, params, result, data_versions, created_at, updated_at FROM analyses ORDER BY updated_at DESC")
    out = []
    for r in rows:
        a = _row(r)
        res = a.pop("result") or {}
        a["headline"] = {k: res.get(k) for k in ("p_report", "error")} | {"hr": (res.get("cox") or {}).get("hr"), "p": (res.get("test") or {}).get("p")}
        out.append(a)
    return out


@router.get("/analyses/{aid}")
def get_analysis(aid: str):
    try:
        op = ws().require()
    except KiriFileError as e:
        return JSONResponse(status_code=409, content={"error": e.code})
    r = op.con.execute("SELECT id, kind, params, result, data_versions, created_at, updated_at FROM analyses WHERE id = ?", (aid,)).fetchone()
    if not r:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    return _row(r)


@router.post("/analyses/run")
def run(body: RunBody):
    try:
        op = ws().require()
    except KiriFileError as e:
        return JSONResponse(status_code=409, content={"error": e.code})
    gene = body.gene.strip().upper()
    projects = _projects(op.project())
    if not projects:
        return JSONResponse(status_code=400, content={"error": "no_cohort"})
    try:
        c = cohort_for(projects, [gene], _data_dir())
        if not c.has(gene):
            raise CohortUnavailable("gene_not_in_cohort", gene=gene, cohort=c.name)
        with _run_lock:
            if body.kind == "survival":
                result = survival.run(c, gene, cut=body.cut, adjust=list(body.adjust))
            elif body.kind == "expression_tn":
                result = expression.tumour_vs_normal(c, gene, paired=body.paired)
            else:
                result = expression.by_stage(c, gene)
    except CohortUnavailable as e:
        return JSONResponse(status_code=409, content={"error": e.code, **e.extra})

    params = body.model_dump(exclude={"replace"}) | {"gene": gene, "projects": projects}
    record = {"id": body.replace or uuid.uuid4().hex, "kind": body.kind, "params": params, "result": result,
              "data_versions": c.data_version(), "created_at": now(), "updated_at": now()}
    if not op.read_only:
        existing = op.con.execute("SELECT created_at FROM analyses WHERE id = ?", (record["id"],)).fetchone()
        if existing:
            record["created_at"] = existing[0]
        op.con.execute(
            "INSERT OR REPLACE INTO analyses(id, kind, params, result, data_versions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (record["id"], record["kind"], json.dumps(params), json.dumps(result, allow_nan=False),
             json.dumps(record["data_versions"]), record["created_at"], record["updated_at"]))
        op.con.commit()
        try:
            ws().autosave()
        except KiriFileError:
            pass
    record["saved"] = not op.read_only
    return record


# ── Notebook entries (the Notebook screen itself comes later) ──
class NoteBody(BaseModel):
    kind: Literal["figure", "text", "result"]
    body: dict


@router.post("/notebook")
def add_note(body: NoteBody):
    try:
        op = ws().require()
    except KiriFileError as e:
        return JSONResponse(status_code=409, content={"error": e.code})
    if op.read_only:
        return JSONResponse(status_code=409, content={"error": "read_only"})
    nid = uuid.uuid4().hex
    op.con.execute("INSERT INTO notebook(id, kind, body, pinned, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
                   (nid, body.kind, json.dumps(body.body, ensure_ascii=False), now(), now()))
    try:
        ws().autosave()
    except KiriFileError:
        pass
    return {"id": nid, "count": op.con.execute("SELECT COUNT(*) FROM notebook").fetchone()[0]}


@router.get("/notebook")
def list_notes():
    try:
        op = ws().require()
    except KiriFileError as e:
        return JSONResponse(status_code=409, content={"error": e.code})
    rows = op.con.execute("SELECT id, kind, body, pinned, created_at FROM notebook ORDER BY created_at")
    return [{"id": r[0], "kind": r[1], "body": json.loads(r[2]), "pinned": bool(r[3]), "created_at": r[4]} for r in rows]


# ── Saving a figure or table to a file the person picked in the Save dialog ──
EXPORT_TYPES = {".png", ".svg", ".pdf", ".csv", ".tsv", ".txt"}


class ExportBody(BaseModel):
    path: str
    data_base64: str


@router.post("/export")
def export_file(body: ExportBody):
    import base64
    import os

    p = Path(body.path).expanduser()
    if p.suffix.lower() not in EXPORT_TYPES or not p.is_absolute():
        return JSONResponse(status_code=400, content={"error": "bad_export_path"})
    if not p.parent.is_dir():
        return JSONResponse(status_code=400, content={"error": "folder_missing"})
    data = base64.b64decode(body.data_base64)
    tmp = p.with_name(f".{p.name}.{uuid.uuid4().hex[:8]}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, p)
    return {"path": str(p), "bytes": len(data)}
