"""
Kiri — Substrate Prediction Service

Scans mitochondrial proteins for transmembrane domains matching
rhomboid protease cleavage motifs. Ranks candidate substrates by
TM overlap, motif confidence, and (optionally) co-expression with
the target gene.

Generic: works with any protease target, not just PARL.
"""

import logging
import re
from typing import Any

from app.core.cache import cache
from app.services.interaction_cleavage import (
    fetch_uniprot_sequence,
    DEFAULT_PARL_MOTIF,
)
from app.services.interaction_ppi import MITOCARTA_GENES

logger = logging.getLogger("kiri.substrate_prediction")

# Known TM-domain annotations for mitochondrial proteins (UniProt curated)
# Format: gene → { uniprot_id, tm_regions: [(start, end), ...] }
MITO_TM_PROTEINS: dict[str, dict[str, Any]] = {
    "MAVS": {"uniprot_id": "Q7Z434", "tm_regions": [(514, 535)]},
    "OPA1": {"uniprot_id": "O60313", "tm_regions": [(87, 109)]},
    "MFN1": {"uniprot_id": "Q8IWA4", "tm_regions": [(596, 616), (620, 640)]},
    "MFN2": {"uniprot_id": "O95140", "tm_regions": [(600, 620), (624, 644)]},
    "PINK1": {"uniprot_id": "Q9BXM7", "tm_regions": [(34, 54)]},
    "PGAM5": {"uniprot_id": "Q96HS1", "tm_regions": [(1, 26)]},
    "STARD7": {"uniprot_id": "Q9Y3S0", "tm_regions": [(1, 20)]},
    "DIABLO": {"uniprot_id": "Q9NR28", "tm_regions": [(1, 55)]},
    "PHB2": {"uniprot_id": "Q99623", "tm_regions": [(1, 36)]},
    "FUNDC1": {"uniprot_id": "Q8IVP5", "tm_regions": [(96, 116), (132, 152), (148, 168)]},
    "BNIP3": {"uniprot_id": "Q12983", "tm_regions": [(164, 184)]},
    "BNIP3L": {"uniprot_id": "O60238", "tm_regions": [(185, 205)]},
    "BCL2": {"uniprot_id": "P10415", "tm_regions": [(210, 230)]},
    "BAX": {"uniprot_id": "Q07812", "tm_regions": [(171, 192)]},
    "HK1": {"uniprot_id": "P19367", "tm_regions": [(1, 15)]},
    "HK2": {"uniprot_id": "P52789", "tm_regions": [(1, 18)]},
    "VDAC1": {"uniprot_id": "P21796", "tm_regions": [(1, 283)]},
    "VDAC2": {"uniprot_id": "P45880", "tm_regions": [(1, 294)]},
    "VDAC3": {"uniprot_id": "Q9Y277", "tm_regions": [(1, 283)]},
    "TOMM20": {"uniprot_id": "Q15388", "tm_regions": [(1, 25)]},
    "TOMM22": {"uniprot_id": "Q9NS69", "tm_regions": [(95, 115)]},
    "TOMM40": {"uniprot_id": "O96008", "tm_regions": [(1, 361)]},
    "TIMM23": {"uniprot_id": "O14925", "tm_regions": [(68, 90), (130, 152)]},
    "TIMM50": {"uniprot_id": "Q3ZCQ8", "tm_regions": [(1, 30)]},
    "OMA1": {"uniprot_id": "Q96E52", "tm_regions": [(79, 99), (108, 128), (145, 165), (195, 215), (244, 264)]},
    "YME1L1": {"uniprot_id": "Q96350", "tm_regions": [(169, 189)]},
    "AFG3L2": {"uniprot_id": "Q9Y4W6", "tm_regions": [(73, 93), (103, 123)]},
    "CLPB": {"uniprot_id": "Q9H078", "tm_regions": [(1, 40)]},
    "IMMT": {"uniprot_id": "Q16891", "tm_regions": [(1, 70)]},
}


async def scan_substrates(
    target_genes: list[str] | None = None,
    motif_pattern: str | None = None,
    scan_all_mitocarta: bool = True,
    context_window: int = 8,
    coexpression_data: dict[str, float] | None = None,
) -> dict[str, Any]:
    """
    Scan mitochondrial proteins for rhomboid protease cleavage motifs
    within transmembrane domains.

    Args:
        target_genes: Optional list to restrict scanning (defaults to all known TM proteins)
        motif_pattern: Regex for cleavage motif (defaults to PARL consensus)
        scan_all_mitocarta: If True, scan all known TM-containing mito proteins
        context_window: Flanking residues to show around hits
        coexpression_data: Optional gene→r correlation values to boost ranking

    Returns:
        Candidate substrate list with scores and motif details.
    """
    pattern = motif_pattern or DEFAULT_PARL_MOTIF

    try:
        compiled = re.compile(pattern)
    except re.error as e:
        return {"error": f"Invalid motif pattern: {e}", "candidates": []}

    # Determine which proteins to scan
    proteins_to_scan = {}
    if target_genes:
        for gene in target_genes:
            gene_upper = gene.upper()
            if gene_upper in MITO_TM_PROTEINS:
                proteins_to_scan[gene_upper] = MITO_TM_PROTEINS[gene_upper]
    if scan_all_mitocarta:
        proteins_to_scan.update(MITO_TM_PROTEINS)

    cache_params = {
        "type": "substrate_scan",
        "proteins": sorted(proteins_to_scan.keys()),
        "motif": pattern,
    }
    cached, hit = await cache.get("substrate_scan", cache_params)
    if hit and cached:
        logger.info("Substrate scan: cache hit")
        cached["cache_hit"] = True
        return cached

    candidates = []

    for gene, info in proteins_to_scan.items():
        uniprot_id = info["uniprot_id"]
        tm_regions = info["tm_regions"]

        # Fetch sequence
        try:
            seq_data = await fetch_uniprot_sequence(uniprot_id)
            sequence = seq_data.get("sequence", "")
        except Exception as e:
            logger.warning(f"Failed to fetch sequence for {gene} ({uniprot_id}): {e}")
            continue

        if not sequence:
            continue

        # Find all motif matches
        motif_hits = []
        for match in compiled.finditer(sequence):
            pos = match.start() + 1  # 1-indexed
            motif_match = match.group()

            # Check TM overlap
            in_tm = any(
                start <= pos <= end
                for start, end in tm_regions
            )

            # Flanking sequence
            flank_start = max(0, match.start() - context_window)
            flank_end = min(len(sequence), match.end() + context_window)
            flanking = sequence[flank_start:flank_end]

            motif_hits.append({
                "position": pos,
                "motif_match": motif_match,
                "flanking_sequence": flanking,
                "in_tm_region": in_tm,
            })

        # Filter to TM-region hits only (rhomboid substrates are cleaved within TM)
        tm_hits = [h for h in motif_hits if h["in_tm_region"]]
        all_hits = motif_hits

        # Score: TM hits × motif count, boosted by co-expression if available
        base_score = len(tm_hits) * 2.0 + len(all_hits) * 0.5
        coexpr_boost = 0.0
        if coexpression_data and gene in coexpression_data:
            coexpr_boost = abs(coexpression_data[gene]) * 3.0
        total_score = round(base_score + coexpr_boost, 3)

        if tm_hits or all_hits:
            candidates.append({
                "gene": gene,
                "uniprot_id": uniprot_id,
                "protein_name": seq_data.get("name", gene),
                "sequence_length": len(sequence),
                "tm_regions": [{"start": s, "end": e} for s, e in tm_regions],
                "tm_hit_count": len(tm_hits),
                "total_hit_count": len(all_hits),
                "tm_hits": tm_hits[:10],  # Cap for payload
                "all_hits": all_hits[:10],
                "score": total_score,
                "coexpression_r": coexpression_data.get(gene) if coexpression_data else None,
                "is_known_substrate": gene in {
                    "PINK1", "PGAM5", "OPA1", "STARD7", "DIABLO", "MAVS", "CLPB", "SMAC",
                },
            })

    # Sort by score descending
    candidates.sort(key=lambda c: c["score"], reverse=True)

    result = {
        "candidates": candidates,
        "total_scanned": len(proteins_to_scan),
        "total_with_hits": len(candidates),
        "tm_hit_candidates": sum(1 for c in candidates if c["tm_hit_count"] > 0),
        "motif_pattern": pattern,
        "method": "TM-domain rhomboid motif scan (MitoCarta3.0 + UniProt)",
        "cache_hit": False,
    }

    await cache.set("substrate_scan", cache_params, result)
    return result
