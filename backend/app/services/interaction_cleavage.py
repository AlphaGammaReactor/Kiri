"""
Kiri — Interaction Lab: Cleavage Motif Analysis Service

Uses Biopython to analyze PARL cleavage motifs on target protein sequences.
Sequences fetched from UniProt; motif analysis done locally.
"""

import logging
import re
from typing import Any

import httpx

from app.core.cache import cache
from app.core.errors import KiriExternalAPIError, KiriComputationError

logger = logging.getLogger("kiri.interaction.cleavage")

# Known PARL cleavage motifs (consensus from literature)
# PARL is a rhomboid protease — cleaves within transmembrane domains
# Typical motifs: small residues (Ala, Gly, Ser) around cleavage site
DEFAULT_PARL_MOTIF = r"[AGS][AGST][VILM][AGST]"

# MAVS transmembrane domain region (approximate, from UniProt Q7Z434)
MAVS_TM_REGION = (514, 535)


async def fetch_uniprot_sequence(uniprot_id: str) -> dict[str, Any]:
    """
    Fetch protein sequence from UniProt.

    Args:
        uniprot_id: UniProt accession (e.g., "Q7Z434" for MAVS)

    Returns:
        {"id": str, "sequence": str, "length": int, "name": str}
    """
    cache_params = {"uniprot_id": uniprot_id, "type": "sequence"}
    cached, hit = await cache.get("default", cache_params)
    if hit:
        return cached

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            last_err = None
            for attempt in range(3):
                try:
                    resp = await client.get(
                        f"https://rest.uniprot.org/uniprotkb/{uniprot_id}.fasta"
                    )
                    resp.raise_for_status()
                    fasta_text = resp.text
                    last_err = None
                    break
                except httpx.HTTPError as e:
                    last_err = e
                    if attempt < 2:
                        import asyncio
                        wait = (2 ** attempt)  # 1s, 2s
                        logger.warning(f"UniProt fetch attempt {attempt+1}/3 failed for {uniprot_id}, retrying in {wait}s: {e}")
                        await asyncio.sleep(wait)
            if last_err is not None:
                raise last_err
    except httpx.HTTPError as e:
        raise KiriExternalAPIError("UniProt", f"Failed to fetch sequence for {uniprot_id} after 3 attempts: {e}")

    # Parse FASTA
    lines = fasta_text.strip().split("\n")
    header = lines[0] if lines else ""
    sequence = "".join(line.strip() for line in lines[1:] if not line.startswith(">"))

    # Extract protein name from header
    name = ""
    if "|" in header:
        parts = header.split("|")
        if len(parts) >= 3:
            name_part = parts[2].split(" OS=")[0] if " OS=" in parts[2] else parts[2]
            name = name_part.strip()

    result = {
        "id": uniprot_id,
        "sequence": sequence,
        "length": len(sequence),
        "name": name,
    }

    await cache.set("default", cache_params, result)
    return result


async def analyze_cleavage_motifs(
    uniprot_id: str,
    motif_pattern: str | None = None,
    context_window: int = 8,
) -> dict[str, Any]:
    """
    Analyze a protein sequence for PARL cleavage motifs.

    Args:
        uniprot_id: UniProt accession of the substrate protein
        motif_pattern: Regex pattern for the cleavage motif (defaults to PARL consensus)
        context_window: Number of flanking residues to show around each hit

    Returns:
        {
            "uniprot_id": str,
            "protein_name": str,
            "motif_pattern": str,
            "total_hits": int,
            "cleavage_sites": [
                {
                    "position": int,
                    "motif_match": str,
                    "flanking_sequence": str,
                    "in_tm_region": bool,
                    "p_score": float
                }
            ],
            "sequence_length": int,
            "tm_region": { "start": int, "end": int } | null
        }
    """
    # Fetch sequence
    seq_data = await fetch_uniprot_sequence(uniprot_id)
    sequence = seq_data["sequence"]

    if not sequence:
        raise KiriComputationError(
            f"Empty sequence for {uniprot_id}",
            source="cleavage-analysis",
        )

    # Use default PARL motif if none provided
    pattern = motif_pattern or DEFAULT_PARL_MOTIF

    try:
        compiled = re.compile(pattern)
    except re.error as e:
        raise KiriComputationError(
            f"Invalid motif pattern '{pattern}': {e}",
            source="cleavage-analysis",
        )

    # Find all motif matches
    sites = []
    for match in compiled.finditer(sequence):
        pos = match.start() + 1  # 1-indexed
        motif_match = match.group()

        # Extract flanking sequence
        flank_start = max(0, match.start() - context_window)
        flank_end = min(len(sequence), match.end() + context_window)
        flanking = sequence[flank_start:flank_end]

        # Check if within MAVS TM region (only for MAVS/Q7Z434)
        in_tm = False
        tm_info = None
        if uniprot_id.upper() == "Q7Z434":
            tm_info = {"start": MAVS_TM_REGION[0], "end": MAVS_TM_REGION[1]}
            in_tm = MAVS_TM_REGION[0] <= pos <= MAVS_TM_REGION[1]

        # Simple priority score: TM region hits are highest priority
        # Then score by position relative to known cleavage regions
        p_score = 1.0 if in_tm else 0.5

        sites.append({
            "position": pos,
            "motif_match": motif_match,
            "flanking_sequence": flanking,
            "flanking_start": flank_start + 1,
            "flanking_end": flank_end,
            "in_tm_region": in_tm,
            "p_score": round(p_score, 2),
        })

    # Sort by priority score (TM hits first), then by position
    sites.sort(key=lambda s: (-s["p_score"], s["position"]))

    return {
        "uniprot_id": uniprot_id,
        "protein_name": seq_data["name"],
        "motif_pattern": pattern,
        "total_hits": len(sites),
        "cleavage_sites": sites,
        "sequence_length": seq_data["length"],
        "tm_region": tm_info,
    }
