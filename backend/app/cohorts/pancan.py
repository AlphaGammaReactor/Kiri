"""
Per-tumour annotations from the TCGA PanCanAtlas, bundled for every TCGA cohort (built by
scripts/build_pancan.py):

* molecular subtype (Subtype_Selected, as curated for the PanCanAtlas from the TCGA marker papers);
* tumour purity and ploidy from ABSOLUTE (Taylor et al., Cancer Cell 2018).

Matched by the first 15 characters of the sample barcode (patient + sample type).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

from app.cohorts.store import CohortUnavailable

DIR = Path(__file__).parent / "samples"
SUBTYPE_CITE = "Subtypes: TCGA marker papers, collected for the PanCanAtlas (TCGAbiolinks PanCancerAtlas_subtypes)."
PURITY_CITE = "Purity: ABSOLUTE, PanCanAtlas master calls (Taylor AM, et al. Cancer Cell. 2018;33:676-689)."


@lru_cache(maxsize=2)
def _table(name: str) -> pd.DataFrame:
    f = DIR / name
    if not f.exists():
        raise CohortUnavailable("annotation_unavailable", table=name)
    return pd.read_csv(f, sep="\t", dtype={"sample": str}).drop_duplicates("sample").set_index("sample")


def subtype(sample_ids: list[str]) -> np.ndarray:
    t = _table("tcga_subtypes.tsv.gz")["subtype"]
    return np.array([t.get(str(s)[:15]) for s in sample_ids], dtype=object)


def purity(sample_ids: list[str]) -> np.ndarray:
    t = _table("tcga_purity.tsv.gz")["purity"]
    return np.array([t.get(str(s)[:15], np.nan) for s in sample_ids], dtype=float)


def short(label: str) -> str:
    """'COAD.CIN' -> 'CIN', 'BRCA.LumA' -> 'LumA': the cancer prefix is the same within one cohort."""
    return label.split(".", 1)[1] if isinstance(label, str) and "." in label else label
