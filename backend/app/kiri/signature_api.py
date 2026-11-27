"""Gene set score: picking the cohort and adding the across-cancers panel."""

from __future__ import annotations

import json
from pathlib import Path

from app.analyses import signature
from app.cohorts import packs
from app.cohorts.store import SAMPLES_DIR, Cohort, CohortUnavailable, load_slice, slice_for


def signature_cohort(projects: list[str], gene: str, set_id: str, custom: list[str], data_dir: Path) -> Cohort:
    """The full cohort when it is downloaded; otherwise the bundled slice if it has my gene and
    enough members (the result then lists the members it lacks); otherwise ask for the download."""
    members, _ = signature.resolve_members(set_id, custom, gene)
    if all(packs.is_ready(data_dir, p) for p in projects):
        return packs.open_packs(projects, data_dir)
    name = slice_for(projects)
    if name:
        c = load_slice(name)
        if c.has(gene) and sum(c.has(g) for g in members) >= signature.MIN_MEMBERS:
            return c
    missing = [p for p in projects if not packs.is_ready(data_dir, p)]
    raise CohortUnavailable("needs_download", projects=missing)


def other_cohorts(data_dir: Path, exclude: list[str]) -> tuple[list[Cohort], list[str]]:
    """Every other cohort Kiri has on this computer: downloaded packs (one per TCGA project) and bundled slices."""
    out, names = [], set()
    root = data_dir / "cohorts"
    for ready in sorted(root.glob("*/ready.json")) if root.exists() else []:
        p = json.loads(ready.read_text()).get("project") or ready.parent.name
        if p in exclude:
            continue
        try:
            out.append(packs.open_packs([p], data_dir))
            names.add(p)
        except CohortUnavailable:
            continue
    for path in sorted(SAMPLES_DIR.glob("*.slice.json.gz")):
        c = load_slice(path.name.replace(".slice.json.gz", ""))
        if sorted(c.projects) == sorted(exclude) or any(p in names for p in c.projects):
            continue
        out.append(c)
    return out, sorted(names)


def run_signature(c: Cohort, gene: str, set_id: str, custom: list[str], data_dir: Path) -> dict:
    res = signature.run(c, gene, set_id, custom)
    if res.get("error"):
        return res
    others, _ = other_cohorts(data_dir, c.projects)
    acr = signature.across([c] + others, gene, set_id, custom)
    acr["current"] = c.name
    acr["downloaded"] = sum(1 for o in others if o.built == "downloaded") + (1 if c.built == "downloaded" else 0)
    res["across"] = acr
    return res
