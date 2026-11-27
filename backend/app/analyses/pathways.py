"""Bundled pathway libraries for enrichment (built by backend/scripts/build_pathways.py)."""

from __future__ import annotations

import gzip
import json
from functools import lru_cache
from pathlib import Path

DIR = Path(__file__).resolve().parent.parent / "pathway_sets"
LIBRARIES = ("hallmark", "reactome", "gobp", "wikipathways")


@lru_cache(maxsize=4)
def _read(lib: str) -> dict | None:
    path = DIR / f"{lib}.json.gz"
    if lib not in LIBRARIES or not path.exists():
        return None
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def load(lib: str) -> dict[str, dict]:
    """{set id: {"name", "genes", "library"}}, or {} when the library is not bundled."""
    d = _read(lib)
    if not d:
        return {}
    return {k: {**v, "library": lib} for k, v in d["sets"].items()}


def info() -> list[dict]:
    out = []
    for lib in LIBRARIES:
        d = _read(lib)
        out.append({"id": lib, "available": bool(d), **({k: d[k] for k in ("version", "licence", "citation", "source")} | {"n": len(d["sets"])} if d else {})})
    return out
