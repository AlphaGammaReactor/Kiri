/**
 * Kiri — DNB (Dynamic Network Biomarker) Panel
 *
 * Displays DNB analysis results: composite score timeline, module breakdown,
 * tipping point detection, and per-module component details.
 */

import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, StatusBadge } from "./ui";
import { type DNBResult } from "../services/api";
import { motion, AnimatePresence } from "framer-motion";
import { toPng } from "html-to-image";
import { useAppDispatch } from "../store";
import { addPanel } from "../store/publicationSlice";
import { addToast } from "../store/errorSlice";

interface DNBPanelProps {
  expressionMatrix: Record<string, number[]> | null;
  stageLabels: string[] | null;
  loading?: boolean;
  /** Lifted state from parent — survives tab switches */
  result: DNBResult | null;
  analysisLoading: boolean;
  analysisError: string;
  onRunAnalysis: () => void;
}

const MODULE_ICONS: Record<string, string> = {
  innate_immunity: "🛡️",
  apoptosis: "💀",
  cell_cycle: "🔄",
  dna_repair: "🧬",
  pi3k_akt: "📡",
  mapk: "⚡",
  wnt: "🌀",
  metabolism: "🔥",
};

export function DNBPanel({ expressionMatrix, stageLabels, loading: parentLoading, result, analysisLoading: loading, analysisError: error, onRunAnalysis }: DNBPanelProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const compositeRef = useRef<HTMLDivElement>(null);

  const handleAddToFigure = useCallback(async () => {
    if (!compositeRef.current || !result) return;
    try {
      const dataUrl = await toPng(compositeRef.current, {
        pixelRatio: 3,
        backgroundColor: "#ffffff",
      });
      const panelTitle = `DNB Composite Scores – Tipping Point: ${result.tipping_point || "N/A"}`;
      dispatch(addPanel({
        sourceModule: "atlas",
        type: "png",
        data: dataUrl,
        title: panelTitle,
        legend: `Method: DNB Analysis | Stages: ${result.stages.length} | Modules: ${result.modules.length}`,
        dataSource: "Expression Matrix",
        citation: "Dynamic Network Biomarker (Chen et al., 2012)",
      }));
      dispatch(addToast({
        type: "success",
        title: t("export.figure_added", '"{{name}}" added to Publication Engine', { name: panelTitle }),
        message: "DNB Composite Scores",
        duration: 3000,
      }));
    } catch (err) {
      console.error("Failed to capture DNB figure", err);
    }
  }, [result, dispatch, t]);

  // Expression data is being loaded by the parent
  if (parentLoading) {
    return (
      <Card>
        <div className="text-center py-16 text-kiri-text-muted">
          <div className="w-8 h-8 rounded-full border-2 border-kiri-accent border-r-transparent animate-spin mx-auto mb-3" />
          <p className="text-sm">{t("dnb.loading_expression", "Loading expression data for DNB analysis...")}</p>
        </div>
      </Card>
    );
  }

  // No expression data available
  if (!expressionMatrix || !stageLabels?.length) {
    return (
      <Card>
        <div className="text-center py-16 text-kiri-text-muted space-y-2">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-sm">{t("dnb.needs_data")}</p>
          <p className="text-xs text-kiri-text-dim max-w-md mx-auto">
            {t("dnb.needs_data_hint", "DNB analysis requires expression data with clinical stage annotations. Switch to the Expression tab and load data from a data source first, then return here.")}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Run Button */}
      {!result && !loading && (
        <Card>
          <div className="text-center py-8">
            <p className="text-sm text-kiri-text-muted mb-4">{t("dnb.description")}</p>
            <button
              onClick={onRunAnalysis}
              className="px-6 py-2.5 rounded-lg bg-kiri-accent text-kiri-bg font-semibold text-sm hover:brightness-110 transition"
            >
              🔬 {t("dnb.run_analysis")}
            </button>
            <p className="text-[10px] text-kiri-text-dim mt-3">
              {Object.keys(expressionMatrix).length} {t("dnb.genes_available")} · {stageLabels.length} {t("dnb.samples")}
            </p>
          </div>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <Card>
          <div className="text-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-kiri-accent border-r-transparent animate-spin mx-auto mb-3" />
            <p className="text-sm text-kiri-text-muted">{t("dnb.computing")}</p>
          </div>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="border-kiri-error/30 bg-kiri-error/5">
          <div className="text-center py-8 space-y-2">
            <p className="text-kiri-error text-sm font-medium">❌ {t("dnb.analysis_failed", "DNB Analysis Failed")}</p>
            <p className="text-xs text-kiri-text-dim max-w-lg mx-auto">
              {error.toLowerCase().includes("insufficient") || error.toLowerCase().includes("sample")
                ? t("dnb.error_insufficient_samples", "Not enough samples to compute DNB scores. The analysis requires multiple samples per stage for meaningful variance and correlation calculations. Try using a larger dataset (e.g. full TCGA cohort).")
                : error.toLowerCase().includes("stage") || error.toLowerCase().includes("group")
                ? t("dnb.error_insufficient_stages", "Not enough distinct stage groups found. DNB analysis needs at least 2 different sample stages (e.g. tumor vs. normal, or Stage I vs. Stage II) to detect tipping points.")
                : t("dnb.error_generic", "The analysis could not complete. This may be due to insufficient data variability, too few genes in known modules, or a backend computation error.")}
            </p>
            <p className="text-[10px] text-kiri-text-dim max-w-md mx-auto mt-1 font-mono bg-kiri-bg rounded px-2 py-1 border border-kiri-border">
              {error}
            </p>
            <button
              onClick={onRunAnalysis}
              className="text-xs text-kiri-accent hover:underline mt-2"
            >
              🔄 {t("common.retry")}
            </button>
          </div>
        </Card>
      )}

      {/* Results */}
      {result && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* Tipping Point Banner */}
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-kiri-text">{t("dnb.tipping_point")}</h3>
                <p className="text-xs text-kiri-text-muted mt-0.5">
                  {t("dnb.tipping_desc")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-kiri-accent uppercase">
                  {result.tipping_point || "—"}
                </span>
                <button
                  onClick={onRunAnalysis}
                  className="text-xs text-kiri-text-dim hover:text-kiri-text transition"
                >
                  🔄 {t("dnb.rerun")}
                </button>
              </div>
            </div>
          </Card>

          {/* Composite Score Timeline */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-kiri-text-muted">{t("dnb.composite_scores")}</h3>
              <button
                onClick={() => void handleAddToFigure()}
                className="text-[10px] text-kiri-accent hover:text-white px-2 py-0.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors flex items-center gap-1"
                title="Add to Publication Engine Cart"
              >
                ＋ Figure
              </button>
            </div>
            <div ref={compositeRef} className="flex items-end gap-3 h-32 bg-kiri-bg rounded p-3">
              {result.stages.map((stage) => {
                const score = result.composite_scores[stage] ?? 0;
                const maxScore = Math.max(...Object.values(result.composite_scores), 1);
                const height = Math.max((score / maxScore) * 100, 4);
                const isPeak = stage === result.tipping_point;
                return (
                  <div key={stage} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-mono text-kiri-text-dim">
                      {score.toFixed(1)}
                    </span>
                    <div
                      className={`w-full rounded-t transition-all ${
                        isPeak ? "bg-kiri-accent" : "bg-kiri-surface-hover"
                      }`}
                      style={{ height: `${height}%` }}
                    />
                    <span className={`text-[10px] uppercase font-semibold ${
                      isPeak ? "text-kiri-accent" : "text-kiri-text-dim"
                    }`}>
                      {stage}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Module Breakdown */}
          <Card>
            <h3 className="text-xs font-semibold text-kiri-text-muted mb-3">
              {t("dnb.modules")} ({result.modules.length})
            </h3>
            <div className="space-y-2">
              {result.modules.map((mod) => (
                <div
                  key={mod.name}
                  className={`rounded-lg border transition-all ${
                    mod.is_tipping_point
                      ? "border-kiri-accent/30 bg-kiri-accent/5"
                      : "border-kiri-border bg-kiri-bg"
                  }`}
                >
                  <button
                    onClick={() => setExpandedModule(expandedModule === mod.name ? null : mod.name)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                  >
                    <span className="text-lg">{MODULE_ICONS[mod.name] || "📦"}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-kiri-text capitalize">
                          {mod.name.replace(/_/g, " ")}
                        </span>
                        {mod.is_tipping_point && (
                          <StatusBadge label={t("dnb.tipping")} variant="success" />
                        )}
                      </div>
                      <p className="text-[10px] text-kiri-text-dim">
                        {mod.genes_found} {t("dnb.genes_in_module")} · {t("dnb.peak")}: {mod.peak_stage}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {Object.entries(mod.scores_by_stage).map(([stage, score]) => (
                        <span
                          key={stage}
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                            stage === mod.peak_stage
                              ? "bg-kiri-accent/20 text-kiri-accent font-bold"
                              : "bg-kiri-surface-hover text-kiri-text-dim"
                          }`}
                        >
                          {(score as number).toFixed(1)}
                        </span>
                      ))}
                    </div>
                  </button>

                  {/* Expanded detail */}
                  <AnimatePresence>
                    {expandedModule === mod.name && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-3 space-y-2">
                          <div className="flex flex-wrap gap-1">
                            {mod.genes.map((gene) => (
                              <span
                                key={gene}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-kiri-surface-hover text-kiri-text-muted font-mono"
                              >
                                {gene}
                              </span>
                            ))}
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[10px]">
                            <div>
                              <p className="text-kiri-text-dim font-semibold">SD_i (variance)</p>
                              {Object.entries(mod.components.sd_i).map(([s, v]) => (
                                <p key={s} className="text-kiri-text-muted">{s}: {(v as number).toFixed(3)}</p>
                              ))}
                            </div>
                            <div>
                              <p className="text-kiri-text-dim font-semibold">PCC_i (intra)</p>
                              {Object.entries(mod.components.pcc_i).map(([s, v]) => (
                                <p key={s} className="text-kiri-text-muted">{s}: {(v as number).toFixed(3)}</p>
                              ))}
                            </div>
                            <div>
                              <p className="text-kiri-text-dim font-semibold">PCC_e (inter)</p>
                              {Object.entries(mod.components.pcc_e).map(([s, v]) => (
                                <p key={s} className="text-kiri-text-muted">{s}: {(v as number).toFixed(3)}</p>
                              ))}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
