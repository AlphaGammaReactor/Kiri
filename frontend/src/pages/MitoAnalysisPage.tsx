/**
 * Kiri — Mitochondrial Analysis Page (Mito Lab)
 *
 * Integrated module for PARL/MAVS mitochondrial function analysis:
 * - Tab 1: Co-Expression — genome-wide Pearson scan + GSEA enrichment
 * - Tab 2: Mito Gene Correlation — scatter plots with regression lines
 * - Tab 3: Mito Function Score — ssGSEA boxplots (high vs low)
 * - Tab 4: Summary — integrated A→B→C narrative
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAppSelector } from "../store";
import { motion, AnimatePresence } from "framer-motion";
import { Card, StatusBadge, Stat, ChartSkeleton } from "../components/ui";
import { CoexpressionGSEAPlot } from "../components/CoexpressionGSEAPlot";
import { MitoScatterPlot } from "../components/MitoScatterPlot";
import { MitoScoreBoxplot } from "../components/MitoScoreBoxplot";
import { MitoSummaryPanel } from "../components/MitoSummaryPanel";
import {
  fetchCoexpression,
  fetchMitoScore,
  getErrorMessage,
  type CoexpressionScanResult,
  type GSEATerm,
  type MitoCorrelation,
  type MitoScoreComparison,
} from "../services/api";
import { useProjectDataSources } from "../hooks/useProjectDataSources";

import type { RootState } from "../store";

type MitoTab = "coexpression" | "mito-corr" | "mito-score" | "summary";

const tabs: { key: MitoTab; labelKey: string; icon: string }[] = [
  { key: "coexpression", labelKey: "mito.tab_coexpression", icon: "🧬" },
  { key: "mito-corr", labelKey: "mito.tab_mito_corr", icon: "📈" },
  { key: "mito-score", labelKey: "mito.tab_mito_score", icon: "⚡" },
  { key: "summary", labelKey: "mito.tab_summary", icon: "📋" },
];

interface CoexpressionData {
  scans: Record<string, CoexpressionScanResult>;
  gsea: Record<string, {
    all_terms: GSEATerm[];
    highlighted_terms: GSEATerm[];
    total_terms: number;
    total_significant: number;
    method: string;
    gene_count: number;
  }>;
  correlations: MitoCorrelation[];
  sampleCount: number;
  source: string;
  coreLabels: Record<string, string>;
}

interface MitoScoreData {
  comparisons: Record<string, MitoScoreComparison>;
  sampleCount: number;
  nGenesUsed: number;
  meanScore: number;
}

function MitoAnalysisPage() {
  const { t } = useTranslation();
  const selectedGenes = useAppSelector((s: RootState) => s.app.selectedGenes);
  const activeProject = useAppSelector((s: RootState) => s.project.activeProject);
  const { clinicalProjectIds: projectIds } = useProjectDataSources();

  const [activeTab, setActiveTab] = useState<MitoTab>("coexpression");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [coexprData, setCoexprData] = useState<CoexpressionData | null>(null);
  const [mitoScoreData, setMitoScoreData] = useState<MitoScoreData | null>(null);

  // Use project proteins directly — no hardcoded fallbacks
  const genes = selectedGenes;

  // Load co-expression data (includes scatter correlations)
  const loadCoexpression = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchCoexpression(
        genes,
        projectIds,
        0.3, 0.05, 200,
        activeProject?.id
      );
      const data = resp.data;
      if (!data) throw new Error("Empty response");
      setCoexprData({
        scans: data.coexpression_scans,
        gsea: data.gsea_results,
        correlations: data.mito_correlations?.correlations ?? [],
        sampleCount: data.sample_count ?? 0,
        source: data.source ?? "TCGA-COAD/READ",
        coreLabels: data.mito_correlations?.core_mito_gene_labels ?? {},
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [genes, activeProject?.id, projectIds]);

  // Load mito score data
  const loadMitoScore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchMitoScore(
        genes,
        projectIds,
        "maxstat",
        activeProject?.id
      );
      const data = resp.data;
      if (!data) throw new Error("Empty response");
      setMitoScoreData({
        comparisons: data.comparisons ?? {},
        sampleCount: data.sample_count ?? 0,
        nGenesUsed: data.mito_scores?.n_genes_used ?? 0,
        meanScore: data.mito_scores?.mean_score ?? 0,
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [genes, activeProject?.id, projectIds]);

  // Load data when tab changes
  useEffect(() => {
    if (activeTab === "coexpression" || activeTab === "mito-corr") {
      if (!coexprData) loadCoexpression();
    } else if (activeTab === "mito-score") {
      if (!mitoScoreData) loadMitoScore();
    } else if (activeTab === "summary") {
      if (!coexprData) loadCoexpression();
      if (!mitoScoreData) loadMitoScore();
    }
  }, [activeTab, coexprData, mitoScoreData, loadCoexpression, loadMitoScore]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-8 max-w-[1400px] mx-auto"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-kiri-text tracking-tight flex items-center gap-2">
            <span>⚡</span>
            {t("mito.title", "Mitochondrial Function Lab")}
          </h1>
          <p className="text-sm text-kiri-text-muted mt-1">
            {t("mito.subtitle_dynamic", "Mitochondrial function analysis")}
          </p>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4">
          {genes.length > 0 && (
            <Stat label={t("mito.genes", "Target Genes")} value={genes.join(", ")} />
          )}
          {coexprData && (
            <Stat label={t("mito.samples", "Samples")} value={String(coexprData.sampleCount)} />
          )}
          <Stat label={t("mito.dataset", "Dataset")} value={projectIds.join("/")} />
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-kiri-surface rounded-xl p-1 mb-6 border border-kiri-border">
        {tabs.map((tab) => (
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
            <span>{t(tab.labelKey, tab.key)}</span>
          </button>
        ))}
      </div>

      {/* Empty state: no protein targets configured */}
      {genes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-16 bg-kiri-surface/50 border border-kiri-border border-dashed rounded-lg">
          <span className="text-5xl mb-4 opacity-50">🧬</span>
          <h3 className="text-lg font-semibold text-kiri-text mb-2">
            {t("mito.empty_title", "No protein targets configured")}
          </h3>
          <p className="text-kiri-text-muted text-sm max-w-md">
            {t("mito.empty_desc", "Add protein targets in Project Settings to begin mitochondrial function analysis.")}
          </p>
        </div>
      ) : (
      <>
      {/* Error display */}
      {error && (
        <Card className="mb-4 border-red-500/30!">
          <div className="flex items-center gap-2 text-sm">
            <StatusBadge label="Error" variant="error" />
            <span className="text-kiri-text-muted">{error}</span>
            <button
              onClick={() => {
                setError(null);
                if (activeTab === "coexpression" || activeTab === "mito-corr") loadCoexpression();
                else if (activeTab === "mito-score") loadMitoScore();
              }}
              className="ml-auto text-xs text-kiri-accent hover:underline"
            >
              {t("common.retry", "Retry")}
            </button>
          </div>
        </Card>
      )}

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {/* Co-Expression Tab */}
          {activeTab === "coexpression" && (
            <div className="space-y-6">
              {loading && !coexprData && (
                <div className="space-y-4">
                  <ChartSkeleton />
                  <ChartSkeleton />
                </div>
              )}

              {coexprData && (
                <>
                  {/* Stats row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {genes.map(gene => {
                      const scan = coexprData.scans?.[gene.toUpperCase()];
                      if (!scan) return null;
                      return (
                        <Card key={gene}>
                          <div className="text-xs text-kiri-text-dim uppercase tracking-wider mb-1">{gene}</div>
                          <div className="text-lg font-bold text-kiri-text">{scan.n_correlated ?? 0}</div>
                          <div className="text-[10px] text-kiri-text-muted">
                            correlated genes (|r| &gt; {scan.r_cutoff ?? 0.3}, p &lt; {scan.p_cutoff ?? 0.05})
                          </div>
                          <div className="text-[10px] text-kiri-text-dim mt-1">
                            {(scan.total_genes_scanned ?? 0).toLocaleString()} genes scanned
                          </div>
                        </Card>
                      );
                    })}
                  </div>

                  {/* GSEA Plots — one per gene */}
                  {genes.map(gene => {
                    const geneUpper = gene.toUpperCase();
                    const gsea = coexprData.gsea[geneUpper];
                    return gsea ? (
                      <CoexpressionGSEAPlot
                        key={gene}
                        terms={gsea.all_terms ?? []}
                        highlightedTerms={gsea.highlighted_terms ?? []}
                        targetGene={geneUpper}
                        totalSignificant={gsea.total_significant ?? 0}
                      />
                    ) : null;
                  })}

                  {/* Top correlated genes table */}
                  {genes.map(gene => {
                    const scan = coexprData.scans?.[gene.toUpperCase()];
                    if (!scan || !scan.correlated_genes?.length) return null;
                    return (
                      <Card key={`table-${gene}`} title={`${gene.toUpperCase()} — Top Correlated Genes`}>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-kiri-border text-kiri-text-dim uppercase tracking-wider">
                                <th className="text-left py-2 px-2">Gene</th>
                                <th className="text-right py-2 px-2">Pearson r</th>
                                <th className="text-right py-2 px-2">p-value</th>
                                <th className="text-left py-2 px-2">Direction</th>
                              </tr>
                            </thead>
                            <tbody>
                              {scan.correlated_genes.slice(0, 20).map((cg, i) => (
                                <tr key={i} className="border-b border-kiri-border/50 hover:bg-kiri-surface-hover">
                                  <td className="py-1.5 px-2 font-mono text-kiri-text">{cg.gene}</td>
                                  <td className={`py-1.5 px-2 text-right font-mono ${(cg.r ?? 0) > 0 ? "text-red-400" : "text-blue-400"}`}>
                                    {(cg.r ?? 0).toFixed(4)}
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono text-kiri-text-muted">
                                    {(cg.p_value ?? 0) < 0.0001 ? (cg.p_value ?? 0).toExponential(2) : (cg.p_value ?? 0).toFixed(4)}
                                  </td>
                                  <td className="py-1.5 px-2">
                                    <StatusBadge
                                      label={cg.direction === "positive" ? "↑ Positive" : "↓ Negative"}
                                      variant={cg.direction === "positive" ? "error" : "info"}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* Mito Gene Correlation Tab */}
          {activeTab === "mito-corr" && (
            <div className="space-y-6">
              {loading && !coexprData && <ChartSkeleton />}

              {coexprData && genes.map(gene => (
                <MitoScatterPlot
                  key={gene}
                  correlations={coexprData.correlations}
                  targetGene={gene.toUpperCase()}
                />
              ))}

              {coexprData && (
                <Card title={t("mito.corr_table_title", "Correlation Summary")}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-kiri-border text-kiri-text-dim uppercase tracking-wider">
                          <th className="text-left py-2 px-2">Target</th>
                          <th className="text-left py-2 px-2">Mito Gene</th>
                          <th className="text-right py-2 px-2">r</th>
                          <th className="text-right py-2 px-2">p-value</th>
                          <th className="text-right py-2 px-2">Significance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {coexprData.correlations.map((c, i) => (
                          <tr key={i} className="border-b border-kiri-border/50 hover:bg-kiri-surface-hover">
                            <td className="py-1.5 px-2 font-mono text-kiri-accent">{c.target_gene}</td>
                            <td className="py-1.5 px-2 font-mono text-kiri-text">
                              {c.mito_gene_display} <span className="text-kiri-text-dim">({c.mito_gene})</span>
                            </td>
                            <td className={`py-1.5 px-2 text-right font-mono ${Math.abs(c.r) > 0.3 ? "text-kiri-accent" : "text-kiri-text-muted"}`}>
                              {c.r.toFixed(4)}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono text-kiri-text-muted">
                              {c.p_value < 0.0001 ? c.p_value.toExponential(2) : c.p_value.toFixed(4)}
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              {c.p_value < 0.001 ? (
                                <StatusBadge label="★★★" variant="success" />
                              ) : c.p_value < 0.01 ? (
                                <StatusBadge label="★★" variant="success" />
                              ) : c.p_value < 0.05 ? (
                                <StatusBadge label="★" variant="warning" />
                              ) : (
                                <StatusBadge label="ns" variant="info" />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Mito Function Score Tab */}
          {activeTab === "mito-score" && (
            <div className="space-y-6">
              {loading && !mitoScoreData && <ChartSkeleton />}

              {mitoScoreData && (
                <>
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <Card>
                      <Stat label={t("mito.genes_used", "MitoCarta Genes Used")} value={String(mitoScoreData.nGenesUsed)} />
                    </Card>
                    <Card>
                      <Stat label={t("mito.mean_score", "Mean Mito Score")} value={(mitoScoreData.meanScore ?? 0).toFixed(3)} />
                    </Card>
                    <Card>
                      <Stat label={t("mito.n_samples", "Total Samples")} value={String(mitoScoreData.sampleCount)} />
                    </Card>
                  </div>

                  {/* Boxplot */}
                  <MitoScoreBoxplot comparisons={mitoScoreData.comparisons} />

                  {/* Per-gene details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(mitoScoreData.comparisons).map(([gene, comp]) => {
                      if (comp.error) {
                        return (
                          <Card key={gene} title={gene}>
                            <div className="text-sm text-kiri-text-dim">{comp.error}</div>
                          </Card>
                        );
                      }
                      return (
                        <Card key={gene} title={`${gene} — Group Comparison`}>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-kiri-text-muted">Cutpoint ({comp.cutpoint_method})</span>
                              <span className="font-mono text-kiri-text">{(comp.cutpoint ?? 0).toFixed(3)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-kiri-text-muted">High group (n={comp.high_group.n})</span>
                              <span className="font-mono text-kiri-text">
                                median = {(comp.high_group?.median ?? 0).toFixed(3)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-kiri-text-muted">Low group (n={comp.low_group.n})</span>
                              <span className="font-mono text-kiri-text">
                                median = {(comp.low_group?.median ?? 0).toFixed(3)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center border-t border-kiri-border pt-2">
                              <span className="text-kiri-text-muted">{comp.test_method}</span>
                              <div className="flex items-center gap-2">
                                <span className={`font-mono font-bold ${comp.significant ? "text-kiri-accent" : "text-kiri-text-dim"}`}>
                                  p = {(comp.p_value ?? 0) < 0.0001 ? (comp.p_value ?? 0).toExponential(2) : (comp.p_value ?? 0).toFixed(4)}
                                </span>
                                {comp.significant && <StatusBadge label="Significant" variant="success" />}
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Summary Tab */}
          {activeTab === "summary" && (
            <div className="space-y-6">
              {(loading && (!coexprData || !mitoScoreData)) && <ChartSkeleton />}

              {coexprData && mitoScoreData && (
                <MitoSummaryPanel
                  correlations={coexprData.correlations}
                  comparisons={mitoScoreData.comparisons}
                  gseaTerms={Object.fromEntries(
                    Object.entries(coexprData.gsea).map(([k, v]) => [k, v.all_terms])
                  )}
                  targetGenes={genes.map(g => g.toUpperCase())}
                />
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      </>
      )}
    </motion.div>
  );
}

export default MitoAnalysisPage;
