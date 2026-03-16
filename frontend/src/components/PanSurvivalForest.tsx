/**
 * Kiri — Pan-Survival Forest Plot
 *
 * Multi-row forest plot showing HR + 95% CI for each gene × each
 * survival metric (OS, DFS, PFS, DSS). Grouped by gene, with
 * metric sub-rows. Extends the existing CoxForestPlot pattern.
 */

import { useMemo, useRef, useEffect, useCallback } from "react";
import * as echarts from "echarts/core";
import { ScatterChart, CustomChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useTranslation } from "react-i18next";
import { useChartLocale } from "../hooks/useChartLocale";
import { useAppDispatch } from "../store";
import { addPanel } from "../store/publicationSlice";
import { addToast } from "../store/errorSlice";
import { getPublicationDataURL } from "../utils/publicationExport";

echarts.use([ScatterChart, CustomChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

interface PanSurvivalResult {
  gene: string;
  metric: string;
  metric_label: string;
  status: string;
  hr: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
  p_value: number | null;
  significant: boolean;
  n_events: number;
  n_total: number;
  concordance?: number;
}

interface GeneSummary {
  risk_direction: string;
  sig_count: number;
  total_metrics: number;
  avg_hr: number | null;
}

interface PanSurvivalForestProps {
  genes: string[];
  results: PanSurvivalResult[];
  summary: Record<string, GeneSummary>;
  metricLabels: Record<string, string>;
  /** Dynamic data source label for +Figure publication panels */
  dataSource?: string;
  /** Citation / method label for +Figure publication panels */
  citation?: string;
}

const METRIC_COLORS: Record<string, string> = {
  OS: "#10b981",   // Emerald
  DFS: "#6366f1",  // Indigo
  PFS: "#f59e0b",  // Amber
  DSS: "#ec4899",  // Pink
};

export function PanSurvivalForest({ genes, results, summary, metricLabels, dataSource, citation }: PanSurvivalForestProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);
  const { t } = useTranslation();
  const { chartKey } = useChartLocale();
  const dispatch = useAppDispatch();

  // Build row labels: gene → metric rows, grouped
  const validResults = useMemo(
    () => results.filter((r) => r.status === "ok" && r.hr != null),
    [results]
  );

  const option = useMemo(() => {
    if (!validResults.length) return null;

    // Build y-axis labels: "GENE - OS", "GENE - DFS", etc.
    const rowLabels = validResults.map(
      (r) => `${r.gene} — ${metricLabels[r.metric] || r.metric}`
    ).reverse();

    const hrData = [...validResults].reverse().map((r) => r.hr!);
    const ciData = [...validResults].reverse().map((r, idx) => [
      idx,
      r.ci_lower!,
      r.ci_upper!,
    ]);

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        backgroundColor: "rgba(20, 20, 28, 0.96)",
        borderColor: "rgba(255,255,255,0.06)",
        textStyle: { color: "#94a3b8", fontSize: 10 },
        formatter: (params: unknown) => {
          if (!Array.isArray(params) || !params.length) return "";
          const idx = validResults.length - 1 - params[0].dataIndex;
          const r = validResults[idx];
          if (!r) return "";
          return `<strong>${r.gene}</strong> — ${r.metric_label}<br/>` +
            `HR: ${r.hr?.toFixed(2)}<br/>` +
            `95% CI: [${r.ci_lower?.toFixed(2)} – ${r.ci_upper?.toFixed(2)}]<br/>` +
            `p = ${r.p_value?.toExponential(2)}<br/>` +
            `Events: ${r.n_events}/${r.n_total}` +
            (r.concordance ? `<br/>C-index: ${r.concordance}` : "");
        },
      },
      grid: { left: "28%", right: "15%", top: 30, bottom: 40 },
      xAxis: {
        type: "log" as const,
        name: t("clinical.cox.hazard_ratio", "Hazard Ratio"),
        nameLocation: "center" as const,
        nameGap: 28,
        logBase: 2,
        axisLabel: { color: "#94a3b8", fontSize: 10 },
        axisLine: { lineStyle: { color: "#475569" } },
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.15)" } },
      },
      yAxis: {
        type: "category" as const,
        data: rowLabels,
        axisLabel: { color: "#94a3b8", fontSize: 10 },
        axisLine: { lineStyle: { color: "#475569" } },
      },
      series: [
        {
          name: "HR",
          type: "scatter" as const,
          data: hrData,
          symbolSize: 10,
          itemStyle: {
            color: (params: { dataIndex: number }) => {
              const idx = validResults.length - 1 - params.dataIndex;
              const r = validResults[idx];
              return r?.significant
                ? (METRIC_COLORS[r.metric] || "#10b981")
                : "#6b7280";
            },
          },
          z: 3,
        },
        {
          name: "95% CI",
          type: "custom" as const,
          renderItem: (_: unknown, api: { value: (i: number) => number; coord: (v: number[]) => number[] }) => {
            const yIndex = api.value(0);
            const low = api.value(1);
            const high = api.value(2);
            const ptLow = api.coord([low, yIndex]);
            const ptHigh = api.coord([high, yIndex]);
            const hw = 4;

            const idx = validResults.length - 1 - yIndex;
            const r = validResults[idx];
            const color = r?.significant
              ? (METRIC_COLORS[r.metric] || "#10b981")
              : "#6b7280";

            return {
              type: "group",
              children: [
                {
                  type: "line",
                  shape: { x1: ptLow[0], y1: ptLow[1], x2: ptHigh[0], y2: ptHigh[1] },
                  style: { stroke: color, lineWidth: 2 },
                },
                {
                  type: "line",
                  shape: { x1: ptLow[0], y1: ptLow[1] - hw, x2: ptLow[0], y2: ptLow[1] + hw },
                  style: { stroke: color, lineWidth: 2 },
                },
                {
                  type: "line",
                  shape: { x1: ptHigh[0], y1: ptHigh[1] - hw, x2: ptHigh[0], y2: ptHigh[1] + hw },
                  style: { stroke: color, lineWidth: 2 },
                },
              ],
            };
          },
          data: ciData,
          z: 2,
        },
        {
          name: "Reference",
          type: "line" as const,
          markLine: {
            symbol: "none",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: [{ xAxis: 1 }] as any,
            lineStyle: { color: "#ef4444", type: "dashed" as const, width: 1.5 },
            label: { show: false },
          },
        },
      ],
    };
  }, [validResults, metricLabels, t]);

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
    const title = t("validation.forest_title", "Pan-Metric Survival Forest Plot");
    dispatch(addPanel({
      sourceModule: "clinical",
      type: "png",
      data: dataUrl,
      title,
      legend: `Method: Multivariate Cox Proportional Hazards | n=${validResults.length} metrics`,
      dataSource: dataSource || "TCGA (GDC)",
      citation: citation || "Therneau (2023) survival",
    }));
    dispatch(addToast({
      type: "success",
      title: t("export.figure_added", '"{{name}}" added to Publication Engine', { name: title }),
      message: "Figure exported successfully.",
      duration: 3000,
    }));
  }, [dispatch, t, validResults.length, dataSource, citation, option]);

  if (!validResults.length) {
    return (
      <div className="text-kiri-text-muted text-sm p-4 text-center">
        {t("validation.no_survival_data", "No survival data available for forest plot.")}
      </div>
    );
  }

  return (
    <div className="bg-kiri-surface border border-kiri-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-kiri-text flex items-center gap-2">
          <span>🌲</span>
          {t("validation.forest_title", "Pan-Metric Survival Forest Plot")}
        </h4>
        <div className="flex items-center gap-2">
          {Object.entries(METRIC_COLORS).map(([metric, color]) => (
            <span key={metric} className="flex items-center gap-1 text-[10px] text-kiri-text-dim">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
              {metricLabels[metric] || metric}
            </span>
          ))}
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

      <div
        ref={chartRef}
        className="w-full"
        style={{ height: `${Math.max(300, validResults.length * 28 + 80)}px` }}
      />

      {/* Gene Summary Cards */}
      <div className="flex flex-wrap gap-3">
        {genes.map((gene) => {
          const s = summary[gene];
          if (!s) return null;
          const dirIcon = s.risk_direction === "risk" ? "🔴" : s.risk_direction === "protective" ? "🟢" : "⚪";
          return (
            <div
              key={gene}
              className="flex items-center gap-2 px-3 py-1.5 bg-kiri-bg rounded-lg border border-kiri-border text-xs"
            >
              <span>{dirIcon}</span>
              <span className="font-semibold text-kiri-text">{gene}</span>
              <span className="text-kiri-text-dim">
                {s.sig_count}/{s.total_metrics} sig
              </span>
              {s.avg_hr && (
                <span className="text-kiri-text-muted">
                  avg HR: {s.avg_hr.toFixed(2)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
