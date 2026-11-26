"""
Kiri — Product website server (the password-gated download site)

Serves the static website in KIRI_SITE_DIR behind the same AccessGateMiddleware
as the test build. It does not load the analysis API.

Routes:
* /api/health      open, for the host's health check
* /api/release     the newest published Mac build, or null
* /download/mac    redirects to the newest .dmg on GitHub Releases
                   (?arch=intel picks the Intel build when there is one)
* everything else  static pages; missing pages get the 404 page

Run with: uvicorn app.site:app
"""

import asyncio
import json
import logging
import time
import urllib.request
from pathlib import Path

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response
from starlette.routing import Route

from app.core.config import settings
from app.core.gate import AccessGateMiddleware

logger = logging.getLogger("kiri.site")

RELEASES_API = f"https://api.github.com/repos/{settings.KIRI_RELEASE_REPO}/releases?per_page=20"
RELEASES_PAGE = f"https://github.com/{settings.KIRI_RELEASE_REPO}/releases"
CACHE_SECONDS = 600

_cache: dict = {"at": 0.0, "value": None}


def pick_mac_assets(releases: list[dict]) -> dict | None:
    """Newest non-draft release with a .dmg. Prefers *_aarch64.dmg; notes an *_x64.dmg."""
    for rel in releases:
        if rel.get("draft"):
            continue
        dmgs = [a for a in rel.get("assets", []) if str(a.get("name", "")).lower().endswith(".dmg")]
        if not dmgs:
            continue
        arm = next((a for a in dmgs if "aarch64" in a["name"].lower() or "arm64" in a["name"].lower()), None)
        intel = next((a for a in dmgs if "x64" in a["name"].lower() or "x86_64" in a["name"].lower()), None)
        main = arm or next((a for a in dmgs if a is not intel), dmgs[0])

        def info(a):
            return {
                "file": a["name"],
                "url": a["browser_download_url"],
                "size_mb": round(a.get("size", 0) / 1_000_000) or None,
                "version": str(rel.get("tag_name", "")).lstrip("v"),
            }

        return {"mac": info(main), "mac_intel": info(intel) if intel and intel is not main else None, "page": rel.get("html_url")}
    return None


def _fetch_releases() -> list[dict]:
    req = urllib.request.Request(RELEASES_API, headers={"Accept": "application/vnd.github+json", "User-Agent": "kiri-site"})
    with urllib.request.urlopen(req, timeout=8) as resp:
        return json.loads(resp.read().decode("utf-8"))


async def latest_mac() -> dict | None:
    now = time.time()
    if now - _cache["at"] < CACHE_SECONDS:
        return _cache["value"]
    try:
        releases = await asyncio.to_thread(_fetch_releases)
        value = pick_mac_assets(releases)
    except Exception as exc:  # GitHub down or rate-limited: keep the last answer
        logger.warning(f"Could not read GitHub releases: {exc}")
        value = _cache["value"]
        _cache["at"] = now - CACHE_SECONDS + 60  # retry in a minute
        return value
    _cache.update(at=now, value=value)
    return value


def _site_dir() -> Path:
    return Path(settings.KIRI_SITE_DIR).resolve()


def _not_found() -> Response:
    page = _site_dir() / "404.html"
    if page.is_file():
        return HTMLResponse(page.read_text(encoding="utf-8"), status_code=404)
    return HTMLResponse("Not found", status_code=404)


async def health(request: Request):
    return JSONResponse({"status": "ok"})


async def release(request: Request):
    value = await latest_mac()
    body = {"mac": value["mac"] if value else None, "mac_intel": value["mac_intel"] if value else None}
    return JSONResponse(body, headers={"Cache-Control": "no-store"})


async def download_mac(request: Request):
    value = await latest_mac()
    if not value:
        return RedirectResponse("/install-mac.html", status_code=302)
    pick = value["mac_intel"] if request.query_params.get("arch") == "intel" and value["mac_intel"] else value["mac"]
    return RedirectResponse(pick["url"], status_code=302)


async def static(request: Request):
    path = request.path_params.get("path", "")
    root = _site_dir()
    candidate = (root / path).resolve()
    if not candidate.is_relative_to(root):
        return _not_found()
    if candidate.is_dir():
        if path and not path.endswith("/"):
            return RedirectResponse("/" + path + "/", status_code=301)
        candidate = candidate / "index.html"
    elif not candidate.is_file() and not candidate.suffix:
        candidate = candidate.with_suffix(".html")
    if not candidate.is_file():
        return _not_found()
    cache = "public, max-age=3600" if candidate.parent.name == "assets" else "no-cache"
    return FileResponse(candidate, headers={"Cache-Control": cache})


app = Starlette(
    routes=[
        Route("/api/health", health),
        Route("/api/release", release),
        Route("/download/mac", download_mac),
        Route("/{path:path}", static),
    ]
)
app.add_middleware(AccessGateMiddleware)
