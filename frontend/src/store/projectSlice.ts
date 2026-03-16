import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { apiClient } from "../services/api";
import { patchUiState as apiPatchUiState } from "../services/api";
import type { SnapshotSummary } from "../services/api";
import { hydrateSource } from "./dataSourceSlice";

/* ── Types ── */

export interface ProjectProtein {
  id: string;
  gene_symbol: string;
  uniprot_id: string;
  protein_name: string;
  organism: string;
  function_summary: string;
  sequence_length: number;
}

export interface ProjectDataSource {
  id: string;
  source_type: string;
  label: string;
  config: Record<string, unknown>;
  status: string;
  sample_count: number;
  added_at?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  cancer_type: string;
  created_at: string | null;
  updated_at: string | null;
  proteins: ProjectProtein[];
  data_sources: ProjectDataSource[];
  protein_count: number;
  source_count: number;
  ui_state?: Record<string, unknown>;
}

interface ProjectState {
  projects: Project[];
  activeProject: Project | null;
  suggestions: { gene_symbol: string; co_occurrence_count: number }[];
  snapshots: SnapshotSummary[];
  isLoading: boolean;
  isCreating: boolean;
  isLoadingSnapshots: boolean;
  error: string | null;
}

const initialState: ProjectState = {
  projects: [],
  activeProject: null,
  suggestions: [],
  snapshots: [],
  isLoading: false,
  isCreating: false,
  isLoadingSnapshots: false,
  error: null,
};

/* ── Async Thunks ── */

export const fetchProjects = createAsyncThunk(
  "project/fetchAll",
  async () => {
    const resp = await apiClient.get("/v1/projects");
    return resp.data.data;
  }
);

export const createProject = createAsyncThunk(
  "project/create",
  async (payload: { name: string; description?: string; cancer_type?: string }) => {
    const resp = await apiClient.post("/v1/projects", payload);
    return resp.data.data;
  }
);

export const fetchProject = createAsyncThunk(
  "project/fetchOne",
  async (id: string) => {
    const resp = await apiClient.get(`/v1/projects/${id}`);
    return resp.data.data;
  }
);

export const addProtein = createAsyncThunk(
  "project/addProtein",
  async ({ projectId, gene_symbol }: { projectId: string; gene_symbol: string }) => {
    const resp = await apiClient.post(`/v1/projects/${projectId}/proteins`, { gene_symbol });
    return resp.data.data;
  }
);

export const removeProtein = createAsyncThunk(
  "project/removeProtein",
  async ({ projectId, proteinId }: { projectId: string; proteinId: string }) => {
    await apiClient.delete(`/v1/projects/${projectId}/proteins/${proteinId}`);
    return proteinId;
  }
);

export const addDataSource = createAsyncThunk(
  "project/addDataSource",
  async ({
    projectId,
    source_type,
    label,
    config,
  }: {
    projectId: string;
    source_type: string;
    label?: string;
    config?: Record<string, unknown>;
  }) => {
    const resp = await apiClient.post(`/v1/projects/${projectId}/sources`, {
      source_type,
      label,
      config,
    });
    return resp.data.data;
  }
);

export const fetchSuggestions = createAsyncThunk(
  "project/fetchSuggestions",
  async (projectId: string) => {
    const resp = await apiClient.get(`/v1/projects/${projectId}/proteins/suggest`);
    return resp.data.data;
  }
);

export const removeDataSource = createAsyncThunk(
  "project/removeDataSource",
  async ({ projectId, sourceId }: { projectId: string; sourceId: string }) => {
    await apiClient.delete(`/v1/projects/${projectId}/sources/${sourceId}`);
    return sourceId;
  }
);

export const deleteProject = createAsyncThunk(
  "project/delete",
  async (id: string) => {
    await apiClient.delete(`/v1/projects/${id}`);
    return id;
  }
);

/* ── Snapshot Thunks ── */

export const listSnapshotsThunk = createAsyncThunk(
  "project/listSnapshots",
  async (projectId: string) => {
    const resp = await apiClient.get(`/v1/projects/${projectId}/snapshots`);
    return resp.data.data as SnapshotSummary[];
  }
);

export const createSnapshotThunk = createAsyncThunk(
  "project/createSnapshot",
  async ({ projectId, name, description }: { projectId: string; name: string; description: string }) => {
    const resp = await apiClient.post(`/v1/projects/${projectId}/snapshots`, { name, description });
    return resp.data.data as SnapshotSummary;
  }
);

export const restoreSnapshotThunk = createAsyncThunk(
  "project/restoreSnapshot",
  async ({ projectId, snapshotId }: { projectId: string; snapshotId: string }, { dispatch }) => {
    await apiClient.post(`/v1/projects/${projectId}/snapshots/${snapshotId}/restore`, {});
    // Re-fetch project to get updated state
    dispatch(fetchProject(projectId));
    // Re-fetch snapshots list
    dispatch(listSnapshotsThunk(projectId));
    return snapshotId;
  }
);

/* ── Slice ── */

export const patchProjectUiState = createAsyncThunk(
  "project/patchUiState",
  async ({ projectId, uiStateUpdates }: { projectId: string; uiStateUpdates: Record<string, unknown> }) => {
    await apiPatchUiState(projectId, uiStateUpdates);
    return uiStateUpdates;
  }
);

const projectSlice = createSlice({
  name: "project",
  initialState,
  reducers: {
    setActiveProject(state, action: PayloadAction<Project | null>) {
      state.activeProject = action.payload;
    },
    clearError(state) {
      state.error = null;
    },
    updateUiState: (state, action: PayloadAction<Record<string, unknown>>) => {
      if (state.activeProject) {
        state.activeProject.ui_state = {
          ...state.activeProject.ui_state,
          ...action.payload,
        };
      }
    },
  },
  extraReducers: (builder) => {
    // fetchProjects
    builder
      .addCase(fetchProjects.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.isLoading = false;
        state.projects = action.payload;
      })
      .addCase(fetchProjects.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to load projects";
      });

    // createProject
    builder
      .addCase(createProject.pending, (state) => {
        state.isCreating = true;
      })
      .addCase(createProject.fulfilled, (state, action) => {
        state.isCreating = false;
        state.projects.unshift(action.payload);
        state.activeProject = action.payload;
      })
      .addCase(createProject.rejected, (state, action) => {
        state.isCreating = false;
        state.error = action.error.message || "Failed to create project";
      });

    // fetchProject
    builder
      .addCase(fetchProject.fulfilled, (state, action) => {
        state.activeProject = action.payload;
      });

    // addProtein
    builder
      .addCase(addProtein.fulfilled, (state, action) => {
        if (state.activeProject) {
          state.activeProject.proteins.push(action.payload);
          state.activeProject.protein_count = state.activeProject.proteins.length;
        }
      });

    // removeProtein
    builder
      .addCase(removeProtein.fulfilled, (state, action) => {
        if (state.activeProject) {
          state.activeProject.proteins = state.activeProject.proteins.filter(
            (p) => p.id !== action.payload
          );
          state.activeProject.protein_count = state.activeProject.proteins.length;
        }
      });

    // addDataSource
    builder
      .addCase(addDataSource.fulfilled, (state, action) => {
        if (state.activeProject) {
          state.activeProject.data_sources.push(action.payload);
          state.activeProject.source_count = state.activeProject.data_sources.length;
        }
      });

    // removeDataSource
    builder
      .addCase(removeDataSource.fulfilled, (state, action) => {
        if (state.activeProject) {
          state.activeProject.data_sources = state.activeProject.data_sources.filter(
            (ds) => ds.id !== action.payload
          );
          state.activeProject.source_count = state.activeProject.data_sources.length;
        }
      });

    // fetchSuggestions
    builder
      .addCase(fetchSuggestions.fulfilled, (state, action) => {
        state.suggestions = action.payload;
      });

    // deleteProject
    builder
      .addCase(deleteProject.pending, (state) => {
        state.error = null;
      })
      .addCase(deleteProject.fulfilled, (state, action) => {
        state.projects = state.projects.filter((p) => p.id !== action.payload);
        if (state.activeProject?.id === action.payload) {
          state.activeProject = null;
        }
      })
      .addCase(deleteProject.rejected, (state, action) => {
        state.error = action.error.message || "Failed to delete project";
      });

    // listSnapshotsThunk
    builder
      .addCase(listSnapshotsThunk.pending, (state) => {
        state.isLoadingSnapshots = true;
      })
      .addCase(listSnapshotsThunk.fulfilled, (state, action) => {
        state.isLoadingSnapshots = false;
        state.snapshots = action.payload ?? [];
      })
      .addCase(listSnapshotsThunk.rejected, (state) => {
        state.isLoadingSnapshots = false;
      });

    // createSnapshotThunk
    builder
      .addCase(createSnapshotThunk.fulfilled, (state, action) => {
        if (action.payload) {
          state.snapshots.unshift(action.payload);
        }
      });

    // patchProjectUiState
    builder
      .addCase(patchProjectUiState.fulfilled, (state, action) => {
        if (state.activeProject) {
          state.activeProject.ui_state = {
            ...state.activeProject.ui_state,
            ...action.payload,
          };
        }
      });

    // hydrateSource
    builder
      .addCase(hydrateSource.fulfilled, (state, action) => {
        if (state.activeProject) {
          const ds = state.activeProject.data_sources.find(
            (s) => s.id === action.payload.sourceId
          );
          if (ds) {
            ds.status = action.payload.status;
          }
        }
      });
  },
});

export const { setActiveProject, clearError, updateUiState } = projectSlice.actions;
export default projectSlice.reducer;
