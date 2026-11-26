"""Gene symbol checks against the bundled HGNC list (works offline)."""

from __future__ import annotations

import difflib
import gzip
from functools import lru_cache
from pathlib import Path

_FILE = Path(__file__).parent / "data" / "hgnc_genes.tsv.gz"


@lru_cache(maxsize=1)
def _table():
    genes: dict[str, dict] = {}
    alias: dict[str, str] = {}
    with gzip.open(_FILE, "rt", encoding="utf-8") as f:
        for line in f:
            if line.startswith("#"):
                continue
            sym, name, group, aliases, prev, ensembl = line.rstrip("\n").split("\t")
            genes[sym.upper()] = {"symbol": sym, "name": name, "group": group, "ensembl": ensembl}
            for a in filter(None, (aliases + "|" + prev).split("|")):
                alias.setdefault(a.strip().upper(), sym)
    protein = sorted(s for s, g in genes.items() if g["group"] == "protein-coding gene")
    return genes, alias, protein, sorted(genes)


def check(text: str) -> dict:
    """ok: an approved symbol. alias: an old or alternative name for one. unknown: with suggestions."""
    q = text.strip().upper()
    genes, alias, protein, everything = _table()
    if not q:
        return {"input": text, "status": "unknown", "suggestions": []}
    if q in genes:
        g = genes[q]
        return {"input": text, "status": "ok", "symbol": g["symbol"], "name": g["name"]}
    starts = [genes[s]["symbol"] for s in protein if s.startswith(q)][:3]
    close = [genes[s]["symbol"] for s in difflib.get_close_matches(q, protein, n=4, cutoff=0.6)]
    suggestions = list(dict.fromkeys(starts + close))[:3]
    if len(suggestions) < 3:
        more = [genes[s]["symbol"] for s in everything if s.startswith(q)]
        suggestions = list(dict.fromkeys(suggestions + more))[:3]
    if q in alias:
        # Another or older name of an approved gene: offer that gene first, then look-alikes.
        g = genes[alias[q].upper()]
        sugg = list(dict.fromkeys([g["symbol"]] + suggestions))[:3]
        return {"input": text, "status": "alias", "symbol": g["symbol"], "name": g["name"], "suggestions": sugg}
    return {"input": text, "status": "unknown", "suggestions": suggestions}
