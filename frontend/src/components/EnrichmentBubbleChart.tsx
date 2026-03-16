/**
 * Kiri — Enrichment Bubble Chart Component
 *
 * Bubble chart visualization for enrichment results.
 * X-axis: Gene Ratio (overlap / term size)
 * Y-axis: Term name
 * Size: Gene count (number of overlapping genes)
 * Color: -log₁₀(adjusted p-value)
 *
 * Inspired by clusterProfiler dotplot but with interactive hover.
 */

import { useMemo, useRef, useEffect, useCallback } from "react";
import * as echarts from "echarts/core";
import { ScatterChart } from "echarts/charts";
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

echarts.use([ScatterChart, GridComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

interface EnrichmentTerm {
  term: string;
  p_value: number;
  adjusted_p_value: number;
  overlap?: string;
  genes?: string[];
}

interface EnrichmentBubbleChartProps {
  terms: EnrichmentTerm[];
  libraryLabel: string;
}

export function EnrichmentBubbleChart({ terms, libraryLabel }: EnrichmentBubbleChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);
  const { t } = useTranslation();
  const { chartKey } = useChartLocale();
  const dispatch = useAppDispatch();

  const option = useMemo(() => {
    if (!terms || terms.length === 0) return null;

    const sorted = [...terms].reverse(); // Bottom-to-top
    const maxGenes = Math.max(...sorted.map((t) => t.genes?.length ?? 1), 1);

    // Parse overlap string "3/150" to compute gene ratio
    const parseRatio = (overlap: string | undefined, geneCount: number): number => {
      if (overlap && overlap.includes("/")) {
        const [num, den] = overlap.split("/").map(Number);
        if (den > 0) return num / den;
      }
      return geneCount / 100; // Fallback
    };

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item" as const,
        backgroundColor: "rgba(20, 20, 28, 0.96)",
        borderColor: "rgba(255,255,255,0.06)",
        textStyle: { color: "#e2e8f0", fontSize: 11 },
        formatter: (params: { data: number[] }) => {
          const [ratio, , geneCount, , adjP] = params.data;
          const term = sorted[Math.round(params.data[1])]?.term || "";
          return `<div style="max-width:320px"><strong>${term}</strong><br/>` +
            `${t("chart.axes.gene_ratio", "Gene Ratio")}: ${ratio.toFixed(3)}<br/>` +
            `${t("chart.axes.p_adjust", "Adj. p")}: ${adjP < 0.001 ? adjP.toExponential(2) : adjP.toFixed(4)}<br/>` +
            `${t("chart.axes.count", "Count")}: ${geneCount}</div>`;
        },
      },
      grid: { left: "38%", right: "14%", top: "6%", bottom: "15%" },
      xAxis: {
        type: "value" as const,
        name: t("chart.axes.gene_ratio", "Gene Ratio"),
        nameLocation: "center" as const,
        nameGap: 28,
        nameTextStyle: { color: "#94a3b8", fontSize: 11 },
        axisLabel: { color: "#94a3b8", fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.04)" } },
      },
      yAxis: {
        type: "category" as const,
        data: sorted.map((t) => {
          const name = t.term.replace(/\(GO:\d+\)/, "").trim();
          return name.length > 40 ? name.slice(0, 37) + "..." : name;
        }),
        axisLabel: { color: "#e2e8f0", fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      visualMap: {
        show: true,
        type: "continuous" as const,
        min: 0,
        max: Math.max(...sorted.map((t) => -Math.log10(Math.max(t.adjusted_p_value, 1e-20)))),
        text: [t("chart.axes.p_adjust", "Adj. p (low)"), t("chart.axes.p_adjust", "(high)")],
        textStyle: { color: "#94a3b8", fontSize: 9 },
        inRange: {
          color: ["#1e40af", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#dbeafe"],
        },
        dimension: 4,
        right: 0,
        top: "center",
        itemWidth: 12,
        itemHeight: 80,
      },
      series: [
        {
          type: "scatter" as const,
          symbolSize: (val: number[]) => Math.max(8, Math.min(32, (val[2] / maxGenes) * 32)),
          data: sorted.map((term, idx) => {
            const geneCount = term.genes?.length ?? 0;
            const ratio = parseRatio(term.overlap, geneCount);
            const negLogP = -Math.log10(Math.max(term.adjusted_p_value, 1e-20));
            return [ratio, idx, geneCount, term.term, negLogP, term.adjusted_p_value];
          }),
        },
      ],
    };
  }, [terms, t]);

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

    const title = t("enrichment.bubble_title", "Enrichment Bubble Chart") + ` — ${libraryLabel}`;

    dispatch(addPanel({
      sourceModule: "atlas",
      type: "png",
      data: dataUrl,
      title,
      legend: `Method: Over-Representation Analysis | Library: ${libraryLabel}`,
      dataSource: "gseapy",
      citation: "Fang et al. (2023) Bioinformatics",
    }));

    dispatch(addToast({
      type: "success",
      title: t('export.figure_added', '"{{name}}" added to Publication Engine', { name: title }),
      message: "Enrichment bubble chart exported successfully.",
      duration: 3000,
    }));
  }, [dispatch, t, libraryLabel, option]);

  if (!terms || terms.length === 0) return null;

  return (
    <div className="bg-kiri-surface border border-kiri-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider">
          {t("enrichment.bubble_title", "Enrichment Bubble Chart")} — {libraryLabel}
        </h4>
        <button
          onClick={handleAddToFigure}
          className="text-[10px] text-kiri-accent hover:text-white px-2 py-0.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors flex items-center gap-1"
          title="Add to Publication Engine Cart"
        >
          ＋ Figure
        </button>
      </div>
      <div ref={chartRef} className="w-full" style={{ height: `${Math.max(280, terms.length * 26)}px` }} />
    </div>
  );
}
