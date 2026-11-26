"""
Kiri — Serve the built frontend from the API process

One process serves both the pages and the API, so the hosted build is a single
container on a single origin (no CORS, no second service, one password gate).
"""

import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from app.core.config import settings

logger = logging.getLogger("kiri.static")


def mount_frontend(app: FastAPI) -> None:
    if not settings.KIRI_STATIC_DIR:
        return
    root = Path(settings.KIRI_STATIC_DIR).resolve()
    index = root / "index.html"
    if not index.is_file():
        logger.warning(f"KIRI_STATIC_DIR={root} has no index.html; the frontend is not served.")
        return

    @app.get("/{full_path:path}", include_in_schema=False)
    async def frontend(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)

        candidate = (root / full_path).resolve()
        # Never serve anything outside the frontend folder.
        if full_path and candidate.is_file() and candidate.is_relative_to(root):
            headers = {}
            if candidate.parent.name == "assets":
                # Vite gives these files content-hashed names, so they never change.
                headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return FileResponse(candidate, headers=headers)

        # A missing file with an extension is a real 404; any other path is an app route.
        if "." in full_path.rsplit("/", 1)[-1]:
            raise HTTPException(status_code=404)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    logger.info(f"Serving the frontend from {root}")
