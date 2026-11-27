"""
Cohorts: who the samples are, and expression values per gene.

Two sources, same interface:
* Bundled slices (samples/<name>.slice.json.gz): a few genes for the sample
  projects, so they open and run offline on first start.
* Cohort packs downloaded on first use (packs.py): every gene for one TCGA
  project, stored so one gene can be read without loading the whole matrix.

Values are log2(TPM + 1) from the GDC harmonised STAR pipeline.
"""

from __future__ import annotations

import gzip
import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

SAMPLES_DIR = Path(__file__).parent / "samples"


class CohortUnavailable(Exception):
    def __init__(self, code: str, **extra):
        super().__init__(code)
        self.code = code
        self.extra = extra


@dataclass
class Cohort:
    name: str
    projects: list[str]
    samples: pd.DataFrame          # id, case, type, project, stage, age, sex, os_time, os_event
    source: str
    units: str
    built: str
    _genes: dict[str, np.ndarray] = field(default_factory=dict)
    reader: object | None = None   # pack reader for genes not in _genes
    mutations: dict | None = None  # somatic mutation calls (mutations.py), when the source has them

    def has(self, gene: str) -> bool:
        return gene in self._genes or (self.reader is not None and self.reader.has(gene))

    def gene(self, gene: str) -> np.ndarray:
        if gene in self._genes:
            return self._genes[gene]
        if self.reader is not None and self.reader.has(gene):
            return self.reader.gene(gene, self.samples["id"].tolist())
        raise CohortUnavailable("gene_not_in_cohort", gene=gene, cohort=self.name)

    def has_mutation(self, gene: str) -> bool:
        """Mutation status is known for this gene (a bundled slice keeps only the commoner genes)."""
        return bool(self.mutations) and (not self.mutations.get("partial") or gene in self.mutations["genes"])

    def mutation(self, gene: str) -> np.ndarray:
        """1 mutated, 0 sequenced and not mutated, NaN not sequenced (see mutations.py)."""
        from app.cohorts.mutations import status

        if not self.mutations:
            raise CohortUnavailable("no_mutation_data", cohort=self.name)
        if not self.has_mutation(gene):
            raise CohortUnavailable("gene_not_in_cohort", gene=gene, cohort=self.name)
        return status(self.mutations, self.samples["id"].tolist(), gene)

    def data_version(self) -> dict:
        return {"cohort": self.name, "projects": self.projects, "source": self.source, "units": self.units, "built": self.built}


@lru_cache(maxsize=8)
def load_slice(name: str) -> Cohort:
    path = SAMPLES_DIR / f"{name}.slice.json.gz"
    if not path.exists():
        raise CohortUnavailable("slice_missing", cohort=name)
    with gzip.open(path, "rt", encoding="utf-8") as f:
        d = json.load(f)
    samples = pd.DataFrame(d["samples"])
    genes = {g: np.array([np.nan if v is None else v for v in vals], dtype=float) for g, vals in d["genes"].items()}
    return Cohort(d["name"], d["projects"], samples, d["source"], d["units"], d["built"], genes, mutations=d.get("mutations"))


def slice_for(projects: list[str]) -> str | None:
    """The bundled slice that covers exactly these TCGA projects, if any."""
    want = sorted(projects)
    for path in SAMPLES_DIR.glob("*.slice.json.gz"):
        name = path.name.replace(".slice.json.gz", "")
        try:
            if sorted(load_slice(name).projects) == want:
                return name
        except CohortUnavailable:
            continue
    return None


def cohort_for(projects: list[str], genes: list[str], data_dir: str | Path, mutated: list[str] | None = None) -> Cohort:
    """The best available cohort for these projects that has all `genes` (and mutation status for `mutated`)."""
    name = slice_for(projects)
    if name:
        c = load_slice(name)
        if all(c.has(g) for g in genes) and all(c.has_mutation(g) for g in (mutated or [])):
            return c
    from app.cohorts.packs import open_packs

    return open_packs(projects, Path(data_dir))
