"""Data folder, downloaded cohorts and problem reports, for the desktop app."""

from __future__ import annotations

import platform
import shutil
import subprocess
import sys
import webbrowser
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app import __version__
from app.cohorts import packs
from app.core.config import settings

router = APIRouter(prefix="/kiri", tags=["system"])

ISSUES = "https://github.com/AlphaGammaReactor/Kiri/issues/new"


def _data_dir() -> Path:
    return Path(settings.KIRI_DATA_DIR)


def _size(p: Path) -> int:
    if not p.exists():
        return 0
    if p.is_file():
        return p.stat().st_size
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())


@router.get("/storage")
def storage():
    """The data folder, each downloaded cohort and the free space on its disk."""
    d = _data_dir()
    root = d / "cohorts"
    items = []
    if root.exists():
        for p in sorted(x for x in root.iterdir() if x.is_dir()):
            ready = packs.is_ready(d, p.name)
            info = {}
            if ready:
                import json

                info = json.loads((p / "ready.json").read_text())
            items.append({"project": p.name, "bytes": _size(p), "ready": ready, "samples": info.get("samples"),
                          "genes": info.get("genes"), **packs.progress_of(p.name)})
    du = shutil.disk_usage(d if d.exists() else d.parent)
    return {"data_dir": str(d), "cohorts": items, "cohort_bytes": _size(root), "projects_bytes": _size(d / "projects"),
            "free_bytes": du.free}


@router.delete("/storage/cohort")
def remove_cohort(project: str):
    """Delete one downloaded cohort. It can be downloaded again; saved results keep their numbers."""
    if not project.startswith("TCGA-") or "/" in project or ".." in project:
        return JSONResponse(status_code=400, content={"error": "unknown_project"})
    if packs.progress_of(project).get("state") == "downloading":
        return JSONResponse(status_code=409, content={"error": "busy"})
    shutil.rmtree(packs.pack_dir(_data_dir(), project), ignore_errors=True)
    return {"ok": True}


@router.post("/storage/reveal")
def reveal():
    """Show the data folder in Finder."""
    d = _data_dir()
    d.mkdir(parents=True, exist_ok=True)
    if sys.platform == "darwin":
        subprocess.Popen(["open", str(d)])  # noqa: S603,S607 - fixed program, our own folder
        return {"ok": True}
    return JSONResponse(status_code=409, content={"error": "unsupported"})


def diagnostics(lang: str, level: str, screen: str, error: str, app: str = "") -> str:
    """Exactly what a problem report contains. No file names, paths, genes or project content."""
    mac = platform.mac_ver()[0]
    lines = [
        f"kiri {app or __version__} · {('macOS ' + mac) if mac else platform.system()} · {platform.machine()}",
        f"lang {lang} · mode {level} · screen {screen}",
        f"engine {__version__} · python {platform.python_version()}",
    ]
    if error:
        lines.append(f"last error {error}")
    return "\n".join(lines)


class ReportBody(BaseModel):
    text: str = ""
    lang: str = "en"
    level: str = "learn"
    screen: str = ""
    error: str = ""
    app: str = ""


@router.post("/report/preview")
def report_preview(body: ReportBody):
    return {"diagnostics": diagnostics(body.lang, body.level, body.screen, body.error, body.app)}


@router.post("/report/open")
def report_open(body: ReportBody):
    """Open a new issue in the browser, filled in. Nothing is sent until the person submits it there."""
    title = (body.text.strip().splitlines() or ["Problem report"])[0][:80]
    text = f"{body.text.strip()}\n\n```\n{diagnostics(body.lang, body.level, body.screen, body.error, body.app)}\n```\n"
    url = f"{ISSUES}?title={quote(title)}&body={quote(text)}"
    webbrowser.open(url)
    return {"url": url}
