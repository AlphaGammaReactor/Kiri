# 🌿 Kiri — Bioinformatics Research Platform

> A bilingual (EN/ZH), publication-grade bioinformatics command center for proving regulatory axes in cancer biology — from raw omics data to journal-ready figures.
>
> **Any cancer type. Any protein targets. Any data sources.** Initial test case: PARL ↔ MAVS axis in Colorectal Cancer (CRC).

## Architecture

```
Kiri/
├── frontend/          # React (Vite + TypeScript) — Dark lab aesthetic
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Module page components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── services/      # i18n, API client
│   │   ├── store/         # Redux Toolkit state
│   │   ├── locales/       # en.json / zh.json
│   │   ├── styles/        # Tailwind theme (index.css)
│   │   ├── App.tsx        # Router + layout shell
│   │   └── main.tsx       # Entry point
│   └── package.json
├── backend/           # FastAPI + bio-computation engine
│   ├── app/
│   │   ├── api/           # REST endpoints
│   │   ├── core/          # Config, middleware
│   │   ├── models/        # Pydantic schemas
│   │   ├── services/      # Business logic, external APIs
│   │   ├── utils/         # Helpers, validation
│   │   └── main.py        # FastAPI app
│   ├── requirements.txt
│   └── pyproject.toml
├── docs/              # Source of truth
│   ├── prd_en.md
│   ├── system_tech.md
│   └── research_brief.md
├── TODO.md
├── development_log.md
└── README.md
```

## Modules

| # | Module | Purpose |
|---|---|---|
| 1 | Multi-Omics Atlas | Expression across TCGA, GEO, scRNA-seq, CPTAC |
| 2 | Interaction Lab | PPI networks, 3D structures, cleavage prediction |
| 3 | Clinical Suite | Survival analysis, Cox regression, synergy scores |
| 4 | AI Discovery | LLM literature mining with anti-hallucination controls |
| 5 | Publication Engine | Journal-ready SVG/PDF export (Nature Cell Bio grade) |
| 6 | Drug Discovery | DrugBank/CTD compound screening |

## Quick Start

### Frontend
```bash
cd frontend
npm install
npm run dev       # → http://localhost:5173
```

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload   # → http://localhost:8000
```

## Trust Layer

Every analysis output includes: data provenance, p-values with CIs, sample sizes, and normalization method. AI outputs are always labeled "AI-Suggested" with verified PubMed citations. See `docs/prd_en.md` for full specifications.

## Bilingual

All UI strings pass through `i18next` — switch between English and Chinese (Simplified) with one click. No hardcoded strings.
