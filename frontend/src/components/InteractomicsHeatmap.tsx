/**
 * Kiri — Interactomics Heatmap Component
 *
 * Renders a gene × gene correlation heatmap or
 * a protein × sample abundance heatmap.
 * Uses ECharts heatmap type with diverging color scale.
 */

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { KiriChart } from "./KiriChart";
import type { Provenance } from "../services/api";

interface InteractomicsHeatmapProps {
  /** gene → gene → value (for correlation matrix) */
  matrix?: Record<string, Record<string, number>>;
  /** gene → [values per sample] (for abundance matrix) */
  abundanceMatrix?: Record<string, number[]>;
  /** Labels for columns (sample names for abundance, gene names for correlation) */
  columnLabels?: string[];
  title?: string;
  provenance?: Provenance | null;
  loading?: boolean;
  error?: string;
  /** Color scale mode */
  mode?: "correlation" | "abundance";
}

export function InteractomicsHeatmap({
  matrix,
  abundanceMatrix,
  columnLabels,
  title = "Heatmap",
  provenance,
  loading,
  error,
  mode = "correlation",
}: InteractomicsHeatmapProps) {
  const option: EChartsOption = useMemo(() => {
    if (mode === "correlation" && matrix) {
      const genes = Object.keys(matrix);
      if (genes.length === 0) return {};

      const data: [number, number, number][] = [];
      let minVal = Infinity;
      let maxVal = -Infinity;

      genes.forEach((g1, i) => {
        genes.forEach((g2, j) => {
          const val = matrix[g1]?.[g2] ?? 0;
          data.push([j, i, val]);
          if (val < minVal) minVal = val;
          if (val > maxVal) maxVal = val;
        });
      });

      return {
        tooltip: {
          position: "top",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (params: Record<string, any>) => {
            const [x, y, val] = params.data;
            return `<strong>${genes[y]} × ${genes[x]}</strong><br/>r = ${val.toFixed(3)}`;
          },
        },
        grid: { left: 100, right: 40, top: 40, bottom: 100 },
        xAxis: {
          type: "category",
          data: genes,
          axisLabel: { rotate: 45, fontSize: 9, color: "#94a3b8" },
          splitLine: { show: false },
        },
        yAxis: {
          type: "category",
          data: genes,
          axisLabel: { fontSize: 9, color: "#94a3b8" },
          splitLine: { show: false },
        },
        visualMap: {
          min: -1,
          max: 1,
          calculable: true,
          orient: "horizontal",
          left: "center",
          bottom: 5,
          inRange: {
            color: ["#3b82f6", "#1e293b", "#ef4444"],
          },
          textStyle: { color: "#94a3b8", fontSize: 10 },
        },
        series: [
          {
            type: "heatmap",
            data,
            emphasis: {
              itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.5)" },
            },
          },
        ],
      };
    }

    if (mode === "abundance" && abundanceMatrix) {
      const genes = Object.keys(abundanceMatrix);
      if (genes.length === 0) return {};

      const cols = columnLabels || genes.length > 0
        ? Array.from(
            { length: abundanceMatrix[genes[0]]?.length ?? 0 },
            (_, i) => `S${i + 1}`
          )
        : [];

      const data: [number, number, number][] = [];
      let minVal = Infinity;
      let maxVal = -Infinity;

      genes.forEach((gene, row) => {
        (abundanceMatrix[gene] || []).forEach((val, col) => {
          data.push([col, row, val]);
          if (val < minVal) minVal = val;
          if (val > maxVal) maxVal = val;
        });
      });

      return {
        tooltip: {
          position: "top",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (params: Record<string, any>) => {
            const [x, y, val] = params.data;
            return `<strong>${genes[y]}</strong> | ${cols[x] || `Col ${x}`}<br/>${val.toFixed(3)}`;
          },
        },
        grid: { left: 100, right: 40, top: 20, bottom: 80 },
        xAxis: {
          type: "category",
          data: cols,
          axisLabel: { rotate: 45, fontSize: 9, color: "#94a3b8" },
          splitLine: { show: false },
        },
        yAxis: {
          type: "category",
          data: genes,
          axisLabel: { fontSize: 9, color: "#94a3b8" },
          splitLine: { show: false },
        },
        visualMap: {
          min: minVal,
          max: maxVal,
          calculable: true,
          orient: "horizontal",
          left: "center",
          bottom: 5,
          inRange: {
            color: ["#1e293b", "#f59e0b", "#ef4444"],
          },
          textStyle: { color: "#94a3b8", fontSize: 10 },
        },
        series: [
          {
            type: "heatmap",
            data,
            emphasis: {
              itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.5)" },
            },
          },
        ],
      };
    }

    return {};
  }, [matrix, abundanceMatrix, columnLabels, mode]);

  return (
    <KiriChart
      title={title}
      option={option}
      provenance={provenance}
      loading={loading}
      error={error}
      height="420px"
      sourceModule="interaction"
    />
  );
}
