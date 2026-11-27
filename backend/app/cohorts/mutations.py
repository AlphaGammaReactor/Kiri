"""
Somatic mutations for TCGA cohorts: which tumours carry a protein-changing mutation in a gene.

Source: the GDC open-access somatic mutation calls (whole exome, masked MAF, harmonised to GRCh38) as
published by the UCSC Xena GDC hub ("{project}.somaticmutation_wxs.tsv.gz"). Only tumours that appear in
the mutation file were sequenced; any other sample has an unknown status (never "wild-type").

A mutation counts when it changes the protein: missense, nonsense, frameshift, in-frame indels, splice
site, start or stop loss. Synonymous, intronic, UTR and other non-coding calls are ignored.
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import numpy as np
import pandas as pd

PROTEIN_CHANGING = ("missense", "stop_gained", "stop_lost", "start_lost", "frameshift", "inframe_insertion",
                    "inframe_deletion", "splice_acceptor", "splice_donor", "protein_altering", "nonsense",
                    "frame_shift", "in_frame", "splice_site", "translation_start_site", "nonstop")
FILE = "{p}.somaticmutation_wxs.tsv.gz"


def protein_changing(effect) -> bool:
    e = str(effect).lower()
    return any(k in e for k in PROTEIN_CHANGING)


def _col(df: pd.DataFrame, *names: str) -> str:
    low = {c.lower(): c for c in df.columns}
    for n in names:
        if n.lower() in low:
            return low[n.lower()]
    raise KeyError(f"none of {names} in {list(df.columns)[:12]}")


def parse(path: Path) -> dict:
    """{"profiled": [sample ids], "genes": {gene: [sample ids with a protein-changing mutation]}}."""
    df = pd.read_csv(path, sep="\t", low_memory=False)
    sc, gc, ec = _col(df, "sample", "Sample_ID", "Tumor_Sample_Barcode"), _col(df, "gene", "Hugo_Symbol"), _col(df, "effect", "Consequence", "Variant_Classification")
    profiled = sorted(set(df[sc].astype(str)))
    hit = df[df[ec].map(protein_changing)]
    genes = {g: sorted(set(v.astype(str))) for g, v in hit.groupby(gc)[sc]}
    return {"profiled": profiled, "genes": genes}


def save(data: dict, out: Path) -> None:
    out.write_bytes(gzip.compress(json.dumps(data, separators=(",", ":")).encode(), mtime=0))


def load(path: Path) -> dict | None:
    if not path.exists():
        return None
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def merge(parts: list[dict | None]) -> dict | None:
    """Mutation data for several projects together; None if any project has none."""
    if not parts or any(p is None for p in parts):
        return None
    genes: dict[str, list[str]] = {}
    for p in parts:
        for g, ids in p["genes"].items():
            genes.setdefault(g, []).extend(ids)
    return {"profiled": [s for p in parts for s in p["profiled"]], "genes": genes}


def status(data: dict, sample_ids: list[str], gene: str) -> np.ndarray:
    """Per sample: 1 mutated, 0 sequenced without a protein-changing mutation, NaN not sequenced.
    Sample ids may differ in their last letters between files (…-01A vs …-01), so match on the first 15."""
    key = lambda s: str(s)[:15]  # noqa: E731
    prof = {key(s) for s in data["profiled"]}
    mut = {key(s) for s in data["genes"].get(gene, [])}
    return np.array([1.0 if key(s) in mut else 0.0 if key(s) in prof else np.nan for s in sample_ids])
