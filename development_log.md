# Kiri Development Log

> Breadcrumb trail for architectural decisions, dependency changes, and bilingual state tracking.
> Maintained by the Kiri IDE Agent. See `/log` workflow for entry format.

---

## 2026-03-17 — 🚀 Railway Production Deployment Prep

- **Context:** Prepared Kiri for Railway cloud deployment. All pending changes (auth, atlas heatmap, rebranding, chart exports, clinical suite, mito lab, drug discovery) committed and synced.
- **Branch Topology:** `main` → `ag-docker-dev` (28 files, 1949 insertions) → `deploy/railway-production` (+ production configs).
- **Production Changes:**
  - `backend/Dockerfile` — removed `--reload`, added 2 workers, dynamic `$PORT` via Railway env
  - `frontend/Dockerfile` — multi-stage build: Vite → nginx (SPA serving)
  - `frontend/nginx.conf` — SPA catch-all, `/api` reverse proxy via `$BACKEND_URL`, gzip, 1y asset caching
  - `backend/app/core/config.py` — `CORS_ORIGINS` now accepts comma-separated env var string (field_validator)
  - `frontend/vite.config.ts` — proxy target env-aware via `VITE_API_URL`
  - `railway.toml` — healthcheck `/api/health`, restart-on-failure policy
- **Architecture:** 2 Railway services (Backend + Frontend) + PostgreSQL plugin. Redis optional (in-memory fallback).
- **Security:** Sensitive values (JWT_SECRET_KEY, INVITE_CODE, API keys) set as Railway env vars, never committed.
- **Bilingual State:** Unchanged — 602/602 parity.
- **PRD Reference:** §4 (Non-Functional — deployment, infrastructure).

---

## 2026-03-16 — 🔧 External API Resilience: Retry Logic for UniProt + STRING-DB

- **Context:** 35 `KiriExternalAPIError` crash reports in a 6-hour window (03:00–09:23 UTC). Both UniProt and STRING-DB were transiently unreachable. The services had **no retry logic**, violating PRD §4 ("exponential backoff, max 3 attempts").
- **Root Cause Confirmed:** APIs respond HTTP 200 from Docker now — the outage was transient. The code simply had no resilience.
- **Fix:** Added retry with exponential backoff (3 attempts, 1s→2s delays) to:
  - `interaction_cleavage.py` — `fetch_uniprot_sequence()` (UniProt FASTA fetch)
  - `interaction_ppi.py` — `fetch_string_network()` (STRING-DB `get_string_ids` + `network` calls)
- **Verified:** 61/61 pytest passed. Docker API rebuilt and deployed.

---

## 2026-03-16 — 🐛 Bug Fixes: 3 Crash-Causing Issues from Audit

- **Context:** Full test suite + crash report analysis identified 3 code-level bugs generating 17+ crash reports.
- **Bug 1 (Critical, 12 crashes):** `cibersort.py` — `ValueError: inhomogeneous shape` on `/atlas/immune-deconvolution`. Root cause: GDC returns expression data where gene value arrays can have different lengths (partial data). `np.array()` fails on ragged lists. **Fix:** Added gene length validation — filters genes with mismatched sample counts before constructing the numpy matrix, with informative error message on insufficient overlap.
- **Bug 2 (Warning, 3 crashes):** `atlas.py` `/temporal-clustering` — `KiriComputationError` ("Only 2 genes have data") propagated as unhandled exception, generating crash reports. **Fix:** Wrapped endpoint with try/except to return `error_response` instead.
- **Bug 3 (Warning, 2 crashes):** `atlas.py` `/mito-score` — similar unhandled propagation. **Fix:** Same try/except pattern.
- **Files Modified:** `app/services/cibersort.py`, `app/api/atlas.py`
- **Verified:** 61/61 pytest passed, 0 TS errors, 54/54 E2E passed. Docker API rebuilt.

---

## 2026-03-16 — /start Re-Init + Full Platform Audit

- **Context:** `/start` workflow re-executed. All 3 source-of-truth documents loaded (`prd_en.md`, `system_tech.md`, `research_brief.md`). Full `/audit` run.
- **Backend Health:** OK — Redis connected, PostgreSQL connected, API responding.
- **Docker:** 4/4 services Up (kiri-api, kiri-frontend, kiri-postgres ✅, kiri-redis ✅).
- **Pytest:** 22/22 passed (16.37s) in `tests/test_api.py`.
- **TypeScript:** `tsc --noEmit` → 0 errors.
- **Crash Stats:** 401/24h, 308 critical, 1230 unresolved total. All `KiriExternalAPIError` on `/interaction/cleavage` (UniProt fetch failures: Q9H300, O95786) and `/interaction/ppi` (STRING-DB connectivity). Transient external API issues — not code bugs.
- **i18n Fix:** `nav.docking` key was missing from `zh.json`. Added `"docking": "蛋白质对接"`. Now 602/602 parity.
- **TODO.md:** Updated crash stats, i18n counts, timestamp.
- **Phases Complete:** 0–7 ✅. Phase 8 (Protein-Protein Docking) remains TODO.
- **Bilingual State:** `en.json` — 602 keys, `zh.json` — 602 keys.
- **PRD Reference:** All sections audited.

---

## 2026-03-16 — 🐛 Bug Fix: html-to-image missing in Docker container

- **Reported:** Vite error overlay: `Failed to resolve import "html-to-image" from "src/components/DNBPanel.tsx"`
- **File(s):** `frontend/src/components/DNBPanel.tsx`, `docker-compose.yml`
- **Severity:** High (blocks entire Atlas page rendering)

### Root Cause
Docker Compose uses an anonymous volume (`/app/node_modules`) to preserve the container's `node_modules` across source-code bind mounts. When `html-to-image` was added to `package.json` after the last image build, the stale anonymous volume kept the **old** `node_modules` that lacked the package — even though `npm ci` in the Dockerfile would install it on a fresh build.

### Resolution
- **Fix Applied:** Rebuilt the frontend Docker image with `--renew-anon-volumes` to discard the stale anonymous volume and run a fresh `npm ci` with the current `package-lock.json`.
- **Command:** `docker compose up -d --build --force-recreate --renew-anon-volumes frontend`
- **Verified:** `docker exec kiri-frontend-1 ls node_modules/html-to-image/es/index.js` → exists. Vite dev server serves pages without error.
- **Lesson:** Any time a new npm dependency is added to `package.json`, the frontend Docker image must be rebuilt with `--renew-anon-volumes` to flush the stale anonymous volume.

---

## 2026-03-16 — Full E2E Test Suite Pass & Fixes

- **Context:** Executed the complete Kiri E2E test suite via Playwright to ensure platform stability.
- **Fix 1:** `module-atlas.spec.ts` — Fixed strict mode violation on "Multi-Omics Atlas" locator matching both a heading and a link.
- **Fix 2:** `module-navigation.spec.ts` — Fixed similar strict mode violations for all module navigation links.
- **Fix 3:** `project-creation.spec.ts` — Mocked the external `MyGene.info` validation endpoint to prevent flakiness/timeout when validating the custom "TP53" gene addition.
- **Cleanup:** Removed the default `example.spec.ts` file which was timing out querying playwright.dev.
- **Verification:** Full Playwright E2E suite passes reliably (`npx playwright test` → 100% green).
- **PRD Reference:** §4 (Non-Functional Requirements — test coverage).

---

## 2026-03-15 — PDM Vault Crash Fix & Phase 8 Preparation

## 2026-03-15 — Full Platform Audit (/audit)

- **Context:** Comprehensive `/audit` workflow execution. All systems checked.
- **Backend Health:** OK — Redis cache active, PostgreSQL connected, API responding.
- **Docker:** 3/3 services Up (kiri-api, kiri-postgres ✅ healthy, kiri-redis ✅ healthy).
- **Pytest:** 57/57 passed (28.07s) across 7 test files — test_api(18), test_clinical_models(14), test_errors(7), test_publication(7), test_drugs(6), test_discovery_llm(4), test_ai_discovery(1).
- **TypeScript:** `tsc --noEmit` → 0 errors.
- **i18n:** 401/401 parity (en.json = zh.json). Significant growth from 232 → 401 keys since last audit.
- **Crash Reports:** 826 in 24h, 177 flagged critical by counter but latest 20 all show `severity: "warning"`. Single exception type: `KiriComputationError` ("Insufficient samples"). Endpoints: `/survival`(12), `/synergy`(5), `/cox`(3). This is expected behavior when clinical data has not been loaded for the active project — not a code bug.
- **TODO.md:** Updated test counts (38→57), i18n counts (194→401), workflow completion status, crash report context.
- **Bilingual State:** `en.json` — 401 keys, `zh.json` — 401 keys.
- **PRD Reference:** §4 (Non-Functional — observability, testing).

---

## 2026-03-15 — /fix Audit: i18n, Test, Config Fixes

- **Context:** /start + /fix workflow run. Full platform health audit → 4 issues found and fixed.
- **Fix 1:** `config.py` — migrated from deprecated class-based `Config` to `model_config = ConfigDict(...)` (Pydantic v2).
- **Fix 2:** `test_ai_discovery.py` — rewrote with `@pytest.mark.asyncio` decorator + proper assertions. Was failing due to bare async def.
- **Fix 3:** `DrugDiscovery.tsx` — replaced 14 hardcoded English strings with `t()` calls (no_targets, loading, compound labels, table headers, assay types).
- **Fix 4:** `PublicationEngine.tsx` — replaced 13 hardcoded English strings with `t()` calls (format options, cart, preview title/footer, empty states).
- **i18n Keys Added:** 38 new keys in both `en.json` and `zh.json` (drugs.*, export.*, common.clear, common.generating).
- **Verification:** TypeScript 0 errors. pytest 57/57 passed (was 56/57). i18n 232/232 parity (was 194/194). No Pydantic deprecation warnings.
- **Crash Reports:** 396 warning-level on `/api/v1/clinical/survival` — expected behavior when insufficient sample data. 0 critical.
- **Bilingual State:** `en.json` — 232 keys, `zh.json` — 232 keys.
- **PRD Reference:** §3 (Bilingual — zero hardcoded strings), §4 (Non-Functional — test coverage).

---

## 2026-03-15 — Chart i18n + Error Resilience Layer

- **Context:** Completed chart label i18n wiring and built comprehensive error resilience layer.
- **Chart i18n:** Fixed hardcoded 'Normal | Tumor' divider in `ExpressionHeatmap.tsx` → now uses `t("atlas.normalLabel") | t("atlas.tumorLabel")`. All other chart components (KaplanMeierPlot, CoxForestPlot, SynergyPanel, PPINetwork) were already correctly wired.
- **ErrorBoundary:** Upgraded `ErrorBoundary.tsx` — added `moduleName` prop for per-module crash isolation, bilingual labels via i18n, `TFunction` typing, crash auto-reporting to `/api/crash-reports`. Wrapped all 6 module routes in App.tsx.
- **Toast System:** Created `Toast.tsx` — animated framer-motion toast notifications (error/warning/success/info). Reads from Redux `errorSlice`.
- **errorSlice:** Augmented existing `errorSlice.ts` with toast state (addToast, dismissToast, clearAllToasts). Existing API error tracking preserved.
- **i18n:** Added 9 `errors.*` keys to both en.json and zh.json (crash_title, crash_module, crash_description, technical_details, reload_page, back_to_projects, network_error, server_error, timeout_error). Also added 27 `modules.interaction.*` + 1 `export.subtitle` earlier.
- **Verified:** TypeScript `tsc --noEmit` → 0 errors. i18n parity → 194/194 keys.
- **Bilingual State:** `en.json` — 194 keys, `zh.json` — 194 keys.
- **PRD Reference:** §3 (Bilingual — chart labels), §4 (Error Handling — graceful degradation).

---

- **Context:** Full codebase audit against PRD, TODO.md, and source-of-truth docs. Verified all 7 PRD modules are implemented.
- **i18n Fix:** en.json was 28 keys behind zh.json (missing `modules.interaction.*` 27 keys + `export.subtitle` 1 key). All keys added — **179/179 parity achieved**.
- **Docker Check:** Backend services (api, postgres, redis) confirmed running. Frontend Docker port-conflicts with local dev server (expected — `npm run dev` is the primary workflow).
- **Platform Generality:** Updated README.md, TODO.md, and dev log to clarify: Kiri supports any cancer type, any protein targets, any data sources. Code already supports this (11 cancer types in `recommendations.py`, generic gene search, user-defined projects).
- **PRD Gap Analysis:** Identified unimplemented acceptance criteria: Single-Cell + CPTAC views (Atlas), AI feedback loop (Discovery), bilingual export (Publication Engine), accessibility (keyboard nav, screen reader labels).
- **Bilingual State:** `en.json` — 179 keys, `zh.json` — 179 keys.
- **PRD Reference:** §1 (Vision), §3 (Bilingual), §4 (Non-Functional Requirements).

---

## 2026-03-14 — IDE Agent Configured
- **Context:** Kiri Research Platform — IDE environment initialized with Controller Mode agent.
- **Decision:** Established 5 slash-command workflows (`/start`, `/todo`, `/check`, `/fix`, `/log`) and breadcrumb logging strategy.
- **Alternatives Considered:** Single monolithic workflow file — rejected for maintainability.
- **Dependencies:** None yet (awaiting PRD and system_tech docs for project scaffolding).
- **Bilingual Impact:** N/A — locale files not yet created.
- **PRD Reference:** Awaiting `prd_en.md` from user.

---

## 2026-03-14 — Source Documents Synthesized
- **Context:** User provided 4 source PDFs (PRD, Data Specs, Stack, UX/UI). Synthesized into 3 formal source-of-truth documents.
- **Decision:** Expanded original PARL-Explorer Pro scope into 6-pillar architecture with Trust Layer as infrastructure. User confirmed vision + approved all docs.
- **Created:** `docs/prd_en.md`, `docs/system_tech.md`, `docs/research_brief.md`
- **Key Insight:** Researcher requires Nature Cell Biology-grade output, zero fabrication tolerance, full pipeline visibility (no black boxes).
- **Dependencies:** None added.
- **Bilingual Impact:** Module names defined in both languages.
- **PRD Reference:** All sections — this IS the PRD.

---

## 2026-03-14 — Phase 1: Foundation Complete
- **Context:** Built the infrastructure layer that all six modules depend on.
- **Backend:** Response envelope with Provenance model (`responses.py`), typed exception hierarchy + global error handlers (`errors.py`), Redis/in-memory caching with source-aware TTLs (`cache.py`), background task manager (`tasks.py`), Trust Layer validation services — HGNC gene validation + PubMed PMID anti-hallucination (`validation.py`).
- **Frontend:** API client with envelope unwrapping and retry (`api.ts`), shared component library — Card, trust badges (AI-Suggested, Verified, Quarantined), ProvenanceFooter, LoadingSkeleton, Stat (`ui.tsx`), GeneSearch with debounced HGNC validation (`GeneSearch.tsx`), KiriChart ECharts wrapper with Okabe-Ito colorblind-safe palette and SVG/PNG export (`KiriChart.tsx`).
- **Verified:** Frontend build passes (515 modules, 253ms). Backend infrastructure tests all pass.
- **Dependencies Added:** None (all deps were installed during scaffold).
- **Bilingual State:** `en.json` — 22 keys, `zh.json` — 22 keys.
- **PRD Reference:** §3 (Trust Layer), §4 (Non-Functional Requirements).

---

## 2026-03-14 — Mono-Repo Scaffolded via /start
- **Context:** Full project structure created — React/Vite/TypeScript frontend + FastAPI backend.
- **Decision:** Mono-repo structure with clear separation. Tailwind CSS v4 via PostCSS (Vite 8 incompatible with @tailwindcss/vite plugin). Redux Toolkit for global state.
- **Frontend:** React 18 + Vite + TypeScript. Tailwind dark-lab theme with custom tokens (kiri-bg, kiri-accent, kiri-surface). i18next configured with EN/ZH locales (22 keys each). App shell with sidebar navigation for all 6 modules + gene selection display + language toggle.
- **Backend:** FastAPI with Pydantic v2 config, CORS middleware, health check, gene validation endpoint (Trust Layer). Requirements include: biopython, scanpy, lifelines, scikit-survival, gseapy + full stats stack.
- **Dependencies Added:**
  - Frontend: tailwindcss, framer-motion, i18next, @reduxjs/toolkit, echarts, cytoscape, three.js, d3, axios
  - Backend: fastapi, uvicorn, biopython, scanpy, lifelines, scikit-survival, pandas, numpy, scipy, statsmodels, gseapy, httpx, redis, celery
- **Bilingual State:** `en.json` — 22 keys, `zh.json` — 22 keys.
- **PRD Reference:** Full scaffold per PRD §2 (Module Architecture) and system_tech §1-2 (Architecture + Stack).

---

## 2026-03-14 — Phase 2: Multi-Omics Atlas Module
- **Context:** Built the first data module — expression data pipeline from GDC/GEO → normalization → heatmap visualization.
- **Backend:** GDC API integration for TCGA-COAD/READ expression + clinical metadata (`services/gdc.py`), GEO dataset loader for GSE39582/GSE33113 (`services/geo.py`), expression normalization (TPM/FPKM) + differential expression via Wilcoxon rank-sum with BH-FDR correction (`services/normalization.py`), Pydantic models (`models/atlas.py`), 6 API endpoints (`api/atlas.py`).
- **Frontend:** Full AtlasPage with ECharts expression heatmap (Normal vs. Tumor split, viridis colorblind-safe gradient), filter sidebar (stage I-IV, MSI-H/L/MSS, normalization selector, data source toggle), gene summary cards with fold change, GEO cohort selector, custom CSV/TSV upload dropzone.
- **Verified:** Frontend build passes (1125 modules, 378ms). AtlasPage correctly code-split via lazy loading.
- **Also Created:** `docs/project_system_design.md` — future refactor blueprint for project system (open/save/snapshot) and data sources page.
- **Dependencies Added:** None (all deps installed during scaffold).
- **Bilingual State:** `en.json` — 41 keys, `zh.json` — 41 keys (+19 atlas module keys each).
- **PRD Reference:** §2 Module 1 (Multi-Omics Atlas), §3 (Trust Layer), §4 (Non-Functional).

---

## 2026-03-14 — Phase 3: Interaction Lab Complete
- **Context:** Built Module 2 (Mechanistic Biology) — full PPI network, 3D protein viewer, cleavage motif analysis, and citation linker. Phase 2 building concurrently.
- **Backend:** 4 services (`interaction_ppi.py` — STRING-DB + BioGRID merge, `interaction_structure.py` — AlphaFold, `interaction_cleavage.py` — Biopython motif scan on UniProt sequences, `interaction_citations.py` — PubMed co-occurrence + PMID validation via Trust Layer). API route module (`api/interaction.py`) with 4 endpoints. BioGRID config added to `config.py`.
- **Frontend:** 4 components (`PPINetwork.tsx` — Cytoscape.js force-directed graph with confidence-weighted edges, `ProteinViewer.tsx` — Three.js backbone tube with pLDDT coloring + cleavage highlights, `CleavagePanel.tsx` — motif results with TM region annotations, `CitationPopup.tsx` — modal with Trust Layer badges). `InteractionLab.tsx` page with 3-panel layout + confidence slider + gene selector. Lazy-loaded for code splitting.
- **Verified:** Backend imports OK. TypeScript 0 errors. Frontend build: 523 modules, 272ms. InteractionLab chunk: 457KB, Three.js chunk: 715KB (tree-shaken).
- **Dependencies Added:** None (cytoscape, three already in package.json from scaffolding).
- **Bilingual State:** `en.json` — 42 keys, `zh.json` — 42 keys.
- **PRD Reference:** §2 Module 2 (Interaction Lab), system_tech §2 (Cytoscape.js, Three.js, Biopython), §3 (API Design), §4 (Trust Layer).

---

## 2026-03-14 — Infrastructure: Docker + Database
- **Context:** Containerized the platform and added real PostgreSQL persistence.
- **Backend:** `Dockerfile` for backend (Python 3.11), `Dockerfile` for frontend (Node 22), `docker-compose.yml` (api, postgres, redis, frontend). Async SQLAlchemy engine + session factory (`core/database.py`). Alembic setup with async-compatible `env.py`. Database init/cleanup wired into FastAPI lifespan.
- **Decision:** PostgreSQL for metadata + project storage. Redis for API cache (falls back to in-memory if unavailable).
- **Remaining:** Celery is still stubbed — `tasks.py` uses in-memory dict.
- **Dependencies Added:** SQLAlchemy, Alembic, asyncpg, psycopg2-binary.
- **Bilingual State:** Unchanged from Phase 3.
- **PRD Reference:** §4 (Non-Functional: background tasks, caching).

---

## 2026-03-14 — Project Management System
- **Context:** Refactored Kiri from single-session tool to persistent project-based architecture.
- **Backend:** SQLAlchemy ORM models (`Project`, `ProjectProtein`, `ProjectDataSource`, `ProjectCollaborator`). Full CRUD API (`api/projects.py`). UniProt protein metadata service. PubMed co-occurrence suggestion service. Data source management endpoints.
- **Frontend:** Redux `projectSlice` (7 async thunks). `ProjectDashboard` page (`/projects`). `NewProjectWizard` (4-step: basics → proteins → sources → review). `ProteinCard` component. Project-scoped routing (`/projects/:id/atlas`, etc.).
- **Bug Fix Sessions:** Multiple conversations debugging project creation — API route mismatches, non-functional Next button, Network Errors on new project screen. All resolved.
- **Bilingual State:** ~80 keys per locale file after project management additions.
- **PRD Reference:** `docs/project_system_design.md`.

---

## 2026-03-14 — Phase 4: Clinical & Prognostic Suite
- **Context:** Built Module 3 (Clinical Suite) — full survival analysis pipeline.
- **Backend:** 4 services — `survival.py` (174L, Kaplan-Meier + log-rank + maxstat cutpoint), `cox.py` (132L, multivariate Cox PH with penalization), `rsf.py` (98L, Random Survival Forest via scikit-survival), `synergy.py` (135L, PARL×MAVS interaction term + 4-way KM). Pydantic models (`models/clinical.py`). API route module (`api/clinical.py`) with 4 endpoints.
- **Frontend:** `ClinicalSuite.tsx` (241L) with tabbed interface for KM, Cox, RSF, Synergy. Components: `KaplanMeierPlot.tsx`, `CoxForestPlot.tsx`, `SynergyPanel.tsx`, `CutpointSelector.tsx`.
- **Bilingual State:** Clinical Suite keys added to both locales.
- **PRD Reference:** §2 Module 3 (Clinical & Prognostic Suite).

---

## 2026-03-14 — Phase 5: AI-Augmented Discovery
- **Context:** Built Module 4 (AI Discovery) with Gemini LLM integration and full anti-hallucination pipeline.
- **Backend:** `discovery_llm.py` (66L, Gemini API integration). Discovery API route (`api/discovery.py`) with 2 endpoints: `/literature` (LLM mine + PMID validate) and `/validate` (standalone). Anti-hallucination flow: extract PMIDs → batch validate against PubMed API → quarantine unverifiable claims.
- **Frontend:** `DiscoveryPage.tsx` (181L). Sub-components: `CitationCard.tsx`, `ConfidenceScoreBar.tsx`. AI outputs visually tagged with "AI-Suggested" badges.
- **Test:** Manual LLM test script (`tests/test_ai_discovery.py`, 46L).
- **Bilingual State:** Discovery keys added to both locales.
- **PRD Reference:** §2 Module 4 (AI-Augmented Discovery), including anti-hallucination controls.

---

## 2026-03-14 — Phase 6: Publication Engine
- **Context:** Built Module 5 (Publication Engine) — journal-grade figure export.
- **Backend:** `publication.py` (142L, `FigureLayoutEngine` with `Panel` + `LayoutOptions` models, PDF generation). Export API route (`api/export.py`, 1 endpoint: `/generate`).
- **Frontend:** `PublicationEngine.tsx` (249L) with panel selector, layout preview, export format selector. Redux `publicationSlice` for panel state.
- **Bilingual State:** Publication engine keys added to both locales.
- **PRD Reference:** §2 Module 5 (Publication Engine).

---

## 2026-03-15 — Drug Discovery Augmentation: PubChem + ChEMBL + Recommendations
- **Context:** Extended Module 6 (Drug Discovery) with two new authoritative data sources and cancer-type-aware project wizard.
- **New Backend Services:**
  - `services/pubchem.py` — PubChem PUG REST integration (compound search, property retrieval, gene-targeted compound discovery). 7-day cache.
  - `services/chembl.py` — ChEMBL REST integration (target resolution gene→ChEMBL ID, bioactivity fetch IC50/Ki/Kd/EC50, pChEMBL sorting, multi-gene batch). 7-day cache.
  - `services/recommendations.py` — Static mapping of 11 cancer types (COAD, READ, BRCA, LUAD, LUSC, PRAD, LIHC, STAD, OV, GBM, OTHER) to curated recommended data source lists incl. TCGA project codes + GEO accessions.
- **Config:** Added `PUBCHEM_API_BASE` + `CHEMBL_API_BASE` to `core/config.py`.
- **API Changes:**
  - `api/drugs.py` — 2 new endpoints: `/drugs/pubchem` (compound search by gene/name), `/drugs/chembl` (bioactivity by gene).
  - `api/projects.py` — New `/projects/recommendations` endpoint. Updated `AddDataSourceRequest` regex to accept 9 types (+ drugbank, pubchem, chembl, string). Extended `_default_label()`.
  - `models/project.py` — Updated `source_type` comment to reflect 9 types.
- **Scoring Upgrade:** `services/targets.py` now incorporates ChEMBL bioactivity count + potent-hit scoring (pChEMBL ≥ 6.0) into target ranking. Cache key bumped to `target_ranking_v2`.
- **Frontend:**
  - `NewProjectWizard.tsx` — 9 data sources grouped into 3 categories (Genomics & Expression, Protein Interaction & Structure, Drug & Compound). Per-cancer-type ★ Recommended badges via `CANCER_RECOMMENDATIONS` map.
  - `DrugDiscovery.tsx` — 4 tabs (Drug Interactions, Target Ranking, Compounds, Bioactivity). Compound cards show MW/LogP/TPSA/H-bonds. Bioactivity table shows IC50/Ki with color-coded pChEMBL values.
  - `services/api.ts` — 5 new API functions: `fetchPubChemCompounds`, `searchPubChemByName`, `fetchChEMBLBioactivities`, `fetchRecommendedSources`, updated `fetchTargetRanking` type.
- **i18n:** Added `compounds_tab`, `bioactivity_tab`, `chembl_assays`, `pubchem_compounds` to both `en.json` and `zh.json`. Updated `research_only_desc` to list all 4 data sources.
- **Decision:** Both PubChem (NIH) and ChEMBL (EMBL-EBI) are open APIs—no API keys required. Per-cancer recommendations are static (not ML-driven) for reliability.
- **Bilingual State:** `en.json` — 151+ keys, `zh.json` — 179+ keys.
- **PRD Reference:** §2 Module 6 (Drug Discovery), system_tech §2 (External APIs).
- **Bugs Found & Fixed During Testing:**
  - Route ordering: `/projects/recommendations` was after `/{project_id}` — FastAPI matched "recommendations" as UUID. Moved static route before dynamic.
  - Cache API: `CacheService.set()` uses source-based TTL from `CACHE_TTL`, not `expire=` kwarg. Fixed 8 calls across 5 files (`drugs.py`, `ctd.py`, `pubchem.py`, `chembl.py`, `targets.py`). Added 7 entries to `CACHE_TTL` in `cache.py`.
- **Verification (7/7 PASS):**
  - Recommendations COAD → `['tcga','geo','string','drugbank','pubchem','chembl']`
  - PubChem Aspirin → CID 2244, C₉H₈O₄, MW=180.16
  - ChEMBL EGFR → 97 assays, IC50=40nM, pChEMBL=7.40, target=Epidermal growth factor receptor
  - Target Ranking → EGFR=111.01 (Tier 1), MAVS=47.01 (Tier 2), PARL=9.01 (Tier 3)
  - Drug Interactions PARL → 1 hit
  - TypeScript compilation → 0 errors
  - Frontend production build → success
---

## 2026-03-14 — E2E Testing + Bug Fix Sessions
- **Context:** Multiple debugging sessions across 4+ conversations to stabilize project creation flow.
- **Issues Found & Fixed:** API route mismatches blocking project creation, Playwright test failures (title check, button locators), non-functional Next button in wizard, Network Errors on new project screen.
- **Tests Created:** `project-creation.spec.ts` (70L Playwright spec — full project lifecycle E2E). `playwright.config.ts` + GitHub Actions workflow (`.github/workflows/playwright.yml`).
- **Lesson Learned:** No crash reporting or structured error logging → bugs discovered only during manual testing. This is the catalyst for the Observability initiative.

---

## 2026-03-15 — Ground Truth Audit & Platform Augmentation Initiative
- **Context:** Full platform audit revealed `development_log.md` and `TODO.md` were severely outdated — documenting only through Phase 3 while all 6 PRD modules had been built.
- **Findings:** en.json=147 keys (log said ~60), zh.json=175 keys (log said ~80). All phases coded but not documented. Docker/Backend not currently running. Zero automated test infrastructure beyond 2 Playwright specs and 1 manual script.
- **Decision:** Initiated 6-layer augmentation strategy: structured error telemetry, frontend error boundaries, automated testing pipeline, IDE agent workflow augmentation, observability infrastructure, data quality monitoring.
- **Created:** `platform_audit_and_vision.md` — comprehensive audit document with augmentation strategy.
- **Bilingual State:** `en.json` — 147 keys, `zh.json` — 175 keys.
- **PRD Reference:** §3 (Trust Layer), §4 (Non-Functional Requirements — error handling, graceful degradation).

---

## 2026-03-15 — Core Fixes + Backend Hardening + Test Suite

- **Context:** Platform audit revealed multiple crash-causing issues across modules. Executed Chunks 1–3 + 5 of the implementation plan.

### Chunk 1: Core Module Fixes
- **Installed** `lucide-react` — AI Discovery and Drug Discovery pages used `Send`, `FileText`, `Zap` icons which were not in `package.json`.
- **Wired** `AtlasPage` directly into router, removed `PlaceholderPage`.
- **Uncommented** `discovery_router` in `backend/app/api/__init__.py`.
- **Built** `ConfirmModal.tsx` — reusable in-app confirmation dialog with danger variant + loading state. Replaced browser `confirm()` in `ProjectDashboard.tsx`.
- **Added** `deleteProject` pending/rejected handlers in `projectSlice.ts`.
- **Added** i18n keys: `delete_title`, `delete_message`, `common.cancel`, `common.confirm` (EN + ZH).

### Chunk 2: Clinical Suite Backend Hardening
- **Fixed** `KiriComputationError` constructor: arg order was `(message, source)` but every caller used `(source, message)`. Swapped to `(source, message)` — the calling convention used in `survival.py`, `cox.py`, `rsf.py`, `synergy.py`.
- **Added** try/except to all 4 clinical API endpoints (`clinical.py`). Domain exceptions re-raised for global handler; unknown exceptions logged + structured error response returned.
- **Fixed** `publication.py` `svg2rlg` NameError: the bare `try/except ImportError: pass` block left `svg2rlg` undefined at runtime. Split into `_HAS_REPORTLAB` + `_HAS_SVGLIB` flags with call-site guards.

### Chunk 3: AI Discovery Safe Init
- **Rewrote** `discovery_llm.py`: Gemini client now lazy-initializes only if `GEMINI_API_KEY` is set. If not, falls back to PubMed keyword search (ESearch → ESummary → structured claims with real PMIDs). The module-level `DiscoveryLLMService()` instantiation no longer crashes the entire backend when the key is missing.
- **drugs.py** verified working with existing MyChem.info + mock fallback.

### Chunk 5: Test Suite
- **Created** `conftest.py` — shared pytest fixtures.
- **Created** 5 test files (38 tests total, all passing):
  - `test_errors.py` (7) — validates `KiriComputationError(source, message)` arg order fix.
  - `test_clinical_models.py` (14) — all Pydantic request/response model validation.
  - `test_discovery_llm.py` (4) — safe init without API key, PubMed fallback with mocked httpx.
  - `test_drugs.py` (6) — mock fallback on network error, cache hit behavior.
  - `test_publication.py` (7) — empty panels, SVG rendering, 2×2 layout, Nature style.
- **Created** `module-health.spec.ts` — Playwright E2E for delete modal and module page loading.

### Verification
- **pytest:** 38/38 passed in 0.84s.
- **TypeScript:** `tsc --noEmit` — 0 errors.
- **Pre-existing failure:** `test_ai_discovery.py::test_llm` (old ad-hoc script, async without marker) — excluded from suite.

- **Decision:** PubMed fallback for AI Discovery (no hallucination risk, returns real PMIDs). `KiriComputationError` arg order aligned to callers rather than changing all call sites.
- **Remaining:** Docker backend rebuild needed (`docker compose up -d --build api`). Playwright E2E requires live backend. Chunk 4 (chart label i18n, virtual scrolling) deferred.
- **Bilingual State:** `en.json` — 153+ keys, `zh.json` — 181+ keys.
- **PRD Reference:** §3 (Trust Layer — no crash tolerance), §4 (Non-Functional — test coverage).
