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
        "licence": "CC BY 4.0 (Reactome)",
        "citation": "Milacic M, et al. The Reactome Pathway Knowledgebase 2024. Nucleic Acids Res. 2024;52(D1):D672-D678.",
        "sets": r})


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "backend/app/pathway_sets")
