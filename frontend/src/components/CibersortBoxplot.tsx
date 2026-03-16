/**
 * Kiri — CIBERSORT Boxplot Component
 *
 * Visualizes the distribution of each immune cell type's proportion
 * across all samples as horizontal box plots.
 *
 * Matches the output style of the R CIBERSORT reference (02.CIBERSORT_Boxplot.png).
 */

import { useMemo, useRef, useEffect, useCallback } from "react";
import * as echarts from "echarts/core";
import { BoxplotChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  DatasetComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useTranslation } from "react-i18next";
import { useChartLocale } from "../hooks/useChartLocale";
import { useAppDispatch } from "../store";
import { addPanel } from "../store/publicationSlice";
import { addToast } from "../store/errorSlice";
import { getPublicationDataURL } from "../utils/publicationExport";

echarts.use([BoxplotChart, GridComponent, TooltipComponent, DatasetComponent, CanvasRenderer]);

interface CibersortSample {
  sample_id: string;
  fractions: Record<string, number>;
}

interface CibersortBoxplotProps {
  samples: CibersortSample[];
  cellTypes: string[];
  cellColors: string[];
  summary: Record<string, { mean: number; median: number; std: number; min: number; max: number }>;
  /** Dynamic data source label for +Figure publication panels */
  dataSource?: string;
  /** Citation / method label for +Figure publication panels */
  citation?: string;
}

export function CibersortBoxplot({ samples, cellTypes, cellColors, summary, dataSource, citation }: CibersortBoxplotProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);
  const { t } = useTranslation();
  const { chartKey } = useChartLocale();
  const dispatch = useAppDispatch();

  const option = useMemo(() => {
    if (!samples.length || !cellTypes.length) return null;

    // Build box data: [min, Q1, median, Q3, max] for each cell type
    const boxData = cellTypes.map((ct) => {
      const vals = samples
        .map((s) => s.fractions[ct] || 0)
        .sort((a, b) => a - b);

      const n = vals.length;
      const q1Idx = Math.floor(n * 0.25);
      const medIdx = Math.floor(n * 0.5);
      const q3Idx = Math.floor(n * 0.75);

      return [
        vals[0],          // min
        vals[q1Idx],      // Q1
        vals[medIdx],     // median
        vals[q3Idx],      // Q3
        vals[n - 1],      // max
      ];
    });

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item" as const,
        backgroundColor: "rgba(20, 20, 28, 0.96)",
        borderColor: "rgba(255,255,255,0.06)",
        textStyle: { color: "#e2e8f0", fontSize: 10 },
        formatter: (params: { name: string; value: number[] }) => {
          if (!params.value) return "";
          const [min, q1, med, q3, max] = params.value;
          const ct = params.name;
          const s = summary[ct];
          return `<strong>${ct}</strong><br/>` +
            `Median: ${(med * 100).toFixed(2)}%<br/>` +
            `Mean: ${s ? (s.mean * 100).toFixed(2) : "?"}%<br/>` +
            `IQR: ${(q1 * 100).toFixed(2)}–${(q3 * 100).toFixed(2)}%<br/>` +
            `Range: ${(min * 100).toFixed(2)}–${(max * 100).toFixed(2)}%`;
        },
      },
      grid: { left: "30%", right: "8%", top: "5%", bottom: "10%" },
      xAxis: {
        type: "value" as const,
        name: t("immune.relative_percent", "Relative Percent"),
        nameLocation: "center" as const,
        nameGap: 28,
        nameTextStyle: { color: "#94a3b8", fontSize: 10 },
        axisLabel: {
          color: "#94a3b8",
          fontSize: 10,
          formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
        },
        axisLine: { lineStyle: { color: "#475569" } },
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.15)" } },
      },
      yAxis: {
        type: "category" as const,
        data: cellTypes,
        axisLabel: { color: "#94a3b8", fontSize: 9 },
        axisLine: { lineStyle: { color: "#475569" } },
      },
      series: [
        {
          name: "Immune Cell Distribution",
          type: "boxplot" as const,
          data: boxData.map((d, idx) => ({
            value: d,
            itemStyle: {
              color: `${cellColors[idx]}33`,
              borderColor: cellColors[idx],
            },
          })),
          boxWidth: ["40%", "70%"],
          itemStyle: { borderWidth: 1.5 },
        },
      ],
    };
  }, [samples, cellTypes, cellColors, summary, t]);

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
    const title = t("immune.boxplot_title", "Cell Type Distribution");
    dispatch(addPanel({
      sourceModule: "clinical",
      type: "png",
      data: dataUrl,
      title,
      legend: `Method: CIBERSORTx Immune Deconvolution | n=${samples.length} samples`,
      dataSource: dataSource || "TCGA (GDC)",
      citation: citation || "Newman et al. (2015) Nature Methods",
    }));
    dispatch(addToast({
      type: "success",
      title: t("export.figure_added", '"{{name}}" added to Publication Engine', { name: title }),
      message: "Figure exported successfully.",
      duration: 3000,
    }));
  }, [dispatch, t, samples.length, dataSource, citation, option]);

  if (!samples.length) return null;

  return (
    <div className="bg-kiri-surface border border-kiri-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-kiri-text flex items-center gap-2">
          <span>📦</span>
          {t("immune.boxplot_title", "Cell Type Distribution")}
        </h4>
        <div className="flex items-center gap-3 text-[10px] text-kiri-text-dim">
          <span>{samples.length} {t("immune.samples", "samples")}</span>
          <span>22 {t("immune.cell_types_label", "cell types")}</span>
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
      <div ref={chartRef} className="w-full" style={{ height: `${Math.max(400, cellTypes.length * 24)}px` }} />
    </div>
  );
}
