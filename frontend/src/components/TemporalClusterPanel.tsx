/**
 * Kiri — Temporal Cluster Panel Component
 *
 * Visualizes Mfuzz-style temporal clustering results with:
 *   1. Cluster centroid line plots with membership gradients
 *   2. Gene membership heatmap/list per cluster
 *   3. Pattern classification labels (Always Up, Rise→Fall, etc.)
 *
 * Uses ECharts for the multi-series spline line chart.
 */

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useTranslation } from "react-i18next";
import { useChartLocale } from "../hooks/useChartLocale";
import { Card } from "./ui";
import { fetchTemporalClusters, getErrorMessage } from "../services/api";
import { useAppDispatch } from "../store";
import { addPanel } from "../store/publicationSlice";
import { addToast } from "../store/errorSlice";
import { getPublicationDataURL } from "../utils/publicationExport";

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface TemporalCluster {
  id: number;
  label: string;
  centroid: number[];
  centroid_norm: number[];
  centroid_smooth: number[];
  genes: string[];
  gene_count: number;
  memberships: Record<string, number>;
  pattern: string;
}

interface TemporalClusterData {
  stages: string[];
  clusters: TemporalCluster[];
  gene_assignments?: Record<string, { cluster: number; membership: number }>;
  n_genes: number;
}

interface TemporalClusterPanelProps {
  expressionMatrix: Record<string, number[]> | null;
  stageLabels: string[] | null;
  loading?: boolean;
}

const CLUSTER_COLORS = [
  "#22d3ee", "#f472b6", "#a78bfa", "#34d399",
  "#fbbf24", "#f87171", "#60a5fa", "#c084fc",
];

const PATTERN_ICONS: Record<string, string> = {
  early_peak: "📈",
  late_rise: "📊",
  rise_fall: "🔔",
  monotone_up: "⬆️",
  monotone_down: "⬇️",
  fall_rise: "🔄",
  flat: "➡️",
};

export function TemporalClusterPanel({ expressionMatrix, stageLabels, loading: parentLoading }: TemporalClusterPanelProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);
  const { t } = useTranslation();
  const { chartKey } = useChartLocale();
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const dispatch = useAppDispatch();

  const [data, setData] = useState<TemporalClusterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runAnalysis = useCallback(async () => {
    if (!expressionMatrix || !stageLabels?.length) return;
    setLoading(true);
    setError("");
    try {
      // Find optimal number of clusters or just use default 6
      const res = await fetchTemporalClusters(expressionMatrix, stageLabels, 6, 2.0);
      if (res.status === "success" && res.data) {
        setData(res.data);
      } else {
        setError(res.errors?.[0] || "Analysis failed");
      }
    } catch (e) {
      setError(getErrorMessage(e));
    }
    setLoading(false);
  }, [expressionMatrix, stageLabels]);

  const option = useMemo(() => {
    if (!data || !data.clusters.length) return null;

    const { stages, clusters } = data;

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "rgba(20, 20, 28, 0.96)",
        borderColor: "rgba(255,255,255,0.06)",
        textStyle: { color: "#e2e8f0", fontSize: 11 },
      },
      legend: {
        show: true,
        type: "scroll" as const,
        bottom: 0,
        textStyle: { color: "#94a3b8", fontSize: 10 },
        data: clusters.map((c) => `${c.label} (${c.gene_count})`),
      },
      grid: { left: "8%", right: "5%", top: "8%", bottom: "18%" },
      xAxis: {
        type: "category" as const,
        data: stages,
        axisLabel: { color: "#94a3b8", fontSize: 10, rotate: stages.length > 5 ? 30 : 0 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value" as const,
        name: t("temporal.normalized_expression", "Normalized Expression"),
        nameTextStyle: { color: "#94a3b8", fontSize: 10 },
        axisLabel: { color: "#94a3b8", fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.04)" } },
      },
      series: clusters.map((cluster, idx) => ({
        name: `${cluster.label} (${cluster.gene_count})`,
        type: "line" as const,
        smooth: 0.4,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: {
          width: selectedCluster === null || selectedCluster === cluster.id ? 2.5 : 0.8,
          color: CLUSTER_COLORS[idx % CLUSTER_COLORS.length],
          opacity: selectedCluster === null || selectedCluster === cluster.id ? 1 : 0.2,
        },
        itemStyle: {
          color: CLUSTER_COLORS[idx % CLUSTER_COLORS.length],
          opacity: selectedCluster === null || selectedCluster === cluster.id ? 1 : 0.2,
        },
        areaStyle: selectedCluster === cluster.id ? {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: `${CLUSTER_COLORS[idx % CLUSTER_COLORS.length]}33` },
            { offset: 1, color: `${CLUSTER_COLORS[idx % CLUSTER_COLORS.length]}05` },
          ]),
        } : undefined,
        data: cluster.centroid_norm,
        emphasis: { lineStyle: { width: 3 } },
      })),
    };
  }, [data, selectedCluster, t]);

  useEffect(() => {
    if (!chartRef.current || !option) return;

    const chart = echarts.init(chartRef.current, undefined, { renderer: "canvas" });
    instanceRef.current = chart;
    chart.setOption(option);

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(chartRef.current);
    return () => { ro.disconnect(); chart.dispose(); };
  }, [chartKey, option]);

  const handleAddToFigure = useCallback(() => {
    if (!instanceRef.current || !option) return;
    const dataUrl = getPublicationDataURL(instanceRef.current, option as Record<string, unknown>);
    const title = t("temporal.title", "Temporal Expression Clusters");
    dispatch(addPanel({
      sourceModule: "clinical",
      type: "png",
      data: dataUrl,
      title,
      legend: `Method: Fuzzy c-means clustering | n=${data?.n_genes} genes, ${data?.clusters.length} clusters`,
      dataSource: "TCGA (GDC)",
      citation: "Kumar et al. (2007) Mfuzz",
    }));
    dispatch(addToast({
      type: "success",
      title: t("export.figure_added", '"{{name}}" added to Publication Engine', { name: title }),
      message: "Figure exported successfully.",
      duration: 3000,
    }));
  }, [dispatch, t, data, option]);

  // Expression data is being loaded by the parent
  if (parentLoading) {
    return (
      <Card>
        <div className="text-center py-16 text-kiri-text-muted">
          <div className="w-8 h-8 rounded-full border-2 border-kiri-accent border-r-transparent animate-spin mx-auto mb-3" />
          <p className="text-sm">{t("temporal.loading_expression", "Loading expression data...")}</p>
        </div>
      </Card>
    );
  }

  // No expression data available
  if (!expressionMatrix || !stageLabels?.length) {
    return (
      <Card>
        <div className="text-center py-16 text-kiri-text-muted space-y-2">
          <p className="text-4xl mb-3">📈</p>
          <p className="text-sm">{t("temporal.needs_data", "Temporal clustering needs expression data")}</p>
          <p className="text-xs text-kiri-text-dim max-w-md mx-auto">
            {t("temporal.needs_data_hint", "Switch to the Expression tab and load data from a data source first.")}
          </p>
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <div className="text-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-kiri-accent border-r-transparent animate-spin mx-auto mb-3" />
          <p className="text-sm text-kiri-text-muted">{t("temporal.computing", "Computing fuzzy c-means clusters...")}</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-kiri-error/30 bg-kiri-error/5">
        <div className="text-center py-8 space-y-2">
          <p className="text-kiri-error text-sm font-medium">❌ {t("temporal.analysis_failed", "Clustering Failed")}</p>
          <p className="text-[10px] text-kiri-text-dim max-w-md mx-auto mt-1 font-mono bg-kiri-bg rounded px-2 py-1 border border-kiri-border">
            {error}
          </p>
          <button
            onClick={() => { setError(""); void runAnalysis(); }}
            className="text-xs text-kiri-accent hover:underline mt-2"
          >
            🔄 {t("common.retry", "Retry")}
          </button>
        </div>
      </Card>
    );
  }

  if (!data || !data.clusters?.length) {
    return (
      <Card>
        <div className="text-center py-8">
          <p className="text-sm text-kiri-text-muted mb-4">{t("temporal.description", "Group genes by their expression patterns over disease stages.")}</p>
          <button
            onClick={() => void runAnalysis()}
            className="px-6 py-2.5 rounded-lg bg-kiri-accent text-kiri-bg font-semibold text-sm hover:brightness-110 transition"
          >
            📈 {t("temporal.run_analysis", "Run Temporal Clustering")}
          </button>
          <p className="text-[10px] text-kiri-text-dim mt-3">
            {Object.keys(expressionMatrix).length} {t("temporal.genes_available", "genes")} · {stageLabels.length} {t("temporal.samples", "samples")}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Centroid plot */}
      <div className="bg-kiri-surface border border-kiri-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-kiri-text flex items-center gap-2">
            <span>🧬</span>
            {t("temporal.title", "Temporal Expression Clusters")}
            <span className="text-xs font-normal text-kiri-text-dim">
              {data.n_genes} {t("temporal.genes_clustered", "genes")} → {data.clusters.length} {t("temporal.clusters", "clusters")}
            </span>
          </h4>
          <div className="flex items-center gap-2">
            {selectedCluster !== null && (
              <button
                onClick={() => setSelectedCluster(null)}
                className="text-[10px] text-kiri-accent hover:underline"
              >
                {t("temporal.show_all", "Show All")}
              </button>
            )}
            <div className="w-px h-4 bg-kiri-border mx-1" />
            <button
              onClick={handleAddToFigure}
              className="text-[10px] text-kiri-accent hover:text-white px-2 py-0.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors flex items-center gap-1"
              title="Add to Publication Engine Cart"
            >
              ＋ Figure
            </button>
          </div>
        </div>
        <div ref={chartRef} className="w-full h-64" />
      </div>

      {/* Cluster cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {data.clusters.map((cluster, idx) => (
          <button
            key={cluster.id}
            onClick={() => setSelectedCluster(selectedCluster === cluster.id ? null : cluster.id)}
            className={`text-left bg-kiri-surface border rounded-lg p-3 transition-all hover:border-kiri-border-focus ${
              selectedCluster === cluster.id
                ? "border-kiri-accent shadow-lg shadow-kiri-accent/10"
                : "border-kiri-border"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: CLUSTER_COLORS[idx % CLUSTER_COLORS.length] }}
              />
              <span className="text-xs font-semibold text-kiri-text truncate">
                {PATTERN_ICONS[cluster.pattern] || ""} {cluster.label}
              </span>
              <span className="text-[10px] text-kiri-text-dim ml-auto shrink-0">
                {cluster.gene_count} genes
              </span>
            </div>

            {/* Top genes with membership bars */}
            <div className="space-y-1">
              {cluster.genes.slice(0, 4).map((gene) => {
                const membership = cluster.memberships[gene] || 0;
                return (
                  <div key={gene} className="flex items-center gap-2 text-[10px]">
                    <span className="font-mono text-kiri-text-muted w-12 truncate">{gene}</span>
                    <div className="flex-1 h-1.5 bg-kiri-bg rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${membership * 100}%`,
                          backgroundColor: CLUSTER_COLORS[idx % CLUSTER_COLORS.length],
                          opacity: 0.7,
                        }}
                      />
                    </div>
                    <span className="text-kiri-text-dim w-8 text-right">{(membership * 100).toFixed(0)}%</span>
                  </div>
                );
              })}
              {cluster.gene_count > 4 && (
                <p className="text-[9px] text-kiri-text-dim">
                  +{cluster.gene_count - 4} more
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
