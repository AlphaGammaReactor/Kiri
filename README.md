# 🌿 Kiri — Bioinformatics Research Platform

> A bilingual (EN/ZH), publication-grade bioinformatics command center for proving regulatory axes in cancer biology — from raw omics data to journal-ready figures.
>
> **Any cancer type. Any protein targets. Any data sources.**

> [!CAUTION]
> **Alpha Release — Not Production Ready**
>
> This project is in **early alpha**. It has **not been systematically bug-checked or audited** for correctness. Analyses, statistical outputs, and AI-generated content should be independently verified before use in any research or publication. Use at your own risk.

## Status

Kiri is being rebuilt. This is an alpha: check any result independently before you rely on it.

| Area | Status |
|---|---|
| Results come only from real data | Done for the paths listed below; the rest of the code has not been audited line by line |
| Install from a lockfile, CI | Done |
| Hosted test build behind a password | Done |
| Golden-number tests against published TCGA results | Not done |
| Independent security review | Not done |
| End-to-end browser tests in CI | Not done (the Playwright tests need a running stack) |

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
│   ├── pyproject.toml     # dependencies
│   └── uv.lock            # exact versions (the lockfile)
├── docs/              # Source of truth (PRD, system design, research brief)
├── TODO.md
├── development_log.md
└── README.md
```

## Modules

| # | Module | Purpose | Status |
|---|---|---|---|
| 1 | Multi-Omics Atlas | Expression across TCGA, GEO, scRNA-seq, CPTAC | Alpha |
| 2 | Interaction Lab | PPI networks, 3D structures, cleavage prediction | Alpha |
| 3 | Clinical Suite | Survival analysis, Cox regression, synergy scores | Alpha |
| 4 | AI Discovery | LLM literature mining with anti-hallucination controls | Alpha |
| 5 | Publication Engine | Journal-ready SVG/PDF export (Nature Cell Bio grade) | Alpha |
| 6 | Drug Discovery | DrugBank, PubChem and ChEMBL compound lookup | Alpha |
| 7 | Mito Lab | Mitochondrial gene analysis | Alpha |
| 8 | Cross-Validation | Independent dataset validation | Alpha |

## What Kiri will not do

Kiri never shows generated, random or example numbers in place of real data.
When a data source or engine is missing, the screen says so and the API
answers `501` with a plain explanation. Not available yet:

| Feature | State |
|---|---|
| GEO expression cohorts | Accession check only. No expression download yet. |
| GEO perturbation datasets, PRIDE proteomics | Upload your own table. No public download yet. |
| Protein docking | No engine yet. |
| CTD chemical-disease associations | Not integrated. |
| Immune deconvolution | Works once you install your own copy of LM22 (see `NOTICE.md`). |
| DFS / PFS / DSS for TCGA cohorts | Only overall survival is available from GDC. |
| Random survival forest | Removed with its GPL dependency. |

The p-value shown after an optimal-cutpoint search is adjusted for the search
(Miller-Siegmund, as in Altman et al. 1994); the unadjusted value is shown beside it.

## Quick start (your own computer)

You need [uv](https://docs.astral.sh/uv/) and Node 22.

```bash
# Backend: http://127.0.0.1:8000
cd backend
uv sync --frozen
uv run uvicorn app.main:app --reload

# Frontend: http://localhost:5173 (proxies /api to the backend)
cd frontend
npm ci
npm run dev
```

Kiri keeps everything in `backend/data/` (a SQLite database, a signing key,
uploads). Nothing else needs to be installed or configured.

```bash
# Checks (the same ones CI runs)
cd backend  && uv run ruff check app tests && uv run pytest -m "not live"
cd frontend && npx tsc -b && npx eslint . && npx vitest run && npm run build
```

## Hosted test build (Railway)

One container serves the frontend and the API. It always runs in **server mode**:

- the whole site is behind one shared password, and the app refuses to start without it;
- adding your own data (uploads, lab records) is turned off, so testers use sample and public data only;
- the API docs are hidden and the site asks search engines not to index it.

```bash
docker build -t kiri-test .
docker run -p 8000:8000 -v kiri-data:/data -e KIRI_ACCESS_PASSWORD='a-long-password' kiri-test
```

On Railway: one service built from the root `Dockerfile` (`railway.toml` sets
this up), a volume mounted at `/data`, and one variable, `KIRI_ACCESS_PASSWORD`
(12 or more characters). Change the variable to sign every tester out.

## Licence

Kiri is **not open source**. All rights reserved; see [`LICENSE`](LICENSE).
The source is published for inspection only: it may not be copied, modified or
redistributed without written permission. This may change at or after 1.0.
Third-party software and data keep their own licences; see [`NOTICE.md`](NOTICE.md).

## Bilingual

All UI strings pass through `i18next` — switch between English and Chinese (Simplified) with one click.
