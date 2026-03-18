import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAppSelector } from "../store";
import type { RootState } from "../store";
import { motion, AnimatePresence } from "framer-motion";
import { usePageState } from "../hooks/usePageState";
import {
  fetchSurvivalAnalysis,
  fetchCoxRegression,
  fetchSynergyScore
} from "../services/api";

import { KaplanMeierPlot } from "../components/KaplanMeierPlot";
import { CoxForestPlot } from "../components/CoxForestPlot";
import { SynergyPanel } from "../components/SynergyPanel";
import { CutpointSelector } from "../components/CutpointSelector";
import { CutpointOptCurve } from "../components/CutpointOptCurve";
// Components ready for data integration:
import { CibersortStackedBar } from "../components/CibersortStackedBar";
import { CibersortBoxplot } from "../components/CibersortBoxplot";
import { PanSurvivalForest } from "../components/PanSurvivalForest";
import { fetchImmuneDeconvolution, fetchPanSurvival } from "../services/api";
import { ProvenanceFooter, InfoTooltip, Stat } from "../components/ui";
import { useProjectDataSources } from "../hooks/useProjectDataSources";

type Tab = "survival" | "cox" | "synergy" | "immune" | "pan_survival";

export default function ClinicalSuite() {
  const { t } = useTranslation();
  const activeGenes = useAppSelector((s: RootState) => s.app.selectedGenes);
  
  // Use dynamic project IDs from project data sources
  const { clinicalProjectIds: projectIds, expressionSources } = useProjectDataSources();

  const [dataSource, setDataSource] = useState("tcga");

  // ── Persisted UI State ──
  const [uiState, setUiState] = usePageState<{
    activeTab: Tab;
    survivalGene: string;
    synergyGeneA: string;
    synergyGeneB: string;
    cutpointMethod: any;
    customCutpoint?: number;
  }>("clinical", {
    activeTab: "survival",
    survivalGene: "",
    synergyGeneA: "",
    synergyGeneB: "",
    cutpointMethod: "maxstat",
    customCutpoint: undefined,
  });

  const { activeTab, survivalGene, synergyGeneA, synergyGeneB, cutpointMethod, customCutpoint } = uiState;

  const setActiveTab = useCallback((val: Tab) => setUiState((s) => ({ ...s, activeTab: val })), [setUiState]);
  const setSurvivalGene = useCallback((val: string) => setUiState((s) => ({ ...s, survivalGene: val })), [setUiState]);
  const setSynergyGeneA = useCallback((val: string) => setUiState((s) => ({ ...s, synergyGeneA: val })), [setUiState]);
  const setSynergyGeneB = useCallback((val: string) => setUiState((s) => ({ ...s, synergyGeneB: val })), [setUiState]);
  const setCutpointMethod = useCallback((val: any) => setUiState((s) => ({ ...s, cutpointMethod: val })), [setUiState]);
  const setCustomCutpoint = useCallback((val?: number) => setUiState((s) => ({ ...s, customCutpoint: val })), [setUiState]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [survivalData, setSurvivalData] = useState<any>(null);

  // Cox state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [coxData, setCoxData] = useState<any>(null);

  // Synergy state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [synergyData, setSynergyData] = useState<any | null>(null);
  
  // New tabs state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [immuneData, setImmuneData] = useState<any | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [panSurvivalData, setPanSurvivalData] = useState<any | null>(null);

  // Keep track of parameters used to fetch cached data so we know when to refetch
  const [lastImmuneProjectIds, setLastImmuneProjectIds] = useState<string>("");
  const [lastPanSurvivalParams, setLastPanSurvivalParams] = useState<string>("");

  // ── Handlers ── // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [provenance, setProvenance] = useState<any>(null);

  // Initialize gene selectors when project genes change
  useEffect(() => {
    if (activeGenes.length > 0) {
      if (!survivalGene || !activeGenes.includes(survivalGene)) {
        setSurvivalGene(activeGenes[0]);
      }
      if (!synergyGeneA || !activeGenes.includes(synergyGeneA)) {
        setSynergyGeneA(activeGenes[0]);
      }
      if (activeGenes.length > 1 && (!synergyGeneB || !activeGenes.includes(synergyGeneB))) {
        setSynergyGeneB(activeGenes[1]);
      }
    }
  }, [activeGenes, survivalGene, synergyGeneA, synergyGeneB]);

  const doLoad = useCallback(async () => {
    if (activeGenes.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      if (activeTab === "survival") {
        if (!survivalGene) return;
        const res = await fetchSurvivalAnalysis([survivalGene], projectIds, cutpointMethod, customCutpoint);
        if (res.status === "error") throw new Error(res.errors[0]);
        setSurvivalData(res.data);
        setProvenance(res.provenance);
      } else if (activeTab === "cox") {
        const res = await fetchCoxRegression(activeGenes, ["stage"], projectIds);
        if (res.status === "error") throw new Error(res.errors[0]);
        setCoxData(res.data);
        setProvenance(res.provenance);
      } else if (activeTab === "synergy") {
        if (!synergyGeneA || !synergyGeneB || synergyGeneA === synergyGeneB) return;
        const res = await fetchSynergyScore(synergyGeneA, synergyGeneB, projectIds, cutpointMethod === "custom" ? "median" : cutpointMethod);
        if (res.status === "error") throw new Error(res.errors[0]);
        setSynergyData(res.data);
        setProvenance(res.provenance);
      } else if (activeTab === "immune") {
        const currentParams = JSON.stringify(projectIds);
        if (!immuneData || lastImmuneProjectIds !== currentParams) {
          const res = await fetchImmuneDeconvolution(null, projectIds, "cibersort", undefined, 100);
          if (res.status === "success" && res.data) {
            setImmuneData(res.data);
            setProvenance(res.provenance);
            setLastImmuneProjectIds(currentParams);
          } else {
            setError(res.errors?.join("; ") || "Failed to run immune deconvolution");
          }
        }
      } else if (activeTab === "pan_survival") {
        const currentParams = JSON.stringify({ activeGenes, projectIds });
        if (!panSurvivalData || lastPanSurvivalParams !== currentParams) {
          const res = await fetchPanSurvival(activeGenes, null, null, projectIds);
          if (res.status === "success" && res.data) {
            setPanSurvivalData(res.data);
            setProvenance(res.provenance);
            setLastPanSurvivalParams(currentParams);
          } else {
            setError(res.errors?.join("; ") || "Failed to run pan-survival analysis");
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      // Intentionally not clearing data here so that previous data remains visible while errored,
      // or clear it if that's the desired behavior. But the infinite loop isn't caused by this catch block.
      // We will clear them to match previous behavior but won't trigger infinite loop because they aren't deps anymore.
      setSurvivalData(null);
      setCoxData(null);
      setSynergyData(null);
      setImmuneData(null);
      setPanSurvivalData(null);
      setProvenance(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeGenes,
    survivalGene,
    synergyGeneA,
    synergyGeneB,
    activeTab,
    projectIds,
    cutpointMethod,
    customCutpoint,
  ]);
  // Removed data objects from the dependency array to prevent infinite fetch loops

  useEffect(() => {
    doLoad();
  }, [doLoad]);

  /** Compact gene selector pill */
  const GeneSelector = ({ value, onChange, exclude, label }: {
    value: string;
    onChange: (v: string) => void;
    exclude?: string;
    label: string;
  }) => (
    <div className="flex items-center gap-2">
      <span className="text-xs text-kiri-text-dim uppercase tracking-wider">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs font-mono px-3 py-1.5 rounded border border-kiri-border bg-kiri-surface text-kiri-accent focus:border-kiri-accent outline-none transition-colors"
      >
        {activeGenes.filter(g => g !== exclude).map(gene => (
          <option key={gene} value={gene}>{gene}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-kiri-text tracking-tight flex items-center gap-2">
            {t("nav.clinical")}
            <InfoTooltip tooltipKey="tooltips.clinical" />
          </h1>
          <p className="text-sm text-kiri-text-muted mt-1">
            {t("clinical.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {activeGenes.length > 0 && (
            <Stat label="Target Genes" value={activeGenes.join(", ")} />
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

      {/* Tab Bar */}
      <div className="flex gap-1 bg-kiri-surface rounded-xl p-1 mb-6 border border-kiri-border">
        {(["survival", "cox", "synergy", "immune", "pan_survival"] as Tab[]).map((tabId) => (
          <button
            key={tabId}
            onClick={() => setActiveTab(tabId)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tabId
                ? "bg-kiri-accent/15 text-kiri-accent border border-kiri-accent/30"
                : "text-kiri-text-muted hover:text-kiri-text hover:bg-kiri-surface-hover border border-transparent"
            }`}
          >
            {t(`clinical.tabs.${tabId}`)}
          </button>
        ))}
      </div>
      {/* Tab labels i18n fallbacks for new tabs */}
      {/* immune → "Immune Infiltration", pan_survival → "Pan-Survival" */}

      {/* ── Main Content ── */}
      <div className="space-y-6">
        {activeGenes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-kiri-surface/50 border border-kiri-border border-dashed rounded-lg">
            <span className="text-4xl mb-4 opacity-50">🧬</span>
            <p className="text-kiri-text-muted mb-6">
              {t("clinical.empty_state")}
            </p>
          </div>
        ) : (
          <>
            {/* Controls row — gene selectors + cutpoint */}
            <div className="flex items-center gap-6 flex-wrap">
              {/* Gene selector for survival tab */}
              {activeTab === "survival" && (
                <GeneSelector
                  value={survivalGene}
                  onChange={setSurvivalGene}
                  label={t("clinical.gene_label", "Gene")}
                />
              )}

              {/* Gene pair selectors for synergy tab */}
              {activeTab === "synergy" && activeGenes.length >= 2 && (
                <>
                  <GeneSelector
                    value={synergyGeneA}
                    onChange={setSynergyGeneA}
                    exclude={synergyGeneB}
                    label={t("clinical.gene_a_label", "Gene A")}
                  />
                  <span className="text-kiri-text-dim text-xs">×</span>
                  <GeneSelector
                    value={synergyGeneB}
                    onChange={setSynergyGeneB}
                    exclude={synergyGeneA}
                    label={t("clinical.gene_b_label", "Gene B")}
                  />
                </>
              )}

              {/* Cutpoint selector (survival + synergy only) */}
              {(activeTab === "survival" || activeTab === "synergy") && (
                <CutpointSelector
                  value={cutpointMethod}
                  onChange={setCutpointMethod}
                  customValue={customCutpoint}
                  onCustomValueChange={setCustomCutpoint}
                />
              )}
            </div>

            {/* Synergy requires 2+ genes */}
            {activeTab === "synergy" && activeGenes.length < 2 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-kiri-surface/50 border border-kiri-border border-dashed rounded-lg">
                <span className="text-4xl mb-4 opacity-50">🔬</span>
                <p className="text-kiri-text-muted">
                  {t("clinical.synergy.needs_two_genes", "Synergy analysis requires at least 2 protein targets. Add more proteins in Project Settings.")}
                </p>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="p-4 bg-kiri-error/10 border border-kiri-error/20 text-kiri-error rounded-lg animate-in fade-in">
                <strong>{t("common.error")}:</strong> {error}
              </div>
            )}

            {/* Loading State */}
            {loading && !error && (
              <div className="flex-1 flex items-center justify-center min-h-[400px]">
                <div className="w-8 h-8 rounded-full border-2 border-kiri-accent border-r-transparent animate-spin" />
              </div>
            )}

            {/* Data Views */}
            <AnimatePresence mode="popLayout">
              {!loading && !error && (
                <motion.div
                  key={`${activeTab}-${survivalGene}-${synergyGeneA}-${synergyGeneB}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex-1"
                >
                  {/* Survival Tab */}
                  {activeTab === "survival" && survivalData && (
                    <div className="bg-kiri-surface border border-kiri-border rounded-lg p-6">
                      <div className="mb-6">
                        <h2 className="text-xl font-bold text-kiri-text mb-1 flex items-center gap-3">
                          {t("clinical.km.title")}
                          <span className="text-sm font-mono font-normal text-kiri-accent px-2 py-0.5 rounded border border-kiri-accent/30 bg-kiri-accent/10">
                            {survivalGene}
                          </span>
                          <span className="text-xs font-mono font-normal text-kiri-text-muted px-2 py-0.5 rounded bg-kiri-bg border border-kiri-border">
                            N = {survivalData.curves.reduce((sum: number, c: any) => sum + c.n_samples, 0)}
                          </span>
                        </h2>
                        <div className="text-sm text-kiri-text-muted mt-2">
                          {t("clinical.stratified_by", { method: survivalData.cutpoint_method, value: survivalData.cutpoint_value.toFixed(2) })}
                        </div>
                      </div>
                      <KaplanMeierPlot
                        curves={survivalData.curves}
                        p_value={survivalData.p_value}
                        at_risk_table={survivalData.at_risk_table}
                        dataSource={provenance?.source || projectIds.join(", ") + " (GDC)"}
                        citation={provenance?.method || "Kaplan-Meier, Lifelines"}
                      />
                      {survivalData.cutpoint_search_data && survivalData.cutpoint_search_data.length > 0 && (
                        <div className="mt-4">
                          <CutpointOptCurve
                            data={survivalData.cutpoint_search_data}
                            optimalCutpoint={survivalData.cutpoint_value}
                            optimalPValue={survivalData.p_value}
                            gene={survivalGene}
                            dataSource={provenance?.source || projectIds.join(", ") + " (GDC)"}
                            citation={provenance?.method || "MaxStat cutpoint optimization"}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cox Tab */}
                  {activeTab === "cox" && coxData && (
                    <div className="bg-kiri-surface border border-kiri-border rounded-lg p-6">
                       <div className="mb-6">
                        <h2 className="text-xl font-bold text-kiri-text mb-1 flex items-center gap-3">
                          {t("clinical.cox.title")}
                          <span className="text-xs font-mono font-normal text-kiri-text-muted px-2 py-0.5 rounded bg-kiri-bg border border-kiri-border">
                            N = {coxData.n_samples}
                          </span>
                        </h2>
                        <p className="text-sm text-kiri-text-muted mt-2">
                          {t("clinical.included_covariates", { genes: activeGenes.join(", ") })}
                        </p>
                      </div>
                      <CoxForestPlot 
                        hazardRatios={coxData.hazard_ratios}
                        concordanceIndex={coxData.concordance_index}
                        dataSource={provenance?.source || projectIds.join(", ") + " (GDC)"}
                        citation={provenance?.method || "Cox Proportional Hazards, Lifelines"}
                      />
                    </div>
                  )}

                  {/* Synergy Tab */}
                  {activeTab === "synergy" && synergyData && (
                    <SynergyPanel
                      geneA={synergyData.gene_a}
                      geneB={synergyData.gene_b}
                      interactionPValue={synergyData.interaction_p_value}
                      combinedHr={synergyData.combined_hr}
                      synergyType={synergyData.synergy_type}
                      curves={synergyData.curves}
                      atRiskTable={synergyData.at_risk_table}
                      dataSource={provenance?.source || `${projectIds.join("+")} (n=${synergyData.n_samples || 0})`}
                      citation={provenance?.method || "Gene-Gene Synergy, Lifelines"}
                    />
                  )}

                  {/* Immune Infiltration Tab */}
                  {/* Immune Tab */}
                  {activeTab === "immune" && immuneData && (
                    <div className="space-y-6">
                      <div className="bg-kiri-surface border border-kiri-border rounded-lg p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h2 className="text-xl font-bold text-kiri-text mb-1 flex items-center gap-3">
                              {t("clinical.immune.title", "Immune Infiltration (CIBERSORT)")}
                              <span className="text-xs font-mono font-normal text-kiri-text-muted px-2 py-0.5 rounded bg-kiri-bg border border-kiri-border">
                                N = {immuneData.samples?.length || 0}
                              </span>
                            </h2>
                            <p className="text-xs text-kiri-text-muted">{t("clinical.immune.desc", "Estimated fractions of 22 immune cell types based on LM22 signature.")}</p>
                          </div>
                        </div>
                        <CibersortStackedBar 
                          samples={immuneData.samples}
                          cellTypes={immuneData.cell_types}
                          cellColors={immuneData.cell_colors || []}
                          method={immuneData.method || "CIBERSORT"}
                          dataSource={provenance?.source || projectIds.join(", ") + " (GDC)"}
                          citation={provenance?.method || "CIBERSORTx, Newman et al. (2015)"}
                        />
                      </div>
                      <div className="bg-kiri-surface border border-kiri-border rounded-lg p-6">
                        <CibersortBoxplot 
                          samples={immuneData.samples}
                          cellTypes={immuneData.cell_types}
                          cellColors={immuneData.cell_colors || []}
                          summary={immuneData.summary || {}}
                          dataSource={provenance?.source || projectIds.join(", ") + " (GDC)"}
                          citation={provenance?.method || "CIBERSORTx, Newman et al. (2015)"}
                        />
                      </div>
                    </div>
                  )}

                  {/* Pan-Survival Tab */}
                  {activeTab === "pan_survival" && panSurvivalData && (
                    <div className="bg-kiri-surface border border-kiri-border rounded-lg p-6">
                      <div className="mb-4">
                        <h2 className="text-xl font-bold text-kiri-text mb-1">
                          {t("validation.forest_title", "Pan-Metric Survival Forest Plot")}
                        </h2>
                        <p className="text-sm text-kiri-text-muted mb-4">
                          {t("clinical.pan_survival.desc", "Cox PH across OS, DFS, PFS, DSS for each target gene")}
                        </p>
                      </div>
                      <PanSurvivalForest
                        genes={panSurvivalData.genes || activeGenes}
                        results={panSurvivalData.results || []}
                        summary={panSurvivalData.summary || {}}
                        metricLabels={{ OS: "Overall Survival", DFS: "Disease-Free", PFS: "Progression-Free", DSS: "Disease-Specific" }}
                        dataSource={provenance?.source || projectIds.join(", ") + " (GDC)"}
                        citation={provenance?.method || "Cox Proportional Hazards, Lifelines"}
                      />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Provenance */}
            {provenance && !loading && !error && (
              <div className="mt-8">
                <ProvenanceFooter provenance={provenance} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
