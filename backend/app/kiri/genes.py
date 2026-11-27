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


@lru_cache(maxsize=1)
def _names():
    """Approved symbol -> its aliases and previous symbols, in HGNC order."""
    out: dict[str, list[str]] = {}
    with gzip.open(_FILE, "rt", encoding="utf-8") as f:
        for line in f:
            if line.startswith("#"):
                continue
            sym, _name, _group, aliases, prev, _ens = line.rstrip("\n").split("\t")
            out[sym.upper()] = [x.strip() for x in (prev + "|" + aliases).split("|") if x.strip()]
    return out


@lru_cache(maxsize=4096)
def other_names(gene: str) -> tuple[str, ...]:
    """Other HGNC names of the same gene, most likely first: today's symbol (when given an old one or an alias),
    then previous symbols, then aliases. Empty for an unknown name."""
    q = gene.strip().upper()
    genes, alias, _p, _e = _table()
    sym = q if q in genes else alias.get(q, "").upper()
    if not sym:
        return ()
    # Never a name that is another gene's approved symbol: that would quietly swap genes.
    names = [genes[sym]["symbol"]] + [n for n in _names().get(sym, []) if n.upper() not in genes or n.upper() == sym]
    return tuple(dict.fromkeys(n for n in names if n.upper() != q))


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


@lru_cache(maxsize=1)
def _search_index():
    genes, alias, _protein, _ = _table()
    coding = {s for s, g in genes.items() if g["group"] == "protein-coding gene"}
    # Approved symbols ordered protein-coding first, then shorter, then alphabetical.
    symbols = sorted(genes, key=lambda s: (s not in coding, len(s), s))
    aliases = sorted(alias, key=lambda a: (alias[a].upper() not in coding, len(a), a))
    names = [(s, genes[s]["name"].upper()) for s in symbols]
    return genes, alias, symbols, aliases, names


def search(text: str, limit: int = 8) -> list[dict]:
    """Type-ahead matches for the gene box, all from the bundled HGNC list.

    Order: exact symbol, exact other name, symbols that start with the text,
    other names that start with it, then (3+ letters) words in the full name.
    Each row says whether it matched the approved symbol or another name.
    """
    q = text.strip().upper()
    if not q:
        return []
    genes, alias, symbols, aliases, names = _search_index()
    out: list[dict] = []
    seen: set[str] = set()

    def add(sym_key: str, via: str | None = None) -> bool:
        if sym_key in seen:
            return len(out) >= limit
        seen.add(sym_key)
        g = genes[sym_key]
        row = {"symbol": g["symbol"], "name": g["name"], "match": "alias" if via else "symbol"}
        if via:
            row["via"] = via
        out.append(row)
        return len(out) >= limit

    if q in genes and add(q):
        return out
    # Symbols that start with the text come first, but an exact other name (p53, HER2) is
    # placed after at most three of them so it is never pushed off the list.
    exact_alias = alias.get(q)
    for s in symbols:
        if exact_alias and len(out) >= 3 and add(exact_alias.upper(), text.strip()):
            return out
        if exact_alias and len(out) >= 3:
            exact_alias = None
        if s.startswith(q) and add(s):
            return out
    if exact_alias and add(exact_alias.upper(), text.strip()):
        return out
    for a in aliases:
        if a.startswith(q) and add(alias[a].upper(), a):
            return out
    if len(q) >= 3:
        for s, name in names:
            if (name.startswith(q) or f" {q}" in name) and add(s):
                return out
    return out
