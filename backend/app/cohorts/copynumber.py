"""
Gene-level copy number for TCGA cohorts: GDC ASCAT3 absolute copy number per gene (whole-genome or
SNP-array derived, harmonised to GRCh38), as published by the UCSC Xena GDC hub
("{project}.gene-level_ascat3.tsv.gz"). Values are whole copies of the gene in the tumour.

States follow the copy count directly, so they read the same in every tumour: 0 deep deletion, 1 loss,
2 normal (two copies), 3-4 gain, 5 or more amplification. Tumours without a call are left out.
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import numpy as np
import pandas as pd

FILES = ["{p}.gene-level_ascat3.tsv.gz", "{p}.gene-level_ascat3.tsv"]
STATES = ["deletion", "loss", "normal", "gain", "amplification"]


def state_of(copies: float) -> str | None:
    if copies != copies:  # NaN
        return None
    c = int(round(copies))
    return "deletion" if c <= 0 else "loss" if c == 1 else "normal" if c == 2 else "gain" if c <= 4 else "amplification"


def convert(raw: Path, ens2sym: dict[str, str], out: Path) -> None:
    """The hub's genes x samples table to an int8 matrix read through a memory map (-1 = no call)."""
    opener = gzip.open if str(raw).endswith(".gz") else open
    with opener(raw, "rt") as f:
        df = pd.read_csv(f, sep="\t", index_col=0)
    df.index = [ens2sym.get(str(i).split(".")[0], str(i).split(".")[0]) for i in df.index]
    df = df[~df.index.duplicated(keep="first")]
    mat = np.clip(np.nan_to_num(df.to_numpy(dtype=float), nan=-1), -1, 120).round().astype(np.int8)
    np.save(out / "cn.npy", mat)
    (out / "cn_genes.json").write_text(json.dumps(list(df.index)))
    (out / "cn_columns.json").write_text(json.dumps(list(df.columns)))


class CopyReader:
    """Copy number from one or more converted packs."""

    def __init__(self, dirs: list[Path]):
        self.parts = []
        for d in dirs:
            if not (d / "cn.npy").exists():
                raise FileNotFoundError(d / "cn.npy")
            genes = json.loads((d / "cn_genes.json").read_text())
            cols = json.loads((d / "cn_columns.json").read_text())
            self.parts.append((np.load(d / "cn.npy", mmap_mode="r"), {g: i for i, g in enumerate(genes)}, {c[:15]: i for i, c in enumerate(cols)}))

    def has(self, gene: str) -> bool:
        return all(gene in g for _, g, _ in self.parts)

    def values(self, gene: str, sample_ids: list[str]) -> np.ndarray:
        out = np.full(len(sample_ids), np.nan)
        for mat, gidx, cidx in self.parts:
            if gene not in gidx:
                continue
            row = np.asarray(mat[gidx[gene]], dtype=float)
            for i, s in enumerate(sample_ids):
                j = cidx.get(str(s)[:15])
                if j is not None and row[j] >= 0:
                    out[i] = row[j]
        return out
