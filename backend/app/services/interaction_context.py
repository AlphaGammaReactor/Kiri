"""
Kiri — Interaction Lab: Interaction Context Service

Fetches functional annotations (GO terms, KEGG pathways) for protein pairs
and assembles a structured mechanism-of-action summary.

Data sources:
  - QuickGO (EBI) — Gene Ontology annotations
  - KEGG REST   — Pathway membership
  - research_brief.md — curated mechanism data for PARL-MAVS axis
"""

import logging
from typing import Any

import httpx

from app.core.cache import cache
from app.core.errors import KiriExternalAPIError

logger = logging.getLogger("kiri.interaction.context")

# ── Curated mechanism data (from research_brief.md) ──
# For known axis pairs we store expert-curated descriptions;
# for unknown pairs we derive what we can from GO/KEGG.

CURATED_MECHANISMS: dict[tuple[str, str], dict[str, Any]] = {
    ("PARL", "MAVS"): {
        "interaction_type": "enzymatic_cleavage",
        "mechanism": "PARL is a mitochondrial rhomboid intramembrane protease that cleaves MAVS at its transmembrane domain, disrupting MAVS aggregation on the outer mitochondrial membrane.",
        "effect_on_target": "Inactivation of MAVS signaling — prevents MAVS from forming prion-like aggregates required for downstream signal transduction.",
        "cellular_effect": "Suppression of the RIG-I/MAVS/IRF3 innate immune signaling pathway, leading to reduced type I interferon (IFN-β) production and potential immune evasion in CRC.",
        "subcellular_location": "Outer mitochondrial membrane",
        "directionality": "PARL → MAVS (protease → substrate)",
    },
    ("MAVS", "DDX58"): {
        "interaction_type": "signal_transduction",
        "mechanism": "RIG-I (DDX58) detects cytoplasmic viral dsRNA and activates MAVS through direct CARD-CARD domain interaction, triggering MAVS aggregation.",
        "effect_on_target": "Activation of MAVS — induces prion-like polymerization of MAVS on the mitochondrial surface.",
        "cellular_effect": "Initiation of antiviral innate immune signaling cascade leading to IRF3 phosphorylation and IFN-β transcription.",
        "subcellular_location": "Mitochondrial outer membrane / cytoplasm",
        "directionality": "DDX58 → MAVS (sensor → adaptor)",
    },
    ("MAVS", "IRF3"): {
        "interaction_type": "signal_transduction",
        "mechanism": "Aggregated MAVS recruits TRAF3 and TBK1 to phosphorylate IRF3, enabling IRF3 dimerization and nuclear translocation.",
        "effect_on_target": "Activation of IRF3 — phosphorylation triggers dimerization and nuclear import for transcription.",
        "cellular_effect": "Transcriptional activation of type I interferon genes (IFNB1) and interferon-stimulated genes (ISGs).",
        "subcellular_location": "Mitochondrial outer membrane → nucleus",
        "directionality": "MAVS → IRF3 (adaptor → transcription factor)",
    },
    ("IRF3", "IFNB1"): {
        "interaction_type": "transcriptional_regulation",
        "mechanism": "Phosphorylated IRF3 dimers translocate to the nucleus and bind the IFNB1 promoter enhancer region, activating transcription.",
        "effect_on_target": "Transcription of IFNB1 gene — production of IFN-β protein.",
        "cellular_effect": "Secretion of IFN-β, which signals in autocrine/paracrine fashion to activate JAK-STAT signaling and ISG expression, establishing an antiviral state.",
        "subcellular_location": "Nucleus (IFNB1 promoter)",
        "directionality": "IRF3 → IFNB1 (transcription factor → target gene)",
    },
}

# ── Key pathway definitions ──

AXIS_PATHWAY = {
    "id": "PARL-MAVS-IRF3-IFNB1",
    "name": "PARL-MAVS Innate Immune Axis",
    "steps": [
        {"gene": "DDX58", "role": "sensor", "label": "RIG-I (DDX58)"},
        {"gene": "MAVS", "role": "adaptor", "label": "MAVS"},
        {"gene": "IRF3", "role": "transcription_factor", "label": "IRF3"},
        {"gene": "IFNB1", "role": "effector", "label": "IFN-β (IFNB1)"},
    ],
    "modulator": {"gene": "PARL", "role": "protease", "target": "MAVS", "effect": "cleavage"},
    "kegg_ids": ["hsa04622"],
    "go_terms": ["GO:0045087", "GO:0005739"],
    "reactome_ids": ["R-HSA-168928"],
}


# ── QuickGO — Gene Ontology ──


async def fetch_go_annotations(gene_symbol: str) -> dict[str, Any]:
    """
    Fetch GO annotations for a gene from QuickGO (EBI).

    Returns: { gene, terms: [{ id, name, aspect, evidence }] }
    """
    cache_params = {"gene": gene_symbol.upper(), "source": "quickgo"}
    cached, hit = await cache.get("quickgo", cache_params)
    if hit:
        return cached

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                "https://www.ebi.ac.uk/QuickGO/services/annotation/search",
                params={
                    "geneProductId": gene_symbol.upper(),
                    "geneProductType": "protein",
                    "taxonId": "9606",
                    "limit": 50,
                },
                headers={"Accept": "application/json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                annotations = data.get("results", [])
            else:
                # Fall back to UniProt keywords approach
                annotations = []
    except httpx.HTTPError as e:
        logger.warning(f"QuickGO fetch failed for {gene_symbol}: {e}")
        annotations = []

    # Deduplicate terms
    seen: set[str] = set()
    terms: list[dict[str, str]] = []
    for ann in annotations:
        go_id = ann.get("goId", "")
        if go_id and go_id not in seen:
            seen.add(go_id)
            terms.append({
                "id": go_id,
                "name": ann.get("goName", ""),
                "aspect": ann.get("goAspect", ""),
                "evidence": ann.get("goEvidence", ""),
            })

    result = {"gene": gene_symbol.upper(), "terms": terms}
    await cache.set("quickgo", cache_params, result)
    return result


# ── KEGG — Pathway membership ──


async def fetch_kegg_pathways(gene_symbol: str) -> dict[str, Any]:
    """
    Fetch KEGG pathways that contain this gene (human only).

    Returns: { gene, pathways: [{ id, name }] }
    """
    cache_params = {"gene": gene_symbol.upper(), "source": "kegg"}
    cached, hit = await cache.get("kegg", cache_params)
    if hit:
        return cached

    pathways: list[dict[str, str]] = []

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Step 1: convert gene symbol to KEGG gene ID
            conv_resp = await client.get(
                f"https://rest.kegg.jp/find/genes/{gene_symbol.upper()}+hsa"
            )
            if conv_resp.status_code != 200 or not conv_resp.text.strip():
                result = {"gene": gene_symbol.upper(), "pathways": []}
                await cache.set("kegg", cache_params, result)
                return result

            # Parse first hit: "hsa:12345\tDescription..."
            kegg_gene_id = ""
            for line in conv_resp.text.strip().split("\n"):
                parts = line.split("\t")
                if parts[0].startswith("hsa:"):
                    kegg_gene_id = parts[0]
                    break

            if not kegg_gene_id:
                result = {"gene": gene_symbol.upper(), "pathways": []}
                await cache.set("kegg", cache_params, result)
                return result

            # Step 2: get pathways for this gene
            pw_resp = await client.get(
                f"https://rest.kegg.jp/link/pathway/{kegg_gene_id}"
            )
            if pw_resp.status_code == 200 and pw_resp.text.strip():
                pathway_ids = []
                for line in pw_resp.text.strip().split("\n"):
                    parts = line.split("\t")
                    if len(parts) >= 2:
                        pw_id = parts[1].replace("path:", "")
                        if pw_id.startswith("hsa"):
                            pathway_ids.append(pw_id)

                # Step 3: get names for each pathway
                for pw_id in pathway_ids[:15]:  # limit to avoid rate limiting
                    name_resp = await client.get(
                        f"https://rest.kegg.jp/get/{pw_id}"
                    )
                    if name_resp.status_code == 200:
                        for line in name_resp.text.split("\n"):
                            if line.startswith("NAME"):
                                name = line.replace("NAME", "").strip()
                                name = name.replace(" - Homo sapiens (human)", "")
                                pathways.append({"id": pw_id, "name": name})
                                break

    except httpx.HTTPError as e:
        logger.warning(f"KEGG fetch failed for {gene_symbol}: {e}")

    result = {"gene": gene_symbol.upper(), "pathways": pathways}
    await cache.set("kegg", cache_params, result)
    return result


# ── Interaction Context Assembly ──


def _normalize_pair(gene_a: str, gene_b: str) -> tuple[str, str]:
    """Normalize gene pair for curated lookup (check both orderings)."""
    a, b = gene_a.upper(), gene_b.upper()
    if (a, b) in CURATED_MECHANISMS:
        return (a, b)
    if (b, a) in CURATED_MECHANISMS:
        return (b, a)
    return (a, b)


def _find_shared_terms(
    go_a: list[dict[str, str]], go_b: list[dict[str, str]]
) -> list[dict[str, str]]:
    """Find GO terms shared between two genes."""
    ids_a = {t["id"] for t in go_a}
    shared = [t for t in go_b if t["id"] in ids_a]
    return shared


def _find_shared_pathways(
    pw_a: list[dict[str, str]], pw_b: list[dict[str, str]]
) -> list[dict[str, str]]:
    """Find KEGG pathways shared between two genes."""
    ids_a = {p["id"] for p in pw_a}
    shared = [p for p in pw_b if p["id"] in ids_a]
    return shared


def _derive_interaction_type(
    evidence: list[str],
) -> str:
    """Derive interaction type from BioGRID experimental evidence."""
    evidence_lower = [e.lower() for e in evidence]
    if any("two-hybrid" in e or "affinity" in e for e in evidence_lower):
        return "physical_binding"
    if any("co-frac" in e or "co-purif" in e for e in evidence_lower):
        return "complex_member"
    if any("reconstituted" in e for e in evidence_lower):
        return "enzymatic"
    return "physical_association"


async def get_interaction_context(
    gene_a: str,
    gene_b: str,
) -> dict[str, Any]:
    """
    Assemble the full interaction context for a gene pair.

    Combines curated mechanism data (if available) with live
    GO and KEGG annotations to build a rich interaction narrative.

    Returns:
        {
            gene_a, gene_b,
            interaction_type, mechanism, effect_on_target, cellular_effect,
            subcellular_location, directionality,
            shared_go_terms, shared_pathways,
            go_a, go_b, pathways_a, pathways_b,
            pathway_axis, is_curated,
        }
    """
    clean_a = gene_a.strip().upper()
    clean_b = gene_b.strip().upper()

    # Check cache
    cache_params = {"gene_a": clean_a, "gene_b": clean_b, "type": "context"}
    cached, hit = await cache.get("default", cache_params)
    if hit:
        return cached

    # Fetch GO and KEGG in parallel
    go_a_data = await fetch_go_annotations(clean_a)
    go_b_data = await fetch_go_annotations(clean_b)
    pw_a_data = await fetch_kegg_pathways(clean_a)
    pw_b_data = await fetch_kegg_pathways(clean_b)

    # Find shared biology
    shared_go = _find_shared_terms(go_a_data["terms"], go_b_data["terms"])
    shared_pw = _find_shared_pathways(pw_a_data["pathways"], pw_b_data["pathways"])

    # Check for curated mechanism
    pair = _normalize_pair(clean_a, clean_b)
    curated = CURATED_MECHANISMS.get(pair)

    if curated:
        result = {
            "gene_a": clean_a,
            "gene_b": clean_b,
            "interaction_type": curated["interaction_type"],
            "mechanism": curated["mechanism"],
            "effect_on_target": curated["effect_on_target"],
            "cellular_effect": curated["cellular_effect"],
            "subcellular_location": curated["subcellular_location"],
            "directionality": curated["directionality"],
            "shared_go_terms": [{"id": t["id"], "name": t["name"]} for t in shared_go[:10]],
            "shared_pathways": [{"id": p["id"], "name": p["name"]} for p in shared_pw[:10]],
            "go_a": {"gene": clean_a, "terms": go_a_data["terms"][:15]},
            "go_b": {"gene": clean_b, "terms": go_b_data["terms"][:15]},
            "pathways_a": pw_a_data["pathways"][:10],
            "pathways_b": pw_b_data["pathways"][:10],
            "pathway_axis": AXIS_PATHWAY,
            "is_curated": True,
        }
    else:
        # Derive what we can from annotations
        result = {
            "gene_a": clean_a,
            "gene_b": clean_b,
            "interaction_type": "physical_association",
            "mechanism": f"{clean_a} and {clean_b} are reported interaction partners (STRING-DB/BioGRID).",
            "effect_on_target": "Functional consequence not yet characterized for this pair.",
            "cellular_effect": _infer_cellular_effect(shared_go),
            "subcellular_location": _infer_location(go_a_data["terms"], go_b_data["terms"]),
            "directionality": f"{clean_a} — {clean_b} (undirected)",
            "shared_go_terms": [{"id": t["id"], "name": t["name"]} for t in shared_go[:10]],
            "shared_pathways": [{"id": p["id"], "name": p["name"]} for p in shared_pw[:10]],
            "go_a": {"gene": clean_a, "terms": go_a_data["terms"][:15]},
            "go_b": {"gene": clean_b, "terms": go_b_data["terms"][:15]},
            "pathways_a": pw_a_data["pathways"][:10],
            "pathways_b": pw_b_data["pathways"][:10],
            "pathway_axis": AXIS_PATHWAY if any(
                g in (clean_a, clean_b)
                for g in ["PARL", "MAVS", "DDX58", "IRF3", "IFNB1"]
            ) else None,
            "is_curated": False,
        }

    await cache.set("default", cache_params, result)
    return result


def _infer_cellular_effect(shared_go: list[dict[str, str]]) -> str:
    """Infer a brief cellular effect summary from shared GO terms."""
    if not shared_go:
        return "Shared cellular functions not determined from GO annotations."

    process_terms = [t for t in shared_go if t.get("aspect") == "biological_process"]
    if process_terms:
        names = [t["name"] for t in process_terms[:3]]
        return f"Shared biological processes: {', '.join(names)}."
    return f"Share {len(shared_go)} GO annotations in common."


def _infer_location(
    go_a: list[dict[str, str]], go_b: list[dict[str, str]]
) -> str:
    """Infer subcellular location from GO cellular component terms."""
    cc_terms_a = {t["name"] for t in go_a if t.get("aspect") == "cellular_component"}
    cc_terms_b = {t["name"] for t in go_b if t.get("aspect") == "cellular_component"}
    shared = cc_terms_a & cc_terms_b
    if shared:
        return ", ".join(list(shared)[:3])
    if cc_terms_a:
        return f"{list(cc_terms_a)[0]} (gene A)"
    return "Not determined"
