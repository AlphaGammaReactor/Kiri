"""
Build two small tables from the TCGA PanCanAtlas, bundled with Kiri for every TCGA cohort:

* tcga_subtypes.tsv.gz: the molecular subtype of each tumour as curated for the PanCanAtlas
  (Subtype_Selected from TCGAbiolinks' PanCancerAtlas_subtypes; e.g. CMS-like CIN/GS/MSI/HM-SNV in colorectal,
  PAM50 in breast). Sources: the TCGA marker papers, collected by Sanchez-Vega et al. 2018 / Thorsson et al. 2018.
* tcga_purity.tsv.gz: tumour purity and ploidy from ABSOLUTE (PanCanAtlas master calls; Taylor et al. 2018).

Both are open-access PanCanAtlas files served by the UCSC Xena PanCanAtlas hub. Run by CI.
Usage: python build_pancan.py <out_dir>
"""

import io
import sys
import urllib.request
from pathlib import Path

import pandas as pd

HUB = "https://pancanatlas.xenahubs.net/download/"
SUBTYPES = ["TCGASubtype.20170308.tsv", "TCGASubtype.20170308.tsv.gz"]
PURITY = ["TCGA_mastercalls.abs_tables_JSedit.fixed.txt", "TCGA_mastercalls.abs_tables_JSedit.fixed.txt.gz"]


def fetch(names: list[str]) -> pd.DataFrame:
    errors = []
    for n in names:
        try:
            req = urllib.request.Request(HUB + n, headers={"User-Agent": "kiri-ci"})
            with urllib.request.urlopen(req, timeout=120) as r:
                raw = r.read()
            return pd.read_csv(io.BytesIO(raw), sep="\t", compression="gzip" if n.endswith(".gz") else None, low_memory=False)
        except Exception as e:  # noqa: BLE001
            errors.append(f"{n}: {type(e).__name__}: {e}")
            print(errors[-1])
    raise SystemExit("no source worked:\n" + "\n".join(errors))


def main(out: str) -> None:
    o = Path(out)
    s = fetch(SUBTYPES)
    print("subtypes columns:", list(s.columns))
    sid = next(c for c in s.columns if c.lower() in ("sampleid", "sample", "pan.samplesid"))
    keep = pd.DataFrame({"sample": s[sid].astype(str).str[:15], "cancer": s.get("cancer.type", s.get("cancer type", "")),
                         "subtype": s["Subtype_Selected"].astype(str)})
    keep = keep[keep["sample"].str.match(r"^TCGA-\w\w-\w{4}-\d\d$") & ~keep["subtype"].isin(["nan", "NA", ""])].drop_duplicates("sample")
    keep.to_csv(o / "tcga_subtypes.tsv.gz", sep="\t", index=False, compression={"method": "gzip", "mtime": 0})
    print(f"subtypes: {len(keep)} tumours; e.g. {keep['subtype'].value_counts().head(8).to_dict()}")

    p = fetch(PURITY)
    print("purity columns:", list(p.columns))
    scol = "sample" if "sample" in p.columns else p.columns[1]
    pur = pd.DataFrame({"sample": p[scol].astype(str).str[:15], "purity": pd.to_numeric(p["purity"], errors="coerce"),
                        "ploidy": pd.to_numeric(p["ploidy"], errors="coerce")})
    pur = pur[pur["purity"].notna() & pur["sample"].str.match(r"^TCGA-\w\w-\w{4}-\d\d$")].drop_duplicates("sample")
    pur.round(3).to_csv(o / "tcga_purity.tsv.gz", sep="\t", index=False, compression={"method": "gzip", "mtime": 0})
    print(f"purity: {len(pur)} tumours; median {pur['purity'].median():.2f}")


if __name__ == "__main__":
    main(sys.argv[1])
