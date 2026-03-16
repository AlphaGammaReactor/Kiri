/**
 * Kiri — Validation Grid Panel
 *
 * Displays multi-cohort validation results as a heatmap-table hybrid.
 * Each cell shows log2FC + significance for a gene × cohort combination.
 * Intersect genes (significant across ALL cohorts) are highlighted.
 */

import { useMemo, useRef, useEffect, useCallback } from "react";
import * as echarts from "echarts/core";
import { HeatmapChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useTranslation } from "react-i18next";
import { useChartLocale } from "../hooks/useChartLocale";
import { useAppDispatch } from "../store";
import { addPanel } from "../store/publicationSlice";
import { addToast } from "../store/errorSlice";
import { getPublicationDataURL } from "../utils/publicationExport";

echarts.use([HeatmapChart, GridComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

interface GridEntry {
  cohort: string;
  status: string;
  log2fc: number | null;
  p_value: number | null;
  p_adjusted?: number | null;
  significant?: boolean;
  test_used?: string;
  mean_a?: number;
  mean_b?: number;
  cohens_d?: number;
  n_a?: number;
  n_b?: number;
}

interface ConcordanceInfo {
  direction: string;
  consistent: boolean;
}

interface ValidationGridPanelProps {
  cohorts: string[];
  genes: string[];
  grid: Record<string, GridEntry[]>;
  intersectGenes: string[];
  concordance: Record<string, ConcordanceInfo>;
}

export function ValidationGridPanel({
  cohorts,
  genes,
  grid,
  intersectGenes,
  concordance,
}: ValidationGridPanelProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);
  const { t } = useTranslation();
  const { chartKey } = useChartLocale();
  const dispatch = useAppDispatch();

  const option = useMemo(() => {
    if (!genes.length || !cohorts.length) return null;

    // Build heatmap data: [cohort_index, gene_index, value]
    const data: number[][] = [];
    genes.forEach((gene, gIdx) => {
      const entries = grid[gene] || [];
      cohorts.forEach((cohort, cIdx) => {
        const entry = entries.find((e) => e.cohort === cohort);
        const fc = entry?.log2fc ?? 0;
        data.push([cIdx, gIdx, fc]);
      });
    });

    return {
      backgroundColor: "transparent",
      tooltip: {
        position: "top" as const,
        backgroundColor: "rgba(20, 20, 28, 0.96)",
        borderColor: "rgba(255,255,255,0.06)",
        textStyle: { color: "#e2e8f0", fontSize: 10 },
        formatter: (params: { value: number[]; name: string }) => {
          const [cIdx, gIdx] = params.value;
          const gene = genes[gIdx];
          const cohort = cohorts[cIdx];
          const entry = (grid[gene] || []).find((e) => e.cohort === cohort);
          if (!entry) return "";

          const sig = entry.significant ? "✅ Significant" : "❌ Not significant";
          const fc = entry.log2fc != null ? entry.log2fc.toFixed(3) : "N/A";
          const pAdj = entry.p_adjusted != null ? entry.p_adjusted.toExponential(2) : "N/A";

          return `<strong>${gene}</strong> in ${cohort}<br/>` +
            `log₂FC: ${fc}<br/>` +
            `Adj. p: ${pAdj}<br/>` +
            `${sig}<br/>` +
            (entry.test_used ? `Test: ${entry.test_used}<br/>` : "") +
            (entry.n_a != null ? `n: ${entry.n_a} vs ${entry.n_b}` : "");
        },
      },
      grid: { left: "12%", right: "15%", top: "8%", bottom: "20%" },
      xAxis: {
        type: "category" as const,
        data: cohorts,
        splitArea: { show: true },
        axisLabel: { color: "#94a3b8", fontSize: 9, rotate: 30 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "category" as const,
        data: genes.map((g) =>
          intersectGenes.includes(g) ? `⭐ ${g}` : g
        ),
        axisLabel: {
          color: (value: string) =>
            value.startsWith("⭐") ? "#fbbf24" : "#e2e8f0",
          fontSize: 11,
          fontWeight: (value: string) =>
            value.startsWith("⭐") ? "bold" : "normal",
        },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      visualMap: {
        min: -4,
        max: 4,
        calculable: true,
        orient: "vertical" as const,
        right: "2%",
        top: "center",
        text: ["Up", "Down"],
        textStyle: { color: "#94a3b8", fontSize: 9 },
        inRange: {
          color: ["#3b82f6", "#1e293b", "#ef4444"],
        },
      },
      series: [
        {
          name: "log₂FC",
          type: "heatmap" as const,
          data,
          label: {
            show: true,
            formatter: (params: { value: number[] }) => {
              const [cIdx, gIdx, fc] = params.value;
              const gene = genes[gIdx];
              const cohort = cohorts[cIdx];
              const entry = (grid[gene] || []).find((e) => e.cohort === cohort);
              if (!entry || entry.log2fc == null) return "—";
              const sig = entry.significant ? "*" : "";
              return `${fc > 0 ? "+" : ""}${fc.toFixed(1)}${sig}`;
            },
            color: "#e2e8f0",
            fontSize: 9,
          },
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.5)" },
          },
        },
      ],
    };
  }, [genes, cohorts, grid, intersectGenes]);

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
    const title = t("validation.grid_title", "Multi-Cohort Validation Grid");
    dispatch(addPanel({
      sourceModule: "atlas",
      type: "png",
      data: dataUrl,
      title,
      legend: `Method: Multi-Cohort Log2FC Heatmap | ${cohorts.length} cohorts × ${genes.length} genes`,
      dataSource: "TCGA (GDC)",
      citation: "GDC Data Portal, NCI",
    }));
    dispatch(addToast({
      type: "success",
      title: t("export.figure_added", '"{{name}}" added to Publication Engine', { name: title }),
      message: "Figure exported successfully.",
      duration: 3000,
    }));
  }, [dispatch, t, cohorts.length, genes.length, option]);

  if (!genes.length) return null;

  return (
    <div className="bg-kiri-surface border border-kiri-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-kiri-text flex items-center gap-2">
          <span>📊</span>
          {t("validation.grid_title", "Multi-Cohort Validation Grid")}
          <span className="text-xs font-normal text-kiri-text-dim">
            {cohorts.length} {t("validation.cohorts", "cohorts")} × {genes.length} {t("validation.genes", "genes")}
          </span>
        </h4>
        <div className="flex items-center gap-3">
          {intersectGenes.length > 0 && (
            <span className="text-xs bg-kiri-warning/10 text-kiri-warning px-2 py-1 rounded-full">
              ⭐ {intersectGenes.length} {t("validation.intersect_genes", "intersect genes")}
            </span>
          )}
          <button
            onClick={handleAddToFigure}
            className="text-[10px] text-kiri-accent hover:text-white px-2 py-0.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors flex items-center gap-1"
            title="Add to Publication Engine Cart"
          >
            ＋ Figure
          </button>
        </div>
      </div>

      <div ref={chartRef} className="w-full" style={{ height: `${Math.max(300, genes.length * 40 + 80)}px` }} />

      {/* Concordance summary */}
      <div className="flex flex-wrap gap-2">
        {genes.map((gene) => {
          const c = concordance[gene];
          if (!c) return null;
          return (
            <span
              key={gene}
              className={`text-[10px] px-2 py-0.5 rounded-full border ${
                c.consistent
                  ? c.direction === "up"
                    ? "border-kiri-error/30 text-kiri-error bg-kiri-error/5"
                    : "border-kiri-info/30 text-kiri-info bg-kiri-info/5"
                  : "border-kiri-text-muted/30 text-kiri-text-muted bg-kiri-surface-hover"
              }`}
            >
              {gene}: {c.direction === "up" ? "↑" : c.direction === "down" ? "↓" : "↕"} {c.consistent ? t("validation.consistent", "consistent") : t("validation.mixed", "mixed")}
            </span>
          );
        })}
      </div>
    </div>
  );
}
