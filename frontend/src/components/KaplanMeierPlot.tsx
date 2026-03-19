import { useTranslation } from "react-i18next";
import { KiriChart } from "./KiriChart";
import { useMemo, useRef, useCallback } from "react";
import * as echarts from "echarts";
import { useAppDispatch } from "../store";
import { addPanel } from "../store/publicationSlice";
import { addToast } from "../store/errorSlice";

interface SurvivalCurveData {
  group_name: string;
  n_samples: number;
  median_survival: number | null;
  time: number[];
  survival: number[];
  ci_lower: number[];
  ci_upper: number[];
}

interface AtRiskTable {
  time_points: number[];
  groups: Record<string, number[]>;
}

interface KaplanMeierPlotProps {
  curves: SurvivalCurveData[];
  p_value: number;
  at_risk_table: AtRiskTable;
  /** Hazard Ratio (High vs Low) */
  hr?: number | null;
  /** HR 95% CI lower bound */
  hr_ci_lower?: number | null;
  /** HR 95% CI upper bound */
  hr_ci_upper?: number | null;
  /** Dynamic data source label for +Figure publication panels */
  dataSource?: string;
  /** Citation / method label for +Figure publication panels */
  citation?: string;
}

export function KaplanMeierPlot({
  curves,
  p_value,
  at_risk_table,
  hr,
  hr_ci_lower,
  hr_ci_upper,
  dataSource,
  citation,
}: KaplanMeierPlotProps) {
  const { t } = useTranslation();
  const chartRef = useRef<echarts.ECharts | null>(null);
  const dispatch = useAppDispatch();

  // Build stat annotation string
  const statAnnotation = useMemo(() => {
    let txt = `${t("clinical.km.p_value")}: ${p_value < 0.001 ? p_value.toExponential(2) : p_value.toFixed(4)}`;
    if (hr != null && hr_ci_lower != null && hr_ci_upper != null) {
      txt += `   HR = ${hr.toFixed(2)} (95% CI: ${hr_ci_lower.toFixed(2)}\u2013${hr_ci_upper.toFixed(2)})`;
    }
    return txt;
  }, [p_value, hr, hr_ci_lower, hr_ci_upper, t]);

  const option = useMemo(() => {
    // Okabe-Ito colorblind-safe palette
    const colors = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7"];

    const series: echarts.SeriesOption[] = [];
    const legendData: string[] = [];

    curves.forEach((curve, index) => {
      const color = colors[index % colors.length];
      const curveName = `${curve.group_name} (n=${curve.n_samples})`;
      legendData.push(curveName);

      // Step-function survival curve
      const dataStr = curve.time.map((t, i) => [t, curve.survival[i]]);

      series.push({
        name: curveName,
        type: "line",
        step: "end",
        data: dataStr,
        lineStyle: { width: 3, color },
        itemStyle: { color },
        showSymbol: false,
        z: 3,
      });

      // 95% CI band — rendered as a polygon using a custom series
      // Build upper bound going forward and lower bound going backward to form a closed polygon
      if (curve.ci_lower.length > 0 && curve.ci_upper.length > 0) {
        // Upper bound line (invisible, for areaStyle reference)
        const ciLower = curve.time.map((t, i) => [t, curve.ci_lower[i]]);

        // Lower bound (invisible baseline for the band)
        series.push({
          name: `${curveName} CI Lower`,
          type: "line",
          step: "end",
          data: ciLower,
          lineStyle: { width: 0, opacity: 0 },
          symbol: "none",
          stack: `ci-band-${index}`,
          stackStrategy: "all" as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          tooltip: { show: false },
          silent: true,
          z: 1,
        });

        // Upper bound band — stacked on top of lower, filled between
        const ciBandData = curve.time.map((t, i) => [t, curve.ci_upper[i] - curve.ci_lower[i]]);
        series.push({
          name: `${curveName} CI Upper`,
          type: "line",
          step: "end",
          data: ciBandData,
          lineStyle: { width: 0, opacity: 0 },
          symbol: "none",
          stack: `ci-band-${index}`,
          stackStrategy: "all" as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          areaStyle: {
            color: color,
            opacity: 0.15,
          },
          tooltip: { show: false },
          silent: true,
          z: 2,
        });
      }
    });

    // Build x-axis config aligned with at-risk time points
    const xAxisMax = at_risk_table.time_points.length > 0
      ? Math.max(...at_risk_table.time_points)
      : undefined;

    const finalOption: echarts.EChartsOption = {
      title: {
        text: statAnnotation,
        left: "right",
        top: 20,
        textStyle: {
          fontSize: 12,
          fontWeight: "normal",
          fontFamily: "'Inter', 'Arial', system-ui, sans-serif",
          color: "#94a3b8",
        },
      },
      tooltip: {
        trigger: "axis",
        formatter: function (params: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
          const time = params[0].value[0];
          let res = `${t("clinical.km.time_days")}: ${time}<br/>`;
          params.forEach((param: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            if (param.seriesName.includes("CI")) return;
            const val = (param.value[1] * 100).toFixed(1);
            res += `${param.marker}${param.seriesName}: ${val}%<br/>`;
          });
          return res;
        },
      },
      legend: {
        data: legendData,
        bottom: 0,
        textStyle: { color: "#94a3b8", fontSize: 11 },
      },
      grid: {
        top: 60,
        bottom: 60,
        left: 60,
        right: 40,
        containLabel: true,
      },
      xAxis: {
        type: "value",
        name: t("clinical.km.time_days"),
        nameLocation: "middle",
        nameGap: 30,
        min: 0,
        max: xAxisMax,
        splitLine: { show: false },
        axisLabel: { color: "#94a3b8" },
        axisLine: { lineStyle: { color: "#475569" } },
      },
      yAxis: {
        type: "value",
        name: t("clinical.km.survival_prob"),
        nameLocation: "middle",
        nameGap: 40,
        min: 0,
        max: 1,
        splitLine: { lineStyle: { color: "#475569" } },
        axisLabel: { color: "#94a3b8", formatter: (val: number) => val.toFixed(1) },
      },
      series: series,
    };
    return finalOption;
  }, [curves, t, at_risk_table.time_points, statAnnotation]);

  /** Export the full KM panel (chart + at-risk table) as a combined image */
  const handleExportCombined = useCallback(
    (format: "svg" | "png") => {
      const instance = chartRef.current;
      if (!instance) return;

      const url = instance.getDataURL({
        type: format === "svg" ? "svg" : "png",
        pixelRatio: format === "png" ? 3 : 1,
        backgroundColor: "transparent",
      });

      const link = document.createElement("a");
      link.download = `kiri-kaplan-meier-${dataSource?.replace(/[^a-zA-Z0-9]/g, "_") || "plot"}.${format}`;
      link.href = url;
      link.click();
    },
    [dataSource]
  );

  const handleAddToFigure = useCallback(() => {
    const instance = chartRef.current;
    if (!instance) return;

    const dataUrl = instance.getDataURL({
      type: "png",
      pixelRatio: 3,
      backgroundColor: "transparent",
    });

    const panelTitle = `Kaplan-Meier Survival — ${dataSource || ""}`;
    dispatch(
      addPanel({
        sourceModule: "clinical",
        type: "png",
        data: dataUrl,
        title: panelTitle,
        legend: `Method: Kaplan-Meier + Log-rank | Source: ${dataSource || "Unknown"}`,
        dataSource: dataSource || "TCGA (GDC)",
        citation: citation || "Kaplan-Meier, Lifelines",
      })
    );
    dispatch(
      addToast({
        type: "success",
        title: t("export.figure_added", '"{{name}}" added to Publication Engine', { name: panelTitle }),
        message: dataSource || "",
        duration: 3000,
      })
    );
  }, [dispatch, dataSource, citation, t]);

  // Callback ref for chart instance — removed, using externalChartRef instead

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Dataset source badge */}
      {dataSource && (
        <div className="flex items-center gap-2 text-[10px] text-kiri-text-dim">
          <span className="px-2 py-0.5 rounded bg-kiri-bg border border-kiri-border">
            Data: {dataSource}
          </span>
        </div>
      )}

      {/* KM Chart */}
      <div className="h-96 w-full">
        <KiriChart
          option={option}
          sourceModule="clinical"
          dataSource={dataSource || "TCGA (GDC)"}
          citation={citation || "Kaplan-Meier, Lifelines"}
          externalChartRef={chartRef}
        />
      </div>

      {/* Export Combined Figure buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleExportCombined("svg")}
          className="text-[10px] text-kiri-text-dim hover:text-kiri-text px-2 py-0.5 rounded border border-kiri-border hover:border-kiri-border-focus transition-colors"
        >
          Export SVG
        </button>
        <button
          onClick={() => handleExportCombined("png")}
          className="text-[10px] text-kiri-text-dim hover:text-kiri-text px-2 py-0.5 rounded border border-kiri-border hover:border-kiri-border-focus transition-colors"
        >
          Export PNG @3×
        </button>
        <button
          onClick={handleAddToFigure}
          className="text-[10px] text-kiri-accent hover:text-white px-2 py-0.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors flex items-center gap-1 ml-2"
          title="Add full KM figure to Publication Engine"
        >
          ＋ Figure
        </button>
      </div>

      {/* At-Risk Table */}
      <div className="bg-kiri-surface rounded-lg border border-kiri-border p-4 overflow-x-auto">
        <h4 className="text-sm font-semibold text-kiri-text mb-3">
          {t("clinical.km.at_risk")}
        </h4>
        <table className="w-full text-sm text-center">
          <thead>
            <tr className="text-kiri-text-muted border-b border-kiri-border">
              <th className="p-2 text-left font-normal">{t("clinical.km.time_days")}</th>
              {at_risk_table.time_points.map((tp) => (
                <th key={tp} className="p-2 font-normal">
                  {tp}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(at_risk_table.groups).map(([group, counts]) => (
              <tr key={group} className="border-b border-kiri-border hover:bg-kiri-surface-hover">
                <td className="p-2 text-left font-medium text-kiri-text">{group}</td>
                {counts.map((count, i) => (
                  <td key={i} className="p-2 text-kiri-text-muted">
                    {count}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
