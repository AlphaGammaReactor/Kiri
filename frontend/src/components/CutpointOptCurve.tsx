/**
 * Kiri — Cutpoint Optimization Curve Component
 *
 * Visualizes the p-value vs. cutpoint search when using MaxStat.
 * Shows the optimization landscape so the user can see HOW the
 * optimal cutpoint was chosen and assess its robustness.
 *
 * Uses ECharts for the line chart with a vertical marker at the
 * selected optimal cutpoint.
 */

import { useRef, useEffect, useMemo, useCallback } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkPointComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useTranslation } from "react-i18next";
import { useChartLocale } from "../hooks/useChartLocale";
import { useAppDispatch } from "../store";
import { addPanel } from "../store/publicationSlice";
import { addToast } from "../store/errorSlice";
import { getPublicationDataURL } from "../utils/publicationExport";

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkPointComponent,
  CanvasRenderer,
]);

interface CutpointOptCurveProps {
  /** Array of { cutpoint, p_value } objects from the maxstat search */
  data: Array<{ cutpoint: number; p_value: number }>;
  /** The selected optimal cutpoint value */
  optimalCutpoint: number;
  /** The p-value at the optimal cutpoint */
  optimalPValue: number;
  /** Gene symbol for label */
  gene: string;
  /** Dynamic data source label for +Figure publication panels */
  dataSource?: string;
  /** Citation / method label for +Figure publication panels */
  citation?: string;
}

export function CutpointOptCurve({
  data,
  optimalCutpoint,
  optimalPValue,
  gene,
  dataSource,
  citation,
}: CutpointOptCurveProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);
  const { t } = useTranslation();
  const { chartKey, formatPValue } = useChartLocale();
  const dispatch = useAppDispatch();

  const option = useMemo(
    () => ({
      animation: true,
      animationDuration: 600,
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "rgba(20, 20, 28, 0.95)",
        borderColor: "rgba(255,255,255,0.08)",
        textStyle: { color: "#e2e8f0", fontSize: 11 },
        formatter: (params: unknown) => {
          const p = (params as Array<{ value: [number, number] }>)[0];
          if (!p) return "";
          return `${t("clinical.cutpoint.expression_value", "Expression")}: ${p.value[0].toFixed(2)}<br/>${t("clinical.cutpoint.p_value_label", "p-value")}: ${p.value[1] < 0.001 ? "< 0.001" : p.value[1].toFixed(4)}`;
        },
      },
      grid: {
        top: 40,
        right: 20,
        bottom: 50,
        left: 60,
      },
      xAxis: {
        type: "value" as const,
        name: t("clinical.cutpoint.expression_value", "Expression Value"),
        nameLocation: "center" as const,
        nameGap: 30,
        nameTextStyle: { color: "#94a3b8", fontSize: 11 },
        axisLabel: { color: "#94a3b8", fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.04)" } },
      },
      yAxis: {
        type: "value" as const,
        name: t("clinical.cutpoint.neg_log_p", "-log₁₀(p)"),
        nameLocation: "center" as const,
        nameGap: 40,
        nameTextStyle: { color: "#94a3b8", fontSize: 11 },
        axisLabel: { color: "#94a3b8", fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.04)" } },
      },
      series: [
        {
          type: "line" as const,
          smooth: true,
          symbol: "circle",
          symbolSize: 3,
          itemStyle: { color: "#17AB72" },
          lineStyle: { width: 2, color: "#17AB72" },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(23, 171, 114, 0.25)" },
              { offset: 1, color: "rgba(23, 171, 114, 0.02)" },
            ]),
          },
          data: data.map((d) => [d.cutpoint, -Math.log10(Math.max(d.p_value, 1e-10))]),
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: "#f59e0b", width: 1.5, type: "dashed" as const },
            data: [
              {
                xAxis: optimalCutpoint,
                label: {
                  formatter: `${t("clinical.cutpoint.optimal", "Optimal")}: ${optimalCutpoint.toFixed(2)}`,
                  color: "#f59e0b",
                  fontSize: 10,
                  position: "end" as const,
                },
              },
            ],
          },
          markPoint: {
            symbol: "diamond",
            symbolSize: 12,
            itemStyle: { color: "#f59e0b", borderColor: "#fff", borderWidth: 1 },
            data: [
              {
                coord: [
                  optimalCutpoint,
                  -Math.log10(Math.max(optimalPValue, 1e-10)),
                ],
                name: t("clinical.cutpoint.optimal", "Optimal"),
              },
            ],
            label: {
              show: true,
              position: "top" as const,
              formatter: formatPValue(optimalPValue),
              color: "#f59e0b",
              fontSize: 10,
              fontWeight: "bold" as const,
            },
          },
        },
        // Significance threshold line at p = 0.05
        {
          type: "line" as const,
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: "rgba(239, 68, 68, 0.5)", width: 1, type: "dotted" as const },
            data: [
              {
                yAxis: -Math.log10(0.05),
                label: {
                  formatter: "p = 0.05",
                  color: "rgba(239, 68, 68, 0.7)",
                  fontSize: 9,
                  position: "start" as const,
                },
              },
            ],
          },
          data: [],
        },
      ],
    }),
    [data, optimalCutpoint, optimalPValue, t, formatPValue]
  );

  // Initialize chart
  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current, undefined, {
      renderer: "canvas",
    });
    instanceRef.current = chart;
    chart.setOption(option);

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      instanceRef.current = null;
    };
  }, [chartKey, option]); // Re-create on locale change or data change

  // Update options when data changes
  useEffect(() => {
    if (instanceRef.current) {
      instanceRef.current.setOption(option, true);
    }
  }, [option]);

  const handleAddToFigure = useCallback(() => {
    if (!instanceRef.current || !option) return;
    try {
      const dataUrl = getPublicationDataURL(instanceRef.current, option as Record<string, unknown>);
      const panelTitle = `MaxStat Optimization: ${gene}`;
      dispatch(
        addPanel({
          sourceModule: "clinical",
          type: "png",
          data: dataUrl,
          title: panelTitle,
          legend: `Method: MaxStat Optimization | Gene: ${gene}`,
          dataSource: dataSource || "TCGA (GDC)",
          citation: citation || `MaxStat cutpoint optimization for ${gene} expression vs. survival`,
        })
      );
      dispatch(addToast({
        type: "success",
        title: t("export.figure_added", '"{{name}}" added to Publication Engine', { name: panelTitle }),
        message: "Cutpoint optimization curve exported successfully.",
        duration: 3000,
      }));
    } catch (err) {
      console.error("Failed to export figure:", err);
      dispatch(addToast({ message: "Failed to export figure", type: "error", duration: 5000 }));
    }
  }, [dispatch, gene, t, dataSource, citation, option]);

  if (!data || data.length === 0) {
    return null;
  }

  return (
    <div className="bg-kiri-surface border border-kiri-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-kiri-text flex items-center gap-2">
          <span className="text-base">📈</span>
          {t("clinical.cutpoint.optimization_title", "Cutpoint Optimization Curve")}
          <span className="text-xs font-mono font-normal text-kiri-accent px-1.5 py-0.5 rounded border border-kiri-accent/30 bg-kiri-accent/10">
            {gene}
          </span>
        </h4>
        <div className="flex items-center gap-2">
          <div className="text-xs text-kiri-text-dim">
            {t("clinical.cutpoint.method_label", "Method")}: MaxStat
          </div>
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
      <div ref={chartRef} className="w-full h-48" />
      <p className="text-[10px] text-kiri-text-dim mt-2">
        {t(
          "clinical.cutpoint.optimization_desc",
          "Higher -log₁₀(p) values indicate stronger separation between High and Low expression groups. The diamond marks the optimal cutpoint."
        )}
      </p>
    </div>
  );
}
