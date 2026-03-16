# Kiri — Project System & Data Sources Design

> **Status:** Proposed — to be implemented after Phase 2 core module is functional.
> **Version:** 0.1 — 2026-03-14

---

## 1. Overview

Kiri currently operates as a single-session tool. This document describes the refactor to introduce a **Project System** — persistent, named research contexts that auto-save and can be snapshotted, shared, and restored.

Each project owns its own data sources, analysis configurations, and results.

---

## 2. Project Lifecycle

```
Create Project → Configure Data Sources → Run Analyses → Auto-Save → Snapshot → Export/Share
```

### Core Features

| Feature | Description |
|---|---|
| **Create Project** | Name, description, target genes, cancer type |
| **Open Project** | Dashboard listing all projects with last-modified, gene targets, data source count |
| **Auto-Save** | Every state change (filter toggle, gene add, analysis run) persists to backend |
| **Snapshots** | Named point-in-time saves ("before adding GSE33113", "for paper draft v2") |
| **Duplicate** | Clone a project with all its data sources and config |
| **Delete** | Soft-delete with 30-day recovery |

### Data Model

```
Project
├── id (UUID)
├── name
├── description
├── target_genes: string[]
├── cancer_type: string
├── created_at / updated_at
├── snapshots: Snapshot[]
└── data_sources: ProjectDataSource[]

ProjectDataSource
├── id (UUID)
├── project_id (FK)
├── source_type: "tcga" | "geo" | "cptac" | "scrna" | "custom_upload" | "custom_api"
├── config: JSON  (accession IDs, API params, file metadata)
├── status: "pending" | "loaded" | "error"
├── sample_count: int
├── last_fetched_at: datetime
└── cached_data_key: string  (reference to cached expression matrix)

Snapshot
├── id (UUID)
├── project_id (FK)
├── name
├── created_at
└── state_json: JSON  (full serialized project state)
```

---

## 3. Data Sources Page

A dedicated page/panel where the user manages all data sources for the active project.

### Layout

```
┌─────────────────────────────────────────────────────┐
│  📦 Data Sources for "My Research Project"          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ TCGA-COAD ✅ │  │ GSE39582  ✅ │  │ + Add    │  │
│  │ 521 samples  │  │ 585 samples  │  │  Source  │  │
│  │ RNA-seq      │  │ Microarray   │  │          │  │
│  └──────────────┘  └──────────────┘  └──────────┘  │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │ My qPCR  ⏳  │  │ CPTAC     🔒│                 │
│  │ Uploading... │  │ Coming soon  │                 │
│  └──────────────┘  └──────────────┘                 │
│                                                     │
├─────────────────────────────────────────────────────┤
│  Add Data Source:                                   │
│  [ Public Database ▾ ]  [ Custom Upload ]  [ API ]  │
└─────────────────────────────────────────────────────┘
```

### "Add Data Source" Wizard

1. **Public Database:** Dropdown of supported sources (TCGA, GEO, CPTAC, scRNA atlases). User enters accession/project ID → backend fetches + validates + caches.
2. **Custom Upload:** Drag-and-drop CSV/TSV. Backend validates columns, data types, gene symbols.
3. **Custom API:** Advanced — user provides an API endpoint URL + auth + field mapping. Backend fetches on demand.

### Per-Source Actions

- **Refresh** — Re-fetch from upstream API (clears cache)
- **Configure** — Edit filters (stages, sample types), normalization
- **Remove** — Detach from project (data stays in cache for reuse)
- **Inspect** — View raw sample metadata table

---

## 4. Backend API Additions

```
/api/v1/projects                    GET    — List projects
/api/v1/projects                    POST   — Create project
/api/v1/projects/{id}               GET    — Get project with data sources
/api/v1/projects/{id}               PATCH  — Update project (auto-save)
/api/v1/projects/{id}               DELETE — Soft-delete

/api/v1/projects/{id}/sources       GET    — List data sources
/api/v1/projects/{id}/sources       POST   — Add data source
/api/v1/projects/{id}/sources/{sid} DELETE — Remove data source
/api/v1/projects/{id}/sources/{sid}/refresh POST — Re-fetch

/api/v1/projects/{id}/snapshots     GET    — List snapshots
/api/v1/projects/{id}/snapshots     POST   — Create snapshot
/api/v1/projects/{id}/snapshots/{snap_id}/restore POST — Restore
```

---

## 5. Frontend State Changes

- **New Redux slice:** `projectSlice` — active project, data sources, dirty/saved state
- **New route:** `/projects` — project dashboard
- **New route:** `/projects/:id/sources` — data sources manager
- **Auto-save middleware:** Redux middleware that debounces state changes → PATCH to backend
- **Project switcher:** Sidebar header becomes project selector dropdown

---

## 6. Migration Strategy

Phase 2 is being built **without** the project system. When this refactor is implemented:

1. Add `projects` and `project_data_sources` tables to PostgreSQL
2. Wrap existing Atlas endpoints to accept `project_id` parameter
3. Create a "Default Project" migration for any existing session state
4. The Atlas page becomes a view *within* a project context
5. Data source badges on charts link to the data sources page

> No breaking changes to existing module APIs — the project layer wraps around them.

---

## 7. Future: Collaboration

Not in scope for initial implementation, but the project model supports:
- Sharing projects via link (read-only or collaborator)
- Export project as reproducible JSON bundle
- Version diff between snapshots
