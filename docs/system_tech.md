# Kiri — System & Technical Architecture

> **Version:** 1.0 — 2026-03-14

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                   FRONTEND (React/Vite)                   │
│  TypeScript • Tailwind CSS • Framer Motion • i18next      │
│  ECharts • Cytoscape.js • Three.js/NGL • D3.js           │
├──────────────────────────────────────────────────────────┤
│                   RESTful API (JSON)                       │
│                   Pydantic Models                          │
├──────────────────────────────────────────────────────────┤
│                   BACKEND (FastAPI)                        │
│  Bio-Computation Engine • Trust Layer • Export Pipeline    │
├──────────────┬─────────────┬────────────────────────────┤
│  PostgreSQL  │    Redis     │   Background Workers        │
│  (metadata)  │  (API cache) │   (Celery / subprocess)     │
├──────────────┴─────────────┴────────────────────────────┤
│              EXTERNAL APIs & DATA SOURCES                 │
│  GDC • GEO • STRING-DB • PubMed • AlphaFold • Gemini     │
│  DrugBank • CTD • MyGene.info • CPTAC                     │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

### Frontend
| Technology | Purpose |
|---|---|
| **React 18** (Vite) | UI framework, fast HMR dev experience |
| **TypeScript** | Type safety across all components |
| **Tailwind CSS** | "Dark Lab" aesthetic — custom theme tokens |
| **Framer Motion** | Smooth transitions and micro-animations |
| **i18next** | Bilingual (EN/ZH) — all strings via `t()` function |
| **Redux Toolkit** | Global state: language, gene selection, active dataset |
| **ECharts** | High-performance interactive charts (expression, survival) |
| **Cytoscape.js** | PPI network visualization |
| **Three.js / NGL** | 3D protein structure rendering |
| **D3.js** | Custom publication-grade SVG figure generation |

### Backend
| Technology | Purpose |
|---|---|
| **Python 3.11+** | Runtime |
| **FastAPI** | Async REST API with auto-generated OpenAPI docs |
| **Pydantic v2** | Request/response validation, strict type-checking |
| **PostgreSQL** | Metadata storage, cached datasets, user sessions |
| **Redis** | API response cache with TTL + version hashing |
| **Celery** | Background task queue for heavy bio-computation |

### Bio-Computation Libraries
| Library | Purpose | Module |
|---|---|---|
| **Biopython** | Gene sequence analysis, motif searching | Interaction Lab |
| **Scanpy** | scRNA-seq processing | Multi-Omics Atlas |
| **Lifelines** | Kaplan-Meier, Cox regression | Clinical Suite |
| **scikit-survival** | Random Survival Forests | Clinical Suite |
| **Pandas / NumPy** | Data manipulation, matrix ops | All modules |
| **SciPy** | Statistical tests (Mann-Whitney, T-test) | All modules |
| **Statsmodels** | Regression, multiple testing correction | Clinical Suite |
| **gseapy** | GSEA, pathway enrichment | Multi-Omics Atlas |
| **OpenMM / IMPD** | Energy minimization, MD simulations | Protein-Protein Docking |
| **HADDOCK / ClusPro API** | Protein-protein docking | Protein-Protein Docking |

### External APIs
| API | Data | Cache TTL |
|---|---|---|
| GDC API | TCGA-COAD/READ RNA-seq + clinical metadata | 24h |
| GEO/NCBI | Independent cohort datasets | 24h |
| STRING-DB | Protein-protein interaction scores | 7d |
| PubMed API | Literature citations, PMID validation | 7d |
| AlphaFold API | Predicted protein structures | 30d |
| Gemini API | LLM literature synthesis | No cache |
| MyGene.info | Real-time gene annotation, HGNC validation | 7d |
| DrugBank | Drug-gene interactions | 7d |
| CTD | Chemical-disease-gene associations | 7d |

---

## 3. API Design

All endpoints follow RESTful conventions with Pydantic validation:

```
/api/v1/atlas/expression       POST  — Fetch expression data for gene set
/api/v1/atlas/upload           POST  — Upload custom CSV/TSV dataset
/api/v1/interaction/ppi        GET   — Fetch PPI network for gene set
/api/v1/interaction/structure   GET   — Fetch AlphaFold structure
/api/v1/clinical/survival      POST  — Run survival analysis
/api/v1/clinical/cox           POST  — Run Cox regression
/api/v1/discovery/literature   POST  — AI literature search
/api/v1/discovery/validate     POST  — Validate PMIDs
/api/v1/drugs/search           GET   — Search drug-gene interactions
/api/v1/export/figure          POST  — Generate publication figure
/api/v1/validation/gene        GET   — Validate gene symbol against HGNC
```

### Response Envelope
Every API response follows:
```json
{
  "status": "success|error",
  "data": { ... },
  "provenance": {
    "source": "TCGA-COAD",
    "method": "TPM normalization",
    "timestamp": "2026-03-14T12:00:00Z",
    "sample_count": 521
  },
  "warnings": [],
  "errors": []
}
```

---

## 4. Trust Layer Implementation

### Input Validation
- Gene symbols validated against HGNC via MyGene.info API before any computation
- Uploaded files validated for format, column headers, and data types
- Request payloads strictly typed via Pydantic (no unvalidated inputs reach computation)

### Computation Validation
- Survival analysis: verify event count > 0, sufficient samples per group
- Statistical tests: verify assumptions (normality, sample size) before applying parametric tests
- Expression analysis: verify normalization method matches data type

### Output Validation
- Exported figures re-parsed to verify axis labels match data
- p-values formatted to appropriate precision (not spuriously precise)
- Provenance metadata attached to every exported artifact

### AI Anti-Hallucination
- All PMIDs validated against PubMed API before display
- AI outputs tagged with `source: "ai-suggested"` in response envelope
- Confidence thresholds: below 0.7 → warning badge, below 0.4 → quarantined

### Error Handling
- All external API calls wrapped with retry logic (exponential backoff, max 3 attempts)
- Timeout handling: long computations return task ID for polling, never block
- Upstream failures surface clear user-facing messages, never silent failures

---

## 5. Bilingual Implementation

| Aspect | Implementation |
|---|---|
| Framework | i18next for React |
| Locale Files | `src/locales/en.json`, `src/locales/zh.json` |
| Rule | **Zero hardcoded strings** — everything via `t()` |
| Scope | UI labels, chart axes, tooltips, error messages, export legends |
| Dynamic Content | Chart labels and axis titles regenerated on locale switch |

---

## 6. Performance Strategy

| Concern | Solution |
|---|---|
| Heavy bio-computation | Celery workers / subprocess — never blocking FastAPI event loop |
| Large dataset rendering | Virtual scrolling, pagination, lazy loading |
| API latency | Redis cache layer with TTL per source |
| Frontend bundle | Code splitting by module (lazy routes) |
| Chart rendering | ECharts canvas mode for large datasets, SVG mode for export |
| Loading UX | Skeleton loaders + progress bars for all async operations |
