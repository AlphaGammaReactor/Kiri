/**
 * Kiri — Interactomics Redux Slice
 *
 * Persists all Phase 9 data (network, co-expression, PRIDE, GEO, substrates,
 * regulatory) so state survives SPA navigation and page refresh via the
 * project-scoped localStorage persistence subscriber.
 */

import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { Provenance } from "../services/api";

/* ── State Shape ── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = any;

interface InteractomicsState {
  activeTab: string;

  // Network tab
  networkData: AnyData | null;
  networkProv: Provenance | null;
  highConfidence: boolean;
  showMitoOnly: boolean;

  // Co-expression tab
  coexprData: AnyData | null;
  coexprProv: Provenance | null;

  // Proteomics tab
  prideResults: AnyData | null;

  // Differential Expression tab
  geoResults: AnyData | null;

  // Substrates tab
  substrateData: AnyData | null;

  // Regulatory Network tab
  regulatoryData: AnyData | null;
  regulatoryProv: Provenance | null;
}

const initialState: InteractomicsState = {
  activeTab: "network",
  networkData: null,
  networkProv: null,
  highConfidence: false,
  showMitoOnly: false,
  coexprData: null,
  coexprProv: null,
  prideResults: null,
  geoResults: null,
  substrateData: null,
  regulatoryData: null,
  regulatoryProv: null,
};

/* ── Slice ── */

const interactomicsSlice = createSlice({
  name: "interactomics",
  initialState,
  reducers: {
    setActiveTab(state, action: PayloadAction<string>) {
      state.activeTab = action.payload;
    },

    // Network
    setNetworkData(state, action: PayloadAction<{ data: AnyData; provenance: Provenance | null }>) {
      state.networkData = action.payload.data;
      state.networkProv = action.payload.provenance;
    },
    clearNetworkData(state) {
      state.networkData = null;
      state.networkProv = null;
    },
    setHighConfidence(state, action: PayloadAction<boolean>) {
      state.highConfidence = action.payload;
    },
    setShowMitoOnly(state, action: PayloadAction<boolean>) {
      state.showMitoOnly = action.payload;
    },

    // Co-expression
    setCoexprData(state, action: PayloadAction<{ data: AnyData; provenance: Provenance | null }>) {
      state.coexprData = action.payload.data;
      state.coexprProv = action.payload.provenance;
    },

    // Proteomics / PRIDE
    setPrideResults(state, action: PayloadAction<AnyData>) {
      state.prideResults = action.payload;
    },

    // Differential Expression / GEO
    setGeoResults(state, action: PayloadAction<AnyData>) {
      state.geoResults = action.payload;
    },

    // Substrates
    setSubstrateData(state, action: PayloadAction<AnyData>) {
      state.substrateData = action.payload;
    },

    // Regulatory
    setRegulatoryData(state, action: PayloadAction<{ data: AnyData; provenance: Provenance | null }>) {
      state.regulatoryData = action.payload.data;
      state.regulatoryProv = action.payload.provenance;
    },

    // Full rehydration from localStorage
    rehydrateInteractomics(state, action: PayloadAction<Partial<InteractomicsState>>) {
      return { ...state, ...action.payload };
    },

    // Clear all (e.g. on project switch)
    clearInteractomics() {
      return { ...initialState };
    },
  },
});

export const {
  setActiveTab,
  setNetworkData,
  clearNetworkData,
  setHighConfidence,
  setShowMitoOnly,
  setCoexprData,
  setPrideResults,
  setGeoResults,
  setSubstrateData,
  setRegulatoryData,
  rehydrateInteractomics,
  clearInteractomics,
} = interactomicsSlice.actions;

export default interactomicsSlice.reducer;
