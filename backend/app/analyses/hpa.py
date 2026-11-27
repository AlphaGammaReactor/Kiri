"""
Human Protein Atlas (CC BY 4.0) facts about a gene, from the bundled tables built by scripts/build_hpa.py:
the protein in tumour vs normal tissue (CPTAC mass spectrometry, as summarised by HPA), where in the cell the
protein sits, the normal tissues with the most RNA, and tissues with high antibody staining.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import pandas as pd

from app.analyses.common import clean

DIR = Path(__file__).resolve().parent.parent / "cohorts" / "samples"

# TCGA project -> words that name the same cancer in HPA's CPTAC list.
CANCER_WORDS = {
    "COAD": ["colon", "colorectal"], "READ": ["colon", "colorectal", "rect"], "BRCA": ["breast"],
    "LUAD": ["lung adeno"], "LUSC": ["lung squamous"], "KIRC": ["clear cell renal", "kidney", "renal"],
    "UCEC": ["endometri", "uterine"], "OV": ["ovar"], "PAAD": ["pancrea"], "GBM": ["glioblastoma", "brain"],
    "HNSC": ["head and neck", "head & neck"], "LIHC": ["liver", "hepatocellular"], "STAD": ["stomach", "gastric"],
}


@lru_cache(maxsize=1)
def _cptac() -> pd.DataFrame | None:
    f = DIR / "hpa_cptac.tsv.gz"
    return pd.read_csv(f, sep="\t") if f.exists() else None


@lru_cache(maxsize=1)
def _genes() -> pd.DataFrame | None:
    f = DIR / "hpa_gene.tsv.gz"
    return pd.read_csv(f, sep="\t").set_index("gene") if f.exists() else None


@lru_cache(maxsize=1)
def release() -> dict:
    try:
        return json.loads((DIR / "hpa_release.json").read_text())
    except (OSError, ValueError):
        return {}


def cancer_for(projects: list[str], names: list[str]) -> str | None:
    """The HPA CPTAC cancer that matches the project's TCGA cancer, if CPTAC studied it."""
    for p in projects:
        for w in CANCER_WORDS.get(p.replace("TCGA-", ""), []):
            hit = next((n for n in names if w in n.lower()), None)
            if hit:
                return hit
    return None


def _split(v) -> list[str]:
    return [x for x in str(v).split(";") if x and x != "nan"] if pd.notna(v) else []


def profile(gene: str, projects: list[str]) -> dict | None:
    """None when the tables are missing or HPA has nothing on the gene."""
    cp, gt = _cptac(), _genes()
    if cp is None and gt is None:
        return None
    out: dict = {"gene": gene}
    if cp is not None:
        rows = cp[cp["gene"] == gene]
        if not rows.empty:
            here = cancer_for(projects, sorted(cp["cancer"].unique()))
            out["cptac"] = {
                "cancer": here,
                "rows": [{"cancer": r.cancer, "log2fc": clean(r.log2fc), "padj": clean(r.padj)} for r in rows.sort_values("log2fc").itertuples()],
                "studied": here is not None and here in set(rows["cancer"]),
            }
    if gt is not None and gene in gt.index:
        r = gt.loc[gene]
        if isinstance(r, pd.DataFrame):
            r = r.iloc[0]
        out["location"] = _split(r.get("location"))
        out["reliability"] = None if pd.isna(r.get("reliability")) else str(r.get("reliability"))
        out["rna_top"] = [{"tissue": t.rsplit(":", 1)[0], "ntpm": clean(float(t.rsplit(":", 1)[1]))} for t in _split(r.get("rna_top")) if ":" in t]
        out["ihc_high"] = _split(r.get("ihc_high"))
    if len(out) == 1:
        return None
    rel = release()
    out["source"] = {"name": "Human Protein Atlas", "version": rel.get("version", ""), "licence": rel.get("licence", "CC BY 4.0"),
                     "url": f"https://www.proteinatlas.org/search/{gene}"}
    return out
