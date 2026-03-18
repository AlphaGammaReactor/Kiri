/**
 * Kiri — Atlas Page (Multi-Omics Atlas Module)
 *
 * Full module page integrating:
 * - Expression heatmap (ECharts) with clustering, transforms, annotations
 * - Dynamic data source selection from project config
 * - Filter sidebar (Stage, MSI, Normalization, Transform, Clustering, Palette)
 * - GEO validation cohort loader
 * - Custom file upload dropzone
 * - Gene summary cards
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAppSelector, useAppDispatch, setHeatmapOptions } from "../store";
import { ExpressionHeatmap, type HeatmapOptions } from "../components/ExpressionHeatmap";
import { AtlasFilters } from "../components/AtlasFilters";
import { EnrichmentPanel } from "../components/EnrichmentPanel";
import { DNBPanel } from "../components/DNBPanel";
import { TemporalClusterPanel } from "../components/TemporalClusterPanel";
import { DEResultsTable } from "../components/DEResultsTable";
import { GeneBoxplots } from "../components/GeneBoxplots";
import { PanCancerBoxplot } from "../components/PanCancerBoxplot";
import { Card, Stat, InfoTooltip } from "../components/ui";
import { useProjectDataSources } from "../hooks/useProjectDataSources";
import { usePageState } from "../hooks/usePageState";
import {
  fetchExpression,
  fetchGeoDataset,
  fetchProjectFileDetail,
  fetchDifferentialExpression,
  fetchDNBAnalysis,
  fetchTemporalClusters,
  fetchPanCancerExpression,
  getErrorMessage,
  type Provenance,
  type DEResult,
  type DEResponse,
  type DNBResult,
} from "../services/api";
import { motion } from "framer-motion";
import { pValueToAsterisks } from "../utils/heatmapUtils";

interface Sample {
  sample_id: string;
  sample_type: string;
  stage: string;
  msi_status: string;
  project: string;
}

interface ExpressionResult {
  genes: string[];
  samples: Sample[];
  values: Record<string, number[]>;
  normalization: string;
  source: string;
  sample_count: number;
}

type AtlasTab = "expression" | "enrichment" | "dnb" | "temporal" | "pan-cancer";

export default function AtlasPage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const selectedGenes = useAppSelector((s) => s.app.selectedGenes);
  const activeProject = useAppSelector((s) => s.project.activeProject);
  const { expressionSources, clinicalProjectIds } = useProjectDataSources();

  // ── Persisted UI State ──
  const [uiState, setUiState] = usePageState<{
    activeTab: AtlasTab;
    dataSource: string;
    normalization: string;
    stages: string[];
    msiFilter: string[];
    geoAccession: string;
  }>("atlas", {
    activeTab: "expression",
    dataSource: "",
    normalization: "tpm",
    stages: [],
    msiFilter: [],
    geoAccession: "GSE39582",
  });

  const { activeTab, dataSource, normalization, stages, msiFilter, geoAccession } = uiState;

  const setActiveTab = (val: AtlasTab) => setUiState((s) => ({ ...s, activeTab: val }));
  const setDataSource = useCallback((val: string) => setUiState((s) => ({ ...s, dataSource: val })), [setUiState]);
  const setNormalization = (val: string) => setUiState((s) => ({ ...s, normalization: val }));
  const setStages = (val: string[]) => setUiState((s) => ({ ...s, stages: val }));
  const setMsiFilter = (val: string[]) => setUiState((s) => ({ ...s, msiFilter: val }));
  const setGeoAccession = (val: string) => setUiState((s) => ({ ...s, geoAccession: val }));

  // ── Heatmap Options (persisted in Redux) ──
  const heatmapOptions = useAppSelector((s) => s.app.heatmapOptions);
  const updateHeatmapOptions = (opts: HeatmapOptions) => dispatch(setHeatmapOptions(opts));

  // ── Data State ──
  const [data, setData] = useState<ExpressionResult | null>(null);
  const [provenance, setProvenance] = useState<Provenance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [warnings, setWarnings] = useState<string[]>([]);

  // ── Differential Expression State ──
  const [deResults, setDeResults] = useState<DEResult[]>([]);
  const [deResponse, setDeResponse] = useState<DEResponse | null>(null);
  const [deLoading, setDeLoading] = useState(false);
  const [deError, setDeError] = useState<string>("");

  // ── Exported gene list from brush selection ──
  const [exportedGenes, setExportedGenes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  // ── Lifted Analysis State (survives tab switches) ──
  // DNB
  const [dnbResult, setDnbResult] = useState<DNBResult | null>(null);
  const [dnbLoading, setDnbLoading] = useState(false);
  const [dnbError, setDnbError] = useState("");

  // Temporal Clustering
  interface TemporalClusterData {
    stages: string[];
    clusters: Array<{
      id: number; label: string; centroid: number[]; centroid_norm: number[];
      centroid_smooth: number[]; genes: string[]; gene_count: number;
      memberships: Record<string, number>; pattern: string;
    }>;
    gene_assignments?: Record<string, { cluster: number; membership: number }>;
    n_genes: number;
  }
  const [temporalData, setTemporalData] = useState<TemporalClusterData | null>(null);
  const [temporalLoading, setTemporalLoading] = useState(false);
  const [temporalError, setTemporalError] = useState("");

  // Pan-Cancer
  interface PanCancerResponse {
    cancer_types: Array<{ project: string; label: string; total_samples: number; genes: Array<{ gene: string; normal_values: number[]; tumor_values: number[]; p_value: number; log2fc: number; n_normal: number; n_tumor: number; mean_normal: number; mean_tumor: number; }>; }>;
    genes: string[];
    total_cancer_types: number;
  }
  const [panCancerData, setPanCancerData] = useState<PanCancerResponse | null>(null);
  const [panCancerLoading, setPanCancerLoading] = useState(false);
  const [panCancerError, setPanCancerError] = useState("");
  const [panCancerGene, setPanCancerGene] = useState(selectedGenes[0] || "");

  // ── Reset analysis results when expression data changes ──
  const dataFingerprint = data ? `${data.source}|${data.sample_count}|${Object.keys(data.values).length}` : "";
  useEffect(() => {
    setDnbResult(null); setDnbError("");
    setTemporalData(null); setTemporalError("");
  }, [dataFingerprint]);

  // Reset pan-cancer when genes change
  const genesKey = selectedGenes.join(",");
  useEffect(() => {
    setPanCancerData(null); setPanCancerError("");
    setPanCancerGene(selectedGenes[0] || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genesKey]);

  // ── DNB Analysis Runner ──
  const runDnbAnalysis = useCallback(async () => {
    if (!data?.values || !data?.samples?.length) return;
    const labels = data.samples.map(s => normalizeStage(s.stage) || s.sample_type || "unknown");
    setDnbLoading(true); setDnbError("");
    try {
      const res = await fetchDNBAnalysis(data.values, labels);
      if (res.status === "success" && res.data) {
        setDnbResult(res.data);
      } else {
        setDnbError(res.errors?.[0] || "Analysis failed");
      }
    } catch (e) {
      setDnbError(String(e));
    }
    setDnbLoading(false);
  }, [data]);

  // ── Temporal Clustering Runner ──
  const runTemporalAnalysis = useCallback(async () => {
    if (!data?.values || !data?.samples?.length) return;
    const labels = data.samples.map(s => normalizeStage(s.stage) || s.sample_type || "unknown");
    setTemporalLoading(true); setTemporalError("");
    try {
      const res = await fetchTemporalClusters(data.values, labels, 6, 2.0);
      if (res.status === "success" && res.data) {
        setTemporalData(res.data as TemporalClusterData);
      } else {
        setTemporalError(res.errors?.[0] || "Analysis failed");
      }
    } catch (e) {
      setTemporalError(getErrorMessage(e));
    }
    setTemporalLoading(false);
  }, [data]);

  // ── Pan-Cancer Runner ──
  const runPanCancerAnalysis = useCallback(async () => {
    if (!selectedGenes.length) return;
    setPanCancerLoading(true); setPanCancerError("");
    try {
      const resp = await fetchPanCancerExpression(selectedGenes, clinicalProjectIds, activeProject?.id);
      if (resp.status === "success" && resp.data) {
        const pcData = resp.data as PanCancerResponse;
        setPanCancerData(pcData);
        if (pcData.genes.length > 0 && !pcData.genes.includes(panCancerGene.toUpperCase())) {
          setPanCancerGene(pcData.genes[0]);
        }
      } else {
        setPanCancerError(resp.errors?.join("; ") || "Failed to fetch pan-cancer data");
      }
    } catch (err) {
      setPanCancerError(err instanceof Error ? err.message : "Pan-cancer fetch failed");
    }
    setPanCancerLoading(false);
  }, [selectedGenes, clinicalProjectIds, activeProject?.id, panCancerGene]);

  // Initialize data source from project sources
  useEffect(() => {
    if (!dataSource && expressionSources.length > 0) {
      setDataSource(expressionSources[0].type);
    }
  }, [expressionSources, dataSource, setDataSource]);

  // ── Fetch Expression Data ──
  const loadData = useCallback(async () => {
    if (selectedGenes.length === 0) return;
    setLoading(true);
    setError("");
    setWarnings([]);

    try {
      if (dataSource === "custom") {
        // Load from stored custom file attached as a data source
        const customSource = activeProject?.data_sources?.find(
          (ds) => ds.source_type === "custom" && ds.config?.file_id
        );
        if (customSource?.config?.file_id && activeProject) {
          const fileDetail = await fetchProjectFileDetail(
            activeProject.id,
            customSource.config.file_id as string
          );
          if (fileDetail.status === "success" && fileDetail.data?.parsed_data) {
            const pd = fileDetail.data.parsed_data;
            const samples = pd.samples.map((s: string) => ({
              sample_id: s,
              sample_type: "custom",
              stage: "",
              msi_status: "",
              project: customSource.label || "Custom Upload",
            }));
            setData({
              genes: pd.genes,
              samples,
              values: pd.values,
              normalization: "custom",
              source: `Custom: ${fileDetail.data.original_name}`,
              sample_count: pd.samples.length,
            });
            setProvenance(fileDetail.provenance);
            setWarnings([]);
          } else {
            setError("Custom file has no parsed expression data");
          }
        } else {
          setError("No custom data source attached — upload a file in Project Settings");
          setLoading(false);
          return;
        }
      } else {
        // TCGA or GEO — fetch from API
        let response;
        if (dataSource === "tcga") {
          response = await fetchExpression(
            selectedGenes,
            clinicalProjectIds,
            normalization
          );
        } else if (dataSource === "geo") {
          response = await fetchGeoDataset(geoAccession, selectedGenes);
        }

        if (response?.status === "success" && response.data) {
          setData(response.data as ExpressionResult);
          setProvenance(response.provenance);
          setWarnings(response.warnings || []);
        } else if (response) {
          setError(response.errors?.join("; ") || "Failed to fetch data");
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch expression data");
    } finally {
      setLoading(false);
    }
  }, [selectedGenes, dataSource, normalization, geoAccession, clinicalProjectIds, activeProject]);

  // Reload data when filters change
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-load expression data when switching to DNB tab if not loaded yet
  useEffect(() => {
    if (activeTab === "dnb" && !data && !loading && selectedGenes.length > 0) {
      loadData();
    }
  }, [activeTab, data, loading, selectedGenes.length, loadData]);

  // ── Auto-run differential expression after expression data loads ──
  useEffect(() => {
    if (!data || data.samples.length < 6) {
      setDeResults([]);
      setDeResponse(null);
      return;
    }
    // Only run for datasets with both tumor and normal samples
    const groups = data.samples.map(s => s.sample_type || "unknown");
    const hasNormal = groups.some(g => g === "normal");
    const hasTumor = groups.some(g => g === "tumor");
    if (!hasNormal || !hasTumor) {
      setDeResults([]);
      setDeResponse(null);
      return;
    }

    let cancelled = false;
    const runDE = async () => {
      setDeLoading(true);
      setDeError("");
      try {
        const resp = await fetchDifferentialExpression(data.values, groups, "tumor", "normal");
        if (!cancelled) {
          if (resp.status === "success" && resp.data) {
            setDeResults(resp.data.results);
            setDeResponse(resp.data);
            setDeError("");
          } else {
            // Backend returned an error response
            const errMsg = resp.errors?.join("; ") || "Differential expression analysis returned no results";
            console.warn("DE analysis error response:", errMsg);
            setDeResults([]);
            setDeResponse(null);
            setDeError(errMsg);
          }
        }
      } catch (err) {
        console.warn("DE analysis failed:", err);
        if (!cancelled) {
          setDeResults([]);
          setDeResponse(null);
          setDeError(err instanceof Error ? err.message : "Differential expression analysis failed");
        }
      } finally {
        if (!cancelled) setDeLoading(false);
      }
    };
    runDE();
    return () => { cancelled = true; };
  }, [data]);

  // ── Gene List Export from brush ──
  const handleGeneListExport = useCallback((genes: string[]) => {
    setExportedGenes(genes);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(exportedGenes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Computed Values ──
  const filteredData = data ? applyFilters(data, stages, msiFilter) : null;
  const tumorCount = filteredData?.samples.filter((s) => s.sample_type === "tumor").length ?? 0;
  const normalCount = filteredData?.samples.filter((s) => s.sample_type === "normal").length ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-8 max-w-[1400px] mx-auto"
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-kiri-text tracking-tight flex items-center gap-2">
            <span>🧬</span>
            {t("nav.atlas")}
            <InfoTooltip tooltipKey="tooltips.atlas" />
          </h1>
          <p className="text-sm text-kiri-text-muted mt-1">
            {t("atlas.subtitle", "Compare target gene expression across databases and resolutions")}
          </p>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4">
          {selectedGenes.length > 0 && (
            <Stat label={t("mito.genes", "Target Genes")} value={selectedGenes.join(", ")} />
          )}
          {filteredData && (
            <Stat label={t("mito.samples", "Samples")} value={String(filteredData.samples.length)} />
          )}
          {/* Data Source Selector */}
          <div className="bg-kiri-bg/50 border border-kiri-border rounded px-3 py-2 min-w-[140px]">
            <p className="text-[10px] text-kiri-text-dim uppercase tracking-wider">Dataset</p>
            <select
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value)}
              className="w-full text-sm font-mono mt-0.5 bg-transparent text-kiri-text border-none outline-none cursor-pointer appearance-none"
            >
              {expressionSources
                .filter((src) => ["tcga", "geo", "cptac", "scrna", "custom"].includes(src.type))
                .map((src) => (
                  <option key={src.type} value={src.type} className="bg-kiri-surface text-kiri-text">
                    {src.icon} {src.label}{src.detail ? ` — ${src.detail}` : ""}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex gap-1 bg-kiri-surface rounded-xl p-1 mb-6 border border-kiri-border">
        {([
          { key: "expression" as AtlasTab, icon: "🧬", labelKey: "enrichment.tab_expression" },
          { key: "enrichment" as AtlasTab, icon: "🎯", labelKey: "enrichment.tab_enrichment" },
          { key: "dnb" as AtlasTab, icon: "📊", labelKey: "dnb.tab_dnb" },
          { key: "temporal" as AtlasTab, icon: "📈", labelKey: "temporal.title", fallback: "Temporal Clusters" },
          ...(dataSource === "tcga" ? [{ key: "pan-cancer" as AtlasTab, icon: "🌐", labelKey: "atlas.panCancerTab", fallback: "Pan-Cancer" }] : []),
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? "bg-kiri-accent/15 text-kiri-accent border border-kiri-accent/30"
                : "text-kiri-text-muted hover:text-kiri-text hover:bg-kiri-surface-hover border border-transparent"
            }`}
          >
            <span>{tab.icon}</span>
            <span>{t(tab.labelKey, tab.fallback || tab.key)}</span>
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      {activeTab === "enrichment" ? (
        <EnrichmentPanel
          genes={selectedGenes}
          projectId={activeProject?.id}
        />
      ) : activeTab === "dnb" ? (
        <DNBPanel
          expressionMatrix={data?.values ?? null}
          stageLabels={data?.samples?.map(s => normalizeStage(s.stage) || s.sample_type || "unknown") ?? null}
          loading={loading}
          result={dnbResult}
          analysisLoading={dnbLoading}
          analysisError={dnbError}
          onRunAnalysis={runDnbAnalysis}
        />
      ) : activeTab === "temporal" ? (
        <TemporalClusterPanel
          expressionMatrix={data?.values ?? null}
          stageLabels={data?.samples?.map(s => normalizeStage(s.stage) || s.sample_type || "unknown") ?? null}
          loading={loading}
          data={temporalData}
          analysisLoading={temporalLoading}
          analysisError={temporalError}
          onRunAnalysis={runTemporalAnalysis}
        />
      ) : activeTab === "pan-cancer" ? (
        <PanCancerBoxplot
          genes={selectedGenes}
          projectIds={clinicalProjectIds}
          projectId={activeProject?.id}
          data={panCancerData}
          loading={panCancerLoading}
          error={panCancerError}
          selectedGene={panCancerGene}
          onSelectGene={setPanCancerGene}
          onLoadData={runPanCancerAnalysis}
        />
      ) : (
      /* ── Expression Tab: Sidebar + Content ── */
      <div className="flex gap-6">
        {/* Sidebar Filters */}
        <div className="w-60 shrink-0">
          <AtlasFilters
            stages={stages}
            onStagesChange={setStages}
            msiFilter={msiFilter}
            onMsiChange={setMsiFilter}
            normalization={normalization}
            onNormalizationChange={setNormalization}
            sampleCount={filteredData?.samples.length}
            tumorCount={tumorCount}
            normalCount={normalCount}
            heatmapOptions={heatmapOptions}
            onHeatmapOptionsChange={updateHeatmapOptions}
          />

          {/* GEO Cohort Selector (shown when GEO is active) */}
          {dataSource === "geo" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 bg-kiri-surface border border-kiri-border rounded-lg p-3"
            >
              <h3 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider mb-2">
                {t("atlas.geoCohort", "Validation Cohort")}
              </h3>
              <select
                value={geoAccession}
                onChange={(e) => setGeoAccession(e.target.value)}
                className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none"
              >
                <option value="GSE39582">GSE39582 — 585 CRC</option>
                <option value="GSE33113">GSE33113 — 90 Stage II</option>
              </select>
            </motion.div>
          )}

          {/* Custom Source Info (shown when Custom is active) */}
          {dataSource === "custom" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 bg-kiri-surface border border-kiri-border rounded-lg p-3"
            >
              <h3 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider mb-2">
                {t("atlas.customSource", "Custom Data")}
              </h3>
              {(() => {
                const customSrc = activeProject?.data_sources?.find(
                  (ds) => ds.source_type === "custom" && ds.config?.file_id
                );
                if (customSrc) {
                  return (
                    <div className="text-xs text-kiri-text-muted">
                      <p className="flex items-center gap-1">
                        <span className="text-kiri-accent">✓</span>
                        {customSrc.label || t("atlas.fileAttached", "File attached")}
                      </p>
                      <p className="text-[10px] text-kiri-text-dim mt-1">
                        {t("atlas.manageInSettings", "Manage uploads in Project Settings")}
                      </p>
                    </div>
                  );
                }
                return (
                  <p className="text-xs text-kiri-text-muted">
                    {t("atlas.noCustomFile", "No custom file attached. Upload a CSV/TSV file in Project Settings → Files & Uploads.")}
                  </p>
                );
              })()}
            </motion.div>
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Warnings */}
          {warnings.length > 0 && (
            <Card className="border-kiri-warning/30 bg-kiri-warning/5">
              <div className="text-xs text-kiri-warning space-y-1">
                {warnings.map((w, i) => (
                  <p key={i}>⚠️ {w}</p>
                ))}
              </div>
            </Card>
          )}

          {/* Heatmap */}
          {filteredData || loading || error ? (
            <ExpressionHeatmap
              genes={filteredData?.genes || []}
              samples={filteredData?.samples || []}
              values={filteredData?.values || {}}
              normalization={filteredData?.normalization || normalization}
              source={filteredData?.source || dataSource.toUpperCase()}
              provenance={provenance}
              loading={loading}
              error={error}
              options={heatmapOptions}
              deResults={deResults}
              onGeneListExport={handleGeneListExport}
            />
          ) : (
            <Card>
              <div className="text-center py-12 text-kiri-text-muted">
                <p className="text-4xl mb-3">🧬</p>
                <p className="text-sm">
                  {t("atlas.emptyState", "Select genes and a data source to explore expression data")}
                </p>
              </div>
            </Card>
          )}

          {/* Differential Expression Results Table */}
          {deResponse && deResults.length > 0 && !deLoading && (
            <DEResultsTable
              results={deResults}
              groupA={deResponse.group_a}
              groupB={deResponse.group_b}
              nA={deResponse.n_a}
              nB={deResponse.n_b}
              method={deResponse.method}
              correction={deResponse.correction}
            />
          )}
          {deLoading && (
            <Card>
              <div className="text-center py-6 text-kiri-text-muted text-sm">
                ⏳ Running differential expression analysis…
              </div>
            </Card>
          )}
          {deError && !deLoading && (
            <Card className="border-kiri-error/30 bg-kiri-error/5">
              <div className="text-center py-4 text-kiri-error text-sm">
                ⚠️ {deError}
              </div>
            </Card>
          )}

          {/* Supplementary Boxplots for Top Significant Genes */}
          {filteredData && deResults.length > 0 && !deLoading && (
            <GeneBoxplots
              values={filteredData.values}
              samples={filteredData.samples}
              deResults={deResults}
              topN={5}
              provenance={provenance}
            />
          )}

          {/* Exported Gene List (from brush selection) */}
          {exportedGenes.length > 0 && (
            <Card>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider">
                    {t("atlas.selectedGenes", "Selected Genes")} ({exportedGenes.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopy}
                      className="text-[10px] px-2 py-1 rounded bg-kiri-surface border border-kiri-border text-kiri-text-muted hover:text-kiri-accent transition-colors"
                    >
                      {copied ? `✅ ${t("common.copied", "Copied!")}` : `📋 ${t("common.copy", "Copy")}`}
                    </button>
                    <button
                      onClick={() => setExportedGenes([])}
                      className="text-[10px] px-2 py-1 rounded text-kiri-text-dim hover:text-kiri-text"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {exportedGenes.map((gene) => (
                    <span
                      key={gene}
                      className="text-xs font-mono px-2 py-0.5 rounded bg-kiri-accent-glow text-kiri-accent border border-kiri-accent-dim"
                    >
                      {gene}
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Gene Summary Cards */}
          {filteredData && filteredData.genes.length > 0 && (
            <>
              {/* Statistical method annotation */}
              {deResponse && deResults.length > 0 && (
                <div className="text-[10px] text-kiri-text-dim px-1 -mb-1">
                  {t("atlas.statisticalMethod", "Statistical method")}: <span className="text-kiri-text-muted">{deResponse.method}</span>
                  {" | "}
                  {t("atlas.correction", "Correction")}: <span className="text-kiri-text-muted">{deResponse.correction}</span>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredData.genes.map((gene) => {
                  const geneValues = filteredData.values[gene] || [];
                  const tumorValues = geneValues.filter(
                    (_, i) => filteredData.samples[i]?.sample_type === "tumor"
                  );
                  const normalValues = geneValues.filter(
                    (_, i) => filteredData.samples[i]?.sample_type === "normal"
                  );
                  const tumorMean = tumorValues.length
                    ? tumorValues.reduce((a, b) => a + b, 0) / tumorValues.length
                    : 0;
                  const normalMean = normalValues.length
                    ? normalValues.reduce((a, b) => a + b, 0) / normalValues.length
                    : 0;
                  const fc = normalMean > 0 ? tumorMean / normalMean : 0;

                  // Look up DE results for this gene
                  const deResult = deResults.find(r => r.gene === gene);
                  const pVal = deResult?.p_value;
                  const fdr = deResult?.adjusted_p_value;
                  const stars = fdr != null ? pValueToAsterisks(fdr) : "";

                  return (
                    <Card key={gene} title={gene}>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-kiri-text-muted">
                            {t("atlas.tumorMean", "Tumor Mean")}
                          </span>
                          <span className="font-mono text-kiri-error">{tumorMean.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-kiri-text-muted">
                            {t("atlas.normalMean", "Normal Mean")}
                          </span>
                          <span className="font-mono text-kiri-success">{normalMean.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs border-t border-kiri-border pt-1.5">
                          <span className="text-kiri-text-muted">
                            {t("atlas.foldChange", "Fold Change")}
                          </span>
                          <span className={`font-mono font-bold ${fc > 1.5 ? "text-kiri-error" : fc < 0.67 ? "text-kiri-success" : "text-kiri-text"}`}>
                            {fc.toFixed(2)}×
                          </span>
                        </div>
                        {/* P-value & FDR */}
                        {pVal != null && (
                          <div className="flex justify-between text-xs">
                            <span className="text-kiri-text-muted">p-value</span>
                            <span className="font-mono text-kiri-text-muted">
                              {pVal < 0.001 ? pVal.toExponential(2) : pVal.toFixed(4)}
                            </span>
                          </div>
                        )}
                        {fdr != null && (
                          <div className="flex justify-between text-xs">
                            <span className="text-kiri-text-muted">FDR</span>
                            <span className={`font-mono ${fdr < 0.05 ? "text-kiri-accent font-bold" : "text-kiri-text-muted"}`}>
                              {fdr < 0.001 ? fdr.toExponential(2) : fdr.toFixed(4)}
                              {stars && <span className="ml-1 text-amber-400">{stars}</span>}
                            </span>
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
      )}
    </motion.div>
  );
}


/**
 * Apply stage and MSI filters to expression data (client-side filtering).
 */
function applyFilters(
  data: ExpressionResult,
  stages: string[],
  msiFilter: string[],
): ExpressionResult {
  if (stages.length === 0 && msiFilter.length === 0) {
    return data;
  }

  const filteredIndices: number[] = [];
  data.samples.forEach((sample, idx) => {
    const passStage = stages.length === 0 || stages.includes(sample.stage);
    const passMsi = msiFilter.length === 0 || msiFilter.includes(sample.msi_status);
    if (passStage && passMsi) {
      filteredIndices.push(idx);
    }
  });

  const filteredSamples = filteredIndices.map((i) => data.samples[i]);
  const filteredValues: Record<string, number[]> = {};
  for (const gene of data.genes) {
    filteredValues[gene] = filteredIndices.map((i) => data.values[gene]?.[i] ?? 0);
  }

  return {
    ...data,
    samples: filteredSamples,
    values: filteredValues,
    sample_count: filteredSamples.length,
  };
}


/**
 * Normalize AJCC pathologic stage labels for DNB analysis.
 * Collapses substages (e.g., "Stage IIA" → "Stage II") so DNB
 * has meaningful groups for tipping-point detection.
 */
function normalizeStage(stage: string): string {
  if (!stage) return "";
  const s = stage.trim();
  // Collapse common AJCC substages
  if (/^Stage\s+IV/i.test(s)) return "Stage IV";
  if (/^Stage\s+III/i.test(s)) return "Stage III";
  if (/^Stage\s+II/i.test(s)) return "Stage II";
  if (/^Stage\s+I($|[^IV])/i.test(s)) return "Stage I";
  // Pass through anything else (e.g. "Not Reported")
  return s;
}
