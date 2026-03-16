"""
Kiri — Protein Catalog Service

Pre-loaded protein database for instant selection in the project wizard.
Core PARL-MAVS axis proteins + commonly studied immune/mitochondrial targets.

Data sourced from:
- research_brief.md (PARL-MAVS axis)
- UniProt (reviewed Swiss-Prot entries)
- HGNC nomenclature
"""

from typing import Any

# ══════════════════════════════
#  Pre-loaded Protein Catalog
# ══════════════════════════════

PROTEIN_CATALOG: list[dict[str, Any]] = [
    # ── Core PARL-MAVS Axis (from research_brief.md) ──
    {
        "gene_symbol": "PARL",
        "uniprot_id": "Q9H300",
        "protein_name": "Presenilin-associated rhomboid-like protein",
        "organism": "Homo sapiens",
        "function_summary": "Mitochondrial intramembrane serine protease that cleaves substrates within the inner mitochondrial membrane. Proposed to cleave MAVS, potentially suppressing innate immune signaling in colorectal cancer.",
        "sequence_length": 379,
        "hgnc_id": "HGNC:23407",
        "category": "core",
        "keywords": ["mitochondrial", "protease", "rhomboid", "intramembrane", "MAVS cleavage"],
    },
    {
        "gene_symbol": "MAVS",
        "uniprot_id": "Q7Z434",
        "protein_name": "Mitochondrial antiviral-signaling protein",
        "organism": "Homo sapiens",
        "function_summary": "Adapter required for innate immune defense against viruses. Acts downstream of RIG-I and MDA5 to activate NF-kB and IRF3, leading to type I interferon production. Located on the outer mitochondrial membrane.",
        "sequence_length": 540,
        "hgnc_id": "HGNC:29233",
        "category": "core",
        "keywords": ["mitochondrial", "innate immunity", "interferon", "antiviral", "RIG-I pathway"],
    },
    {
        "gene_symbol": "DDX58",
        "uniprot_id": "O95786",
        "protein_name": "DExD/H-box helicase 58 (RIG-I)",
        "organism": "Homo sapiens",
        "function_summary": "Cytoplasmic RNA helicase that senses double-stranded RNA from viruses. Activates MAVS signaling to induce type I interferon responses. Key upstream sensor in the RIG-I-like receptor pathway.",
        "sequence_length": 925,
        "hgnc_id": "HGNC:19942",
        "category": "core",
        "keywords": ["RNA sensor", "helicase", "RIG-I", "innate immunity", "dsRNA detection"],
    },
    {
        "gene_symbol": "IRF3",
        "uniprot_id": "Q14653",
        "protein_name": "Interferon regulatory factor 3",
        "organism": "Homo sapiens",
        "function_summary": "Transcription factor activated downstream of MAVS signaling. Phosphorylated IRF3 dimerizes and translocates to the nucleus to drive expression of type I interferons and interferon-stimulated genes.",
        "sequence_length": 427,
        "hgnc_id": "HGNC:6118",
        "category": "core",
        "keywords": ["transcription factor", "interferon", "innate immunity", "phosphorylation"],
    },
    {
        "gene_symbol": "IFNB1",
        "uniprot_id": "P01574",
        "protein_name": "Interferon beta 1",
        "organism": "Homo sapiens",
        "function_summary": "Type I interferon cytokine produced in response to viral infection. Output of the RIG-I/MAVS/IRF3 pathway. Has antiproliferative, antiviral, and immunomodulatory activities.",
        "sequence_length": 187,
        "hgnc_id": "HGNC:5434",
        "category": "core",
        "keywords": ["cytokine", "interferon", "antiviral", "type I IFN", "immune signaling"],
    },
    # ── Immune & Signaling Proteins ──
    {
        "gene_symbol": "MDA5",
        "uniprot_id": "Q9BYX4",
        "protein_name": "Interferon-induced helicase C domain-containing protein 1 (IFIH1/MDA5)",
        "organism": "Homo sapiens",
        "function_summary": "Cytoplasmic RNA helicase that detects long dsRNA. Works in parallel with RIG-I to activate MAVS-dependent interferon responses. Also known as IFIH1.",
        "sequence_length": 1025,
        "hgnc_id": "HGNC:18873",
        "category": "immune",
        "keywords": ["RNA sensor", "helicase", "MDA5", "IFIH1", "innate immunity"],
    },
    {
        "gene_symbol": "STING1",
        "uniprot_id": "Q86WV6",
        "protein_name": "Stimulator of interferon genes protein",
        "organism": "Homo sapiens",
        "function_summary": "ER-resident transmembrane protein that activates innate immune signaling in response to cytosolic DNA via the cGAS-STING pathway. Induces type I interferon production through TBK1-IRF3 axis.",
        "sequence_length": 379,
        "hgnc_id": "HGNC:27962",
        "category": "immune",
        "keywords": ["cGAS-STING", "innate immunity", "interferon", "DNA sensing", "ER"],
    },
    {
        "gene_symbol": "TBK1",
        "uniprot_id": "Q9UHD2",
        "protein_name": "TANK-binding kinase 1",
        "organism": "Homo sapiens",
        "function_summary": "Serine/threonine kinase that phosphorylates IRF3 and IRF7 downstream of MAVS and STING signaling. Essential for type I interferon induction in innate immune defense.",
        "sequence_length": 729,
        "hgnc_id": "HGNC:11584",
        "category": "immune",
        "keywords": ["kinase", "IRF3 phosphorylation", "innate immunity", "interferon"],
    },
    {
        "gene_symbol": "NFKB1",
        "uniprot_id": "P19838",
        "protein_name": "Nuclear factor NF-kappa-B p105 subunit",
        "organism": "Homo sapiens",
        "function_summary": "Transcription factor central to immune, inflammatory, and apoptotic responses. Activated downstream of MAVS signaling and multiple immune receptors.",
        "sequence_length": 969,
        "hgnc_id": "HGNC:7794",
        "category": "immune",
        "keywords": ["transcription factor", "NF-kB", "inflammation", "immune", "apoptosis"],
    },
    {
        "gene_symbol": "CASP1",
        "uniprot_id": "P29466",
        "protein_name": "Caspase-1 (ICE)",
        "organism": "Homo sapiens",
        "function_summary": "Inflammatory caspase that cleaves pro-IL-1β and pro-IL-18 into their active forms. Key effector of the NLRP3 inflammasome. Linked to pyroptosis and immune signaling.",
        "sequence_length": 404,
        "hgnc_id": "HGNC:1499",
        "category": "immune",
        "keywords": ["caspase", "inflammasome", "IL-1", "pyroptosis", "inflammatory"],
    },
    {
        "gene_symbol": "NLRP3",
        "uniprot_id": "Q96P20",
        "protein_name": "NACHT, LRR and PYD domains-containing protein 3",
        "organism": "Homo sapiens",
        "function_summary": "Cytoplasmic pattern recognition receptor that forms the NLRP3 inflammasome. Activates caspase-1 to process IL-1β. Implicated in autoinflammatory diseases and cancer immunology.",
        "sequence_length": 1036,
        "hgnc_id": "HGNC:16400",
        "category": "immune",
        "keywords": ["inflammasome", "pattern recognition", "IL-1", "innate immunity"],
    },
    # ── Mitochondrial Proteins ──
    {
        "gene_symbol": "PINK1",
        "uniprot_id": "Q9BXM7",
        "protein_name": "Serine/threonine-protein kinase PINK1",
        "organism": "Homo sapiens",
        "function_summary": "Mitochondrial kinase that protects cells from stress-induced mitochondrial dysfunction. Initiates mitophagy by phosphorylating ubiquitin and Parkin. Mutations linked to Parkinson's disease.",
        "sequence_length": 581,
        "hgnc_id": "HGNC:14581",
        "category": "mitochondrial",
        "keywords": ["mitochondrial", "kinase", "mitophagy", "Parkin", "stress response"],
    },
    {
        "gene_symbol": "PRKN",
        "uniprot_id": "O60260",
        "protein_name": "E3 ubiquitin-protein ligase parkin",
        "organism": "Homo sapiens",
        "function_summary": "E3 ubiquitin ligase recruited to depolarized mitochondria by PINK1. Ubiquitinates outer mitochondrial membrane proteins to tag damaged mitochondria for autophagy (mitophagy).",
        "sequence_length": 465,
        "hgnc_id": "HGNC:8607",
        "category": "mitochondrial",
        "keywords": ["ubiquitin ligase", "mitophagy", "PINK1", "mitochondrial quality"],
    },
    {
        "gene_symbol": "MFN2",
        "uniprot_id": "O95140",
        "protein_name": "Mitofusin-2",
        "organism": "Homo sapiens",
        "function_summary": "GTPase involved in mitochondrial fusion. Tethers adjacent mitochondria and facilitates outer membrane fusion. Also mediates ER-mitochondria contacts important for calcium signaling and MAVS activation.",
        "sequence_length": 757,
        "hgnc_id": "HGNC:16877",
        "category": "mitochondrial",
        "keywords": ["mitochondrial fusion", "GTPase", "ER contact", "MAVS", "calcium"],
    },
    {
        "gene_symbol": "VDAC1",
        "uniprot_id": "P21796",
        "protein_name": "Voltage-dependent anion-selective channel protein 1",
        "organism": "Homo sapiens",
        "function_summary": "Major channel protein in the outer mitochondrial membrane. Forms pores allowing metabolite passage. Interacts with MAVS and plays roles in apoptosis and metabolic regulation.",
        "sequence_length": 283,
        "hgnc_id": "HGNC:12669",
        "category": "mitochondrial",
        "keywords": ["outer membrane", "channel", "apoptosis", "metabolite transport", "MAVS"],
    },
    # ── Tumor Suppressor / Oncology ──
    {
        "gene_symbol": "TP53",
        "uniprot_id": "P04637",
        "protein_name": "Cellular tumor antigen p53",
        "organism": "Homo sapiens",
        "function_summary": "Tumor suppressor that acts as a transcription factor regulating cell cycle arrest, apoptosis, and DNA repair. Most frequently mutated gene in human cancers. Guardian of the genome.",
        "sequence_length": 393,
        "hgnc_id": "HGNC:11998",
        "category": "oncology",
        "keywords": ["tumor suppressor", "transcription factor", "apoptosis", "cell cycle", "p53"],
    },
    {
        "gene_symbol": "KRAS",
        "uniprot_id": "P01116",
        "protein_name": "GTPase KRas",
        "organism": "Homo sapiens",
        "function_summary": "Small GTPase that acts as a molecular switch in RAS-MAPK signaling. Frequently mutated in colorectal, pancreatic, and lung cancers. Key oncogenic driver.",
        "sequence_length": 189,
        "hgnc_id": "HGNC:6407",
        "category": "oncology",
        "keywords": ["oncogene", "GTPase", "RAS-MAPK", "colorectal cancer", "signaling"],
    },
    {
        "gene_symbol": "BRAF",
        "uniprot_id": "P15056",
        "protein_name": "Serine/threonine-protein kinase B-Raf",
        "organism": "Homo sapiens",
        "function_summary": "Serine/threonine kinase in the RAS-MAPK pathway. BRAF V600E mutation is common in colorectal cancers with MSI-H phenotype. Target of vemurafenib and dabrafenib.",
        "sequence_length": 766,
        "hgnc_id": "HGNC:1097",
        "category": "oncology",
        "keywords": ["kinase", "MAPK", "V600E", "colorectal cancer", "MSI-H", "targeted therapy"],
    },
    {
        "gene_symbol": "APC",
        "uniprot_id": "P25054",
        "protein_name": "Adenomatous polyposis coli protein",
        "organism": "Homo sapiens",
        "function_summary": "Tumor suppressor that negatively regulates Wnt signaling by promoting beta-catenin degradation. Mutations in APC initiate colorectal adenoma formation (FAP). Truncating mutations are the most common initiating event in sporadic CRC.",
        "sequence_length": 2843,
        "hgnc_id": "HGNC:583",
        "category": "oncology",
        "keywords": ["tumor suppressor", "Wnt signaling", "beta-catenin", "colorectal cancer", "FAP"],
    },
    {
        "gene_symbol": "MLH1",
        "uniprot_id": "P40692",
        "protein_name": "DNA mismatch repair protein Mlh1",
        "organism": "Homo sapiens",
        "function_summary": "DNA mismatch repair gene. Epigenetic silencing of MLH1 by promoter methylation is the primary cause of sporadic MSI-H colorectal cancer. Key biomarker for immunotherapy response.",
        "sequence_length": 756,
        "hgnc_id": "HGNC:7127",
        "category": "oncology",
        "keywords": ["mismatch repair", "MSI-H", "methylation", "immunotherapy", "Lynch syndrome"],
    },
]


def get_full_catalog() -> list[dict[str, Any]]:
    """Return the complete protein catalog."""
    return PROTEIN_CATALOG


def search_catalog(query: str) -> list[dict[str, Any]]:
    """
    Search the catalog by gene symbol, protein name, or keywords.
    Case-insensitive fuzzy matching.
    """
    if not query or not query.strip():
        return PROTEIN_CATALOG

    q = query.strip().upper()

    results = []
    for protein in PROTEIN_CATALOG:
        # Exact symbol match → highest priority
        if protein["gene_symbol"].upper() == q:
            results.insert(0, protein)
            continue

        # Symbol starts with query
        if protein["gene_symbol"].upper().startswith(q):
            results.append(protein)
            continue

        # Search protein name
        if q.lower() in protein["protein_name"].lower():
            results.append(protein)
            continue

        # Search keywords
        if any(q.lower() in kw.lower() for kw in protein.get("keywords", [])):
            results.append(protein)
            continue

        # Search category
        if q.lower() in protein.get("category", "").lower():
            results.append(protein)
            continue

    return results


def is_catalog_protein(gene_symbol: str) -> dict[str, Any] | None:
    """
    Check if a gene symbol exists in the catalog.
    Returns the protein data if found, None otherwise.
    """
    symbol = gene_symbol.strip().upper()
    for protein in PROTEIN_CATALOG:
        if protein["gene_symbol"].upper() == symbol:
            return protein
    return None
