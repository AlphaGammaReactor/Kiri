"""
Build the DepMap dependency summary bundled with Kiri: for every gene and cancer lineage, how strongly
knocking the gene out (CRISPR, Chronos gene effect) slows cancer cell lines down.

Source: DepMap Public release on figshare (Broad Institute), licence CC BY 4.0, checked here before use.
Files: CRISPRGeneEffect.csv (cell lines x genes) and Model.csv (lineage of each cell line).
Output: depmap_lineage.tsv.gz with gene, lineage, n, q10, q25, q50, q75, q90 (gene effect) and dep
(share of lines with effect <= -0.5, the usual "dependent" cut) for lineages with at least 5 lines,
plus lineage "All" over every line. Run by CI. Usage: python build_depmap.py <out_dir>
"""

import io
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

ARTICLES = [27993248, 25880521, 24667905]  # DepMap 24Q4, 24Q2, 23Q4 Public, newest first
UA = {"User-Agent": "kiri-ci"}


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600) as r:
        return r.read()


def release():
    for a in ARTICLES:
        try:
            meta = json.loads(get(f"https://api.figshare.com/v2/articles/{a}"))
        except Exception as e:  # noqa: BLE001
            print(a, "metadata failed:", e)
            continue
        lic = (meta.get("license") or {}).get("name", "")
        print(a, meta.get("title"), "licence:", lic)
        if "CC BY" not in lic or "NC" in lic or "ND" in lic:
            print("  skipped: licence is not CC BY")
            continue
        files = {f["name"]: f["download_url"] for f in meta.get("files", [])}
        if "CRISPRGeneEffect.csv" in files and "Model.csv" in files:
            return meta["title"], lic, files
        print("  files missing:", sorted(files)[:20])
    raise SystemExit("no DepMap release with a CC BY licence and the needed files")


def main(out: str) -> None:
    title, lic, files = release()
    model = pd.read_csv(io.BytesIO(get(files["Model.csv"])), low_memory=False)
    print("Model columns:", list(model.columns)[:30])
    lin = model.set_index("ModelID")["OncotreeLineage"].dropna()
    ge = pd.read_csv(io.BytesIO(get(files["CRISPRGeneEffect.csv"])), index_col=0)
    ge.columns = [c.split(" (")[0] for c in ge.columns]  # "TP53 (7157)" -> "TP53"
    ge = ge.loc[:, ~ge.columns.duplicated()]
    print("gene effect:", ge.shape)
    groups = {"All": ge.index.tolist()}
    for name, ids in lin[lin.index.isin(ge.index)].groupby(lin).groups.items():
        if len(ids) >= 5:
            groups[name] = list(ids)
    rows = []
    for name, ids in groups.items():
        m = ge.loc[ids].to_numpy(dtype=float)
        q = np.nanpercentile(m, [10, 25, 50, 75, 90], axis=0)
        n = np.sum(~np.isnan(m), axis=0)
        dep = np.nansum(m <= -0.5, axis=0) / np.maximum(n, 1)
        rows.append(pd.DataFrame({"gene": ge.columns, "lineage": name, "n": n, "q10": q[0], "q25": q[1], "q50": q[2],
                                  "q75": q[3], "q90": q[4], "dep": dep}))
    df = pd.concat(rows, ignore_index=True)
    df = df[df["n"] > 0].round({"q10": 2, "q25": 2, "q50": 2, "q75": 2, "q90": 2, "dep": 2})
    o = Path(out)
    df.to_csv(o / "depmap_lineage.tsv.gz", sep="\t", index=False, compression={"method": "gzip", "mtime": 0})
    (o / "depmap_release.json").write_text(json.dumps({"release": title, "licence": lic, "lines": len(ge), "genes": ge.shape[1],
                                                        "lineages": {k: len(v) for k, v in groups.items()}}, indent=1))
    print(f"{title}: {len(ge)} lines, {ge.shape[1]} genes, {len(groups)} lineages -> {len(df)} rows")
    print(df[df.gene.isin(["KRAS", "PARL", "MAVS"]) & df.lineage.isin(["All", "Bowel"])].to_string())


if __name__ == "__main__":
    main(sys.argv[1])
