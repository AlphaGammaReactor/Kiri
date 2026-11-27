"""
Interactions and structure: who my protein works with, and what the protein looks like.

* Partners from STRING (Szklarczyk et al., Nucleic Acids Res 2023; CC BY 4.0): the top partners
  of my gene in human, with the combined score and the evidence behind it (experiments,
  curated databases, text mining, co-expression...). Then, in the project's own tumours, whether
  each partner's RNA rises and falls with my gene (Spearman, Benjamini–Hochberg). STRING says
  the proteins are linked somewhere in biology; the cohort says whether that shows in these tumours.
* Protein map from UniProt (reviewed entry; CC BY 4.0): length, domains, transmembrane segments,
  signal and transit peptides, active sites, plus the AlphaFold DB per-residue confidence (pLDDT;
  Jumper et al. 2021, Varadi et al. 2024; CC BY 4.0) so a student sees which parts are folded.

Each gene is fetched once and cached in the data folder; the sample-project genes ship with the app.
"""

from __future__ import annotations

import gzip
import json
import re
import time
from pathlib import Path

import numpy as np
from scipy import stats

from app.analyses.common import bh, check, clean
from app.analyses.signature import _tumours, spearman_ci
from app.cohorts.store import Cohort, CohortUnavailable

STRING = "https://string-db.org/api"
UNIPROT = "https://rest.uniprot.org/uniprotkb/search"
ALPHAFOLD = "https://alphafold.ebi.ac.uk/api/prediction"
CALLER = "kiri_desktop"
PARTNERS = 20
MIN_SCORE = 400  # STRING "medium confidence"
BUNDLED = Path(__file__).resolve().parent.parent / "cohorts" / "samples" / "interactions"
SAMPLE_GENES = ["PARL", "MAVS", "TP53", "MDM2", "ATF5", "EGFR"]
EVIDENCE = {"escore": "experiments", "dscore": "databases", "tscore": "textmining", "ascore": "coexpression",
            "nscore": "neighborhood", "fscore": "fusion", "pscore": "cooccurrence"}
FEATURES = {"Domain": "domain", "Transmembrane": "tm", "Signal": "signal", "Transit peptide": "transit",
            "Intramembrane": "intramem", "Active site": "site", "Motif": "motif", "Region": "region", "Zinc finger": "domain",
            "DNA binding": "domain", "Coiled coil": "coil"}
CITATIONS = {
    "string": "Szklarczyk D et al. The STRING database in 2023. Nucleic Acids Res 2023;51:D638",
    "uniprot": "The UniProt Consortium. UniProt: the Universal Protein Knowledgebase in 2025. Nucleic Acids Res 2025;53:D609",
    "alphafold": "Jumper J et al. Nature 2021;596:583 · Varadi M et al. Nucleic Acids Res 2024;52:D368",
}


def _safe(g: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", g)


def _read(p: Path):
    with gzip.open(p, "rt", encoding="utf-8") as f:
        return json.load(f)


def _write(p: Path, obj) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8") as f:
        json.dump(obj, f)
    tmp.replace(p)


def _get(url: str, params: dict | None = None):
    import httpx

    r = httpx.get(url, params=params, timeout=30, follow_redirects=True, headers={"User-Agent": "Kiri desktop"})
    r.raise_for_status()
    return r.json()


def fetch(gene: str) -> dict:
    """Everything Kiri needs for one gene, straight from STRING, UniProt and AlphaFold DB."""
    out: dict = {"gene": gene, "fetched": time.strftime("%Y-%m-%d")}
    rows = _get(f"{STRING}/json/interaction_partners",
                {"identifiers": gene, "species": 9606, "limit": PARTNERS, "required_score": MIN_SCORE, "caller_identity": CALLER})
    partners = []
    for r in rows:
        partners.append({"gene": r.get("preferredName_B"), "score": round(float(r.get("score", 0)), 3),
                         **{v: round(float(r.get(k, 0)), 3) for k, v in EVIDENCE.items()}})
    out["partners"] = partners
    names = [gene] + [p["gene"] for p in partners]
    edges = []
    if len(names) > 1:
        net = _get(f"{STRING}/json/network", {"identifiers": "\r".join(names), "species": 9606, "required_score": MIN_SCORE,
                                              "caller_identity": CALLER})
        seen = set()
        for e in net:
            a, b = e.get("preferredName_A"), e.get("preferredName_B")
            key = tuple(sorted((a, b)))
            if a and b and a != b and key not in seen and gene not in key:
                seen.add(key)
                edges.append([a, b, round(float(e.get("score", 0)), 3)])
    out["edges"] = edges
    try:
        ver = _get(f"{STRING}/json/version")
        out["string_version"] = (ver[0] if isinstance(ver, list) and ver else ver).get("string_version")
    except Exception:  # noqa: BLE001 — the version is a nicety
        out["string_version"] = None

    fields = "accession,protein_name,length,cc_subcellular_location,ft_domain,ft_transmem,ft_signal,ft_transit,ft_intramem,ft_act_site,ft_motif,ft_zn_fing,ft_dna_bind,ft_coiled"
    up = _get(UNIPROT, {"query": f"gene_exact:{gene} AND organism_id:9606 AND reviewed:true", "fields": fields, "format": "json", "size": 1})
    res = (up.get("results") or [None])[0]
    if res:
        name = (((res.get("proteinDescription") or {}).get("recommendedName") or {}).get("fullName") or {}).get("value")
        feats = []
        for f in res.get("features") or []:
            kind = FEATURES.get(f.get("type"))
            loc = f.get("location") or {}
            s, e = (loc.get("start") or {}).get("value"), (loc.get("end") or {}).get("value")
            if kind and s and e:
                feats.append({"kind": kind, "start": int(s), "end": int(e), "label": f.get("description") or f.get("type")})
        locs = []
        for c in res.get("comments") or []:
            for sl in c.get("subcellularLocations") or []:
                v = (sl.get("location") or {}).get("value")
                if v and v not in locs:
                    locs.append(v)
        out["protein"] = {"accession": res.get("primaryAccession"), "name": name, "length": (res.get("sequence") or {}).get("length"),
                          "features": feats, "locations": locs[:4]}
        try:
            af = _get(f"{ALPHAFOLD}/{res.get('primaryAccession')}")
            entry = af[0] if isinstance(af, list) and af else None
            if entry:
                conf_url = entry.get("plddtDocUrl") or re.sub(r"model_v(\d+)\.(cif|pdb)$", r"confidence_v\1.json", entry.get("cifUrl", ""))
                conf = _get(conf_url) if conf_url.endswith(".json") else {}
                out["alphafold"] = {"id": entry.get("entryId"), "version": entry.get("latestVersion") or entry.get("modelCreatedDate"),
                                    "mean": entry.get("globalMetricValue"), "plddt": conf.get("confidenceScore") or []}
        except Exception:  # noqa: BLE001 — not every protein has an AlphaFold model
            out["alphafold"] = None
    return out


def data(gene: str, data_dir: Path) -> dict:
    path = data_dir / "interactions" / f"{_safe(gene)}.json.gz"
    for p in (path, BUNDLED / f"{_safe(gene)}.json.gz"):
        if p.exists():
            return _read(p)
    try:
        d = fetch(gene)
    except Exception as e:  # noqa: BLE001 — any network failure means the same thing to the student
        raise CohortUnavailable("needs_internet", source="string_uniprot", detail=str(e)[:200]) from e
    _write(path, d)
    return d


def build_bundle(dest: Path, genes: list[str]) -> None:
    for g in genes:
        _write(dest / f"{_safe(g)}.json.gz", fetch(g))


def run(c: Cohort | None, gene: str, data_dir: Path) -> dict:
    d = data(gene, data_dir)
    base = {"kind": "interactions", "gene": gene}
    partners = d.get("partners") or []
    prot = d.get("protein")
    if not partners and not prot:
        return base | {"error": "no_interactions"}

    # Do the partners also go together in the project's tumours?
    n = 0
    if c is not None and partners:
        have = [p["gene"] for p in partners if c.has(p["gene"])]
        if c.has(gene) and have:
            t = _tumours(c, [gene] + have)
            t = t[t[f"g:{gene}"].notna()]
            n = len(t)
            x = t[f"g:{gene}"].to_numpy(float)
            if n >= 10:
                for p in partners:
                    if p["gene"] not in have:
                        continue
                    y = t[f"g:{p['gene']}"].to_numpy(float)
                    ok = ~np.isnan(y)
                    r = stats.spearmanr(x[ok], y[ok])
                    lo, hi = spearman_ci(float(r.statistic), int(ok.sum()))
                    p |= {"rho": clean(r.statistic), "lo": clean(lo), "hi": clean(hi), "p": clean(r.pvalue)}
        tested = [p for p in partners if p.get("p") is not None]
        for p, q in zip(tested, bh([p["p"] for p in tested])):
            p["p_adj"] = clean(q)
    tested = [p for p in partners if p.get("p_adj") is not None]
    together = [p["gene"] for p in tested if p["p_adj"] < 0.05 and p["rho"] > 0]
    opposite = [p["gene"] for p in tested if p["p_adj"] < 0.05 and p["rho"] < 0]
    missing = [p["gene"] for p in partners if p.get("rho") is None] if c is not None else []
    strong = [p for p in partners if p["score"] >= 0.7]
    experimental = [p["gene"] for p in partners if p.get("experiments", 0) >= 0.4 or p.get("databases", 0) >= 0.4]
    textonly = [p["gene"] for p in partners if p["score"] >= 0.4 and p.get("textmining", 0) >= p["score"] - 0.05
                and p.get("experiments", 0) < 0.2 and p.get("databases", 0) < 0.2]
    af = d.get("alphafold") or None
    plddt = (af or {}).get("plddt") or []
    bands = None
    if plddt:
        v = np.asarray(plddt, float)
        bands = {"very_high": round(float(np.mean(v > 90)) * 100), "confident": round(float(np.mean((v > 70) & (v <= 90))) * 100),
                 "low": round(float(np.mean((v > 50) & (v <= 70))) * 100), "very_low": round(float(np.mean(v <= 50)) * 100)}

    checks = [check("data", "pass" if partners else "caution", "data.inter" if partners else "data.interNone",
                    k=len(partners), min=MIN_SCORE / 1000, v=d.get("string_version") or "–", date=d.get("fetched", "")),
              check("assumptions", "caution", "assume.interString")]
    if textonly:
        checks.append(check("assumptions", "caution", "assume.interText", list=", ".join(textonly[:8])))
    if c is not None and partners:
        if n >= 10:
            checks += [check("data", "pass", "data.interCohort", n=n, k=len(tested), cohort=c.name),
                       check("multiple", "pass", "multiple.inter", k=len(tested)),
                       check("assumptions", "caution", "assume.interCoexp")]
            if missing:
                checks.append(check("data", "caution", "data.interMissing", list=", ".join(missing[:10]), n=len(missing)))
        else:
            checks.append(check("data", "caution", "data.interNoCohort"))
    if prot:
        checks.append(check("data", "pass", "data.interProtein", acc=prot.get("accession") or "–", len=prot.get("length") or "–"))
    if bands:
        checks.append(check("assumptions", "caution" if bands["very_low"] + bands["low"] >= 30 else "pass", "assume.interPlddt",
                            hi=bands["very_high"] + bands["confident"], lo=bands["very_low"] + bands["low"]))
    return base | {"partners": partners, "edges": d.get("edges") or [], "protein": prot, "alphafold": af and {k: af.get(k) for k in ("id", "version", "mean")},
                   "plddt": plddt, "bands": bands, "n": n, "together": together, "opposite": opposite, "strong": len(strong),
                   "experimental": experimental, "string_version": d.get("string_version"), "fetched": d.get("fetched"),
                   "checks": checks, "citations": CITATIONS,
                   "data_version": (c.data_version() if c is not None else {"cohort": "", "projects": [], "source": "STRING · UniProt · AlphaFold DB",
                                                                             "units": "", "built": d.get("fetched", "")})}


def table(c: Cohort | None, gene: str, data_dir: Path) -> dict:
    r = run(c, gene, data_dir)
    cols = ["partner", "string_score"] + list(EVIDENCE.values()) + ["spearman_rho_in_cohort", "p", "p_adj_BH"]
    return {"columns": cols, "rows": [[p["gene"], p["score"]] + [p.get(v) for v in EVIDENCE.values()] + [p.get("rho"), p.get("p"), p.get("p_adj")]
                                      for p in r.get("partners", [])]}
