import { useTranslation } from "react-i18next";
import { KiriChart } from "./KiriChart";
import { useMemo } from "react";
import * as echarts from "echarts";

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
  /** Dynamic data source label for +Figure publication panels */
  dataSource?: string;
  /** Citation / method label for +Figure publication panels */
  citation?: string;
}

export function KaplanMeierPlot({ curves, p_value, at_risk_table, dataSource, citation }: KaplanMeierPlotProps) {
  const { t } = useTranslation();

  const option = useMemo(() => {
    // Okabe-Ito colorblind-safe palette (from system_tech.md / KiriChart.tsx defaults)
    const colors = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7"];

    const series: any[] = [];
    const legendData: string[] = [];

    curves.forEach((curve, index) => {
      const color = colors[index % colors.length];
      const curveName = `${curve.group_name} (n=${curve.n_samples})`;
      legendData.push(curveName);

      // Line for survival curve (step function shape)
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

      // Shaded area for confidence interval
      // ECharts trick: upper bound as an invisible line, lower bound filled up to the upper bound
      // For simplicity in step charts, sometimes CI is rendered as overlapping transparent polys.
      // A standard line chart fill from base is easier:
      const ciLower = curve.time.map((t, i) => [t, curve.ci_lower[i]]);
      const ciUpper = curve.time.map((t, i) => [t, curve.ci_upper[i]]);

      series.push({
        name: `${curveName} - CI Lower`,
        type: "line",
        step: "end",
        data: ciLower,
        lineStyle: { width: 0 },
        symbol: "none",
        stack: `ci_${index}`, // don't stack but group
        tooltip: { show: false },
        z: 1,
      });

      series.push({
        name: `${curveName} - CI Upper`,
        type: "line",
        step: "end",
        data: ciUpper,
        lineStyle: { width: 0 },
        symbol: "none",
        areaStyle: {
          color: color,
          opacity: 0.15,
          origin: "start" 
        },
        tooltip: { show: false },
        z: 2,
      });
    });

    const finalOption: echarts.EChartsOption = {
      title: {
        text: `${t("clinical.km.p_value")}: ${p_value.toExponential(2)}`,
        left: "right",
        top: 20,
        textStyle: {
          fontSize: 14,
          fontWeight: "normal",
          color: "#94a3b8",
        },
      },
      tooltip: {
        trigger: "axis",
        formatter: function (params: any) {
          const time = params[0].value[0];
          let res = `${t("clinical.km.time_days")}: ${time}<br/>`;
          params.forEach((param: any) => {
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
        textStyle: { color: "#94a3b8" },
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
      series: series as echarts.SeriesOption[],
    };
    return finalOption;
  }, [curves, p_value, t]);

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="h-96 w-full">
        <KiriChart
          option={option}
          sourceModule="clinical"
          dataSource={dataSource || "TCGA (GDC)"}
          citation={citation || "Kaplan-Meier, Lifelines"}
        />
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
