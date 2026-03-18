# 🌿 Kiri — Bioinformatics Research Platform

> A bilingual (EN/ZH), publication-grade bioinformatics command center for proving regulatory axes in cancer biology — from raw omics data to journal-ready figures.
>
> **Any cancer type. Any protein targets. Any data sources.**

> [!CAUTION]
> **Alpha Release — Not Production Ready**
>
> This project is in **early alpha**. It has **not been systematically bug-checked or audited** for correctness. Analyses, statistical outputs, and AI-generated content should be independently verified before use in any research or publication. Use at your own risk.

## Status

| Area | Status |
|---|---|
| Core modules | ✅ Implemented (alpha) |
| Backend API | ✅ Functional |
| Frontend UI | ✅ Functional |
| i18n (EN/ZH) | ✅ Implemented |
| Bug testing | ⚠️ Not systematically done |
| E2E tests | ⚠️ Partial coverage |
| Security audit | ❌ Not done |
| Performance tuning | ❌ Not done |

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
| 6 | Drug Discovery | DrugBank/CTD compound screening | Alpha |
| 7 | Mito Lab | Mitochondrial gene analysis | Alpha |
| 8 | Cross-Validation | Independent dataset validation | Alpha |

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

### Docker (dev — all services)
```bash
docker-compose up --build
```

## Deployment

### Branch Topology
```
main                         ← stable baseline
  └── ag-docker-dev          ← latest development (all features)
        └── deploy/railway-production  ← production-ready Docker configs
```

### Railway (Production)

The `deploy/railway-production` branch includes production-hardened Dockerfiles and Railway configs.

**Architecture:** 2 Railway services from 1 repo
| Service | Root Dir | Build | Serves |
|---------|----------|-------|--------|
| Backend (FastAPI) | `backend/` | Dockerfile (Python 3.11, 2 workers) | `/api/*` |
| Frontend (Vite→nginx) | `frontend/` | Dockerfile (multi-stage: build → nginx) | SPA + proxy to backend |

**Required env vars (set in Railway dashboard, never committed):**
| Variable | Service | Description |
|----------|---------|-------------|
| `DATABASE_URL` | Backend | Auto-injected by Railway PostgreSQL plugin |
| `JWT_SECRET_KEY` | Backend | Strong random secret for auth |
| `CORS_ORIGINS` | Backend | Comma-separated: `https://<frontend>.up.railway.app` |
| `INVITE_CODE` | Backend | Registration gate code |
| `DEBUG` | Backend | Set to `false` |
| `BACKEND_URL` | Frontend | `https://<backend>.up.railway.app` |

### Railway Operations

**List services:**
```bash
railway link          # Link to the Kiri project (one-time)
railway service list  # Shows: Kiri, Frontend, Postgres-soBQ, Postgres-3_4W, Redis
```

**Connect to production database (interactive psql):**
```bash
railway connect Postgres-soBQ
```

**Run SQL non-interactively (pipe):**
```bash
echo "SELECT count(*) FROM users;" | railway connect Postgres-soBQ
```

> [!IMPORTANT]
> **`railway connect` is the only reliable method from local.**
> Direct TCP proxy (`switchyard.proxy.rlwy.net:47381`) and `railway run` both fail from local machines. Always use `railway connect <service-name>` to pipe SQL or open an interactive session.

**Delete a user (cascade-safe):**
```sql
BEGIN;
DELETE FROM projects WHERE owner_id = (SELECT id FROM users WHERE email = 'user@example.com');
DELETE FROM project_collaborators WHERE user_id = (SELECT id FROM users WHERE email = 'user@example.com');
DELETE FROM users WHERE email = 'user@example.com';
COMMIT;
```

**View deployment logs:**
```bash
railway logs --service Kiri          # Backend logs
railway logs --service Frontend      # Frontend logs
```


## Data Sources

Kiri pulls from public databases at runtime. No bulk datasets are bundled in the repo — users download/generate data files as needed during analysis.

| Source | Type |
|---|---|
| TCGA (GDC API) | Bulk RNA-seq, clinical |
| GEO (NCBI) | Microarray, RNA-seq |
| UniProt | Protein annotation |
| STRING | Protein-protein interactions |
| RCSB PDB | 3D structures |
| DrugBank / CTD | Drug-target interactions |
| PubMed / NCBI | Literature mining |

## Trust Layer

Every analysis output includes: data provenance, p-values with CIs, sample sizes, and normalization method. AI outputs are labeled "AI-Suggested" with verified PubMed citations. See `docs/prd_en.md` for full specifications.

## Bilingual

All UI strings pass through `i18next` — switch between English and Chinese (Simplified) with one click.

## License

Private repository. All rights reserved.
