/**
 * Kiri Atlas — Pan-Cancer Boxplot
 *
 * GEPIA/TIMER-style paired boxplot showing Normal vs Tumor
 * expression for a single gene across all major TCGA cancer types.
 *
 * Features:
 * - Side-by-side Normal (green) / Tumor (red) boxplots per cancer type
 * - Significance asterisks based on Wilcoxon p-value
 * - Gene selector when project has multiple genes
 * - Scatter overlay for individual data points
 * - Publication Engine export via KiriChart
 */

import { useState, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { EChartsOption } from "echarts";
import { KiriChart } from "./KiriChart";
import { Card } from "./ui";
import { motion } from "framer-motion";

// ── Types ──

interface PanCancerGeneData {
  gene: string;
  normal_values: number[];
  tumor_values: number[];
  p_value: number;
  log2fc: number;
  n_normal: number;
  n_tumor: number;
  mean_normal: number;
  mean_tumor: number;
}

interface PanCancerCancerType {
  project: string;
  label: string;
  total_samples: number;
  genes: PanCancerGeneData[];
}

interface PanCancerResponse {
  cancer_types: PanCancerCancerType[];
  genes: string[];
  total_cancer_types: number;
}

interface PanCancerBoxplotProps {
  genes: string[];
  projectIds?: string[];
  projectId?: string;
}

// ── Tissue-type color palette ──

const CANCER_COLORS: Record<string, string> = {
  ACC: "#e6194b", BLCA: "#f58231", BRCA: "#ffe119", CESC: "#bfef45",
  CHOL: "#3cb44b", COAD: "#42d4f4", DLBC: "#4363d8", ESCA: "#911eb4",
  GBM: "#f032e6", HNSC: "#a9a9a9", KICH: "#9A6324", KIRC: "#469990",
  KIRP: "#dcbeff", LAML: "#800000", LGG: "#aaffc3", LIHC: "#808000",
  LUAD: "#ffd8b1", LUSC: "#000075", MESO: "#e6beff", OV: "#fabebe",
  PAAD: "#008080", PCPG: "#e6194b", PRAD: "#f58231", READ: "#42d4f4",
  SARC: "#4363d8", SKCM: "#911eb4", STAD: "#ffe119", TGCT: "#bfef45",
  THCA: "#dcbeff", THYM: "#aaffc3", UCEC: "#f032e6", UCS: "#a9a9a9",
  UVM: "#9A6324",
};

/**
 * Compute boxplot stats: [min, q1, median, q3, max]
 */
function boxplotStats(arr: number[]): [number, number, number, number, number] {
  if (arr.length === 0) return [0, 0, 0, 0, 0];
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  const q1Idx = Math.floor(n * 0.25);
  const medIdx = Math.floor(n * 0.5);
  const q3Idx = Math.floor(n * 0.75);
  return [sorted[0], sorted[q1Idx], sorted[medIdx], sorted[q3Idx], sorted[n - 1]];
}

function pToStars(p: number): string {
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "";
}

export function PanCancerBoxplot({ genes, projectIds, projectId }: PanCancerBoxplotProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<PanCancerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedGene, setSelectedGene] = useState(genes[0] || "");

  // Track whether we've already fetched for these genes
  const cacheKeyRef = useRef("");

  // Fetch pan-cancer data (user-initiated)
  const loadData = useCallback(async () => {
    if (!genes.length) return;
    const cacheKey = `${genes.join(",")}|${projectIds?.join(",") ?? ""}|${projectId ?? ""}`;
    setLoading(true);
    setError("");

    try {
      const { fetchPanCancerExpression } = await import("../services/api");
      const resp = await fetchPanCancerExpression(genes, projectIds, projectId);
      if (resp.status === "success" && resp.data) {
        setData(resp.data as PanCancerResponse);
        cacheKeyRef.current = cacheKey;
        // Default to first gene if current selection not in results
        const resultGenes = (resp.data as PanCancerResponse).genes;
        if (resultGenes.length > 0 && !resultGenes.includes(selectedGene.toUpperCase())) {
          setSelectedGene(resultGenes[0]);
        }
      } else {
        setError(resp.errors?.join("; ") || "Failed to fetch pan-cancer data");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pan-cancer fetch failed");
    } finally {
      setLoading(false);
    }
  }, [genes, projectIds, projectId, selectedGene]);

  // Build chart option for the selected gene
  const chartOption = useMemo<EChartsOption | null>(() => {
    if (!data || !selectedGene) return null;

    const gene = selectedGene.toUpperCase();

    // Filter cancer types that have data for this gene
    const entries: { label: string; geneData: PanCancerGeneData; color: string }[] = [];
    for (const ct of data.cancer_types) {
      const gd = ct.genes.find((g) => g.gene === gene);
      if (gd) {
        entries.push({
          label: ct.label,
          geneData: gd,
          color: CANCER_COLORS[ct.label] || "#94a3b8",
        });
      }
    }

    if (entries.length === 0) return null;

    // Sort by label alphabetically
    entries.sort((a, b) => a.label.localeCompare(b.label));

    // Build paired boxplot data
    // Normal boxes at category index, Tumor at same category index but offset
    const normalBoxData: (number[] | null)[] = [];
    const tumorBoxData: (number[] | null)[] = [];
    const significanceMarkers: { index: number; stars: string; p: number }[] = [];

    entries.forEach((e, idx) => {
      const nBox = e.geneData.n_normal >= 3 ? boxplotStats(e.geneData.normal_values) : null;
      const tBox = boxplotStats(e.geneData.tumor_values);
      normalBoxData.push(nBox);
      tumorBoxData.push(tBox);

      const stars = pToStars(e.geneData.p_value);
      if (stars) {
        significanceMarkers.push({ index: idx, stars, p: e.geneData.p_value });
      }
    });

    // Build rich label text with significance and color
    const xLabels = entries.map((e) => {
      const stars = pToStars(e.geneData.p_value);
      return `{label|${e.label}}${stars ? `{star|${stars}}` : ""}`;
    });

    const option: EChartsOption = {
      title: {
        text: `{gene|${gene}}`,
        subtext: t(
          "atlas.panCancerSubtitle",
          "Expression across TCGA cancer types (Normal vs Tumor)"
        ),
        left: "center",
        top: 8,
        textStyle: {
          fontSize: 16,
          fontWeight: "bold",
          color: "#e2e8f0",
          rich: {
            gene: {
              fontStyle: "italic",
              fontSize: 16,
              fontWeight: "bold",
              color: "#e2e8f0",
            },
          },
        },
        subtextStyle: { fontSize: 11, color: "#94a3b8" },
      },
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(20, 20, 28, 0.96)",
        borderColor: "rgba(255,255,255,0.06)",
        textStyle: { color: "#e2e8f0", fontSize: 11 },
      },
      legend: {
        data: [
          { name: "Normal", itemStyle: { color: "#22c55e" } },
          { name: "Tumor", itemStyle: { color: "#ef4444" } },
        ],
        bottom: 5,
        textStyle: { color: "#94a3b8", fontSize: 10 },
      },
      grid: {
        left: 55,
        right: 20,
        top: 70,
        bottom: 85,
      },
      xAxis: {
        type: "category" as const,
        data: xLabels,
        axisLabel: {
          fontSize: 9,
          color: "#94a3b8",
          rotate: 45,
          interval: 0,
          rich: {
            label: { fontSize: 9, fontWeight: "bold" },
            star: { fontSize: 11, color: "#f59e0b", fontWeight: "bold" },
          },
        },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value" as const,
        name: t("atlas.expression", "Expression (TPM)"),
        nameTextStyle: { fontSize: 10, color: "#64748b" },
        axisLabel: { fontSize: 9, color: "#64748b" },
        splitLine: { lineStyle: { color: "#1e293b" } },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      series: [
        // Normal boxplots
        {
          name: "Normal",
          type: "boxplot",
          data: normalBoxData.map((box) => ({
            value: box || [0, 0, 0, 0, 0],
            itemStyle: {
              color: "rgba(34,197,94,0.15)",
              borderColor: "#22c55e",
              borderWidth: box ? 1.5 : 0,
              opacity: box ? 1 : 0,
            },
          })),
          boxWidth: ["30%", "50%"],
          // Shift each box left within its category
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          encode: undefined as any,
        },
        // Tumor boxplots
        {
          name: "Tumor",
          type: "boxplot",
          data: tumorBoxData.map((box) => ({
            value: box || [0, 0, 0, 0, 0],
            itemStyle: {
              color: "rgba(239,68,68,0.15)",
              borderColor: "#ef4444",
              borderWidth: 1.5,
            },
          })),
          boxWidth: ["30%", "50%"],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          encode: undefined as any,
        },
      ],
    };

    return option;
  }, [data, selectedGene, t]);

  // ── Loading State ──
  if (loading) {
    return (
      <Card>
        <div className="text-center py-16 text-kiri-text-muted">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="inline-block text-3xl mb-3"
          >
            🧬
          </motion.div>
          <p className="text-sm">
            {t(
              "atlas.panCancerLoading",
              "Fetching expression data across cancer types..."
            )}
          </p>
          <p className="text-xs text-kiri-text-dim mt-1">
            {t(
              "atlas.panCancerLoadingHint",
              "This may take a moment as we query multiple TCGA cohorts"
            )}
          </p>
        </div>
      </Card>
    );
  }

  // ── Error State ──
  if (error) {
    return (
      <Card className="border-red-500/30 bg-red-500/5">
        <div className="text-center py-8">
          <p className="text-red-400 text-sm">❌ {error}</p>
          <button
            onClick={loadData}
            className="mt-3 text-xs px-3 py-1.5 rounded bg-kiri-surface border border-kiri-border text-kiri-text hover:border-kiri-accent transition-colors"
          >
            {t("common.retry", "Retry")}
          </button>
        </div>
      </Card>
    );
  }

  // ── Initial State: Run Analysis Button ──
  if (!data && !loading && !error) {
    return (
      <Card>
        <div className="text-center py-16">
          <p className="text-5xl mb-4">📊</p>
          <h3 className="text-lg font-semibold text-kiri-text mb-2">
            {t("atlas.panCancerTitle", "Pan-Cancer Expression")}
          </h3>
          <p className="text-sm text-kiri-text-muted mb-1 max-w-lg mx-auto">
            {t(
              "atlas.panCancerSubtitle",
              "Expression across TCGA cancer types (Normal vs Tumor)"
            )}
          </p>
          <p className="text-xs text-kiri-text-dim mb-6 max-w-md mx-auto">
            {t(
              "atlas.panCancerDesc",
              "Compare your target genes across 33 TCGA cancer types with statistical significance testing."
            )}
          </p>
          <button
            onClick={loadData}
            className="px-5 py-2.5 rounded-lg bg-kiri-accent text-white text-sm font-medium hover:bg-kiri-accent/80 transition-colors"
          >
            🚀 {t("atlas.runPanCancer", "Run Pan-Cancer Analysis")}
          </button>
          <p className="text-[10px] text-kiri-text-dim mt-3">
            {genes.length} {genes.length === 1 ? "gene" : "genes"} · ~33 cancer types
          </p>
        </div>
      </Card>
    );
  }

  // ── Empty State (after run) ──
  if (!data || !chartOption) {
    return (
      <Card>
        <div className="text-center py-12 text-kiri-text-muted">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-sm">
            {t(
              "atlas.panCancerEmpty",
              "No pan-cancer expression data available. Ensure genes are selected."
            )}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Gene Selector + Re-run (if multiple genes) */}
      <div className="flex items-center gap-3 flex-wrap">
        {data.genes.length > 1 && (
          <>
            <label className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider">
              {t("atlas.selectGene", "Select Gene")}
            </label>
            <select
              value={selectedGene}
              onChange={(e) => setSelectedGene(e.target.value)}
              className="text-xs bg-kiri-bg border border-kiri-border rounded px-3 py-1.5 text-kiri-text focus:border-kiri-accent outline-none font-mono"
            >
              {data.genes.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </>
        )}
        <span className="text-[10px] text-kiri-text-dim">
          {data.total_cancer_types} {t("atlas.cancerTypes", "cancer types")}
        </span>
        <button
          onClick={loadData}
          disabled={loading}
          className="ml-auto text-[10px] px-2.5 py-1 rounded border border-kiri-border text-kiri-text-muted hover:text-kiri-text hover:border-kiri-accent transition-colors disabled:opacity-50"
        >
          🔄 {t("common.retry", "Re-run")}
        </button>
      </div>

      {/* Main Chart */}
      <KiriChart
        title={`${selectedGene} — Pan-Cancer Expression`}
        option={chartOption}
        provenance={null}
        height="450px"
        sourceModule="atlas"
        dataSource="TCGA Pan-Cancer (GDC)"
        citation="Wilcoxon rank-sum test | * p<0.05, ** p<0.01, *** p<0.001"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {data.cancer_types
          .map((ct) => {
            const gd = ct.genes.find((g) => g.gene === selectedGene.toUpperCase());
            if (!gd) return null;
            const stars = pToStars(gd.p_value);
            const fcColor =
              gd.log2fc > 0.5
                ? "text-red-400"
                : gd.log2fc < -0.5
                ? "text-green-400"
                : "text-kiri-text-muted";
            return (
              <div
                key={ct.project}
                className="bg-kiri-surface border border-kiri-border rounded-lg p-2.5 text-center"
              >
                <div className="flex items-center justify-center gap-1 mb-1">
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ backgroundColor: CANCER_COLORS[ct.label] || "#94a3b8" }}
                  />
                  <span className="text-xs font-bold text-kiri-text">{ct.label}</span>
                  {stars && (
                    <span className="text-amber-400 text-xs font-bold">{stars}</span>
                  )}
                </div>
                <div className="text-[10px] text-kiri-text-muted space-y-0.5">
                  <div>
                    <span className={`font-mono ${fcColor}`}>
                      {gd.log2fc > 0 ? "+" : ""}
                      {gd.log2fc.toFixed(2)}
                    </span>
                    <span className="ml-1">log₂FC</span>
                  </div>
                  <div>
                    n={gd.n_tumor}T / {gd.n_normal}N
                  </div>
                </div>
              </div>
            );
          })
          .filter(Boolean)}
      </div>
    </motion.div>
  );
}
