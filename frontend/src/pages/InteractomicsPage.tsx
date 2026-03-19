/**
 * Kiri — Interactomics & Regulatory Network Page
 *
 * Phase 9 module with 6 analysis tabs:
 * 1. Network — Enhanced PPI (STRING + BioGRID + IntAct, mito annotations)
 * 2. Co-Expression — Heatmap of correlated genes (|r| > 0.6)
 * 3. Proteomics — CoIP-MS volcano plot + heatmap
 * 4. Differential Expression — Public dataset DE with substrate annotations
 * 5. Substrates — Candidate substrate prediction
 * 6. Regulatory Network — Integrated mechanistic graph
 *
 * All analyses are project-scoped via the Redux store's active project.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppSelector, useAppDispatch } from "../store";
import { motion } from "framer-motion";
import { Card, StatusBadge, ChartSkeleton, Stat, InfoTooltip } from "../components/ui";
import { PPINetwork } from "../components/PPINetwork";
import { InteractomicsHeatmap } from "../components/InteractomicsHeatmap";
import { SubstrateTable } from "../components/SubstrateTable";
import { RegulatoryGraph } from "../components/RegulatoryGraph";
import {
  fetchEnhancedPPI,
  fetchCoexpressionHeatmap,
  fetchProteomicsAnalysis,
  fetchPublicDE,
  loadPrideDataset,
  loadGeoDataset,
  fetchSubstrateScan,
  fetchRegulatoryNetwork,
  getErrorMessage,
} from "../services/api";
import { useProjectDataSources } from "../hooks/useProjectDataSources";
import { VolcanoPlot } from "../components/VolcanoPlot";
import {
  setActiveTab as setActiveTabAction,
  setNetworkData as setNetworkDataAction,
  clearNetworkData as clearNetworkDataAction,
  setHighConfidence as setHighConfidenceAction,
  setShowMitoOnly as setShowMitoOnlyAction,
  setIncludeBiogrid as setIncludeBiogridAction,
  setIncludeIntact as setIncludeIntactAction,
  setCoexprData as setCoexprDataAction,
  setPrideResults as setPrideResultsAction,
  setProteomicsAnalysis as setProteomicsAnalysisAction,
  setGeoResults as setGeoResultsAction,
  setDeAnalysis as setDeAnalysisAction,
  setSubstrateData as setSubstrateDataAction,
  setRegulatoryData as setRegulatoryDataAction,
  setFdrCutoff as setFdrCutoffAction,
  setLfcCutoff as setLfcCutoffAction,
} from "../store/interactomicsSlice";

type TabId = "network" | "coexpression" | "proteomics" | "de" | "substrates" | "regulatory";

const TABS: { id: TabId; labelKey: string; fallback: string; icon: string }[] = [
  { id: "network", labelKey: "interactomics.tab_network", fallback: "Network", icon: "🕸️" },
  { id: "coexpression", labelKey: "interactomics.tab_coexpression", fallback: "Co-Expression", icon: "📊" },
  { id: "proteomics", labelKey: "interactomics.tab_proteomics", fallback: "Proteomics", icon: "🧪" },
  { id: "de", labelKey: "interactomics.tab_de", fallback: "Differential Expression", icon: "🌋" },
  { id: "substrates", labelKey: "interactomics.tab_substrates", fallback: "Substrates", icon: "✂️" },
  { id: "regulatory", labelKey: "interactomics.tab_regulatory", fallback: "Regulatory Network", icon: "🔬" },
];

function InteractomicsPage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const selectedGenes = useAppSelector((s) => s.app.selectedGenes);
  const activeProject = useAppSelector((s) => s.project.activeProject);
  const projectId = activeProject?.id;
  const { clinicalProjectIds } = useProjectDataSources();

  // ── Redux-persisted state (survives navigation + refresh) ──
  const activeTab = useAppSelector((s) => s.interactomics.activeTab) as TabId;
  const networkData = useAppSelector((s) => s.interactomics.networkData);
  const networkProv = useAppSelector((s) => s.interactomics.networkProv);
  const coexprData = useAppSelector((s) => s.interactomics.coexprData);
  const coexprProv = useAppSelector((s) => s.interactomics.coexprProv);
  const substrateData = useAppSelector((s) => s.interactomics.substrateData);
  const regulatoryData = useAppSelector((s) => s.interactomics.regulatoryData);
  const regulatoryProv = useAppSelector((s) => s.interactomics.regulatoryProv);
  const prideResults = useAppSelector((s) => s.interactomics.prideResults);
  const geoResults = useAppSelector((s) => s.interactomics.geoResults);
  const highConfidence = useAppSelector((s) => s.interactomics.highConfidence);
  const showMitoOnly = useAppSelector((s) => s.interactomics.showMitoOnly);
  const includeBiogrid = useAppSelector((s) => s.interactomics.includeBiogrid);
  const includeIntact = useAppSelector((s) => s.interactomics.includeIntact);
  const proteomicsAnalysis = useAppSelector((s) => s.interactomics.proteomicsAnalysis);
  const proteomicsProv = useAppSelector((s) => s.interactomics.proteomicsProv);
  const deAnalysis = useAppSelector((s) => s.interactomics.deAnalysis);
  const deProv = useAppSelector((s) => s.interactomics.deProv);
  const fdrCutoff = useAppSelector((s) => s.interactomics.fdrCutoff);
  const lfcCutoff = useAppSelector((s) => s.interactomics.lfcCutoff);

  // ── Ephemeral UI state (no need to persist) ──
  const [prideLoading, setPrideLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // Tab setter that goes through Redux
  const setActiveTab = useCallback((tab: TabId) => {
    dispatch(setActiveTabAction(tab));
  }, [dispatch]);

  // Stable genes reference
  const genes = useMemo(() => selectedGenes, [selectedGenes]);

  // Fetch data when tab changes
  const fetchData = useCallback(async () => {
    if (genes.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      switch (activeTab) {
        case "network": {
          if (!networkData) {
            const resp = await fetchEnhancedPPI(
              genes, 0.4, highConfidence, includeBiogrid, includeIntact, true, projectId
            );
            if (resp.status === "success") {
              dispatch(setNetworkDataAction({ data: resp.data, provenance: resp.provenance }));
            } else {
              setError(resp.errors?.join("; ") || "Failed to fetch network");
            }
          }
          break;
        }
        case "coexpression": {
          if (!coexprData) {
            const resp = await fetchCoexpressionHeatmap(
              genes, clinicalProjectIds, 0.6, 50, projectId
            );
            if (resp.status === "success") {
              dispatch(setCoexprDataAction({ data: resp.data, provenance: resp.provenance }));
            } else {
              setError(resp.errors?.join("; ") || "Failed to fetch co-expression data");
            }
          }
          break;
        }
        case "substrates": {
          if (!substrateData) {
            const resp = await fetchSubstrateScan(genes, undefined, true, projectId);
            if (resp.status === "success") {
              dispatch(setSubstrateDataAction(resp.data));
            } else {
              setError(resp.errors?.join("; ") || "Failed to run substrate scan");
            }
          }
          break;
        }
        case "regulatory": {
          if (!regulatoryData) {
            const resp = await fetchRegulatoryNetwork(
              genes, clinicalProjectIds,
              true, true, true, true, projectId
            );
            if (resp.status === "success") {
              dispatch(setRegulatoryDataAction({ data: resp.data, provenance: resp.provenance }));
            } else {
              setError(resp.errors?.join("; ") || "Failed to build regulatory network");
            }
          }
          break;
        }
        // proteomics and de require user-uploaded data — show placeholder
        default:
          break;
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [activeTab, projectId, highConfidence, includeBiogrid, includeIntact, genes, networkData, coexprData, substrateData, regulatoryData, dispatch, clinicalProjectIds]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Re-fetch network when confidence or source filter changes
  const handleConfidenceToggle = async () => {
    dispatch(setHighConfidenceAction(!highConfidence));
    dispatch(clearNetworkDataAction()); // Force refetch
  };

  const handleSourceChange = (value: string) => {
    dispatch(setIncludeBiogridAction(value === "biogrid" || value === "all"));
    dispatch(setIncludeIntactAction(value === "intact" || value === "all"));
    dispatch(clearNetworkDataAction()); // Force refetch
  };

  // Derive current source value for the dropdown
  const currentSource = includeBiogrid && includeIntact
    ? "all"
    : includeBiogrid
    ? "biogrid"
    : includeIntact
    ? "intact"
    : "string";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-8 max-w-[1400px] mx-auto space-y-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-kiri-text tracking-tight flex items-center gap-2">
            <span>⚙️</span>
            {t("interactomics.title", "Interactomics & Regulatory Network")}
            <InfoTooltip tooltipKey="tooltips.interactomics" />
          </h1>
          <p className="text-sm text-kiri-text-muted mt-1">
            {t("interactomics.subtitle", "Multi-omics integration: PPI networks, co-expression, proteomics, substrates, and regulatory mechanisms")}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Stat label="Target Genes" value={genes.length > 0 ? genes.join(", ") : "—"} />
          {networkData?.meta && (
            <Stat label="Network" value={`${networkData.meta.total_nodes} nodes`} />
          )}
          {/* Data Source Selector */}
          <div className="bg-kiri-bg/50 border border-kiri-border rounded px-3 py-2 min-w-[140px]">
            <p className="text-[10px] text-kiri-text-dim uppercase tracking-wider">Dataset</p>
            <select
              value={currentSource}
              onChange={(e) => handleSourceChange(e.target.value)}
              className="w-full text-sm font-mono mt-0.5 bg-transparent text-kiri-text border-none outline-none cursor-pointer appearance-none"
            >
              <option value="string" className="bg-kiri-surface text-kiri-text">🔗 STRING-DB</option>
              <option value="biogrid" className="bg-kiri-surface text-kiri-text">🧬 BioGRID</option>
              <option value="intact" className="bg-kiri-surface text-kiri-text">🔬 IntAct</option>
              <option value="all" className="bg-kiri-surface text-kiri-text">📊 All Sources</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tab Bar — pill-style */}
      <div className="flex gap-1 bg-kiri-surface rounded-xl p-1 border border-kiri-border overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 text-sm px-4 py-2.5 rounded-lg font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? "bg-kiri-accent/15 text-kiri-accent border border-kiri-accent/30"
                : "text-kiri-text-muted hover:text-kiri-text hover:bg-kiri-surface-hover border border-transparent"
            }`}
          >
            <span>{tab.icon}</span>
            <span>{t(tab.labelKey, tab.fallback)}</span>
          </button>
        ))}
      </div>

      {/* Error display */}
      {error && (
        <Card className="mb-4">
          <div className="flex items-center gap-2 text-sm text-kiri-error">
            <StatusBadge label="Error" variant="error" />
            <span>{error}</span>
            <button
              onClick={() => { setError(""); fetchData(); }}
              className="ml-auto text-kiri-accent hover:text-white text-xs px-2 py-1 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors"
            >
              Retry
            </button>
          </div>
        </Card>
      )}

      {/* No genes state */}
      {genes.length === 0 && (
        <Card>
          <div className="text-center py-12 text-kiri-text-muted">
            <p className="text-4xl mb-3">🕸️</p>
            <p className="text-sm">
              {t("interactomics.no_project_genes", "Add protein targets to your project to analyze their interaction network.")}
            </p>
          </div>
        </Card>
      )}

      {/* Tab Content — Only render when genes are present */}
      {genes.length > 0 && (
        <>
          {activeTab === "network" && (
            <div className="space-y-4">
              {/* Controls */}
              <Card>
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 text-sm text-kiri-text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={highConfidence}
                      onChange={handleConfidenceToggle}
                      className="rounded border-kiri-border bg-kiri-surface"
                    />
                    {t("interactomics.high_confidence", "High confidence only (>0.7)")}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-kiri-text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showMitoOnly}
                      onChange={() => dispatch(setShowMitoOnlyAction(!showMitoOnly))}
                      className="rounded border-kiri-border bg-kiri-surface"
                    />
                    {t("interactomics.mito_only", "Highlight mitochondrial proteins")}
                  </label>
                  {networkData?.meta && (
                    <div className="ml-auto text-xs text-kiri-text-dim space-x-4">
                      <span>{networkData.meta.total_nodes} nodes</span>
                      <span>{networkData.meta.total_edges} edges</span>
                      <span>{networkData.meta.high_confidence_count} high-confidence</span>
                      <span>{networkData.meta.mitochondrial_node_count} mitochondrial</span>
                      <span>Sources: {networkData.meta.sources_used?.join(", ")}</span>
                    </div>
                  )}
                </div>
              </Card>

              {loading ? (
                <ChartSkeleton />
              ) : networkData ? (
                <PPINetwork
                  data={networkData}
                  provenance={networkProv}
                  loading={false}
                  confidence={highConfidence ? 0.7 : 0.4}
                />
              ) : !error ? (
                <Card>
                  <div className="text-center text-kiri-text-muted text-sm py-8">
                    {t("interactomics.no_project_genes", "Add protein targets to your project to analyze their interaction network.")}
                  </div>
                </Card>
              ) : null}
            </div>
          )}

          {activeTab === "coexpression" && (
            <div className="space-y-4">
              {loading ? (
                <ChartSkeleton />
              ) : coexprData?.matrix ? (
                <InteractomicsHeatmap
                  matrix={coexprData.matrix}
                  title={t("interactomics.coexpr_heatmap", "Co-Expression Correlation Heatmap (|r| ≥ 0.6)")}
                  provenance={coexprProv}
                  mode="correlation"
                />
              ) : !error ? (
                <Card>
                  <div className="text-center text-kiri-text-muted text-sm py-8">
                    {t("interactomics.no_coexpr", "Add protein targets to your project to run co-expression analysis.")}
                  </div>
                </Card>
              ) : null}
            </div>
          )}

          {activeTab === "proteomics" && (
            <div className="space-y-4">
              {/* Threshold Controls */}
              <Card>
                <div className="flex flex-wrap items-center gap-6 py-2">
                  <h4 className="text-sm font-semibold text-kiri-text">Statistical Thresholds</h4>
                  <label className="flex items-center gap-2 text-xs text-kiri-text-muted">
                    FDR cutoff:
                    <input
                      type="number"
                      step={0.01}
                      min={0.001}
                      max={0.5}
                      value={fdrCutoff}
                      onChange={(e) => dispatch(setFdrCutoffAction(parseFloat(e.target.value) || 0.05))}
                      className="w-20 px-2 py-1 rounded bg-kiri-bg border border-kiri-border text-kiri-text text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-kiri-text-muted">
                    |log₂FC| cutoff:
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      max={5}
                      value={lfcCutoff}
                      onChange={(e) => dispatch(setLfcCutoffAction(parseFloat(e.target.value) || 1.0))}
                      className="w-20 px-2 py-1 rounded bg-kiri-bg border border-kiri-border text-kiri-text text-xs"
                    />
                  </label>
                </div>
              </Card>

              <Card title={t("interactomics.proteomics_title", "CoIP-MS / Proteomics Analysis")}>
                <div className="text-center text-kiri-text-muted text-sm py-6 space-y-3">
                  <p>
                    {t("interactomics.proteomics_upload", "Upload a proteomics abundance matrix (CSV) or search PRIDE for published CoIP-MS datasets.")}
                  </p>
                  <div className="flex justify-center gap-3">
                    <button className="text-xs text-kiri-accent hover:text-white px-3 py-1.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors">
                      📁 Upload Data
                    </button>
                    <button
                      disabled={prideLoading}
                      onClick={async () => {
                        setPrideLoading(true);
                        try {
                          const resp = await fetchProteomicsAnalysis(null, null, genes, "bait", "control", fdrCutoff, lfcCutoff, projectId);
                          if (resp.status === "success" && resp.data) {
                            dispatch(setPrideResultsAction(resp.data));
                          } else {
                            setError(resp.errors?.join("; ") || "PRIDE search failed");
                          }
                        } catch (err) {
                          setError(getErrorMessage(err));
                        } finally {
                          setPrideLoading(false);
                        }
                      }}
                      className="text-xs text-kiri-accent hover:text-white px-3 py-1.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors disabled:opacity-50"
                    >
                      {prideLoading ? "⏳ Searching..." : "🔍 Search PRIDE"}
                    </button>
                  </div>
                </div>
              </Card>

              {/* PRIDE search results — clickable datasets */}
              {prideResults?.available_datasets && (
                <Card title="Available PRIDE Datasets">
                  {prideResults.message && (
                    <p className="text-xs text-kiri-text-muted mb-3">{prideResults.message}</p>
                  )}
                  {prideResults.available_datasets.datasets?.length > 0 ? (
                    <div className="space-y-2">
                      {prideResults.available_datasets.datasets.map((ds: Record<string, unknown>, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded border border-kiri-border hover:border-kiri-accent/50 hover:bg-kiri-accent/5 transition-colors group">
                          <div>
                            <p className="text-sm text-kiri-text font-medium">{String(ds.accession || ds.title || `Dataset ${i + 1}`)}</p>
                            <p className="text-xs text-kiri-text-muted">{String(ds.title || ds.description || "")}</p>
                            {ds.organism ? <p className="text-xs text-kiri-text-dim mt-0.5">Organism: {String(ds.organism)}</p> : null}
                            {ds.matching_genes ? <p className="text-xs text-kiri-accent/70 mt-0.5">Matching genes: {String((ds.matching_genes as string[]).join(", "))}</p> : null}
                          </div>
                          <button
                            disabled={prideLoading}
                            onClick={async () => {
                              setPrideLoading(true);
                              setError("");
                              try {
                                const resp = await loadPrideDataset(
                                  String(ds.accession), genes, fdrCutoff, lfcCutoff, projectId
                                );
                                if (resp.status === "success" && resp.data) {
                                  dispatch(setProteomicsAnalysisAction({ data: resp.data, provenance: resp.provenance }));
                                } else {
                                  setError(resp.errors?.join("; ") || "Analysis failed");
                                }
                              } catch (err) {
                                setError(getErrorMessage(err));
                              } finally {
                                setPrideLoading(false);
                              }
                            }}
                            className="px-3 py-1.5 text-xs font-medium rounded bg-kiri-accent/20 text-kiri-accent hover:bg-kiri-accent hover:text-white border border-kiri-accent/30 transition-all opacity-70 group-hover:opacity-100 disabled:opacity-30"
                          >
                            {prideLoading ? "⏳" : "▶ Load & Analyze"}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-kiri-text-dim text-center py-4">No PRIDE datasets found for your target genes.</p>
                  )}
                </Card>
              )}

              {/* Proteomics analysis results */}
              {proteomicsAnalysis && (
                <>
                  <Card title={`Analysis Results — ${proteomicsAnalysis.dataset_title || "CoIP-MS"}`}>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div className="p-3 rounded bg-kiri-bg border border-kiri-border text-center">
                        <p className="text-2xl font-bold text-kiri-text">{proteomicsAnalysis.total_proteins ?? 0}</p>
                        <p className="text-xs text-kiri-text-muted">Total Proteins</p>
                      </div>
                      <div className="p-3 rounded bg-kiri-bg border border-kiri-border text-center">
                        <p className="text-2xl font-bold text-kiri-accent">{proteomicsAnalysis.significant_count ?? 0}</p>
                        <p className="text-xs text-kiri-text-muted">Significant (FDR&lt;{fdrCutoff})</p>
                      </div>
                      <div className="p-3 rounded bg-kiri-bg border border-kiri-border text-center">
                        <p className="text-2xl font-bold text-kiri-text">{String(fdrCutoff)}</p>
                        <p className="text-xs text-kiri-text-muted">FDR Cutoff</p>
                      </div>
                      <div className="p-3 rounded bg-kiri-bg border border-kiri-border text-center">
                        <p className="text-2xl font-bold text-kiri-text">{String(lfcCutoff)}</p>
                        <p className="text-xs text-kiri-text-muted">|log₂FC| Cutoff</p>
                      </div>
                    </div>
                    <p className="text-xs text-kiri-text-dim mb-2">
                      Method: {proteomicsAnalysis.method || "Welch's t-test + BH FDR"}
                      {proteomicsProv?.source ? ` • Source: ${proteomicsProv.source}` : ""}
                    </p>
                  </Card>
                  {proteomicsAnalysis.results && (
                    <VolcanoPlot
                      data={proteomicsAnalysis.results.map((r: Record<string, unknown>) => ({
                        protein: String(r.protein || ""),
                        log2_fold_change: Number(r.log2_fold_change || 0),
                        neg_log10_p: Number(r.neg_log10_p || 0),
                        significant: Boolean(r.significant),
                      }))}
                      lfcCutoff={lfcCutoff}
                      fdrCutoff={fdrCutoff}
                      title="Volcano Plot — CoIP-MS Differential Abundance"
                    />
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === "de" && (
            <div className="space-y-4">
              {/* Threshold Controls */}
              <Card>
                <div className="flex flex-wrap items-center gap-6 py-2">
                  <h4 className="text-sm font-semibold text-kiri-text">Statistical Thresholds</h4>
                  <label className="flex items-center gap-2 text-xs text-kiri-text-muted">
                    FDR cutoff:
                    <input
                      type="number"
                      step={0.01}
                      min={0.001}
                      max={0.5}
                      value={fdrCutoff}
                      onChange={(e) => dispatch(setFdrCutoffAction(parseFloat(e.target.value) || 0.05))}
                      className="w-20 px-2 py-1 rounded bg-kiri-bg border border-kiri-border text-kiri-text text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-kiri-text-muted">
                    |log₂FC| cutoff:
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      max={5}
                      value={lfcCutoff}
                      onChange={(e) => dispatch(setLfcCutoffAction(parseFloat(e.target.value) || 1.0))}
                      className="w-20 px-2 py-1 rounded bg-kiri-bg border border-kiri-border text-kiri-text text-xs"
                    />
                  </label>
                </div>
              </Card>

              <Card title={t("interactomics.de_title", "Public Dataset Differential Expression")}>
                <div className="text-center text-kiri-text-muted text-sm py-6 space-y-3">
                  <p>
                    {t("interactomics.de_upload", "Upload expression data or search GEO for knockdown/overexpression datasets related to your target genes.")}
                  </p>
                  <div className="flex justify-center gap-3">
                    <button className="text-xs text-kiri-accent hover:text-white px-3 py-1.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors">
                      📁 Upload Data
                    </button>
                    <button
                      disabled={geoLoading}
                      onClick={async () => {
                        setGeoLoading(true);
                        try {
                          const resp = await fetchPublicDE(null, null, genes, "perturbation", "control", lfcCutoff, fdrCutoff, true, projectId);
                          if (resp.status === "success" && resp.data) {
                            dispatch(setGeoResultsAction(resp.data));
                          } else {
                            setError(resp.errors?.join("; ") || "GEO search failed");
                          }
                        } catch (err) {
                          setError(getErrorMessage(err));
                        } finally {
                          setGeoLoading(false);
                        }
                      }}
                      className="text-xs text-kiri-accent hover:text-white px-3 py-1.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors disabled:opacity-50"
                    >
                      {geoLoading ? "⏳ Searching..." : "🔍 Search GEO"}
                    </button>
                  </div>
                </div>
              </Card>

              {/* GEO search results — clickable datasets */}
              {geoResults?.available_datasets && (
                <Card title="Available GEO Datasets">
                  {geoResults.message && (
                    <p className="text-xs text-kiri-text-muted mb-3">{geoResults.message}</p>
                  )}
                  {geoResults.available_datasets.datasets?.length > 0 ? (
                    <div className="space-y-2">
                      {geoResults.available_datasets.datasets.map((ds: Record<string, unknown>, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded border border-kiri-border hover:border-kiri-accent/50 hover:bg-kiri-accent/5 transition-colors group">
                          <div>
                            <p className="text-sm text-kiri-text font-medium">{String(ds.accession || `Dataset ${i + 1}`)}</p>
                            <p className="text-xs text-kiri-text-muted">{String(ds.title || "")}</p>
                            <div className="flex gap-3 mt-1 text-xs text-kiri-text-dim">
                              {ds.perturbation ? <span>Type: {String(ds.perturbation)}</span> : null}
                              {ds.target_gene ? <span>Target: {String(ds.target_gene)}</span> : null}
                              {ds.platform ? <span>Platform: {String(ds.platform)}</span> : null}
                              {ds.organism ? <span>Organism: {String(ds.organism)}</span> : null}
                            </div>
                          </div>
                          <button
                            disabled={geoLoading}
                            onClick={async () => {
                              setGeoLoading(true);
                              setError("");
                              try {
                                const resp = await loadGeoDataset(
                                  String(ds.accession), genes, lfcCutoff, fdrCutoff, true, projectId
                                );
                                if (resp.status === "success" && resp.data) {
                                  dispatch(setDeAnalysisAction({ data: resp.data, provenance: resp.provenance }));
                                } else {
                                  setError(resp.errors?.join("; ") || "Analysis failed");
                                }
                              } catch (err) {
                                setError(getErrorMessage(err));
                              } finally {
                                setGeoLoading(false);
                              }
                            }}
                            className="px-3 py-1.5 text-xs font-medium rounded bg-kiri-accent/20 text-kiri-accent hover:bg-kiri-accent hover:text-white border border-kiri-accent/30 transition-all opacity-70 group-hover:opacity-100 disabled:opacity-30"
                          >
                            {geoLoading ? "⏳" : "▶ Load & Analyze"}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-kiri-text-dim text-center py-4">No GEO datasets found for your target genes.</p>
                  )}
                </Card>
              )}

              {/* DE analysis results */}
              {deAnalysis && (
                <>
                  <Card title={`DE Results — ${deAnalysis.dataset_title || "Public Dataset"}`}>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                      <div className="p-3 rounded bg-kiri-bg border border-kiri-border text-center">
                        <p className="text-2xl font-bold text-kiri-text">{deAnalysis.total_genes ?? 0}</p>
                        <p className="text-xs text-kiri-text-muted">Total Genes</p>
                      </div>
                      <div className="p-3 rounded bg-kiri-bg border border-kiri-border text-center">
                        <p className="text-2xl font-bold text-kiri-accent">{deAnalysis.deg_count ?? 0}</p>
                        <p className="text-xs text-kiri-text-muted">DEGs</p>
                      </div>
                      <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-center">
                        <p className="text-2xl font-bold text-red-400">{deAnalysis.up_regulated ?? 0}</p>
                        <p className="text-xs text-kiri-text-muted">Up-regulated</p>
                      </div>
                      <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20 text-center">
                        <p className="text-2xl font-bold text-blue-400">{deAnalysis.down_regulated ?? 0}</p>
                        <p className="text-xs text-kiri-text-muted">Down-regulated</p>
                      </div>
                      <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20 text-center">
                        <p className="text-2xl font-bold text-amber-400">{deAnalysis.substrate_deg_count ?? 0}</p>
                        <p className="text-xs text-kiri-text-muted">Substrate DEGs</p>
                      </div>
                    </div>
                    <p className="text-xs text-kiri-text-dim mb-2">
                      Method: {deAnalysis.method || "Mann-Whitney U + BH FDR"}
                      {deAnalysis.perturbation_type ? ` • ${deAnalysis.perturbation_type}` : ""}
                      {deAnalysis.target_gene ? ` of ${deAnalysis.target_gene}` : ""}
                      {deProv?.source ? ` • Source: ${deProv.source}` : ""}
                    </p>
                    {/* Substrate DEGs highlight */}
                    {deAnalysis.substrate_degs?.length > 0 && (
                      <div className="mt-3 p-3 rounded border border-amber-500/30 bg-amber-500/5">
                        <h5 className="text-xs font-semibold text-amber-400 mb-2">🔬 Known Substrate DEGs</h5>
                        <div className="space-y-1">
                          {deAnalysis.substrate_degs.map((sub: Record<string, unknown>, i: number) => (
                            <div key={i} className="flex justify-between items-center text-xs">
                              <span className="text-kiri-text font-medium">{String(sub.gene || "")}</span>
                              <span className={Number(sub.log2_fold_change || 0) > 0 ? "text-red-400" : "text-blue-400"}>
                                log₂FC: {Number(sub.log2_fold_change || 0).toFixed(2)}
                              </span>
                              <span className="text-kiri-text-dim">FDR: {Number(sub.adjusted_p_value || 0).toExponential(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                  {deAnalysis.results && (
                    <VolcanoPlot
                      data={deAnalysis.results.map((r: Record<string, unknown>) => ({
                        gene: String(r.gene || ""),
                        log2_fold_change: Number(r.log2_fold_change || 0),
                        neg_log10_fdr: Number(r.neg_log10_fdr || 0),
                        significant: Boolean(r.significant),
                        is_known_substrate: Boolean(r.is_known_substrate),
                      }))}
                      lfcCutoff={lfcCutoff}
                      fdrCutoff={fdrCutoff}
                      title="Volcano Plot — Differential Expression"
                    />
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === "substrates" && (
            <div className="space-y-4">
              {loading ? (
                <ChartSkeleton />
              ) : substrateData ? (
                <>
                  {/* Summary stats */}
                  <Card>
                    <div className="flex gap-6 text-xs text-kiri-text-muted">
                      <span>Scanned: <strong className="text-kiri-text">{substrateData.total_scanned}</strong> proteins</span>
                      <span>With hits: <strong className="text-kiri-text">{substrateData.total_with_hits}</strong></span>
                      <span>TM candidates: <strong className="text-kiri-accent">{substrateData.tm_hit_candidates}</strong></span>
                      <span>Motif: <code className="text-kiri-accent">{substrateData.motif_pattern}</code></span>
                    </div>
                  </Card>
                  <SubstrateTable
                    candidates={substrateData.candidates}
                    motifPattern={substrateData.motif_pattern}
                  />
                </>
              ) : !error ? (
                <Card>
                  <div className="text-center text-kiri-text-muted text-sm py-8">
                    {t("interactomics.no_substrates", "No substrate prediction results. Add protein targets to your project.")}
                  </div>
                </Card>
              ) : null}
            </div>
          )}

          {activeTab === "regulatory" && (
            <div className="space-y-4">
              {loading ? (
                <ChartSkeleton />
              ) : regulatoryData ? (
                <>
                  {/* Legend for functional categories */}
                  {regulatoryData.functions && (
                    <Card>
                      <div className="flex flex-wrap gap-3 text-xs">
                        {Object.entries(regulatoryData.functions as Record<string, { label: string; color: string; genes_in_network: string[] }>).map(
                          ([, func]) =>
                            func.genes_in_network.length > 0 && (
                              <span
                                key={func.label}
                                className="flex items-center gap-1"
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-full"
                                  style={{ backgroundColor: func.color }}
                                />
                                <span className="text-kiri-text-muted">
                                  {func.label} ({func.genes_in_network.length})
                                </span>
                              </span>
                            )
                        )}
                      </div>
                    </Card>
                  )}
                  <RegulatoryGraph
                    nodes={regulatoryData.nodes}
                    edges={regulatoryData.edges}
                    edgeColors={regulatoryData.meta?.edge_colors}
                    title={t("interactomics.regulatory_title", "Integrated Regulatory Network")}
                    provenance={regulatoryProv}
                  />
                </>
              ) : !error ? (
                <Card>
                  <div className="text-center text-kiri-text-muted text-sm py-8">
                    {t("interactomics.no_regulatory", "Add protein targets to build a regulatory network.")}
                  </div>
                </Card>
              ) : null}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

export default InteractomicsPage;
