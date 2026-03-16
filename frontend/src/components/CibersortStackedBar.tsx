/**
 * Kiri — CIBERSORT Stacked Bar Chart
 *
 * Visualizes immune cell type proportions per sample as a stacked bar chart.
 * Each bar represents one sample, and the stacked segments show the
 * relative proportion of each of the 22 immune cell types (LM22).
 *
 * Matches the output style of the R CIBERSORT reference (01.CIBERSORT_StackedBar.png).
 */

import { useMemo, useRef, useEffect, useCallback } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useTranslation } from "react-i18next";
import { useChartLocale } from "../hooks/useChartLocale";
import { useAppDispatch } from "../store";
import { addPanel } from "../store/publicationSlice";
import { addToast } from "../store/errorSlice";
import { getPublicationDataURL } from "../utils/publicationExport";

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer]);

interface CibersortSample {
  sample_id: string;
  fractions: Record<string, number>;
  p_value?: number;
}

interface CibersortStackedBarProps {
  samples: CibersortSample[];
  cellTypes: string[];
  cellColors: string[];
  method: string;
  /** Dynamic data source label for +Figure publication panels */
  dataSource?: string;
  /** Citation / method label for +Figure publication panels */
  citation?: string;
}

export function CibersortStackedBar({ samples, cellTypes, cellColors, method, dataSource, citation }: CibersortStackedBarProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);
  const { t } = useTranslation();
  const { chartKey } = useChartLocale();
  const dispatch = useAppDispatch();

  const option = useMemo(() => {
    if (!samples.length || !cellTypes.length) return null;

    const sampleIds = samples.map((s) => s.sample_id);

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        backgroundColor: "rgba(20, 20, 28, 0.96)",
        borderColor: "rgba(255,255,255,0.06)",
        textStyle: { color: "#e2e8f0", fontSize: 10 },
        formatter: (params: Array<{ seriesName: string; value: number; color: string; name: string }>) => {
          const header = `<strong>${params[0]?.name || ""}</strong><br/>`;
          const rows = params
            .filter((p) => p.value > 0.001)
            .sort((a, b) => b.value - a.value)
            .map((p) => `<span style="color:${p.color}">●</span> ${p.seriesName}: ${(p.value * 100).toFixed(1)}%`)
            .join("<br/>");
          return header + rows;
        },
      },
      legend: {
        show: true,
        type: "scroll" as const,
        top: 0,
        textStyle: { color: "#94a3b8", fontSize: 9 },
        itemWidth: 10,
        itemHeight: 10,
        data: cellTypes,
      },
      grid: { left: "4%", right: "4%", top: "22%", bottom: "15%" },
      dataZoom: samples.length > 30 ? [
        {
          type: "slider" as const,
          show: true,
          bottom: 0,
          height: 20,
          start: 0,
          end: Math.min(100, (30 / samples.length) * 100),
          textStyle: { color: "#94a3b8" },
        },
      ] : [],
      xAxis: {
        type: "category" as const,
        data: sampleIds,
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#475569" } },
      },
      yAxis: {
        type: "value" as const,
        name: t("immune.relative_percent", "Relative Percent"),
        nameTextStyle: { color: "#94a3b8", fontSize: 10 },
        max: 1,
        axisLabel: {
          color: "#94a3b8",
          fontSize: 10,
          formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
        },
        axisLine: { lineStyle: { color: "#475569" } },
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.15)" } },
      },
      series: cellTypes.map((ct, idx) => ({
        name: ct,
        type: "bar" as const,
        stack: "total",
        barWidth: "95%",
        emphasis: { focus: "series" as const },
        itemStyle: {
          color: cellColors[idx] || `hsl(${(idx * 16) % 360}, 65%, 55%)`,
        },
        data: samples.map((s) => s.fractions[ct] || 0),
      })),
    };
  }, [samples, cellTypes, cellColors, t]);

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
    const title = t("immune.stacked_bar_title", "Immune Cell Composition");
    dispatch(addPanel({
      sourceModule: "clinical",
      type: "png",
      data: dataUrl,
      title,
      legend: `Method: CIBERSORTx Immune Deconvolution | ${method} | n=${samples.length} samples`,
      dataSource: dataSource || "TCGA (GDC)",
      citation: citation || "Newman et al. (2015) Nature Methods",
    }));
    dispatch(addToast({
      type: "success",
      title: t("export.figure_added", '"{{name}}" added to Publication Engine', { name: title }),
      message: "Figure exported successfully.",
      duration: 3000,
    }));
  }, [dispatch, t, method, samples.length, dataSource, citation, option]);

  if (!samples.length) return null;

  return (
    <div className="bg-kiri-surface border border-kiri-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-kiri-text flex items-center gap-2">
          <span>🧫</span>
          {t("immune.stacked_bar_title", "Immune Cell Composition")}
          <span className="text-xs font-normal text-kiri-text-dim">
            {samples.length} {t("immune.samples", "samples")} · {method}
          </span>
        </h4>
        <button
          onClick={handleAddToFigure}
          className="text-[10px] text-kiri-accent hover:text-white px-2 py-0.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors flex items-center gap-1"
          title="Add to Publication Engine Cart"
        >
          ＋ Figure
        </button>
      </div>
      <div ref={chartRef} className="w-full" style={{ height: "380px" }} />
    </div>
  );
}
