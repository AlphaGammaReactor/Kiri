"""Build the small TCGA slices that ship inside Kiri for the sample projects.

They let the sample projects open and run offline on first start. The data are
the GDC harmonised STAR TPM values, survival and clinical tables as published
by the UCSC Xena GDC hub (Goldman et al., Nat Biotechnol 2020), for a handful
of genes. Uses the hub's query API (xenaPython), so only the listed genes are fetched.
Run on a machine that can reach the hub (GitHub Actions does this):

    python scripts/build_sample_slice.py out_dir
"""

import gzip
import json
import math
import sys
from datetime import date
from pathlib import Path

import xenaPython as xena

HUB = "https://gdc.xenahubs.net"
SLICES = {
    "TCGA-COADREAD": {"projects": ["TCGA-COAD", "TCGA-READ"],
                      "genes": ["PARL", "MAVS", "TP53", "MKI67", "CDX2", "VIL1", "GAPDH", "ACTB",
                                "PINK1", "OPA1", "MFN2", "TFAM", "IFNB1", "DDX58", "IFIH1", "TBK1",
                                "IRF3", "CDH1", "MUC2", "LGR5"]},
    "TCGA-BRCA": {"projects": ["TCGA-BRCA"],
                  "genes": ["TP53", "MDM2", "CDKN1A", "BAX", "ESR1", "PGR", "ERBB2", "MKI67",
                            "GAPDH", "ACTB", "BRCA1", "BRCA2", "GATA3", "FOXA1", "KRT5", "EGFR"]},
}


def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def cohort_of(proj: str) -> str:
    code = proj.split("-", 1)[1]
    names = [c for c in xena.all_cohorts(HUB, []) if c.startswith("GDC TCGA") and c.endswith(f"({code})")]
    if not names:
        raise SystemExit(f"No GDC cohort for {proj}")
    return names[0]


def datasets(cohort: str) -> dict:
    found = {}
    for d in xena.dataset_list(HUB, [cohort]):
        n = d["name"]
        print("  dataset:", n, d.get("type"), flush=True)
        for key, pat in (("expr", "star_tpm"), ("surv", "survival"), ("clin", "clinical")):
            if pat in n and key not in found:
                found[key] = n
    missing = {"expr", "surv", "clin"} - found.keys()
    if missing:
        raise SystemExit(f"{cohort}: no dataset for {missing}")
    return found


def phenotype(ds: str, samples: list, wanted: dict) -> dict:
    """Field values for the samples, categorical codes decoded. wanted: key -> candidate names."""
    fields = set(xena.dataset_field(HUB, ds))
    pick = {k: next((f for f in names if f in fields), None) for k, names in wanted.items()}
    print("  fields from", ds, pick, flush=True)
    use = [f for f in pick.values() if f]
    vals = xena.dataset_fetch(HUB, ds, samples, use) if use else []
    codes = {c["name"]: (c["code"].split("\t") if c.get("code") else None)
             for c in xena.field_codes(HUB, ds, use)} if use else {}
    out = {}
    for k, f in pick.items():
        if not f:
            out[k] = [None] * len(samples)
            continue
        col = vals[use.index(f)]
        cs = codes.get(f)
        out[k] = [(cs[int(v)] if cs and num(v) is not None else num(v)) for v in col]
    return out


def stage_of(s) -> str:
    if not isinstance(s, str) or not s.startswith("Stage"):
        return ""
    s = s.replace("Stage ", "").strip()
    for roman in ("IV", "III", "II", "I"):
        if s.startswith(roman):
            return roman
    return ""


def build(name: str, spec: dict) -> dict:
    samples, values = [], {g: [] for g in spec["genes"]}
    for proj in spec["projects"]:
        cohort = cohort_of(proj)
        print(proj, "->", cohort, flush=True)
        ds = datasets(cohort)
        ids = xena.dataset_samples(HUB, ds["expr"], None)
        keep = []
        for sid in ids:
            code = sid.split("-")[3][:2] if len(sid.split("-")) > 3 else ""
            kind = "tumor" if code in ("01", "02", "03", "05", "06") else "normal" if code == "11" else None
            if kind:
                keep.append((sid, kind))
        sids = [s for s, _ in keep]
        expr = {}
        for row in xena.dataset_gene_probe_avg(HUB, ds["expr"], sids, spec["genes"]):
            sc = row["scores"]
            if sc and isinstance(sc[0], list):
                sc = sc[0]
            expr[row["gene"]] = sc if sc and len(sc) == len(sids) else [None] * len(sids)
            if not (sc and len(sc) == len(sids)):
                print("  WARNING: no values for", row["gene"], flush=True)
        surv = phenotype(ds["surv"], sids, {"t": ["OS.time"], "e": ["OS"]})
        clin = phenotype(ds["clin"], sids, {
            "stage": ["ajcc_pathologic_stage.diagnoses", "ajcc_pathologic_stage"],
            "age": ["age_at_index.demographic", "age_at_index"],
            "sex": ["gender.demographic", "gender"],
        })
        for i, (sid, kind) in enumerate(keep):
            age = num(clin["age"][i])
            ev = num(surv["e"][i])
            samples.append({
                "id": sid, "case": sid[:12], "type": kind, "project": proj,
                "stage": stage_of(clin["stage"][i]),
                "age": age,
                "sex": clin["sex"][i] if isinstance(clin["sex"][i], str) else "",
                "os_time": num(surv["t"][i]),
                "os_event": int(ev) if ev is not None else None,
            })
            for g in spec["genes"]:
                v = num(expr[g][i])
                values[g].append(round(v, 4) if v is not None else None)
    return {
        "name": name, "projects": spec["projects"], "built": date.today().isoformat(),
        "source": "GDC harmonised data (STAR, GENCODE v36) via the UCSC Xena GDC hub",
        "units": "log2(TPM + 1)", "samples": samples, "genes": values,
    }


def main(out: str) -> None:
    out_dir = Path(out)
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, spec in SLICES.items():
        data = build(name, spec)
        n_t = sum(s["type"] == "tumor" for s in data["samples"])
        n_n = sum(s["type"] == "normal" for s in data["samples"])
        print(f"{name}: {n_t} tumour, {n_n} normal samples, {len(data['genes'])} genes")
        # mtime=0 keeps the file identical when the data are, so CI only commits real changes.
        raw = json.dumps(data, separators=(",", ":")).encode()
        (out_dir / f"{name}.slice.json.gz").write_bytes(gzip.compress(raw, mtime=0))


if __name__ == "__main__":
    main(sys.argv[1])
