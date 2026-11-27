"""
Build the pathway libraries bundled with Kiri for DE enrichment (run by CI, which has network access).

- MSigDB Hallmark gene sets (Liberzon et al. 2015, Cell Systems), human gene symbols.
- Reactome pathways (Milacic et al. 2024, Nucleic Acids Research), human gene symbols.

Each becomes backend/app/pathway_sets/<library>.json.gz:
{"library", "version", "source", "licence", "citation", "sets": {id: {"name", "genes"}}}
"""

from __future__ import annotations

import gzip
import io
import json
import sys
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

HALLMARK_VERSION = "2024.1.Hs"
HALLMARK = f"https://data.broadinstitute.org/gsea-msigdb/msigdb/release/{HALLMARK_VERSION}/h.all.v{HALLMARK_VERSION}.symbols.gmt"
REACTOME = "https://reactome.org/download/current/ReactomePathways.gmt.zip"
REACTOME_VERSION_URL = "https://reactome.org/ContentService/data/database/version"
GOBP = f"https://data.broadinstitute.org/gsea-msigdb/msigdb/release/{HALLMARK_VERSION}/c5.go.bp.v{HALLMARK_VERSION}.symbols.gmt"
WIKIPATHWAYS_DIR = "https://data.wikipathways.org/current/gmt/"
HGNC_COMPLETE = "https://storage.googleapis.com/public-download-files/hgnc/tsv/tsv/hgnc_complete_set.txt"


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "kiri-build"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def hallmark_name(raw: str) -> str:
    words = raw.removeprefix("HALLMARK_").split("_")
    keep = {"DNA", "UV", "TNFA", "NFKB", "KRAS", "MTORC1", "PI3K", "AKT", "MTOR", "IL2", "STAT5", "IL6", "JAK", "STAT3", "TGF", "E2F", "G2M",
            "MYC", "P53", "WNT", "ROS", "UPR", "V1", "V2", "DN", "UP"}
    out = " ".join(w if w in keep else w.lower() for w in words)
    return out[0].upper() + out[1:]


def parse_gmt(text: str, id_col: int, name_fn) -> dict:
    sets = {}
    for line in text.splitlines():
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 3:
            continue
        sid = parts[id_col]
        genes = sorted({g for g in parts[2:] if g})
        sets[sid] = {"name": name_fn(parts), "genes": genes}
    return sets


def go_name(raw: str) -> str:
    out = raw.removeprefix("GOBP_").replace("_", " ").lower()
    return out[0].upper() + out[1:]


def wikipathways(d: Path) -> None:
    """WikiPathways (CC0) for human: the GMT lists Entrez ids, turned into HGNC symbols."""
    import re

    listing = get(WIKIPATHWAYS_DIR).decode()
    name = next(iter(sorted(set(re.findall(r"wikipathways-\d+-gmt-Homo_sapiens\.gmt", listing)), reverse=True)), None)
    if not name:
        raise SystemExit("no human WikiPathways GMT in " + WIKIPATHWAYS_DIR)
    hgnc = get(HGNC_COMPLETE).decode().splitlines()
    head = hgnc[0].split("\t")
    si, ei = head.index("symbol"), head.index("entrez_id")
    ent = {}
    for line in hgnc[1:]:
        p = line.split("\t")
        if len(p) > ei and p[ei]:
            ent[p[ei]] = p[si]
    sets = {}
    for line in get(WIKIPATHWAYS_DIR + name).decode().splitlines():
        p = line.split("\t")
        if len(p) < 3:
            continue
        title, _ver, wpid, _sp = (p[0].split("%") + ["", "", "", ""])[:4]
        genes = sorted({ent[g] for g in p[2:] if g in ent})
        if len(genes) >= 5:
            sets[wpid] = {"name": title, "genes": genes}
    version = name.split("-")[1]
    write(d / "wikipathways.json.gz", {
        "library": "wikipathways", "version": version, "source": WIKIPATHWAYS_DIR + name, "built": date.today().isoformat(),
        "licence": "CC0 1.0 (WikiPathways)",
        "citation": "Agrawal A, et al. WikiPathways 2024: next generation pathway database. Nucleic Acids Res. 2024;52(D1):D679-D689.",
        "sets": sets})


def write(out: Path, lib: dict) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(out, "wt", encoding="utf-8", compresslevel=9) as f:
        json.dump(lib, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    print(out, len(lib["sets"]), "sets,", out.stat().st_size, "bytes")


def main(dest: str) -> None:
    d = Path(dest)
    h = parse_gmt(get(HALLMARK).decode(), 0, lambda p: hallmark_name(p[0]))
    write(d / "hallmark.json.gz", {
        "library": "hallmark", "version": HALLMARK_VERSION, "source": HALLMARK, "built": date.today().isoformat(),
        "licence": "CC BY 4.0 (MSigDB Hallmark collection)",
        "citation": "Liberzon A, et al. The Molecular Signatures Database Hallmark Gene Set Collection. Cell Syst. 2015;1(6):417-425.",
        "sets": h})
    z = zipfile.ZipFile(io.BytesIO(get(REACTOME)))
    text = z.read(z.namelist()[0]).decode()
    try:
        version = get(REACTOME_VERSION_URL).decode().strip()
    except Exception:  # noqa: BLE001
        version = "current"
    r = parse_gmt(text, 1, lambda p: p[0])
    write(d / "reactome.json.gz", {
        "library": "reactome", "version": version, "source": REACTOME, "built": date.today().isoformat(),
        "licence": "CC0 1.0 (Reactome data; attribution encouraged)",
        "citation": "Milacic M, et al. The Reactome Pathway Knowledgebase 2024. Nucleic Acids Res. 2024;52(D1):D672-D678.",
        "sets": r})
    g = parse_gmt(get(GOBP).decode(), 0, lambda p: go_name(p[0]))
    g = {k: v for k, v in g.items() if 15 <= len(v["genes"]) <= 500}
    write(d / "gobp.json.gz", {
        "library": "gobp", "version": HALLMARK_VERSION, "source": GOBP, "built": date.today().isoformat(),
        "licence": "CC BY 4.0 (Gene Ontology, via MSigDB C5)",
        "citation": "Gene Ontology Consortium. The Gene Ontology knowledgebase in 2023. Genetics. 2023;224(1):iyad031. Sets as packaged by MSigDB (Liberzon A, et al. 2011).",
        "sets": g})
    wikipathways(d)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "backend/app/pathway_sets")
