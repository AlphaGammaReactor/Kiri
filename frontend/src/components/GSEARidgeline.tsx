/**
 * Kiri — GSEA Ridgeline Plot Component
 *
 * Visualizes GSEA pre-ranked results as a ridgeline (joy) plot.
 * Each row is a gene set term, plotted as a density-like NES bar
 * with color indicating direction (positive = up-regulated pathway,
 * negative = down-regulated).
 *
 * Significant terms (FDR < 0.25) are highlighted with a star.
 */

import { useMemo, useRef, useEffect, useCallback } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
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

echarts.use([BarChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

interface GSEATerm {
  term: string;
  nes: number;
  p_value: number;
  fdr: number;
  lead_genes: string[];
  significant: boolean;
}

interface GSEARidgelineProps {
  terms: GSEATerm[];
  libraryLabel: string;
}

export function GSEARidgeline({ terms, libraryLabel }: GSEARidgelineProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);
  const { t } = useTranslation();
  const { chartKey } = useChartLocale();
  const dispatch = useAppDispatch();

  const option = useMemo(() => {
    if (!terms || terms.length === 0) return null;

    // Sort by NES descending (positive at top, negative at bottom)
    const sorted = [...terms].sort((a, b) => a.nes - b.nes);
    const maxAbsNES = Math.max(...sorted.map((t) => Math.abs(t.nes)), 1);

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        backgroundColor: "rgba(20, 20, 28, 0.96)",
        borderColor: "rgba(255,255,255,0.06)",
        textStyle: { color: "#e2e8f0", fontSize: 11 },
        formatter: (params: Array<{ data: number; name: string; dataIndex: number }>) => {
          const p = params[0];
          if (!p) return "";
          const term = sorted[p.dataIndex];
          const star = term.significant ? " ⭐" : "";
          return `<div style="max-width:350px"><strong>${term.term}${star}</strong><br/>` +
            `NES: ${term.nes.toFixed(3)}<br/>` +
            `FDR: ${term.fdr < 0.001 ? term.fdr.toExponential(2) : term.fdr.toFixed(4)}<br/>` +
            `${t("enrichment.gsea_lead_genes", "Leading Edge")}: ${term.lead_genes.slice(0, 8).join(", ")}` +
            `${term.lead_genes.length > 8 ? "..." : ""}</div>`;
        },
      },
      grid: { left: "35%", right: "8%", top: "5%", bottom: "12%" },
      xAxis: {
        type: "value" as const,
        name: t("chart.axes.nes", "NES"),
        nameLocation: "center" as const,
        nameGap: 28,
        nameTextStyle: { color: "#94a3b8", fontSize: 11 },
        axisLabel: { color: "#94a3b8", fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.04)" } },
        min: -maxAbsNES * 1.1,
        max: maxAbsNES * 1.1,
      },
      yAxis: {
        type: "category" as const,
        data: sorted.map((t) => {
          const name = t.term.replace(/\(GO:\d+\)/, "").trim();
          const star = t.significant ? "★ " : "";
          return star + (name.length > 35 ? name.slice(0, 32) + "..." : name);
        }),
        axisLabel: { color: "#e2e8f0", fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      series: [
        {
          type: "bar" as const,
          barWidth: "60%",
          data: sorted.map((term) => ({
            value: term.nes,
            itemStyle: {
              color: term.nes > 0
                ? term.significant ? "#22d3ee" : "rgba(34, 211, 238, 0.45)"
                : term.significant ? "#f87171" : "rgba(248, 113, 113, 0.45)",
              borderRadius: term.nes > 0 ? [0, 3, 3, 0] : [3, 0, 0, 3],
            },
          })),
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: "#475569", width: 1, type: "dashed" as const },
            data: [{ xAxis: 0 }],
          },
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
    const title = t("enrichment.gsea_ridgeline_title", "GSEA NES Distribution") + ` — ${libraryLabel}`;
    dispatch(addPanel({
      sourceModule: "atlas",
      type: "png",
      data: dataUrl,
      title,
      legend: `Method: Gene Set Enrichment Analysis (GSEA) | Library: ${libraryLabel}`,
      dataSource: "gseapy",
      citation: "Subramanian et al. (2005) PNAS",
    }));
    dispatch(addToast({
      type: "success",
      title: t("export.figure_added", '"{{name}}" added to Publication Engine', { name: title }),
      message: "Figure exported successfully.",
      duration: 3000,
    }));
  }, [dispatch, t, libraryLabel, option]);

  if (!terms || terms.length === 0) return null;

  const sigCount = terms.filter((t) => t.significant).length;

  return (
    <div className="bg-kiri-surface border border-kiri-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider">
          {t("enrichment.gsea_ridgeline_title", "GSEA NES Distribution")} — {libraryLabel}
        </h4>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            {t("enrichment.gsea_upregulated", "Up-regulated")}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            {t("enrichment.gsea_downregulated", "Down-regulated")}
          </span>
          {sigCount > 0 && (
            <span className="text-amber-400">★ {sigCount} FDR &lt; 0.25</span>
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
      <div ref={chartRef} className="w-full" style={{ height: `${Math.max(280, terms.length * 26)}px` }} />
    </div>
  );
}
