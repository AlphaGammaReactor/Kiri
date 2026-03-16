import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import * as echarts from "echarts";
import { KiriChart } from "./KiriChart";

interface HazardRatioResult {
  variable: string;
  hr: number;
  ci_lower: number;
  ci_upper: number;
  p_value: number;
  significant: boolean;
}

interface CoxForestPlotProps {
  hazardRatios: HazardRatioResult[];
  concordanceIndex: number;
  /** Dynamic data source label for +Figure publication panels */
  dataSource?: string;
  /** Citation / method label for +Figure publication panels */
  citation?: string;
}

export function CoxForestPlot({ hazardRatios, concordanceIndex, dataSource, citation }: CoxForestPlotProps) {
  const { t } = useTranslation();

  const option = useMemo(() => {
    // Reverse so ECharts renders top-to-bottom
    const data = [...hazardRatios].reverse();

    const yAxisData = data.map((d) => d.variable);
    const hrData = data.map((d) => d.hr);

    // ECharts error bar format: [category_index, lower, upper]
    const errorData = data.map((d, index) => [
      index,
      d.ci_lower,
      d.ci_upper,
    ]);

    // Format annotations for p-values
    const pValueLabels = data.map((d, index) => ({
      coord: [Math.max(d.ci_upper, d.hr) * 1.5, index],
      label: {
        formatter: `p=${d.p_value.toExponential(2)}`,
        color: d.significant ? "#22c55e" : "#9ca3af", // Success for sig, gray for not
        fontWeight: d.significant ? "bold" : "normal",
      },
    }));

    const option: echarts.EChartsOption = {
      title: {
        text: `${t("clinical.cox.concordance")}: ${concordanceIndex.toFixed(3)}`,
        left: "center",
        top: 0,
        textStyle: {
          fontSize: 14,
          fontWeight: "normal",
          color: "#94a3b8",
        },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: function (params: any) {
          if (!Array.isArray(params) || params.length === 0) return "";
          const varName = params[0].name;
          const point = data.find((d) => d.variable === varName);
          if (!point) return "";
          return `
            <div class="font-medium text-kiri-text mb-1">${varName}</div>
            <div class="text-sm">
              <span class="text-kiri-text-muted">HR:</span> 
              <span class="font-mono text-white">${point.hr.toFixed(2)}</span>
            </div>
            <div class="text-sm">
              <span class="text-kiri-text-muted">95% CI:</span> 
              <span class="font-mono text-white">[${point.ci_lower.toFixed(2)} - ${point.ci_upper.toFixed(2)}]</span>
            </div>
            <div class="text-sm mt-1">
              <span class="text-kiri-text-muted">p-value:</span> 
              <span class="font-mono ${point.significant ? 'text-kiri-success' : 'text-kiri-text'}">${point.p_value.toExponential(2)}</span>
            </div>
          `;
        },
      },
      grid: {
        top: 40,
        bottom: 40,
        left: 120,
        right: 120, // space for p-values
        containLabel: true,
      },
      xAxis: {
        type: "log",
        name: t("clinical.cox.hazard_ratio"),
        nameLocation: "middle",
        nameGap: 30,
        logBase: 2,
        splitLine: { lineStyle: { color: "#475569" } },
        axisLabel: { color: "#94a3b8" },
        axisLine: { lineStyle: { color: "#475569" } },
      },
      yAxis: {
        type: "category",
        data: yAxisData,
        axisLine: { lineStyle: { color: "#475569" } },
        axisLabel: { color: "#94a3b8", fontSize: 13, fontWeight: "normal" },
      },
      series: [
        // Scatter points for HR
        {
          name: "HR",
          type: "scatter",
          data: hrData,
          symbolSize: 10,
          itemStyle: {
            color: (params: any) => {
              const sig = data[params.dataIndex].significant;
              return sig ? "#22c55e" : "#6b7280"; // Success / Gray
            },
          },
          z: 3,
        },
        // Custom error bars (horizontal whiskers)
        {
          name: "95% CI",
          type: "custom",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          renderItem: function (_: any, api: any) {
            const yIndex = api.value(0);
            const low = api.value(1);
            const high = api.value(2);

            const ptLow = api.coord([low, yIndex]);
            const ptHigh = api.coord([high, yIndex]);
            const halfWidth = 4; // whisper cap height

            const sig = data[yIndex].significant;
            const color = sig ? "#22c55e" : "#6b7280";

            return {
              type: "group",
              children: [
                {
                  type: "line",
                  shape: {
                    x1: ptLow[0], y1: ptLow[1],
                    x2: ptHigh[0], y2: ptHigh[1],
                  },
                  style: { stroke: color, lineWidth: 2 },
                  z2: 2,
                },
                {
                  type: "line",
                  shape: {
                    x1: ptLow[0], y1: ptLow[1] - halfWidth,
                    x2: ptLow[0], y2: ptLow[1] + halfWidth,
                  },
                  style: { stroke: color, lineWidth: 2 },
                  z2: 2,
                },
                {
                  type: "line",
                  shape: {
                    x1: ptHigh[0], y1: ptHigh[1] - halfWidth,
                    x2: ptHigh[0], y2: ptHigh[1] + halfWidth,
                  },
                  style: { stroke: color, lineWidth: 2 },
                  z2: 2,
                },
              ],
            };
          },
          data: errorData,
          z: 2,
        },
        // Reference line at HR = 1
        {
          name: "Reference",
          type: "line",
          markLine: {
            symbol: "none",
            data: [{ xAxis: 1 }] as any,
            lineStyle: {
              color: "#ef4444", // Error warning color
              type: "dashed",
              width: 1.5,
            },
            label: { show: false },
          },
        },
        // Invisible scatter just to render p-value labels on the right
        {
          name: "Labels",
          type: "scatter",
          data: hrData.map(() => 1), // dummy x
          symbolSize: 0,
          markPoint: {
            symbol: "none",
            data: pValueLabels as any,
            label: {
              show: true,
              position: "right",
              distance: 10,
              align: "left",
            },
          },
        },
      ],
    };

    return option;
  }, [hazardRatios, concordanceIndex, t]);

  return (
    <div className="w-full flex justify-center">
      <div className="h-96 w-full max-w-4xl bg-kiri-surface rounded-lg border border-kiri-border p-4">
        <KiriChart
          option={option}
          sourceModule="clinical"
          dataSource={dataSource || "TCGA (GDC)"}
          citation={citation || "Cox Proportional Hazards, Lifelines"}
        />
      </div>
    </div>
  );
}
