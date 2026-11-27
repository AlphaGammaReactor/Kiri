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
    copies: dict | None = None     # bundled slice: gene -> copy number per sample (copynumber.py)
    copy_reader: object | None = None  # pack: CopyReader

    def _expr_has(self, g: str) -> bool:
        return g in self._genes or (self.reader is not None and self.reader.has(g))

    def stored_name(self, gene: str, test=None) -> str:
        """The name this cohort keeps the gene under: as asked, or another HGNC name of the same gene
        (an older symbol, an alias, or today's symbol when the data use an older one)."""
        test = test or self._expr_has
        if test(gene):
            return gene
        from app.kiri.genes import other_names

        return next((n for n in other_names(gene) if test(n)), gene)

    def has(self, gene: str) -> bool:
        return self._expr_has(self.stored_name(gene))

    def gene(self, gene: str) -> np.ndarray:
        gene = self.stored_name(gene)
        if gene in self._genes:
            return self._genes[gene]
        if self.reader is not None and self.reader.has(gene):
            return self.reader.gene(gene, self.samples["id"].tolist())
        raise CohortUnavailable("gene_not_in_cohort", gene=gene, cohort=self.name)

    def _mut_has(self, gene: str) -> bool:
        return bool(self.mutations) and (not self.mutations.get("partial") or gene in self.mutations["genes"])

    def has_mutation(self, gene: str) -> bool:
        """Mutation status is known for this gene (a bundled slice keeps only the commoner genes)."""
        return self._mut_has(self.stored_name(gene, self._mut_has))

    def mutation(self, gene: str) -> np.ndarray:
        """1 mutated, 0 sequenced and not mutated, NaN not sequenced (see mutations.py)."""
        from app.cohorts.mutations import status

        if not self.mutations:
            raise CohortUnavailable("no_mutation_data", cohort=self.name)
        if not self.has_mutation(gene):
            raise CohortUnavailable("gene_not_in_cohort", gene=gene, cohort=self.name)
        return status(self.mutations, self.samples["id"].tolist(), self.stored_name(gene, lambda g: g in self.mutations["genes"]))

    def _cn_has(self, gene: str) -> bool:
        return (self.copies is not None and gene in self.copies) or (self.copy_reader is not None and self.copy_reader.has(gene))

    def has_copies(self, gene: str) -> bool:
        return self._cn_has(self.stored_name(gene, self._cn_has))

    def copy_number(self, gene: str) -> np.ndarray:
        """Whole copies of the gene per sample (NaN: no call)."""
        gene = self.stored_name(gene, self._cn_has)
        if self.copies is not None and gene in self.copies:
            return np.array([np.nan if v is None else v for v in self.copies[gene]], dtype=float)
        if self.copy_reader is not None and self.copy_reader.has(gene):
            return self.copy_reader.values(gene, self.samples["id"].tolist())
        if self.copies is None and self.copy_reader is None:
            raise CohortUnavailable("no_copy_data", cohort=self.name)
        raise CohortUnavailable("gene_not_in_cohort", gene=gene, cohort=self.name)

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
    return Cohort(d["name"], d["projects"], samples, d["source"], d["units"], d["built"], genes, mutations=d.get("mutations"), copies=d.get("copies"))


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


def cohort_for(projects: list[str], genes: list[str], data_dir: str | Path, mutated: list[str] | None = None,
               copies: list[str] | None = None) -> Cohort:
    """The best available cohort for these projects that has all `genes` (and mutation status for `mutated`,
    copy number for `copies`)."""
    name = slice_for(projects)
    if name:
        c = load_slice(name)
        if all(c.has(g) for g in genes) and all(c.has_mutation(g) for g in (mutated or [])) and all(c.has_copies(g) for g in (copies or [])):
            return c
    from app.cohorts.packs import open_packs

    return open_packs(projects, Path(data_dir))
