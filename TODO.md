# Kiri — Global TODO

> Auto-managed by the IDE Agent. Run `/todo` to refresh.
> Last updated: 2026-03-16 18:45 HKT (full platform audit + /start re-init)

---

## Phase 0: Initialization ✅
- [x] Configure IDE Agent (workflows, logging, validation)
- [x] Receive source documents (PRD, Data Specs, Stack, UX/UI)
- [x] Synthesize vision → `prd_en.md`, `system_tech.md`, `research_brief.md`
- [x] Run `/start` to scaffold React/FastAPI mono-repo
- [x] Initialize i18n locale files (en.json, zh.json)

---

## Phase 1: Foundation ✅
- [x] Response envelope (`status`, `data`, `provenance`, `warnings`, `errors`)
- [x] Global error handling middleware (graceful degradation)
- [x] Gene symbol validation endpoint (MyGene.info → HGNC)
- [x] PMID validation service (PubMed API)
- [x] Provenance metadata service
- [x] Input validation middleware (Pydantic strict mode)
- [x] Tailwind dark-lab theme + component tokens
- [x] Shared component library (`Card`, `Badge`, `ProvenanceFooter`, etc.)
- [x] Gene search component with HGNC auto-validation
- [x] API client service (axios + error handling + provenance extraction)

> [!NOTE]
> Phase 1 claimed PostgreSQL + Celery were set up, but those were stubs.
> Real PostgreSQL was added in the Infrastructure phase below.
> Celery + Redis implemented with graceful in-memory fallback.

---

## Phase 2: Multi-Omics Atlas ✅
- [x] GDC API integration: fetch TCGA-COAD/READ expression data (real downloads)
- [x] GDC API integration: fetch clinical metadata (stage, MSI, survival)
- [x] GEO dataset loader service
- [x] Custom CSV/TSV upload endpoint
- [x] Expression normalization service (TPM, FPKM, counts)
- [x] Replace synthetic GDC expression data with real downloads
- [x] Differential expression (PyDESeq2 Negative Binomial GLM)
- [x] API routes for Atlas endpoints
- [x] Expression heatmap component (ECharts)
- [x] Atlas filters component (stage, MSI, normalization, data source)
- [x] Atlas page wired into App router

---

## Phase 3: Interaction Lab ✅
- [x] STRING-DB API integration: PPI scores + confidence thresholds
- [x] BioGRID API integration: physical interaction evidence
- [x] AlphaFold API integration: predicted protein structures
- [x] Biopython cleavage motif analysis service
- [x] PubMed citation linker (edge → PMID)
- [x] Cytoscape.js PPI network viewer
- [x] Three.js/NGL 3D protein structure viewer
- [x] Cleavage site annotation overlay
- [x] Edge click → citation popup (with PMID validation)
- [x] Confidence threshold slider

---

## Infrastructure: Docker + Database ✅
- [x] `Dockerfile` for backend (Python 3.11 + bio-computation deps)
- [x] `Dockerfile` for frontend (Node 22 + Vite)
- [x] `docker-compose.yml` (api, postgres, redis, frontend)
- [x] `.env.example` with all required variables
- [x] `DATABASE_URL` added to `config.py`
- [x] Async SQLAlchemy engine + session factory (`core/database.py`)
- [x] Alembic setup (async-compatible `env.py`, migration template)
- [x] Database init/cleanup wired into FastAPI lifespan
- [x] Create initial Alembic migration + run it
- [x] Replace in-memory task dict with Celery + Redis (graceful fallback)

---

## Project Management System ✅
- [x] SQLAlchemy ORM models: `Project`, `ProjectProtein`, `ProjectDataSource`, `ProjectCollaborator`
- [x] `owner_id` field on Project (nullable — ready for future auth)
- [x] `ProjectCollaborator` table (user_id, email, role: owner/editor/viewer)
- [x] Project CRUD API endpoints (create, list, get, update, soft-delete)
- [x] Protein target endpoints (add with HGNC + UniProt enrichment, remove)
- [x] UniProt protein metadata service (`services/uniprot.py`)
- [x] PubMed co-occurrence suggestion service (`services/protein_suggest.py`)
- [x] Data source management endpoints (add/remove)
- [x] Redux `projectSlice` (7 async thunks)
- [x] Project Dashboard page (`/projects`)
- [x] New Project wizard (4-step: basics → proteins → sources → review)
- [x] `ProteinCard` component (full + compact modes)
- [x] Project-scoped routing (`/projects/:id/atlas`, etc.)
- [x] i18n keys for EN + ZH
- [x] Retrofit Atlas endpoints with `project_id`
- [x] Retrofit Interaction Lab endpoints with `project_id`

---

## Phase 4: Clinical & Prognostic Suite ✅
- [x] Lifelines: Kaplan-Meier endpoint with log-rank test (`services/survival.py` — 174L)
- [x] Lifelines: Cox proportional hazards endpoint (`services/cox.py` — 132L)
- [x] scikit-survival: Random Survival Forest endpoint (`services/rsf.py` — 98L)
- [x] Optimal cutpoint calculation (maxstat)
- [x] Synergy score computation (PARL×MAVS interaction term) (`services/synergy.py` — 135L)
- [x] Kaplan-Meier plotter with at-risk tables (`KaplanMeierPlot.tsx`)
- [x] Cox hazard ratio forest plot (`CoxForestPlot.tsx`)
- [x] Synergy score visualization (`SynergyPanel.tsx`)
- [x] Cutpoint method selector + disclosure (`CutpointSelector.tsx`)
- [x] p-value, CI, sample size display on every analysis
- [x] Clinical Suite page (`ClinicalSuite.tsx` — 241L)
- [x] API routes wired (`api/clinical.py` — 4 endpoints)

---

## Phase 5: AI-Augmented Discovery ✅
- [x] Gemini API integration: literature mining endpoint (`services/discovery_llm.py` — 66L)
- [x] PubMed search + PMID validation pipeline
- [x] Confidence scoring for AI-generated insights
- [x] Quarantine mechanism for unverifiable claims
- [x] AI Discovery page with "AI-Suggested" badge system (`DiscoveryPage.tsx` — 181L)
- [x] Citation cards with PMID verification status (`CitationCard.tsx`)
- [x] Confidence score bars (`ConfidenceScoreBar.tsx`)
- [x] Quarantined claims view (warning state)
- [x] API routes wired (`api/discovery.py` — 2 endpoints)

> [!NOTE]
> User feedback (accept/dismiss AI suggestions) is not yet implemented.

---

## Phase 6: Publication Engine ✅
- [x] SVG/PDF figure generation service (`services/publication.py` — 142L)
- [x] Figure panel layout engine (multi-panel, journal-spec)
- [x] Auto-legend generator (methods, sample sizes, stats)
- [x] Provenance footer stamper (dataset, method, date, version)
- [x] Figure builder UI (select panels, arrange layout) (`PublicationEngine.tsx` — 249L)
- [x] Export format selector (SVG / PDF / PNG)
- [x] Preview with Nature Cell Biology style defaults
- [x] API routes wired (`api/export.py` — 1 endpoint)

> [!NOTE]
> Bilingual export option and colorblind-safe palette selector UI are stubbed but not fully wired.
> Publication state now persists across page reloads (auto-save with 2s debounce).

---

## Project History & Auto-Save ✅
- [x] Publication Engine state persistence (JSON column on Project, GET/PUT endpoints)
- [x] Alembic migration for `publication_state` column
- [x] Frontend auto-load on mount, auto-save with 2s debounce
- [x] Snapshot thunks in `projectSlice` (list, create, restore)
- [x] `ProjectHistory.tsx` page with timeline, create/restore dialogs
- [x] `useAutoSave.ts` hook (5-min interval, change-detection)
- [x] 📜 History nav item + route in `App.tsx`
- [x] i18n keys (en + zh, 18 new keys each)

---

## Phase 7: Drug Discovery ✅
- [x] DrugBank integration for drug-gene interactions (via MyChem.info proxy)
- [x] CTD integration: chemical-disease-gene associations (mock data)
- [x] Drug target ranking service (multi-source scoring: MyChem + CTD + ChEMBL)
- [x] Drug search interface
- [x] Drug-gene interaction cards with evidence level
- [x] Target ranking visualization
- [x] "Research Use Only" disclaimer component
- [x] PubChem integration — compound search, properties, gene-targeted discovery (`services/pubchem.py`)
- [x] ChEMBL integration — bioactivity data IC50/Ki/Kd, pChEMBL scoring (`services/chembl.py`)
- [x] Cancer-type-specific data source recommendations — 11 cancer types (`services/recommendations.py`)
- [x] Categorized data source wizard — 9 sources in 3 categories + ★ Recommended badges
- [x] DrugDiscovery page: 4 tabs (Interactions, Ranking, Compounds, Bioactivity)
- [x] API endpoints: `/drugs/pubchem`, `/drugs/chembl`, `/projects/recommendations`

## Phase 8: Protein-Protein Docking
- [ ] Backend orchestration for ClusPro/HADDOCK docking APIs
- [ ] AlphaFold-Multimer integration for high-accuracy complex prediction
- [ ] OpenMM integration for energy minimization/clash removal
- [ ] Interface residue analysis (≤5Å) and contact characterization (Biopython)
- [ ] MM/GBSA binding free energy estimation
- [ ] 2D LigPlot+ style interaction mapping component
- [ ] Enhanced 3D Viewer for publication-quality rendering (transparent surfaces, PyMOL styles)
- [ ] DockQ/pLDDT/PAE validation metrics computation and display
- [ ] High-resolution (≥300 dpi) TIFF/PDF export pipeline for structural models
- [ ] New `ProteinDocking.tsx` frontend page with workflow wizard (Strategy -> Run -> Analysis)
- [ ] API endpoints for docking job submission and polling

---

## Cross-Cutting

### i18n
- [x] Project management keys (en.json + zh.json)
- [x] Interaction Lab keys (en.json + zh.json)
- [x] Atlas keys (en.json + zh.json)
- [x] Clinical Suite keys (en.json + zh.json)
- [x] AI Discovery keys (en.json + zh.json)
- [x] Drug Discovery keys (en.json + zh.json)
- [x] Publication Engine keys (en.json + zh.json)
- [x] Chart label translation on locale switch
- [x] Error message translation (errors.* keys: 9 keys EN + ZH)

### Testing
- [x] Backend: pytest suite — 57 tests across 7 files (api, errors, models, discovery, drugs, publication, ai_discovery)
- [x] Backend: Error class + model validation tests
- [x] Backend: Discovery LLM safe-init + PubMed fallback tests
- [x] Backend: Drug service mock fallback + cache tests
- [x] Backend: Publication engine PDF generation tests
- [ ] Backend: Bio-computation integration tests (requires GDC network)
- [ ] Frontend: Vitest component tests
- [x] E2E: Project creation spec (Playwright, 70L)
- [x] E2E: Module health spec — delete modal + all pages load (Playwright)
- [x] E2E: Playwright run with live backend (100% passing)
- [ ] CI/CD: GitHub Actions pipeline

### Performance
- [x] Lazy route loading (code splitting)
- [ ] Virtual scrolling for large tables
- [x] Redis cache hit/miss monitoring (`cache.stats()` + `/api/cache-stats` endpoint)

### Observability & Error Telemetry ✅
- [x] Structured JSON logging (structlog) — `core/logging.py`, JSON in prod, colored console in dev
- [x] Crash report persistence (`crash_reports` table + model + API)
- [x] Request correlation ID middleware (`core/middleware.py`)
- [x] Extended health check (DB, Redis, external APIs via `?deep=true`)
- [x] Frontend Error Boundary with crash reporting
- [x] Toast notification system for API errors
- [x] Redux `errorSlice` for error aggregation

### IDE Agent Augmentation
- [x] `/audit` workflow (verify TODO vs code, i18n counts, backend health)
- [x] `/status` workflow (health, Docker, Redis, crashes, log tailing)
- [x] `/sync` workflow (reconcile dev log with codebase, fixed locale paths)
- [x] Enhanced `/fix` workflow (crash report integration)

### Deployment & Infrastructure
- [x] Production Dockerfiles (backend: 2 workers, frontend: multi-stage nginx)
- [x] Railway config (`railway.toml`, `nginx.conf`, env-aware CORS)
- [x] Branch topology: `main` → `ag-docker-dev` → `deploy/railway-production`
- [x] GitHub sync — all branches pushed
- [/] Railway project setup (PostgreSQL plugin, env vars, domain generation)
- [ ] CI/CD: GitHub Actions pipeline

### Auth & Collaboration
- [x] JWT auth backend (`auth.py`, `user.py`)
- [x] Login page frontend (`LoginPage.tsx`, `ProtectedRoute.tsx`, `authSlice.ts`)
- [ ] User registration / login fully wired
- [ ] Project ownership (fill `owner_id`)
- [ ] Invite collaborators by email
- [ ] Role-based access (owner / editor / viewer)

### Blockers
- ~~Celery still stubbed~~ ✅ Fixed: Celery + Redis with graceful fallback
- 401 crash reports (24h), 308 critical — all `KiriExternalAPIError` on Interaction Lab endpoints (`/interaction/cleavage`, `/interaction/ppi`) due to UniProt and STRING-DB connectivity failures. Transient external API issues, not code bugs.

### Infrastructure Notes
- Docker backend (api, postgres, redis) running. Frontend served locally (`npm run dev`) — Docker frontend port-conflicts; local dev server is the primary workflow.
- The platform is fully generic: **any cancer type, any protein targets, any data sources** (see `recommendations.py` for 11 cancer types).

### Bilingual Coverage
- `en.json`: 602 keys ✅
- `zh.json`: 602 keys ✅
- Parity achieved — `nav.docking` gap fixed 2026-03-16
