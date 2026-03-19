import { configureStore, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import projectReducer from "./projectSlice";
import publicationReducer from "./publicationSlice";
import errorReducer from "./errorSlice";
import dataSourceReducer from "./dataSourceSlice";
import authReducer from "./authSlice";
import interactomicsReducer from "./interactomicsSlice";
import type { HeatmapOptions } from "../components/ExpressionHeatmap";
import { DEFAULT_HEATMAP_OPTIONS } from "../components/ExpressionHeatmap";
import { loadPersistedGlobal, createPersistenceSubscriber } from "./persistence";

/* ── App Slice ── */
interface AppState {
  language: "en" | "zh";
  theme: "dark" | "light";
  selectedGenes: string[];
  activeModule: string;
  heatmapOptions: HeatmapOptions;
  projectViewMode: "grid" | "list";
}

const _persisted = loadPersistedGlobal();

const initialState: AppState = {
  language: (_persisted.language as "en" | "zh") || "en",
  theme: (localStorage.getItem("kiri-theme") as "dark" | "light") || "dark",
  selectedGenes: [],
  activeModule: "atlas",
  heatmapOptions: DEFAULT_HEATMAP_OPTIONS,
  projectViewMode: (_persisted.projectViewMode as "grid" | "list") || (localStorage.getItem("kiri-view-mode") as "grid" | "list") || "grid",
};

const appSlice = createSlice({
  name: "app",
  initialState,
  reducers: {
    setLanguage(state, action: PayloadAction<"en" | "zh">) {
      state.language = action.payload;
    },
    setTheme(state, action: PayloadAction<"dark" | "light">) {
      state.theme = action.payload;
      localStorage.setItem("kiri-theme", action.payload);
    },
    setSelectedGenes(state, action: PayloadAction<string[]>) {
      state.selectedGenes = action.payload;
    },
    addGene(state, action: PayloadAction<string>) {
      if (!state.selectedGenes.includes(action.payload)) {
        state.selectedGenes.push(action.payload);
      }
    },
    removeGene(state, action: PayloadAction<string>) {
      state.selectedGenes = state.selectedGenes.filter(
        (g) => g !== action.payload
      );
    },
    setActiveModule(state, action: PayloadAction<string>) {
      state.activeModule = action.payload;
    },
    setHeatmapOptions(state, action: PayloadAction<HeatmapOptions>) {
      state.heatmapOptions = action.payload;
    },
    setProjectViewMode(state, action: PayloadAction<"grid" | "list">) {
      state.projectViewMode = action.payload;
      localStorage.setItem("kiri-view-mode", action.payload);
    },
    /** Rehydrate project-scoped app state from localStorage */
    rehydrateAppFromProject(state, action: PayloadAction<{ activeModule?: string; heatmapOptions?: Record<string, unknown> }>) {
      if (action.payload.activeModule) state.activeModule = action.payload.activeModule;
      if (action.payload.heatmapOptions) state.heatmapOptions = action.payload.heatmapOptions as unknown as HeatmapOptions;
    },
  },
});

export const {
  setLanguage,
  setTheme,
  setSelectedGenes,
  addGene,
  removeGene,
  setActiveModule,
  setHeatmapOptions,
  setProjectViewMode,
  rehydrateAppFromProject,
} = appSlice.actions;

/* ── Store ── */
export const store = configureStore({
  reducer: {
    app: appSlice.reducer,
    auth: authReducer,
    project: projectReducer,
    publication: publicationReducer,
    errors: errorReducer,
    dataSource: dataSourceReducer,
    interactomics: interactomicsReducer,
  },
});

// ── Real-time state persistence ──
store.subscribe(createPersistenceSubscriber(store));

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
