"""
Kiri — Cancer-Type Data Source Recommendations

Static mapping of cancer types to recommended data sources.
Each cancer type gets its own curated list based on data
availability and relevance in authoritative databases.
"""

from typing import Any


# ── Per-cancer-type recommended sources ──
# Every cancer type from CANCER_TYPES in the frontend gets recommendations.
# Sources: tcga, geo, cptac, scrna, custom, drugbank, pubchem, chembl, string

CANCER_RECOMMENDATIONS: dict[str, dict[str, Any]] = {
    "COAD": {
        "label": "Colorectal — Colon",
        "recommended": ["tcga", "geo", "string", "drugbank", "pubchem", "chembl", "massive", "proteomecentral"],
        "tcga_projects": ["TCGA-COAD"],
        "geo_accessions": ["GSE39582", "GSE33113", "GSE17536"],
        "notes": "Primary Kiri cancer type. Extensive TCGA + GEO validation cohorts.",
    },
    "READ": {
        "label": "Colorectal — Rectal",
        "recommended": ["tcga", "geo", "string", "drugbank", "pubchem", "chembl", "massive", "proteomecentral"],
        "tcga_projects": ["TCGA-READ"],
        "geo_accessions": ["GSE39582"],
        "notes": "Often combined with COAD for CRC analysis.",
    },
    "BRCA": {
        "label": "Breast Cancer",
        "recommended": ["tcga", "geo", "cptac", "string", "drugbank", "pubchem", "chembl", "massive", "proteomecentral"],
        "tcga_projects": ["TCGA-BRCA"],
        "geo_accessions": ["GSE96058", "GSE81538"],
        "notes": "Excellent CPTAC proteomics coverage. High drug target density.",
    },
    "LUAD": {
        "label": "Lung Adenocarcinoma",
        "recommended": ["tcga", "geo", "cptac", "string", "drugbank", "pubchem", "chembl", "massive", "proteomecentral"],
        "tcga_projects": ["TCGA-LUAD"],
        "geo_accessions": ["GSE68465", "GSE31210"],
        "notes": "Strong druggability data (EGFR, ALK, KRAS). CPTAC proteomics available.",
    },
    "LUSC": {
        "label": "Lung Squamous Cell",
        "recommended": ["tcga", "geo", "string", "drugbank", "pubchem", "massive", "proteomecentral"],
        "tcga_projects": ["TCGA-LUSC"],
        "geo_accessions": ["GSE4573"],
        "notes": "Fewer druggable targets than LUAD. Limited CPTAC data.",
    },
    "PRAD": {
        "label": "Prostate Cancer",
        "recommended": ["tcga", "geo", "string", "drugbank", "pubchem", "chembl", "massive", "proteomecentral"],
        "tcga_projects": ["TCGA-PRAD"],
        "geo_accessions": ["GSE21034", "GSE46602"],
        "notes": "Good GEO validation cohorts. Hormone-driven targets well-studied.",
    },
    "LIHC": {
        "label": "Liver (Hepatocellular)",
        "recommended": ["tcga", "geo", "string", "drugbank", "pubchem", "chembl", "massive", "proteomecentral"],
        "tcga_projects": ["TCGA-LIHC"],
        "geo_accessions": ["GSE14520", "GSE36376"],
        "notes": "Sorafenib/lenvatinib targets well-characterized in DrugBank.",
    },
    "STAD": {
        "label": "Stomach (Gastric)",
        "recommended": ["tcga", "geo", "string", "drugbank", "pubchem", "massive", "proteomecentral"],
        "tcga_projects": ["TCGA-STAD"],
        "geo_accessions": ["GSE62254", "GSE15459"],
        "notes": "Lauren classification important for subtyping.",
    },
    "OV": {
        "label": "Ovarian Cancer",
        "recommended": ["tcga", "geo", "cptac", "string", "drugbank", "pubchem", "chembl", "massive", "proteomecentral"],
        "tcga_projects": ["TCGA-OV"],
        "geo_accessions": ["GSE26712", "GSE9891"],
        "notes": "CPTAC proteomics available. PARP inhibitor targets in ChEMBL.",
    },
    "GBM": {
        "label": "Glioblastoma",
        "recommended": ["tcga", "geo", "scrna", "string", "drugbank", "pubchem", "chembl", "massive", "proteomecentral"],
        "tcga_projects": ["TCGA-GBM"],
        "geo_accessions": ["GSE108474", "GSE16011"],
        "notes": "Rich scRNA-seq data. Blood-brain barrier considerations for drugs.",
    },
    "OTHER": {
        "label": "Other Cancer Type",
        "recommended": ["string", "drugbank", "pubchem", "chembl", "massive", "proteomecentral"],
        "tcga_projects": [],
        "geo_accessions": [],
        "notes": "Generic recommendation. TCGA/GEO datasets must be selected manually.",
    },
}


def get_recommendations(cancer_type: str) -> dict[str, Any]:
    """
    Get recommended data sources for a cancer type.

    Args:
        cancer_type: Cancer type code (e.g., "COAD", "BRCA").

    Returns:
        Recommendation dict with recommended source types and context.
    """
    key = cancer_type.strip().upper()
    rec = CANCER_RECOMMENDATIONS.get(key, CANCER_RECOMMENDATIONS["OTHER"])
    return {
        "cancer_type": key,
        "label": rec["label"],
        "recommended_sources": rec["recommended"],
        "tcga_projects": rec.get("tcga_projects", []),
        "geo_accessions": rec.get("geo_accessions", []),
        "notes": rec.get("notes", ""),
    }
