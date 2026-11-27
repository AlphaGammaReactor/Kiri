"""
Cell line dependency (DepMap): does knocking the gene out slow cancer cells down?

Reads the bundled per-lineage summary of the DepMap CRISPR screens (Chronos gene effect; built by
scripts/build_depmap.py, licence CC BY 4.0). Gene effect 0 means no effect; -1 is the median of genes that
every cell line needs. A line counts as dependent at an effect of -0.5 or below.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import pandas as pd

from app.analyses.common import check, clean
from app.cohorts.store import CohortUnavailable

DIR = Path(__file__).resolve().parent.parent / "cohorts" / "samples"
DEP_CUT = -0.5
CITE = "DepMap, Broad (CC BY 4.0). Chronos: Dempster JM, et al. Genome Biol. 2021;22:343."

# TCGA project -> DepMap (Oncotree) lineage of matching cell lines.
LINEAGE = {
    "COAD": "Bowel", "READ": "Bowel", "BRCA": "Breast", "LUAD": "Lung", "LUSC": "Lung", "MESO": "Pleura",
    "SKCM": "Skin", "UVM": "Eye", "GBM": "CNS/Brain", "LGG": "CNS/Brain", "OV": "Ovary/Fallopian Tube",
    "PAAD": "Pancreas", "ESCA": "Esophagus/Stomach", "STAD": "Esophagus/Stomach", "KIRC": "Kidney", "KIRP": "Kidney",
    "KICH": "Kidney", "LIHC": "Liver", "CHOL": "Biliary Tract", "PRAD": "Prostate", "UCEC": "Uterus", "UCS": "Uterus",
    "HNSC": "Head and Neck", "BLCA": "Bladder/Urinary Tract", "LAML": "Myeloid", "DLBC": "Lymphoid", "SARC": "Soft Tissue",
    "THCA": "Thyroid", "CESC": "Cervix", "ACC": "Adrenal Gland", "PCPG": "Peripheral Nervous System", "TGCT": "Testis",
    "THYM": "Thymus",
}


@lru_cache(maxsize=1)
def _table() -> pd.DataFrame:
    f = DIR / "depmap_lineage.tsv.gz"
    if not f.exists():
        raise CohortUnavailable("annotation_unavailable", table=f.name)
    return pd.read_csv(f, sep="\t")


@lru_cache(maxsize=1)
def release() -> dict:
    try:
        return json.loads((DIR / "depmap_release.json").read_text())
    except (OSError, ValueError):
        return {}


def lineages_for(projects: list[str]) -> list[str]:
    return list(dict.fromkeys(LINEAGE[p.replace("TCGA-", "")] for p in projects if p.replace("TCGA-", "") in LINEAGE))


def _rows(gene: str) -> tuple[str, pd.DataFrame]:
    t = _table()
    sub = t[t["gene"] == gene]
    if sub.empty:
        from app.kiri.genes import other_names

        for n in other_names(gene):
            sub = t[t["gene"] == n]
            if not sub.empty:
                return n, sub
        raise CohortUnavailable("gene_not_screened", gene=gene)
    return gene, sub


def run(gene: str, projects: list[str]) -> dict:
    used, sub = _rows(gene)
    rel = release()
    mine = lineages_for(projects)
    allrow = sub[sub["lineage"] == "All"].iloc[0]
    rows = []
    for _, r in sub[sub["lineage"] != "All"].sort_values("q50").iterrows():
        rows.append({"lineage": r["lineage"], "n": int(r["n"]), "q10": clean(r["q10"]), "q25": clean(r["q25"]), "median": clean(r["q50"]),
                     "q75": clean(r["q75"]), "q90": clean(r["q90"]), "dep": clean(r["dep"]), "mine": r["lineage"] in mine})
    focus = next((x for x in rows if x["mine"]), None)
    common = float(allrow["dep"]) >= 0.9
    checks = [check("data", "pass", "data.depmap", lines=int(allrow["n"]), lineages=len(rows), release=rel.get("release", "DepMap"))]
    if mine and not focus:
        checks.append(check("enough", "caution", "enough.noLineage", lineage=", ".join(mine)))
    elif focus:
        ok = focus["n"] >= 10
        checks.append(check("enough", "pass" if ok else "caution", "enough.lineage" if ok else "enough.fewLines", n=focus["n"], lineage=focus["lineage"]))
    checks.append(check("assumptions", "caution", "assume.cellLines"))
    renamed = {gene: used} if used != gene else {}
    from app.analyses import opentargets

    return {
        "opentargets": opentargets.evidence(used, projects),
        "kind": "dependency", "gene": gene, "rows": rows, "cut": DEP_CUT,
        "all": {"n": int(allrow["n"]), "median": clean(allrow["q50"]), "dep": clean(allrow["dep"]), "q10": clean(allrow["q10"]), "q90": clean(allrow["q90"])},
        "focus": focus, "common_essential": common, "checks": checks,
        "data_version": {"cohort": "DepMap", "projects": projects, "source": f"{rel.get('release', 'DepMap Public')} CRISPR (Chronos gene effect)",
                         "units": "gene effect", "built": rel.get("release", ""), "cite": CITE, **({"renamed": renamed} if renamed else {})},
    }


def table(gene: str, projects: list[str]) -> dict:
    used, sub = _rows(gene)
    mine = set(lineages_for(projects))
    cols = ["lineage", "cell_lines", "gene_effect_q10", "q25", "median", "q75", "q90", "share_dependent"]
    rows = [[r["lineage"] + (" *" if r["lineage"] in mine else ""), int(r["n"]), r["q10"], r["q25"], r["q50"], r["q75"], r["q90"], r["dep"]]
            for _, r in sub.sort_values("q50").iterrows()]
    return {"columns": cols, "rows": rows, "units": "gene effect", "data_version": {"source": release().get("release", "DepMap")}}
