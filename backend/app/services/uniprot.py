"""
Kiri — UniProt Protein Metadata Service

Fetches protein information from the UniProt REST API.
Used during project creation to display validated protein cards.
"""

import logging
from typing import Any

import httpx

from app.core.cache import cache
from app.core.errors import KiriExternalAPIError

logger = logging.getLogger("kiri.uniprot")

UNIPROT_BASE = "https://rest.uniprot.org/uniprotkb"
UNIPROT_TIMEOUT = 15.0


async def fetch_protein_by_gene(
    gene_symbol: str,
    organism: str = "Homo sapiens",
) -> dict[str, Any] | None:
    """
    Look up a protein by gene symbol in UniProt.

    Returns protein metadata (name, accession, function, sequence length)
    or None if not found.
    """
    cache_params = {"gene": gene_symbol.upper(), "organism": organism}
    cached, hit = await cache.get("uniprot", cache_params)
    if hit:
        logger.info(f"UniProt cache hit for {gene_symbol}")
        return cached

    # Search UniProt for human protein by gene name
    query = f"(gene_exact:{gene_symbol}) AND (organism_name:{organism}) AND (reviewed:true)"

    try:
        async with httpx.AsyncClient(timeout=UNIPROT_TIMEOUT) as client:
            resp = await client.get(
                f"{UNIPROT_BASE}/search",
                params={
                    "query": query,
                    "format": "json",
                    "fields": (
                        "accession,protein_name,gene_names,organism_name,"
                        "cc_function,length,id"
                    ),
                    "size": "1",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as e:
        raise KiriExternalAPIError("UniProt", f"Failed to fetch protein data: {e}")

    results = data.get("results", [])
    if not results:
        return None

    entry = results[0]

    # Extract function summary from comments
    function_text = ""
    comments = entry.get("comments", [])
    for comment in comments:
        if comment.get("commentType") == "FUNCTION":
            texts = comment.get("texts", [])
            if texts:
                function_text = texts[0].get("value", "")
                break

    # Extract recommended protein name
    protein_desc = entry.get("proteinDescription", {})
    recommended = protein_desc.get("recommendedName", {})
    protein_name = recommended.get("fullName", {}).get("value", "")
    if not protein_name:
        # Fallback to submitted name
        submitted = protein_desc.get("submittedName", [])
        if submitted:
            protein_name = submitted[0].get("fullName", {}).get("value", "")

    # Extract gene names
    gene_names_data = entry.get("genes", [{}])
    primary_gene = ""
    if gene_names_data:
        primary_gene = gene_names_data[0].get("geneName", {}).get("value", "")

    result = {
        "uniprot_id": entry.get("primaryAccession", ""),
        "protein_name": protein_name,
        "gene_symbol": primary_gene or gene_symbol.upper(),
        "organism": entry.get("organism", {}).get("scientificName", organism),
        "function_summary": function_text[:500] if function_text else "",
        "sequence_length": entry.get("sequence", {}).get("length", 0),
    }

    await cache.set("uniprot", cache_params, result)
    return result


async def fetch_proteins_batch(
    gene_symbols: list[str],
    organism: str = "Homo sapiens",
) -> list[dict[str, Any]]:
    """Fetch UniProt metadata for multiple genes."""
    results = []
    for symbol in gene_symbols:
        info = await fetch_protein_by_gene(symbol, organism)
        if info:
            results.append(info)
    return results


def get_alphafold_pdb_url(uniprot_id: str) -> str:
    """
    Constructs the AlphaFold DB URL for a standard UniProt accession.
    Example: P0DTD1 -> https://alphafold.ebi.ac.uk/files/AF-P0DTD1-F1-model_v4.pdb
    """
    return f"https://alphafold.ebi.ac.uk/files/AF-{uniprot_id}-F1-model_v4.pdb"
