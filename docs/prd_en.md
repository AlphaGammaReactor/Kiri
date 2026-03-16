# Kiri — Product Requirements Document (PRD)

> **Version:** 1.0 — 2026-03-14
> **Status:** Draft — Pending User Approval
> **Bilingual:** All user-facing strings via i18next (`en.json` / `zh.json`)

---

## 1. Project Vision

Kiri is a bilingual (EN/ZH), publication-grade bioinformatics platform that enables researchers to prove regulatory axes in cancer biology — starting with the **PARL ↔ MAVS axis in Colorectal Cancer (CRC)** — through a unified pipeline from raw omics data to journal-ready figures.

Kiri bridges the gap that no existing tool covers: **data selection → QC → normalization → analysis → mechanistic insight → clinical impact → drug targets → publication export**, all in one interface.

---

## 2. Module Architecture

### Module 1: Multi-Omics Atlas

**Purpose:** Compare target genes across every available database at every resolution level.

| Feature | Description | Data Source |
|---|---|---|
| Bulk RNA-seq Explorer | TPM/FPKM heatmaps, Normal vs. Tumor, Stage I-IV filtering | TCGA-COAD/READ via GDC API |
| GEO Validation | Independent cohort validation (GSE39582, GSE33113) | GEO/NCBI |
| Single-Cell View | Cell-type resolution — tumor vs. immune vs. stromal | Human Colon Cancer Atlas (scRNA-seq) |
| Proteomics Overlay | Protein-level validation of transcript findings | CPTAC |
| Custom Upload | CSV/TSV upload for lab-specific data (qPCR, Western Blot) | User-provided |

**Key Controls:** Split view toggle, MSI status filter (Stable/Instable), normalization method selector (TPM/FPKM/Counts).

**Acceptance Criteria:**
- [ ] User can select any gene and see expression across all data sources in a unified view
- [ ] Normalization method is always labeled on axes
- [ ] Sample sizes (n=) displayed on every panel
- [ ] All data points trace to source barcodes/accessions

---

### Module 2: Interaction Lab (Mechanistic Biology)

**Purpose:** Visualize the physical mechanisms — how proteins interact, where cleavage happens.

| Feature | Description | Tool |
|---|---|---|
| PPI Network | Interactive protein-protein interaction graph | Cytoscape.js + STRING-DB API |
| 3D Structure Viewer | Protein structure with cleavage site annotation | Three.js / NGL + AlphaFold API |
| Substrate Prediction | Sequence-based PARL cleavage motif analysis | Biopython |
| Citation Links | Click any edge/node → supporting PubMed citations | PubMed API |

**Acceptance Criteria:**
- [ ] PPI scores sourced from STRING-DB with confidence thresholds visible
- [ ] 3D viewer loads AlphaFold structures with predicted cleavage residues highlighted
- [ ] Every interaction edge links to ≥1 PubMed ID (or is flagged as "predicted")

---

### Module 3: Clinical & Prognostic Suite

**Purpose:** Predictive modeling for patient survival based on gene expression patterns.

| Feature | Description | Library |
|---|---|---|
| Kaplan-Meier Plotter | Survival curves with optimal cutpoint auto-calculation | Lifelines |
| Cox Regression | Multi-variable hazard ratios | Lifelines |
| Random Survival Forest | ML-based survival prediction | scikit-survival |
| Synergy Score | "Does high PARL + low MAVS = worse survival?" | Custom (Lifelines + SciPy) |

**Acceptance Criteria:**
- [ ] All survival curves show p-values (log-rank), 95% CI, and at-risk tables
- [ ] Cutpoint method is disclosed (maxstat / median / user-defined)
- [ ] Cox model shows hazard ratios with confidence intervals
- [ ] Synergy analysis includes interaction term p-value

---

### Module 4: AI-Augmented Discovery

**Purpose:** LLM-powered hypothesis generation and literature mining.

| Feature | Description | API |
|---|---|---|
| Literature Miner | Find "hidden" PARL/MAVS mentions in non-CRC papers | Gemini API + PubMed |
| Cross-Paper Synthesis | Connect findings across disparate research areas | Gemini API |
| Novelty Detector | Identify gaps in existing literature for the user's axis | Gemini API |

**Anti-Hallucination Controls:**
- All AI outputs visually separated from computed data (distinct card style, "AI-Suggested" badge)
- Every literature claim must link to a verifiable PubMed ID
- PMID validation: if the cited paper doesn't exist, the claim is flagged and quarantined
- Confidence score on every AI insight; below threshold → warning badge
- User can rate/dismiss AI suggestions (feedback loop for quality)

**Acceptance Criteria:**
- [ ] No AI-generated text is ever presented without "AI-Suggested" label
- [ ] All PMIDs are validated against PubMed API before display
- [ ] Quarantined/flagged claims are visually distinct (warning state)

---

### Module 5: Publication Engine

**Purpose:** Export analysis results as journal-submission-ready figures.

| Feature | Description |
|---|---|
| Vector Export | SVG/PDF at 300 DPI |
| Figure Panels | Multi-panel layouts matching Nature Cell Biology standards |
| Auto-Legends | Generated figure legends with methods, sample sizes, stats |
| Provenance Footer | Dataset, normalization method, date, Kiri version on every export |
| Bilingual Export | Figures exportable in EN or ZH |

**Style Standards (Nature Cell Biology-grade):**
- Clean axes, no chartjunk, proper tick marks
- Colorblind-safe palettes by default, grayscale-safe for print
- Serif fonts for figure labels, monospace for data values
- Error bars always labeled (SEM vs. SD vs. 95% CI)

**Acceptance Criteria:**
- [ ] Exported SVGs pass journal dimension/resolution checks
- [ ] Every figure includes provenance metadata
- [ ] Color palettes tested against CVD simulation

---

### Module 6: Drug Discovery

**Purpose:** Translate findings into therapeutic targets.

| Feature | Description | Data Source |
|---|---|---|
| Drug Search | Compounds that inhibit PARL or stabilize MAVS | DrugBank |
| Toxicology Cross-Ref | Chemical-disease-gene associations | CTD |
| Target Ranking | Score drugs by interaction confidence + clinical evidence | Custom scoring |

**Acceptance Criteria:**
- [ ] Drug-gene associations show original source and evidence level
- [ ] No drug recommendation without supporting citations
- [ ] Clear "Research Use Only" disclaimer

### Module 7: Protein-Protein Docking

**Purpose:** Perform high-confidence docking between protein complexes to generate publication-ready structural models and interaction analyses.

| Feature | Description | Tool / API |
|---|---|---|
| Docking Strategy | Global rigid docking (ClusPro/ZDOCK) or flexible docking (HADDOCK). AlphaFold-Multimer for high accuracy. | ClusPro/HADDOCK/AlphaFold API |
| Refinement | Energy minimization and short MD simulations to remove clashes | OpenMM / IMPD |
| Interaction Analysis | Interface residues (≤5Å), H-bonds, salt bridges, hydrophobic contacts, π–π stacking, MM/GBSA | Biopython / PyMOL / Custom |
| 2D Interaction Diagram | LigPlot+ style 2D interaction maps of key contacts | Custom visualization |
| Publication Figures | Cartoon representations with gradients, close-up interface views (semi-transparent electrostatic surface) | 3D Viewer (NGL/Three.js) |

**Acceptance Criteria:**
- [ ] User can select two proteins and run global or flexible docking
- [ ] Interface residues and non-covalent interactions are fully characterized
- [ ] Binding free energy is estimated
- [ ] Interactive 3D viewer supports publication-quality styling (gradients, electrostatic surfaces)
- [ ] Validation metrics (DockQ, pLDDT/PAE) are displayed
- [ ] Results exportable as High-Res PDB complexes and TIFF/PDF figures (≥300 dpi)

---

## 3. Global Requirements

### Bilingual (EN/ZH)
- All UI strings via `i18next` → `t()` function
- No hardcoded strings anywhere in the UI
- Locale files: `locales/en.json`, `locales/zh.json`
- Chart labels, axis titles, tooltips — all translated

### Trust Layer (Infrastructure)
- **Data Provenance:** Every data point traceable to source
- **Statistical Rigor:** p-values, CIs, sample sizes visible on every analysis
- **Validation Pipeline:** Input (HGNC check), computation (event count check), output (label verification)
- **Anti-Hallucination:** AI outputs isolated, PMID-validated, confidence-scored
- **Audit Trail:** Every analysis step reproducible and logged

### Accessibility
- Colorblind-safe palettes (default)
- Keyboard navigation for all interactive elements
- Screen reader labels on charts

---

## 4. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Heavy bio-computation in background tasks (Celery/subprocess), never blocking FastAPI |
| Loading States | All async computation shows progress indicators |
| Error Handling | Graceful degradation — upstream API failures show clear messages, never silent failures |
| Caching | Redis layer for API responses (STRING-DB, PubMed, GDC) with TTL + version tracking |
| Export | All visualizations exportable as SVG/PDF/PNG |
