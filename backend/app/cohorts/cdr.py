"""
Clinical outcome endpoints for TCGA patients from the TCGA Pan-Cancer Clinical Data Resource
(TCGA-CDR; Liu et al., Cell 2018;173:400-416). The table is curated by the PanCanAtlas consortium
and published openly by the NCI Genomic Data Commons. Kiri bundles it (about 11,000 patients), so
progression-free interval (PFI) and disease-specific survival (DSS) work offline for every
TCGA cohort. CI builds the file with scripts/build_cdr.py.

Overall survival keeps coming from the GDC survival file in each cohort pack, so results made
before this table existed stay the same.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import pandas as pd

from app.cohorts.store import CohortUnavailable

FILE = Path(__file__).parent / "samples" / "tcga_cdr.tsv.gz"
ENDPOINTS = {"PFI": ("PFI.time", "PFI"), "DSS": ("DSS.time", "DSS")}
CITATION = "Liu J, et al. An Integrated TCGA Pan-Cancer Clinical Data Resource to Drive High-Quality Survival Outcome Analytics. Cell. 2018;173:400-416.e11."


def available() -> bool:
    return FILE.exists()


@lru_cache(maxsize=1)
def table() -> pd.DataFrame:
    if not FILE.exists():
        raise CohortUnavailable("endpoint_unavailable")
    t = pd.read_csv(FILE, sep="\t", dtype={"case": str})
    return t.drop_duplicates("case").set_index("case")


def attach(samples: pd.DataFrame, endpoint: str) -> pd.DataFrame:
    """The samples with ep_time (days) and ep_event for the endpoint, matched by patient barcode."""
    s = samples.copy()
    if endpoint == "OS":
        s["ep_time"], s["ep_event"] = s["os_time"], s["os_event"]
        return s
    tc, ec = ENDPOINTS[endpoint]
    if s.empty or not str(s["case"].iloc[0]).startswith("TCGA-"):
        raise CohortUnavailable("endpoint_unavailable", endpoint=endpoint)
    t = table()
    s["ep_time"] = pd.to_numeric(s["case"].map(t[tc]), errors="coerce")
    s["ep_event"] = pd.to_numeric(s["case"].map(t[ec]), errors="coerce")
    return s
