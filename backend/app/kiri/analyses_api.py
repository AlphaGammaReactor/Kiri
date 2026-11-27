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

from app.analyses import correlation, expression, survival
from app.analyses.genesets import GENESETS
from app.cohorts import packs
from app.cohorts.store import CohortUnavailable, cohort_for, slice_for
from app.core.config import settings
from app.kiri.api import ws
from app.kiri.fileformat import KiriFileError, now
from app.kiri.owndata import own_cohort, own_dataset_of

router = APIRouter(prefix="/kiri", tags=["analyses"])
_run_lock = threading.Lock()


def _data_dir() -> Path:
    return Path(settings.KIRI_DATA_DIR)


def _projects(project: dict) -> list[str]:
    ds = [d for d in project.get("datasets", []) if d.startswith("TCGA-")]
    return ds or [f"TCGA-{c}" for c in project.get("cancers", [])]


class RunBody(BaseModel):
    kind: Literal["survival", "expression_tn", "expression_stage", "expression_group", "correlation", "signature"]
    gene: str
    gene2: Optional[str] = None  # correlation: the second gene
    cut: Literal["median", "quartile", "optimal"] = "median"
    adjust: list[Literal["age", "stage"]] = Field(default_factory=list)
    paired: bool = False
    set_id: str = "uprmt_markers"  # signature: a built-in gene set, or "custom"
    members: list[str] = Field(default_factory=list, max_length=200)  # signature: the custom set
    replace: Optional[str] = None  # analysis id to overwrite (changing options)
    check_only: bool = False  # Reproduce: compute again and return the numbers without saving


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
    own = own_dataset_of(op.project())
    if own:
        try:
            c = own_cohort(op, own)
            return {"projects": [own], "sample_slice": None, "packs": {}, "own": {"id": own, "name": c.name, "n": len(c.samples),
                    "values": len(c._genes), "survival": bool(c.samples["os_time"].notna().any() and c.samples["os_event"].notna().any()),
                    "groups": sorted({g for g in c.samples["group"] if g}), "units": c.units}}
        except KeyError:
            pass
    projects = _projects(op.project())
    sl = slice_for(projects) if projects else None
    return {
        "projects": projects,
        "sample_slice": sl,
        "packs": {p: {"ready": packs.is_ready(_data_dir(), p), **packs.progress_of(p)} for p in projects},
    }


@router.get("/genesets")
def genesets(language: str = "en"):
    """The built-in gene sets (marker lists with citations) for the gene set score."""
    from app.analyses.genesets import listing

    return {"items": listing(language)}


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
        checks = res.get("checks") or []
        worst = next((s for s in ("problem", "caution", "pass") if any(c.get("status") == s for c in checks)), None)
        a["headline"] = {k: res.get(k) for k in ("p_report", "error")} | {
            "hr": (res.get("cox_adjusted") or res.get("cox") or {}).get("hr"), "p": (res.get("test") or {}).get("p", res.get("p")),
            "rho": res.get("rho"), "n": (res.get("counts") or {}).get("patients") or res.get("n"), "worst": worst}
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


@router.get("/analyses/{aid}/rows")
def analysis_rows(aid: str):
    """The per-sample rows behind a stored analysis (data table, CSV, scripts)."""
    from app.analyses.tables import rows_for

    try:
        op = ws().require()
    except KiriFileError as e:
        return JSONResponse(status_code=409, content={"error": e.code})
    r = op.con.execute("SELECT kind, params FROM analyses WHERE id = ?", (aid,)).fetchone()
    if not r:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    params = json.loads(r[1])
    genes = [params["gene"]] + ([params["gene2"]] if params.get("gene2") else [])
    try:
        projects = params.get("projects") or _projects(op.project())
        if projects and projects[0].startswith("own:"):
            try:
                c = own_cohort(op, projects[0])
            except KeyError:
                return JSONResponse(status_code=404, content={"error": "not_found"})
        elif r[0] == "signature":
            from app.kiri.signature_api import signature_cohort

            c = signature_cohort(projects, params["gene"], params.get("set_id", "uprmt_markers"), params.get("members") or [], _data_dir())
        else:
            c = cohort_for(projects, genes, _data_dir())
        return rows_for(c, r[0], params) | {"units": c.units, "data_version": c.data_version()}
    except CohortUnavailable as e:
        return JSONResponse(status_code=409, content={"error": e.code, **e.extra})


@router.post("/analyses/run")
def run(body: RunBody):
    try:
        op = ws().require()
    except KiriFileError as e:
        return JSONResponse(status_code=409, content={"error": e.code})
    gene = body.gene.strip().upper()
    gene2 = (body.gene2 or "").strip().upper()
    if body.kind == "correlation" and not gene2:
        return JSONResponse(status_code=400, content={"error": "needs_second_gene"})
    own = own_dataset_of(op.project())
    projects = [own] if own else _projects(op.project())
    if not projects:
        return JSONResponse(status_code=400, content={"error": "no_cohort"})
    try:
        wanted = [gene] + ([gene2] if body.kind == "correlation" else [])
        if own:
            try:
                c = own_cohort(op, own)
            except KeyError:
                return JSONResponse(status_code=400, content={"error": "no_cohort"})
        elif body.kind == "signature":
            from app.kiri.signature_api import signature_cohort

            c = signature_cohort(projects, gene, body.set_id, body.members, _data_dir())
        else:
            c = cohort_for(projects, wanted, _data_dir())
        for g in wanted:
            if not c.has(g):
                raise CohortUnavailable("gene_not_in_cohort", gene=g, cohort=c.name)
        with _run_lock:
            if body.kind == "survival":
                result = survival.run(c, gene, cut=body.cut, adjust=list(body.adjust))
            elif body.kind == "correlation":
                result = correlation.run(c, gene, gene2)
            elif body.kind == "expression_tn":
                result = expression.tumour_vs_normal(c, gene, paired=body.paired)
            elif body.kind == "expression_group":
                result = expression.by_group(c, gene)
            elif body.kind == "signature":
                from app.kiri.signature_api import run_signature

                if body.set_id != "custom" and body.set_id not in GENESETS:
                    return JSONResponse(status_code=400, content={"error": "unknown_set"})
                result = run_signature(c, gene, body.set_id, body.members, _data_dir())
            else:
                result = expression.by_stage(c, gene)
    except CohortUnavailable as e:
        return JSONResponse(status_code=409, content={"error": e.code, **e.extra})

    params = body.model_dump(exclude={"replace", "check_only"}) | {"gene": gene, "projects": projects}
    if body.kind == "correlation":
        params["gene2"] = gene2
    else:
        params.pop("gene2", None)
    if body.kind != "signature":
        params.pop("set_id", None)
        params.pop("members", None)
    elif body.set_id != "custom":
        params["members"] = []
    record = {"id": body.replace or uuid.uuid4().hex, "kind": body.kind, "params": params, "result": result,
              "data_versions": c.data_version(), "created_at": now(), "updated_at": now()}
    if body.check_only:
        record["saved"] = False
        return record
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
    updated = dict(op.con.execute("SELECT id, updated_at FROM analyses").fetchall())
    out = []
    for r in op.con.execute("SELECT id, kind, body, pinned, created_at FROM notebook ORDER BY created_at"):
        body = json.loads(r[2])
        aid = body.get("analysis_id")
        changed = bool(aid and aid in updated and updated[aid] > r[4])
        out.append({"id": r[0], "kind": r[1], "body": body, "pinned": bool(r[3]), "created_at": r[4], "changed_since": changed})
    return out


# ── Saving a figure or table to a file the person picked in the Save dialog ──
EXPORT_TYPES = {".png", ".svg", ".pdf", ".csv", ".tsv", ".txt", ".r", ".py"}


class ExportBody(BaseModel):
    path: str
    data_base64: str


class PdfBody(BaseModel):
    path: str
    svg: str


@router.post("/export/pdf")
def export_pdf(body: PdfBody):
    """A figure as a vector PDF, drawn from the same SVG the app shows."""
    import io
    import os

    from reportlab.graphics import renderPDF

    p = Path(body.path).expanduser()
    if p.suffix.lower() != ".pdf" or not p.is_absolute():
        return JSONResponse(status_code=400, content={"error": "bad_export_path"})
    if not p.parent.is_dir():
        return JSONResponse(status_code=400, content={"error": "folder_missing"})
    from app.kiri.report import svg_drawing

    d = svg_drawing(body.svg)
    if d is None:
        return JSONResponse(status_code=400, content={"error": "bad_svg"})
    buf = io.BytesIO()
    renderPDF.drawToFile(d, buf)
    data = buf.getvalue()
    tmp = p.with_name(f".{p.name}.{uuid.uuid4().hex[:8]}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, p)
    return {"path": str(p), "bytes": len(data)}


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


class NotePatch(BaseModel):
    pinned: Optional[bool] = None
    text: Optional[str] = None


@router.patch("/notebook/{nid}")
def patch_note(nid: str, body: NotePatch):
    try:
        op = ws().require()
    except KiriFileError as e:
        return JSONResponse(status_code=409, content={"error": e.code})
    if op.read_only:
        return JSONResponse(status_code=409, content={"error": "read_only"})
    r = op.con.execute("SELECT body FROM notebook WHERE id = ?", (nid,)).fetchone()
    if not r:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    if body.pinned is not None:
        op.con.execute("UPDATE notebook SET pinned = ?, updated_at = ? WHERE id = ?", (int(body.pinned), now(), nid))
    if body.text is not None:
        b = json.loads(r[0]) | {"text": body.text}
        op.con.execute("UPDATE notebook SET body = ?, updated_at = ? WHERE id = ?", (json.dumps(b, ensure_ascii=False), now(), nid))
    try:
        ws().autosave()
    except KiriFileError:
        pass
    return {"ok": True}


@router.delete("/notebook/{nid}")
def delete_note(nid: str):
    try:
        op = ws().require()
    except KiriFileError as e:
        return JSONResponse(status_code=409, content={"error": e.code})
    if op.read_only:
        return JSONResponse(status_code=409, content={"error": "read_only"})
    op.con.execute("DELETE FROM notebook WHERE id = ?", (nid,))
    try:
        ws().autosave()
    except KiriFileError:
        pass
    return {"ok": True}


class ReportBody(BaseModel):
    path: str
    format: Literal["pdf", "html", "docx"]
    title: str
    ids: Optional[list[str]] = None  # entries to include (default: all)
    labels: dict = Field(default_factory=dict)  # translated headings from the app


@router.post("/notebook/export")
def export_report(body: ReportBody):
    from app.kiri import report

    try:
        op = ws().require()
    except KiriFileError as e:
        return JSONResponse(status_code=409, content={"error": e.code})
    p = Path(body.path).expanduser()
    if p.suffix.lower() != f".{body.format}" or not p.is_absolute() or not p.parent.is_dir():
        return JSONResponse(status_code=400, content={"error": "bad_export_path"})
    notes = [n for n in list_notes() if body.ids is None or n["id"] in body.ids]
    data = report.build(body.format, body.title, op.project(), notes, body.labels)
    tmp = p.with_name(f".{p.name}.{uuid.uuid4().hex[:8]}.tmp")
    tmp.write_bytes(data)
    import os

    os.replace(tmp, p)
    return {"path": str(p), "bytes": len(data), "entries": len(notes)}


# ── One-page summary of the project (Overview) ──
class SummaryItem(BaseModel):
    title: str
    summary: str = ""
    analysis_id: Optional[str] = None
    checks: list = Field(default_factory=list)
    svg: Optional[str] = Field(default=None, max_length=5_000_000)  # figure drawn by the app from the saved result


class SummaryBody(BaseModel):
    path: str
    format: Literal["pdf", "html", "docx"]
    title: str
    intro: list[str] = Field(default_factory=list)  # translated lines under the title
    items: list[SummaryItem] = Field(default_factory=list)
    labels: dict = Field(default_factory=dict)
    one_page: bool = False  # PDF only: A4 landscape, the first four items as panels
    byline: str = ""
    footer: str = ""


@router.post("/summary/export")
def export_summary(body: SummaryBody):
    """A short report a supervisor can read: the question, then one block per analysis with its
    headline numbers, reliability line and the latest figure sent to the notebook for it."""
    import os

    from app.kiri import report

    try:
        op = ws().require()
    except KiriFileError as e:
        return JSONResponse(status_code=409, content={"error": e.code})
    p = Path(body.path).expanduser()
    if p.suffix.lower() != f".{body.format}" or not p.is_absolute() or not p.parent.is_dir():
        return JSONResponse(status_code=400, content={"error": "bad_export_path"})
    figs: dict[str, str] = {}
    for n in list_notes():  # oldest first, so the newest figure per analysis wins
        b = n["body"]
        if b.get("analysis_id") and b.get("svg"):
            figs[b["analysis_id"]] = b["svg"]
    if body.one_page and body.format == "pdf":
        panels = [{"svg": it.svg or figs.get(it.analysis_id or ""), "summary": it.summary, "title": it.title,
                   "worst": report.worst(it.checks)} for it in body.items[:4]]
        data = report.one_page_pdf(body.title, body.byline, panels, body.footer, body.labels)
        tmp = p.with_name(f".{p.name}.{uuid.uuid4().hex[:8]}.tmp")
        tmp.write_bytes(data)
        os.replace(tmp, p)
        return {"path": str(p), "bytes": len(data), "entries": len(panels)}
    when = {r[0]: r[1] for r in op.con.execute("SELECT id, updated_at FROM analyses")}
    entries = []
    for it in body.items:
        entries.append({"kind": "result", "created_at": when.get(it.analysis_id or "", now()),
                        "body": {"title": it.title, "summary": it.summary, "checks": it.checks,
                                 "svg": it.svg or figs.get(it.analysis_id or "")}})
    data = report.build(body.format, body.title, op.project(), entries, body.labels, intro=body.intro)
    tmp = p.with_name(f".{p.name}.{uuid.uuid4().hex[:8]}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, p)
    return {"path": str(p), "bytes": len(data), "entries": len(entries)}
