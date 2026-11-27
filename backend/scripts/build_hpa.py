"""
Build small per-gene tables from the Human Protein Atlas (HPA, CC BY 4.0), bundled with Kiri:

* hpa_cptac.tsv.gz: CPTAC mass-spectrometry protein abundance, tumour vs normal tissue, per cancer
  (log2 fold change and adjusted p), as HPA summarises it. HPA lists CPTAC under CC BY 4.0.
* hpa_gene.tsv.gz: where in the cell the protein sits (HPA subcellular atlas, with reliability), the normal
  tissues with the most RNA (HPA consensus nTPM) and the tissues where antibody staining is high.
* hpa_release.json: version, licence, citation.

Only HPA's own data and CPTAC are used; HPA's third-party sources with other terms are left out.
The licence page is checked before anything is written. Run by CI.
Usage: python build_hpa.py <out_dir>
"""

import io
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd

BASE = "https://www.proteinatlas.org/download/tsv/"
UA = {"User-Agent": "kiri-ci"}


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
        return r.read()


def table(name: str) -> pd.DataFrame:
    raw = get(BASE + name)
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        inner = [n for n in z.namelist() if n.endswith(".tsv")][0]
        df = pd.read_csv(z.open(inner), sep="\t", low_memory=False)
    print(f"{name}: {len(df)} rows; columns {list(df.columns)}")
    return df


def col(df: pd.DataFrame, *words: str) -> str:
    for w in words:
        for c in df.columns:
            if c.lower() == w.lower():
                return c
    for w in words:
        for c in df.columns:
            if w.lower() in c.lower():
                return c
    raise SystemExit(f"no column like {words} in {list(df.columns)}")


def licence() -> tuple[str, str]:
    page = get("https://www.proteinatlas.org/about/licence").decode("utf-8", "replace")
    if "Creative Commons Attribution 4.0" not in page:
        raise SystemExit("HPA licence page no longer says CC BY 4.0; not building")
    m = re.search(r"[Vv]ersion[:\s]+(\d+\.\d+)", get("https://www.proteinatlas.org/about/releases").decode("utf-8", "replace"))
    return "CC BY 4.0", (m.group(1) if m else "")


def main(out: str) -> None:
    o = Path(out)
    lic, version = licence()
    print("licence", lic, "version", version)

    c = table("cancer_cptac.tsv.zip")
    g, t = col(c, "Gene name", "gene"), col(c, "Cancer", "Tumor", "tumour")
    fc, p = col(c, "log2", "fold"), col(c, "adjusted", "padj", "q")
    cp = pd.DataFrame({"gene": c[g].astype(str), "cancer": c[t].astype(str),
                       "log2fc": pd.to_numeric(c[fc], errors="coerce").round(3),
                       "padj": pd.to_numeric(c[p], errors="coerce")})
    cp = cp.dropna(subset=["log2fc"])
    cp["padj"] = cp["padj"].map(lambda v: float(f"{v:.3g}") if pd.notna(v) else v)
    cp.to_csv(o / "hpa_cptac.tsv.gz", sep="\t", index=False, compression={"method": "gzip", "mtime": 0})
    print(f"cptac: {len(cp)} rows, {cp['gene'].nunique()} genes; cancers {sorted(cp['cancer'].unique())}")

    s = table("subcellular_location.tsv.zip")
    sg, rel = col(s, "Gene name"), col(s, "Reliability")
    levels = [x for x in ("Enhanced", "Supported", "Approved") if x in s.columns]
    sub = pd.DataFrame({"gene": s[sg].astype(str), "reliability": s[rel].astype(str),
                        "location": s[levels].fillna("").astype(str).agg(";".join, axis=1).str.strip(";").str.replace(";;", ";")})
    sub = sub[sub["location"] != ""].drop_duplicates("gene")

    r = table("rna_tissue_consensus.tsv.zip")
    rg, rt, rv = col(r, "Gene name"), col(r, "Tissue"), col(r, "nTPM", "TPM")
    r[rv] = pd.to_numeric(r[rv], errors="coerce")
    top = (r.sort_values(rv, ascending=False).groupby(rg).head(3)
           .assign(x=lambda d: d[rt].astype(str) + ":" + d[rv].round(1).astype(str))
           .groupby(rg)["x"].agg(";".join).rename("rna_top"))

    h = table("normal_ihc_data.tsv.zip")
    hg, ht, hl = col(h, "Gene name"), col(h, "Tissue"), col(h, "Level")
    hr = col(h, "Reliability")
    h = h[h[hl].astype(str).eq("High") & ~h[hr].astype(str).eq("Uncertain")]
    high = h.groupby(hg)[ht].agg(lambda v: ";".join(sorted(set(map(str, v)))[:8])).rename("ihc_high")

    genes = sub.set_index("gene").join(top, how="outer").join(high, how="outer").reset_index().rename(columns={"index": "gene"})
    genes.to_csv(o / "hpa_gene.tsv.gz", sep="\t", index=False, compression={"method": "gzip", "mtime": 0})
    print(f"gene table: {len(genes)} genes; e.g.\n{genes[genes['gene'].isin(['KRAS', 'MAVS', 'PARL', 'TP53'])].to_string()}")

    (o / "hpa_release.json").write_text(json.dumps({
        "name": "Human Protein Atlas", "version": version, "licence": lic, "url": "https://www.proteinatlas.org",
        "cite": "Uhlén M, et al. Tissue-based map of the human proteome. Science. 2015;347:1260419. Thul PJ, et al. "
                "A subcellular map of the human proteome. Science. 2017;356:eaal3321. Human Protein Atlas, proteinatlas.org.",
        "cptac_cite": "Data generated by the Clinical Proteomic Tumor Analysis Consortium (NCI/NIH), as summarised by the Human Protein Atlas.",
        "cancers": sorted(cp["cancer"].unique().tolist()),
    }, indent=1) + "\n")


if __name__ == "__main__":
    main(sys.argv[1])
