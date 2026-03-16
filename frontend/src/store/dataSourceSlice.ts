/**
 * Kiri — Data Source Hydration Slice
 *
 * Manages hydration status for data sources.
 * Tracks per-source progress: idle → connecting → downloading → loaded / error
 */

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { hydrateDataSource as apiHydrate, fetchSourceCachedData } from "../services/api";

/* ── Types ── */

export type HydrationStatus = "idle" | "connecting" | "downloading" | "loaded" | "error";

interface DataSourceState {
  /** Per-source hydration status: sourceId → status */
  hydrationStatus: Record<string, HydrationStatus>;
  /** Per-source cached data: sourceId → data */
  cachedData: Record<string, Record<string, unknown> | null>;
  /** Per-source error messages: sourceId → error */
  errors: Record<string, string | null>;
}

const initialState: DataSourceState = {
  hydrationStatus: {},
  cachedData: {},
  errors: {},
};

/* ── Thunks ── */

/**
 * Hydrate a single data source by calling the backend hydration endpoint.
 * The backend fetches external API data, caches it, and returns the result.
 */
export const hydrateSource = createAsyncThunk(
  "dataSource/hydrate",
  async (
    { projectId, sourceId }: { projectId: string; sourceId: string },
    { dispatch }
  ) => {
    // Set connecting status
    dispatch(setHydrationStatus({ sourceId, status: "connecting" }));

    try {
      // Set downloading status
      dispatch(setHydrationStatus({ sourceId, status: "downloading" }));

      // Call hydration endpoint (synchronous — waits for completion)
      const result = await apiHydrate(projectId, sourceId);

      if (result.status === "error") {
        dispatch(setHydrationStatus({ sourceId, status: "error" }));
        dispatch(setError({ sourceId, error: result.errors?.join("; ") || "Hydration failed" }));
        return { sourceId, status: "error" as const };
      }

      dispatch(setHydrationStatus({ sourceId, status: "loaded" }));
      return { sourceId, status: "loaded" as const, data: result.data };
    } catch (err) {
      dispatch(setHydrationStatus({ sourceId, status: "error" }));
      dispatch(setError({ sourceId, error: err instanceof Error ? err.message : "Unknown error" }));
      throw err;
    }
  }
);

/**
 * Fetch cached data for a source from the backend.
 */
export const fetchCachedData = createAsyncThunk(
  "dataSource/fetchCachedData",
  async ({ projectId, sourceId }: { projectId: string; sourceId: string }) => {
    const result = await fetchSourceCachedData(projectId, sourceId);
    return {
      sourceId,
      data: result.data?.cached_data || null,
      status: result.data?.status || "pending",
    };
  }
);

/* ── Slice ── */

const dataSourceSlice = createSlice({
  name: "dataSource",
  initialState,
  reducers: {
    setHydrationStatus(
      state,
      action: PayloadAction<{ sourceId: string; status: HydrationStatus }>
    ) {
      state.hydrationStatus[action.payload.sourceId] = action.payload.status;
    },
    setError(
      state,
      action: PayloadAction<{ sourceId: string; error: string | null }>
    ) {
      state.errors[action.payload.sourceId] = action.payload.error;
    },
    clearHydrationState(state, action: PayloadAction<string>) {
      delete state.hydrationStatus[action.payload];
      delete state.cachedData[action.payload];
      delete state.errors[action.payload];
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchCachedData.fulfilled, (state, action) => {
      state.cachedData[action.payload.sourceId] = action.payload.data;
      state.hydrationStatus[action.payload.sourceId] =
        action.payload.status === "loaded" ? "loaded" :
        action.payload.status === "error" ? "error" : "idle";
    });
  },
});

export const { setHydrationStatus, setError, clearHydrationState } = dataSourceSlice.actions;
export default dataSourceSlice.reducer;
