"""
Expression across cancers: one gene in tumour and normal tissue for every TCGA cancer type,
with GTEx healthy tissue as an optional extra normal.

TCGA and GTEx are processed by different consortia, so comparing them directly mixes
pipelines. The UCSC Toil recompute (Vivian et al., Nat Biotechnol 2017) ran the same
RSEM pipeline on both, which is why this view uses it rather than the GDC STAR values
used elsewhere in Kiri. One gene is fetched at a time from the UCSC Xena Toil hub and
kept in the data folder, so each gene is downloaded once and then works offline.

Per cancer: Wilcoxon rank-sum test of tumour against normal, median difference, and
Benjamini–Hochberg correction across the cancers that have enough normal samples.
"""

from __future__ import annotations

import gzip
import json
import math
import re
import time
from pathlib import Path

import numpy as np
from scipy import stats

from app.analyses.common import bh, check, clean, summary
from app.cohorts.store import CohortUnavailable

HUB = "https://toil.xenahubs.net"
EXPR = "TcgaTargetGtex_rsem_gene_tpm"            # log2(TPM + 0.001)
PHENO = "TcgaTargetGTEX_phenotype.txt"
SOURCE = "UCSC Toil RNA-seq recompute of TCGA and GTEx (RSEM, GENCODE v23) via the UCSC Xena Toil hub"
CITATION = "Vivian J, et al. Toil enables reproducible, open source, big biomedical data analyses. Nat Biotechnol. 2017;35:314–316."
MIN_NORMAL = 3
POINTS = 60  # points drawn per box (all values are in the statistics)

# TCGA study names as the Toil phenotype spells them (lower-cased, letters only) -> project code.
TCGA = {
    "ACC": ["adrenocorticalcancer", "adrenocorticalcarcinoma"], "BLCA": ["bladderurothelialcarcinoma"],
    "BRCA": ["breastinvasivecarcinoma"], "CESC": ["cervicalendocervicalcancer", "cervicalsquamouscellcarcinomaandendocervicaladenocarcinoma"],
    "CHOL": ["cholangiocarcinoma"], "COAD": ["colonadenocarcinoma"], "DLBC": ["diffuselargebcelllymphoma", "lymphoidneoplasmdiffuselargebcelllymphoma"],
    "ESCA": ["esophagealcarcinoma"], "GBM": ["glioblastomamultiforme"], "HNSC": ["headnecksquamouscellcarcinoma", "headandnecksquamouscellcarcinoma"],
    "KICH": ["kidneychromophobe"], "KIRC": ["kidneyclearcellcarcinoma", "kidneyrenalclearcellcarcinoma"],
    "KIRP": ["kidneypapillarycellcarcinoma", "kidneyrenalpapillarycellcarcinoma"], "LAML": ["acutemyeloidleukemia"],
    "LGG": ["brainlowergradeglioma"], "LIHC": ["liverhepatocellularcarcinoma"], "LUAD": ["lungadenocarcinoma"],
    "LUSC": ["lungsquamouscellcarcinoma"], "MESO": ["mesothelioma"], "OV": ["ovarianserouscystadenocarcinoma"],
    "PAAD": ["pancreaticadenocarcinoma"], "PCPG": ["pheochromocytomaparaganglioma", "pheochromocytomaandparaganglioma"],
    "PRAD": ["prostateadenocarcinoma"], "READ": ["rectumadenocarcinoma"], "SARC": ["sarcoma"],
    "SKCM": ["skincutaneousmelanoma"], "STAD": ["stomachadenocarcinoma"], "TGCT": ["testiculargermcelltumor", "testiculargermcelltumors"],
    "THCA": ["thyroidcarcinoma"], "THYM": ["thymoma"], "UCEC": ["uterinecorpusendometrioidcarcinoma", "uterinecorpusendometrialcarcinoma"],
    "UCS": ["uterinecarcinosarcoma"], "UVM": ["uvealmelanoma"],
}
_NAME2CODE = {n: k for k, names in TCGA.items() for n in names}
# GTEx tissue (Toil "_primary_site") that matches each cancer's organ; None where no fair match exists.
GTEX = {
    "ACC": "Adrenal Gland", "BLCA": "Bladder", "BRCA": "Breast", "CESC": "Cervix Uteri", "CHOL": None, "COAD": "Colon",
    "DLBC": None, "ESCA": "Esophagus", "GBM": "Brain", "HNSC": None, "KICH": "Kidney", "KIRC": "Kidney", "KIRP": "Kidney",
    "LAML": None, "LGG": "Brain", "LIHC": "Liver", "LUAD": "Lung", "LUSC": "Lung", "MESO": None, "OV": "Ovary",
    "PAAD": "Pancreas", "PCPG": "Adrenal Gland", "PRAD": "Prostate", "READ": "Colon", "SARC": None, "SKCM": "Skin",
    "STAD": "Stomach", "TGCT": "Testis", "THCA": "Thyroid", "THYM": None, "UCEC": "Uterus", "UCS": "Uterus", "UVM": None,
}


def _key(s: str) -> str:
    return re.sub(r"[^a-z]", "", (s or "").lower())


def _xena():
    import warnings

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", FutureWarning)
        import xenaPython

    return xenaPython


# Sample genes ship with Kiri (built by CI, .github/workflows/across.yml) so the sample projects work offline.
BUNDLED = Path(__file__).resolve().parent.parent / "cohorts" / "samples" / "across"
SAMPLE_GENES = ["TP53", "MDM2", "PARL", "MAVS", "ATF5", "EGFR"]


def _safe(gene: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", gene)


def _cache(data_dir: Path) -> Path:
    d = Path(data_dir) / "across"
    (d / "genes").mkdir(parents=True, exist_ok=True)
    return d


def _read(path: Path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def _write(path: Path, obj) -> None:
    tmp = path.with_suffix(".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8") as f:
        json.dump(obj, f, separators=(",", ":"))
    tmp.replace(path)


def _decode(v, codes):
    """A phenotype value: categorical codes are indices into `codes`; missing comes as None, NaN or "NaN"."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return v
    if math.isnan(f):
        return None
    if codes:
        i = int(f)
        return codes[i] if 0 <= i < len(codes) else None
    return v


def phenotype(data_dir: Path) -> dict:
    """Samples with study, sample type, site and TCGA code. Fetched once, then read from the data folder."""
    path = _cache(data_dir) / "phenotype.json.gz"
    if path.exists():
        return _read(path)
    if (BUNDLED / "phenotype.json.gz").exists():
        return _read(BUNDLED / "phenotype.json.gz")
    try:
        x = _xena()
        samples = x.dataset_samples(HUB, EXPR, None)
        fields = set(x.dataset_field(HUB, PHENO))
        want = {"study": "_study", "type": "_sample_type", "site": "_primary_site", "disease": "primary disease or tissue",
                "detail": "detailed_category"}
        use = {k: v for k, v in want.items() if v in fields}
        vals = x.dataset_fetch(HUB, PHENO, samples, list(use.values()))
        codes = {c["name"]: (c["code"].split("\t") if c.get("code") else None) for c in x.field_codes(HUB, PHENO, list(use.values()))}
    except Exception as e:  # noqa: BLE001 — any network or hub failure means the same thing to the student
        raise CohortUnavailable("needs_internet", source="xena_toil", detail=str(e)[:200]) from e
    out = {"samples": samples, "fetched": time.strftime("%Y-%m-%d")}
    for (k, field), col in zip(use.items(), vals):
        cd = codes.get(field)
        out[k] = [_decode(v, cd) for v in col]
    disease = out.get("disease") or out.get("detail") or [None] * len(samples)
    out["code"] = [(_NAME2CODE.get(_key(d)) if (st or "").upper() == "TCGA" else None) for d, st in zip(disease, out.get("study", [None] * len(samples)))]
    _write(path, out)
    return out


def gene_values(data_dir: Path, gene: str, samples: list[str]) -> np.ndarray:
    path = _cache(data_dir) / "genes" / f"{_safe(gene)}.json.gz"
    for p in (path, BUNDLED / f"{_safe(gene)}.json.gz"):
        if p.exists():
            d = _read(p)
            if len(d["v"]) == len(samples):
                return np.array([np.nan if v is None else v for v in d["v"]], dtype=float)
    try:
        res = _xena().dataset_gene_probe_avg(HUB, EXPR, samples, [gene])
    except Exception as e:  # noqa: BLE001
        raise CohortUnavailable("needs_internet", source="xena_toil", detail=str(e)[:200]) from e
    scores = res[0].get("scores") if res else None
    if not scores or not scores[0] or all(v is None or (isinstance(v, float) and math.isnan(v)) for v in scores[0]):
        raise CohortUnavailable("gene_not_in_cohort", gene=gene, cohort="TCGA + GTEx (Toil)")
    raw = np.array([np.nan if v is None else v for v in scores[0]], dtype=float)
    # Toil stores log2(TPM + 0.001); Kiri shows log2(TPM + 1) everywhere.
    vals = np.log2(np.maximum(2 ** raw - 0.001, 0) + 1)
    _write(path, {"gene": gene, "v": [clean(v) for v in vals], "fetched": time.strftime("%Y-%m-%d")})
    return vals


def _pts(v: np.ndarray, rng) -> list[float]:
    v = v[~np.isnan(v)]
    if len(v) > POINTS:
        v = rng.choice(v, POINTS, replace=False)
    return [round(float(x), 3) for x in v]


def run(gene: str, data_dir: Path, normal: str = "tcga_gtex") -> dict:
    ph = phenotype(data_dir)
    y = gene_values(data_dir, gene, ph["samples"])
    types = [(t or "").lower() for t in ph.get("type", [])]
    study = [(s or "").upper() for s in ph.get("study", [])]
    site = ph.get("site", [None] * len(y))
    code = ph["code"]
    rng = np.random.default_rng(20261127)
    rows, unmatched = [], 0
    for cc in TCGA:
        idx = [i for i, c in enumerate(code) if c == cc]
        if not idx:
            unmatched += 1
            continue
        tum = np.array([y[i] for i in idx if "tumor" in types[i] and "normal" not in types[i] and "metastatic" not in types[i]])
        if cc == "SKCM":  # most TCGA melanomas are metastases; use every tumour sample
            tum = np.array([y[i] for i in idx if "normal" not in types[i]])
        tn = np.array([y[i] for i in idx if "normal" in types[i]])
        g = GTEX.get(cc)
        gt = np.array([y[i] for i in range(len(y)) if study[i] == "GTEX" and g and site[i] == g]) if normal == "tcga_gtex" else np.array([])
        nor = np.concatenate([tn, gt]) if len(gt) else tn
        tum, nor = tum[~np.isnan(tum)], nor[~np.isnan(nor)]
        row = {"code": cc, "tumour": summary(tum), "normal": summary(nor), "n_tcga_normal": int((~np.isnan(tn)).sum()) if len(tn) else 0,
               "n_gtex": int(len(gt)), "gtex_site": g if normal == "tcga_gtex" else None, "p": None, "diff": None,
               "points_t": _pts(tum, rng), "points_n": _pts(nor, rng)}
        if len(tum) >= MIN_NORMAL and len(nor) >= MIN_NORMAL:
            row["p"] = clean(stats.mannwhitneyu(tum, nor, alternative="two-sided").pvalue)
            row["diff"] = clean(np.median(tum) - np.median(nor))
        rows.append(row)
    tested = [r for r in rows if r["p"] is not None]
    for r, q in zip(tested, bh([r["p"] for r in tested])):
        r["p_adj"] = clean(q)
    up = [r["code"] for r in tested if r["p_adj"] < 0.05 and r["diff"] > 0]
    down = [r["code"] for r in tested if r["p_adj"] < 0.05 and r["diff"] < 0]
    rows.sort(key=lambda r: -(r["tumour"].get("median") or -1e9))
    no_normal = [r["code"] for r in rows if r["p"] is None]
    checks = [
        check("data", "info", "data.across", n=len(rows), source=SOURCE, fetched=ph.get("fetched", "")),
        check("enough", "caution" if no_normal else "pass", "enough.across" if not no_normal else "enough.acrossSome",
              n=len(no_normal), list=", ".join(no_normal), min=MIN_NORMAL),
        check("assumptions", "caution", "assume.acrossGtex" if normal == "tcga_gtex" else "assume.acrossTcga"),
        check("multiple", "pass", "multiple.across", n=len(tested)),
    ]
    return {"kind": "across", "gene": gene, "normal": normal, "rows": rows, "n_up": len(up), "n_down": len(down), "up": up, "down": down,
            "n_tested": len(tested), "unmatched": unmatched, "units": "log2(TPM + 1)", "checks": checks,
            "test": {"name": "wilcoxon_rank_sum", "correction": "benjamini_hochberg"},
            "data_version": {"cohort": "TCGA + GTEx (Toil)", "projects": [f"TCGA-{r['code']}" for r in rows], "source": SOURCE,
                             "units": "log2(TPM + 1)", "built": ph.get("fetched", "")}}


def rows(gene: str, data_dir: Path, normal: str = "tcga_gtex") -> dict:
    """One line per sample used: study, cancer or tissue, tumour or normal, value."""
    ph = phenotype(data_dir)
    y = gene_values(data_dir, gene, ph["samples"])
    sites = {v for v in GTEX.values() if v} if normal == "tcga_gtex" else set()
    out = []
    for i, s in enumerate(ph["samples"]):
        if np.isnan(y[i]):
            continue
        st, t, c, site = (ph.get("study") or [""])[i], (ph.get("type") or [""])[i], ph["code"][i], (ph.get("site") or [None])[i]
        if c:
            out.append([s, "TCGA", c, "normal" if "normal" in (t or "").lower() else "tumour", clean(y[i])])
        elif (st or "").upper() == "GTEX" and site in sites:
            out.append([s, "GTEx", site, "normal", clean(y[i])])
    return {"columns": ["sample", "study", "cancer_or_tissue", "group", f"{gene}_log2_TPM_plus_1"], "rows": out,
            "units": "log2(TPM + 1)", "data_version": {"source": SOURCE, "citation": CITATION}}


def build_bundle(dest: Path, genes: list[str] = SAMPLE_GENES) -> None:
    """Fetch the phenotype and the sample genes into `dest` (used by CI to bundle them with the app)."""
    tmp = Path(dest) / "_tmp"
    ph = phenotype(tmp)
    for g in genes:
        gene_values(tmp, g, ph["samples"])
    Path(dest).mkdir(parents=True, exist_ok=True)
    (tmp / "across" / "phenotype.json.gz").replace(Path(dest) / "phenotype.json.gz")
    for g in genes:
        (tmp / "across" / "genes" / f"{_safe(g)}.json.gz").replace(Path(dest) / f"{_safe(g)}.json.gz")
