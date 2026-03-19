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
  includeBiogrid: boolean;
  includeIntact: boolean;

  // Co-expression tab
  coexprData: AnyData | null;
  coexprProv: Provenance | null;

  // Proteomics tab
  prideResults: AnyData | null;
  proteomicsAnalysis: AnyData | null;
  proteomicsProv: Provenance | null;

  // Differential Expression tab
  geoResults: AnyData | null;
  deAnalysis: AnyData | null;
  deProv: Provenance | null;

  // Substrates tab
  substrateData: AnyData | null;

  // Regulatory Network tab
  regulatoryData: AnyData | null;
  regulatoryProv: Provenance | null;

  // Threshold controls (persisted per-project)
  fdrCutoff: number;
  lfcCutoff: number;
  rCutoff: number;
  confidenceThreshold: number;
}

const initialState: InteractomicsState = {
  activeTab: "network",
  networkData: null,
  networkProv: null,
  highConfidence: false,
  showMitoOnly: false,
  includeBiogrid: true,
  includeIntact: true,
  coexprData: null,
  coexprProv: null,
  prideResults: null,
  proteomicsAnalysis: null,
  proteomicsProv: null,
  geoResults: null,
  deAnalysis: null,
  deProv: null,
  substrateData: null,
  regulatoryData: null,
  regulatoryProv: null,
  fdrCutoff: 0.05,
  lfcCutoff: 1.0,
  rCutoff: 0.6,
  confidenceThreshold: 0.4,
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
    setIncludeBiogrid(state, action: PayloadAction<boolean>) {
      state.includeBiogrid = action.payload;
    },
    setIncludeIntact(state, action: PayloadAction<boolean>) {
      state.includeIntact = action.payload;
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
    setProteomicsAnalysis(state, action: PayloadAction<{ data: AnyData; provenance: Provenance | null }>) {
      state.proteomicsAnalysis = action.payload.data;
      state.proteomicsProv = action.payload.provenance;
    },

    // Differential Expression / GEO
    setGeoResults(state, action: PayloadAction<AnyData>) {
      state.geoResults = action.payload;
    },
    setDeAnalysis(state, action: PayloadAction<{ data: AnyData; provenance: Provenance | null }>) {
      state.deAnalysis = action.payload.data;
      state.deProv = action.payload.provenance;
    },

    // Substrates
    setSubstrateData(state, action: PayloadAction<AnyData>) {
      state.substrateData = action.payload;
    },
    clearSubstrateData(state) {
      state.substrateData = null;
    },

    // Regulatory
    setRegulatoryData(state, action: PayloadAction<{ data: AnyData; provenance: Provenance | null }>) {
      state.regulatoryData = action.payload.data;
      state.regulatoryProv = action.payload.provenance;
    },

    // Threshold controls
    setFdrCutoff(state, action: PayloadAction<number>) {
      state.fdrCutoff = action.payload;
    },
    setLfcCutoff(state, action: PayloadAction<number>) {
      state.lfcCutoff = action.payload;
    },
    setRCutoff(state, action: PayloadAction<number>) {
      state.rCutoff = action.payload;
    },
    setConfidenceThreshold(state, action: PayloadAction<number>) {
      state.confidenceThreshold = action.payload;
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
  setIncludeBiogrid,
  setIncludeIntact,
  setCoexprData,
  setPrideResults,
  setProteomicsAnalysis,
  setGeoResults,
  setDeAnalysis,
  setSubstrateData,
  clearSubstrateData,
  setRegulatoryData,
  setFdrCutoff,
  setLfcCutoff,
  setRCutoff,
  setConfidenceThreshold,
  rehydrateInteractomics,
  clearInteractomics,
} = interactomicsSlice.actions;

export default interactomicsSlice.reducer;
