"""Build the small TCGA slices that ship inside Kiri for the sample projects.

They let the sample projects open and run offline on first start. The data are
the GDC harmonised STAR TPM values, survival and clinical tables as published
by the UCSC Xena GDC hub (Goldman et al., Nat Biotechnol 2020), for a handful
of genes. Run on a machine that can reach the hub (GitHub Actions does this):

    python scripts/build_sample_slice.py out_dir
"""

import gzip
import io
import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

import pandas as pd

HUB = "https://gdc-hub.s3.us-east-1.amazonaws.com/download"
SLICES = {
    "TCGA-COADREAD": {"projects": ["TCGA-COAD", "TCGA-READ"],
                      "genes": ["PARL", "MAVS", "TP53", "MKI67", "CDX2", "VIL1", "GAPDH", "ACTB",
                                "PINK1", "OPA1", "MFN2", "TFAM", "IFNB1", "DDX58", "IFIH1", "TBK1",
                                "IRF3", "CDH1", "MUC2", "LGR5"]},
    "TCGA-BRCA": {"projects": ["TCGA-BRCA"],
                  "genes": ["TP53", "MDM2", "CDKN1A", "BAX", "ESR1", "PGR", "ERBB2", "MKI67",
                            "GAPDH", "ACTB", "BRCA1", "BRCA2", "GATA3", "FOXA1", "KRT5", "EGFR"]},
}


def fetch(url: str) -> bytes:
    print("GET", url, flush=True)
    with urllib.request.urlopen(url, timeout=600) as r:
        return r.read()


def table(url: str) -> pd.DataFrame:
    raw = fetch(url)
    if url.endswith(".gz"):
        raw = gzip.decompress(raw)
    return pd.read_csv(io.BytesIO(raw), sep="\t", low_memory=False)


def gene_map() -> dict:
    """Ensembl id (no version) → symbol, from the hub's gene annotation."""
    t = table(f"{HUB}/gencode.v36.annotation.gtf.gene.probemap")
    return {r["id"].split(".")[0]: r["gene"] for _, r in t.iterrows()}


def stage_of(s) -> str:
    if not isinstance(s, str) or not s.startswith("Stage"):
        return ""
    s = s.replace("Stage ", "").strip()
    for roman in ("IV", "III", "II", "I"):
        if s.startswith(roman):
            return roman
    return ""


def build(name: str, spec: dict, ens2sym: dict) -> dict:
    sym2ens = {v: k for k, v in ens2sym.items()}
    samples, values = [], {g: [] for g in spec["genes"]}
    for proj in spec["projects"]:
        expr = table(f"{HUB}/{proj}.star_tpm.tsv.gz")
        expr["ens"] = expr.iloc[:, 0].str.split(".").str[0]
        expr = expr.set_index("ens").drop(columns=expr.columns[0])
        surv = table(f"{HUB}/{proj}.survival.tsv").set_index("sample")
        clin = table(f"{HUB}/{proj}.clinical.tsv.gz")
        clin = clin.set_index(clin.columns[0])
        for sid in expr.columns:
            code = sid.split("-")[3][:2] if len(sid.split("-")) > 3 else ""
            kind = "tumor" if code in ("01", "02", "03", "05", "06") else "normal" if code == "11" else None
            if kind is None:
                continue
            c = clin.loc[sid] if sid in clin.index else None
            sv = surv.loc[sid] if sid in surv.index else None
            stage_col = next((k for k in ("ajcc_pathologic_stage.diagnoses", "ajcc_pathologic_stage") if c is not None and k in c.index), None)
            age_col = next((k for k in ("age_at_index.demographic", "age_at_index") if c is not None and k in c.index), None)
            sex_col = next((k for k in ("gender.demographic", "gender") if c is not None and k in c.index), None)
            samples.append({
                "id": sid, "case": sid[:12], "type": kind, "project": proj,
                "stage": stage_of(c[stage_col]) if stage_col else "",
                "age": float(c[age_col]) if age_col and pd.notna(c[age_col]) else None,
                "sex": str(c[sex_col]) if sex_col and pd.notna(c[sex_col]) else "",
                "os_time": float(sv["OS.time"]) if sv is not None and pd.notna(sv["OS.time"]) else None,
                "os_event": int(sv["OS"]) if sv is not None and pd.notna(sv["OS"]) else None,
            })
            for g in spec["genes"]:
                e = sym2ens.get(g)
                v = expr.at[e, sid] if e in expr.index else None
                values[g].append(round(float(v), 4) if v is not None and pd.notna(v) else None)
    return {
        "name": name, "projects": spec["projects"], "built": date.today().isoformat(),
        "source": "GDC harmonised data (STAR, GENCODE v36) via the UCSC Xena GDC hub",
        "units": "log2(TPM + 1)", "samples": samples, "genes": values,
    }


def main(out: str) -> None:
    out_dir = Path(out)
    out_dir.mkdir(parents=True, exist_ok=True)
    ens2sym = gene_map()
    for name, spec in SLICES.items():
        data = build(name, spec, ens2sym)
        n_t = sum(s["type"] == "tumor" for s in data["samples"])
        n_n = sum(s["type"] == "normal" for s in data["samples"])
        print(f"{name}: {n_t} tumour, {n_n} normal samples, {len(data['genes'])} genes")
        with gzip.open(out_dir / f"{name}.slice.json.gz", "wt", encoding="utf-8") as f:
            json.dump(data, f, separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1])
