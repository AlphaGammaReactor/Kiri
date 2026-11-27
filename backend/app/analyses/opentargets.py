"""
Open Targets: how strongly a gene is linked to the project's cancer, from the bundled association summary
(Open Targets Platform, CC0 1.0; built by scripts/build_opentargets.py). The overall score (0 to 1) combines
evidence types: genetic association, somatic mutations, known drugs, pathways, RNA expression, literature,
animal models.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import pandas as pd

from app.analyses.common import clean

DIR = Path(__file__).resolve().parent.parent / "cohorts" / "samples"
TYPES = ["genetic_association", "somatic_mutation", "known_drug", "affected_pathway", "rna_expression", "literature", "animal_model"]
CITE = "Open Targets Platform (CC0 1.0). Buniello A, et al. Nucleic Acids Res. 2025;53:D1467-D1475."


@lru_cache(maxsize=1)
def _table() -> pd.DataFrame | None:
    f = DIR / "opentargets_cancer.tsv.gz"
    return pd.read_csv(f, sep="\t") if f.exists() else None


@lru_cache(maxsize=1)
def release() -> dict:
    try:
        return json.loads((DIR / "opentargets_release.json").read_text())
    except (OSError, ValueError):
        return {}


def code_for(projects: list[str]) -> str | None:
    codes = {p.replace("TCGA-", "") for p in projects}
    if codes & {"COAD", "READ"}:
        return "COADREAD"
    return next(iter(sorted(codes)), None) if len(codes) == 1 else None


def evidence(gene: str, projects: list[str]) -> dict | None:
    """The gene's association with the project's cancer, its rank among linked genes, and the evidence types.
    None when the summary is missing or the project has no single TCGA cancer."""
    t, code = _table(), code_for(projects)
    if t is None or code is None:
        return None
    sub = t[t["cancer"] == code].sort_values("score", ascending=False).reset_index(drop=True)
    if sub.empty:
        return None
    d = release().get("diseases", {}).get(code, {})
    hit = sub.index[sub["gene"] == gene]
    base = {"cancer": code, "disease": d.get("name", code), "disease_id": d.get("id"), "linked": int(len(sub)),
            "release": release().get("release", "Open Targets"), "cite": CITE, "min_score": release().get("min_score", 0.02)}
    if not len(hit):
        return base | {"score": None, "rank": None, "types": {}}
    r = sub.loc[hit[0]]
    return base | {"score": clean(r["score"]), "rank": int(hit[0]) + 1,
                   "types": {k: clean(r[k]) for k in TYPES if k in r and float(r[k]) > 0}}
