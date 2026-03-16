# Kiri — Research Brief

> **Purpose:** Single source of truth for all biological naming conventions, gene identifiers, TCGA codes, and scientific standards used across the Kiri platform.
>
> **Rule:** If it's not in this document, ASK before coding.

---

## 1. Target Genes

| Gene Symbol | Full Name | UniProt ID | HGNC ID | Role in Kiri |
|---|---|---|---|---|
| **PARL** | Presenilin-associated rhomboid-like protein | Q9H300 | HGNC:23407 | Primary — mitochondrial intramembrane protease |
| **MAVS** | Mitochondrial antiviral-signaling protein | Q7Z434 | HGNC:29233 | Primary — innate immune signaling adaptor |
| **DDX58** (RIG-I) | DExD/H-box helicase 58 | O95786 | HGNC:19942 | Downstream — RNA sensor, MAVS activator |
| **IRF3** | Interferon regulatory factor 3 | Q14653 | HGNC:6118 | Downstream — transcription factor activated by MAVS |
| **IFNB1** | Interferon beta 1 | P01574 | HGNC:5434 | Downstream — type I interferon output |

### Regulatory Axis
```
RIG-I (DDX58) → MAVS → IRF3 → IFN-β (IFNB1)
                  ↑
              PARL cleaves MAVS (proposed mechanism)
```

**Hypothesis:** PARL-mediated cleavage of MAVS suppresses the innate immune response in CRC, contributing to immune evasion and poorer prognosis.

---

## 2. TCGA Project Codes

| Code | Full Name | Use in Kiri |
|---|---|---|
| **TCGA-COAD** | Colon Adenocarcinoma | Primary dataset |
| **TCGA-READ** | Rectum Adenocarcinoma | Combined with COAD for CRC analysis |

### Clinical Variables
| Variable | GDC Field | Values |
|---|---|---|
| Overall Survival (OS) | `days_to_death` / `days_to_last_follow_up` | Numeric (days) |
| Vital Status | `vital_status` | Alive / Dead |
| Tumor Stage | `ajcc_pathologic_stage` | Stage I, II, III, IV |
| MSI Status | `msi_status` | MSI-H, MSI-L, MSS |
| Primary Site | `primary_site` | Colon / Rectum |

### Expression Data
- **Data Type:** HTSeq - Counts (raw), HTSeq - FPKM, HTSeq - FPKM-UQ
- **Preferred Normalization:** TPM (calculated from raw counts for cross-sample comparison)
- **Workflow:** GDC STAR 2-pass alignment

---

## 3. GEO Validation Cohorts

| Accession | Platform | Samples | Use |
|---|---|---|---|
| **GSE39582** | Affymetrix U133+ | 585 CRC | Primary validation cohort |
| **GSE33113** | Affymetrix U133+ | 90 Stage II CRC | Stage-specific validation |

---

## 4. Protein Databases

| Database | Use | Key Identifiers |
|---|---|---|
| **STRING-DB** | PPI confidence scores | STRING IDs (e.g., 9606.ENSP00000...) |
| **BioGRID** | Physical interaction evidence | BioGRID IDs |
| **PDB** | Crystal/Cryo-EM structures | PDB IDs (e.g., 6VKF) |
| **AlphaFold** | Predicted structures | UniProt IDs → AF-{UniProt}-F1 |
| **CPTAC** | Proteomic validation | CPTAC sample IDs |

---

## 5. Pharmacology Databases

| Database | Use | Query Format |
|---|---|---|
| **DrugBank** | Drug-target interactions | Gene symbol or UniProt ID |
| **CTD** | Chemical-disease-gene associations | Gene symbol |

---

## 6. Naming Conventions & Standards

### Gene Symbols
- **Authority:** HGNC (Hugo Gene Nomenclature Committee)
- **Format:** Uppercase italicized in publications (e.g., *PARL*)
- **Validation:** All user-input gene symbols checked against HGNC via MyGene.info API

### Statistical Reporting
- **p-values:** Report exact values (e.g., p = 0.0032), not thresholds (p < 0.05)
- **Multiple testing:** Benjamini-Hochberg FDR correction by default
- **Survival curves:** Log-rank test, with at-risk tables
- **Effect sizes:** Hazard ratios with 95% CI
- **Expression comparison:** Wilcoxon rank-sum (non-parametric) unless normality confirmed

### Figure Standards (Nature Cell Biology)
- **Resolution:** Minimum 300 DPI for raster, vector preferred (SVG/PDF)
- **Fonts:** Arial/Helvetica for figures (Nature preference), 6-8pt minimum
- **Color:** Colorblind-safe palettes; must work in grayscale
- **Error bars:** Always labeled (SEM, SD, or 95% CI)
- **Scale bars:** Where applicable (e.g., microscopy images)

---

## 7. Pathway Databases

| Database | Use |
|---|---|
| **KEGG** | Metabolic and signaling pathways |
| **GO** (Gene Ontology) | Biological process, molecular function, cellular component |
| **Reactome** | Detailed pathway maps |

### Key Pathways for PARL-MAVS Axis
- `hsa04622` — RIG-I-like receptor signaling pathway (KEGG)
- `GO:0045087` — Innate immune response
- `GO:0005739` — Mitochondrion
- `R-HSA-168928` — RIG-I/MDA5 mediated induction of IFN (Reactome)
