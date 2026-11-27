"""
Build backend/app/cohorts/samples/tcga_cdr.tsv.gz: progression-free interval (PFI) and
disease-specific survival (DSS) for every TCGA patient, from the TCGA Pan-Cancer Clinical Data
Resource (Liu et al., Cell 2018). Run by CI (the app's sandboxed builds cannot reach these hosts).

Sources, tried in order:
  1. the UCSC Xena PanCanAtlas hub copy of the CDR survival table (tab-separated);
  2. the original supplementary table published by the NCI GDC (Excel).

Usage: python build_cdr.py <out_dir>
"""

import io
import sys
import urllib.request
from pathlib import Path

import pandas as pd

XENA = "Survival_SupplementalTable_S1_20171025_xena_sp"
SOURCES = [
    ("xena", f"https://pancanatlas.xenahubs.net/download/{XENA}.gz"),
    ("xena", f"https://pancanatlas.xenahubs.net/download/{XENA}"),
    ("xena", f"https://tcga-pancan-atlas-hub.s3.us-east-1.amazonaws.com/download/{XENA}.gz"),
    ("gdc", "https://api.gdc.cancer.gov/data/1b5f413e-a8d1-4d10-92eb-7c4ae739ed81"),  # TCGA-CDR-SupplementalTableS1.xlsx
]
KEEP = ["PFI", "PFI.time", "DSS", "DSS.time"]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "kiri-ci"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def tidy(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns={"_PATIENT": "case", "bcr_patient_barcode": "case", "cancer type abbreviation": "type"})
    if "case" not in df.columns and "sample" in df.columns:
        df["case"] = df["sample"].str[:12]
    missing = [c for c in ["case", "type", *KEEP] if c not in df.columns]
    if missing:
        raise ValueError(f"columns missing: {missing}; have {list(df.columns)[:20]}")
    out = df[["case", "type", *KEEP]].copy()
    for c in KEEP:
        out[c] = pd.to_numeric(out[c], errors="coerce")
    out = out[out["case"].astype(str).str.match(r"^TCGA-\w\w-\w{4}$")]
    out = out.drop_duplicates("case").sort_values("case")
    for c in ("PFI", "DSS"):
        out[c] = out[c].astype("Int64")
    return out


def main(out_dir: str) -> None:
    errors = []
    for kind, url in SOURCES:
        try:
            raw = fetch(url)
            if kind == "xena":
                df = pd.read_csv(io.BytesIO(raw), sep="\t", compression="gzip" if url.endswith(".gz") else None)
            else:
                df = pd.read_excel(io.BytesIO(raw), sheet_name="TCGA-CDR")
            out = tidy(df)
            if len(out) < 10000:
                raise ValueError(f"only {len(out)} patients")
            dest = Path(out_dir) / "tcga_cdr.tsv.gz"
            out.to_csv(dest, sep="\t", index=False, compression={"method": "gzip", "mtime": 0})
            print(f"{url}: {len(out)} patients, PFI known for {out['PFI'].notna().sum()} -> {dest}")
            return
        except Exception as e:  # noqa: BLE001 - try the next source
            errors.append(f"{url}: {type(e).__name__}: {e}")
            print(errors[-1])
    sys.exit("no source worked:\n" + "\n".join(errors))


if __name__ == "__main__":
    main(sys.argv[1])
