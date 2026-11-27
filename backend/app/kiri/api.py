"""HTTP API for projects (.kiri files), used by the desktop app."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app import __version__
from app.core.config import settings
from app.kiri import cancers, genes
from app.kiri.fileformat import KiriFileError, Workspace

router = APIRouter(prefix="/kiri", tags=["projects"])
_ws: Workspace | None = None


def ws() -> Workspace:
    global _ws
    if _ws is None:
        _ws = Workspace(f"{settings.KIRI_DATA_DIR}/projects", __version__)
    return _ws


def _err(e: KiriFileError, status: int = 409):
    return JSONResponse(status_code=status, content={"error": e.code, "detail": e.detail, **e.extra})


class NewProject(BaseModel):
    path: str
    name: str = ""
    question: str = ""
    template: str = "blank"
    targets: list[str] = Field(default_factory=list)
    cancers: list[str] = Field(default_factory=list)
    datasets: list[str] = Field(default_factory=list)
    standard_panel: bool = False
    language: str = "en"


class PathBody(BaseModel):
    path: str


class VersionBody(BaseModel):
    name: str


class ProjectPatch(BaseModel):
    name: Optional[str] = None
    question: Optional[str] = None
    targets: Optional[list[str]] = None
    cancers: Optional[list[str]] = None
    datasets: Optional[list[str]] = None
    standard_panel: Optional[bool] = None


@router.get("/recent")
def recent():
    return {"items": ws().recent()}


@router.delete("/recent")
def forget(body: PathBody):
    ws().forget(body.path)
    return {"ok": True}


@router.post("/new")
def new(body: NewProject):
    data = body.model_dump(exclude={"path", "language"})
    if not data["name"]:
        data.pop("name")
    try:
        return ws().create(body.path, data, body.language)
    except KiriFileError as e:
        return _err(e, 400)


SAMPLES = {
    "parl-mavs": {
        "name": "PARL–MAVS in CRC",
        "question": "Is PARL–MAVS signalling linked to outcome in colorectal cancer?",
        "zh": {"name": "PARL–MAVS 与结直肠癌", "question": "PARL–MAVS 信号是否与结直肠癌的预后相关？"},
        "template": "two_gene", "targets": ["PARL", "MAVS"], "cancers": ["COAD", "READ"],
        "datasets": ["TCGA-COAD", "TCGA-READ"], "standard_panel": True, "sample": True,
    },
    "tp53-brca": {
        "name": "TP53 in breast cancer",
        "question": "Is TP53 expression linked to survival in breast cancer, and does it change with stage?",
        "zh": {"name": "TP53 与乳腺癌", "question": "TP53 的表达是否与乳腺癌的生存相关？是否随分期变化？"},
        "template": "one_gene", "targets": ["TP53"], "cancers": ["BRCA"],
        "datasets": ["TCGA-BRCA"], "standard_panel": True, "sample": True,
    },
}
SAMPLE = SAMPLES["parl-mavs"]  # kept for older callers


@router.get("/samples")
def samples(language: str = "en"):
    """The sample projects that ship with Kiri (their data is bundled, so they work offline)."""
    out = []
    for sid, s in SAMPLES.items():
        loc = s["zh"] if language == "zh" else s
        out.append({"id": sid, "name": loc["name"], "question": loc["question"], "targets": s["targets"],
                    "cancers": s["cancers"], "template": s["template"]})
    return {"items": out}


@router.post("/sample")
def sample(language: str = "en", id: str = "parl-mavs"):  # noqa: A002 - query name used by the app
    """Open a built-in sample project, creating a fresh copy the first time."""
    from pathlib import Path

    if id not in SAMPLES:
        return JSONResponse(status_code=404, content={"error": "unknown_sample"})
    spec = SAMPLES[id]
    data = {k: v for k, v in spec.items() if k != "zh"}
    if language == "zh":
        data |= spec["zh"]
    folder = Path(settings.KIRI_DATA_DIR) / "samples"
    folder.mkdir(parents=True, exist_ok=True)
    # The file name stays the same in every language, so switching language reopens the same copy.
    path = folder / f"{spec['name']}.kiri"
    try:
        if path.exists():
            return ws().open(str(path))
        return ws().create(str(path), data, language)
    except KiriFileError as e:
        if e.code == "damaged":
            path.unlink(missing_ok=True)
            return ws().create(str(path), data, language)
        return _err(e)


@router.post("/open")
def open_(body: PathBody):
    try:
        return ws().open(body.path)
    except KiriFileError as e:
        return _err(e, 404 if e.code == "not_found" else 409)


@router.get("/project")
def current():
    w = ws()
    return w.current.summary() if w.current else JSONResponse(status_code=404, content={"error": "no_project"})


@router.patch("/project")
def patch(body: ProjectPatch):
    w = ws()
    try:
        op = w.require()
        op.update_project({k: v for k, v in body.model_dump().items() if v is not None})
        w.autosave()
        return op.summary()
    except KiriFileError as e:
        return _err(e)


@router.post("/versions")
def save_version(body: VersionBody):
    w = ws()
    try:
        v = w.require().save_version(body.name)
        w.autosave()
        return v
    except KiriFileError as e:
        return _err(e)


@router.post("/save-copy")
def save_copy(body: PathBody):
    try:
        return ws().save_copy(body.path)
    except KiriFileError as e:
        return _err(e)


@router.post("/restore-autosave")
def restore(body: PathBody):
    try:
        return ws().restore_autosave(body.path)
    except KiriFileError as e:
        return _err(e)


@router.post("/close")
def close():
    ws().close()
    return {"ok": True}


@router.get("/genes/check")
def gene_check(q: str):
    return genes.check(q)


@router.get("/cancers")
def cancer_types():
    return {"items": cancers.all_types()}
