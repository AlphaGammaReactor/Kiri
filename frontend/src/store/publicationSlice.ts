import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { fetchPublicationState, savePublicationState as savePublicationStateApi } from '../services/api';
import type { PersistedPublicationState } from '../services/api';

export interface ExportPanel {
  id: string; // unique
  sourceModule: 'atlas' | 'interaction' | 'clinical' | 'discovery';
  type: 'svg' | 'png';
  data: string; // the raw SVG string or base64 PNG
  title: string;
  legend: string;
  /** Data source provenance, e.g. "TCGA-COAD (GDC)" */
  dataSource?: string;
  /** Analysis method citation, e.g. "Kaplan-Meier, Lifelines v0.29" */
  citation?: string;
  /** User-editable title override (used in preview canvas) */
  customTitle?: string;
  /** Grid column span (1 = default single cell, 2 = span two columns) */
  spanCols?: number;
  /** Grid row span (1 = default single row, 2 = span two rows) */
  spanRows?: number;
}

export interface PublicationOptions {
  layout: '1x1' | '1x2' | '2x1' | '2x2' | '2x3' | '3x2';
  palette: 'default' | 'colorblind' | 'monochrome';
  language: 'en' | 'zh';
  style: 'nature' | 'cell' | 'science' | 'pnas';
  format: 'pdf' | 'svg';
}

interface PublicationState {
  panels: ExportPanel[];
  options: PublicationOptions;
  isExporting: boolean;
  exportError: string | null;
  isLoading: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
}

const initialState: PublicationState = {
  panels: [],
  options: {
    layout: '2x2',
    palette: 'colorblind',
    language: 'en',
    style: 'nature',
    format: 'pdf',
  },
  isExporting: false,
  exportError: null,
  isLoading: false,
  isSaving: false,
  lastSavedAt: null,
};

/* ── Async Thunks ── */

export const loadPublicationState = createAsyncThunk(
  'publication/load',
  async (projectId: string) => {
    const resp = await fetchPublicationState(projectId);
    return resp.data as PersistedPublicationState;
  }
);

export const persistPublicationState = createAsyncThunk(
  'publication/save',
  async ({ projectId, panels, options }: { projectId: string; panels: ExportPanel[]; options: PublicationOptions }) => {
    const resp = await savePublicationStateApi(projectId, { panels, options });
    return resp.data;
  }
);

const publicationSlice = createSlice({
  name: 'publication',
  initialState,
  reducers: {
    addPanel(state, action: PayloadAction<Omit<ExportPanel, 'id'>>) {
      const id = `${action.payload.sourceModule}_${Date.now()}`;
      state.panels.push({ ...action.payload, id });
    },
    removePanel(state, action: PayloadAction<string>) {
      state.panels = state.panels.filter(p => p.id !== action.payload);
    },
    clearPanels(state) {
      state.panels = [];
    },
    movePanelUp(state, action: PayloadAction<string>) {
      const idx = state.panels.findIndex(p => p.id === action.payload);
      if (idx > 0) {
        [state.panels[idx - 1], state.panels[idx]] = [state.panels[idx], state.panels[idx - 1]];
      }
    },
    movePanelDown(state, action: PayloadAction<string>) {
      const idx = state.panels.findIndex(p => p.id === action.payload);
      if (idx >= 0 && idx < state.panels.length - 1) {
        [state.panels[idx], state.panels[idx + 1]] = [state.panels[idx + 1], state.panels[idx]];
      }
    },
    /** Drag-and-drop reorder: move panel from startIndex to endIndex */
    reorderPanels(state, action: PayloadAction<{ startIndex: number; endIndex: number }>) {
      const { startIndex, endIndex } = action.payload;
      if (startIndex < 0 || endIndex < 0 || startIndex >= state.panels.length || endIndex >= state.panels.length) return;
      const [moved] = state.panels.splice(startIndex, 1);
      state.panels.splice(endIndex, 0, moved);
    },
    /** Update per-panel metadata (customTitle, spanCols, spanRows) */
    updatePanelMeta(state, action: PayloadAction<{ id: string; changes: Partial<Pick<ExportPanel, 'customTitle' | 'spanCols' | 'spanRows'>> }>) {
      const panel = state.panels.find(p => p.id === action.payload.id);
      if (panel) {
        Object.assign(panel, action.payload.changes);
      }
    },
    setOptions(state, action: PayloadAction<Partial<PublicationOptions>>) {
      state.options = { ...state.options, ...action.payload };
    },
    setExporting(state, action: PayloadAction<boolean>) {
      state.isExporting = action.payload;
    },
    setExportError(state, action: PayloadAction<string | null>) {
      state.exportError = action.payload;
    },
    /** Rehydrate publication state from localStorage (fast pre-load before backend fetch) */
    rehydratePublication(state, action: PayloadAction<{ panels?: unknown[]; options?: Record<string, unknown> }>) {
      // Only rehydrate if we have no panels yet (avoid overwriting fresh backend data)
      if (action.payload.panels && action.payload.panels.length > 0 && state.panels.length === 0) {
        state.panels = action.payload.panels as ExportPanel[];
      }
      if (action.payload.options && Object.keys(action.payload.options).length > 0) {
        state.options = { ...state.options, ...action.payload.options } as PublicationOptions;
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadPublicationState.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(loadPublicationState.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload) {
          const loaded = action.payload;
          if (loaded.panels && loaded.panels.length > 0) {
            state.panels = loaded.panels as ExportPanel[];
          }
          if (loaded.options && Object.keys(loaded.options).length > 0) {
            state.options = { ...state.options, ...loaded.options } as PublicationOptions;
          }
        }
      })
      .addCase(loadPublicationState.rejected, (state) => {
        state.isLoading = false;
        // Silently fail — just keep current state
      })
      .addCase(persistPublicationState.pending, (state) => {
        state.isSaving = true;
      })
      .addCase(persistPublicationState.fulfilled, (state) => {
        state.isSaving = false;
        state.lastSavedAt = new Date().toISOString();
      })
      .addCase(persistPublicationState.rejected, (state) => {
        state.isSaving = false;
      });
  }
});

export const {
  addPanel, removePanel, clearPanels,
  movePanelUp, movePanelDown, reorderPanels,
  updatePanelMeta,
  setOptions, setExporting, setExportError,
  rehydratePublication,
} = publicationSlice.actions;
export default publicationSlice.reducer;
