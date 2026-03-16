/**
 * Kiri — Mitochondrial Gene Scatter Plot Grid
 *
 * Displays a grid of scatter plots showing expression correlation
 * between target genes (PARL/MAVS) and core mitochondrial genes.
 * Each plot includes:
 * - Scatter points (expression per sample)
 * - Linear regression fit line
 * - r-value, p-value annotations
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { KiriChart } from "./KiriChart";
import type { EChartsOption } from "echarts";
import type { MitoCorrelation } from "../services/api";

interface MitoScatterPlotProps {
  correlations: MitoCorrelation[];
  targetGene: string;
  loading?: boolean;
  error?: string;
}

// Color palette for each mitochondrial gene
const MITO_COLORS: Record<string, string> = {
  PPARGC1A: "#E69F00",
  TFAM: "#56B4E9",
  BNIP3: "#009E73",
  PINK1: "#F0E442",
  PRKN: "#0072B2",
  MAP1LC3B: "#D55E00",
  SOD1: "#CC79A7",
  SOD2: "#999999",
};

function formatPValue(p: number): string {
  if (p < 0.0001) return p.toExponential(2);
  if (p < 0.01) return p.toFixed(4);
  return p.toFixed(3);
}

export function MitoScatterPlot({
  correlations,
  targetGene,
  loading,
  error,
}: MitoScatterPlotProps) {
  const { t } = useTranslation();

  // Filter to correlations for this target gene
  const geneCorrelations = useMemo(
    () => correlations.filter(c => c.target_gene === targetGene),
    [correlations, targetGene]
  );

  const option = useMemo((): EChartsOption => {
    if (geneCorrelations.length === 0) {
      return {
        title: { text: "No correlation data", left: "center", top: "center", textStyle: { color: "#64748b", fontSize: 14 } },
      };
    }

    const n = geneCorrelations.length;
    const cols = Math.min(n, 4);
    const rows = Math.ceil(n / cols);

    // Build grid, xAxis, yAxis, and series for each subplot
    const grids: EChartsOption["grid"][] = [];
    const xAxes: EChartsOption["xAxis"][] = [];
    const yAxes: EChartsOption["yAxis"][] = [];
    const series: EChartsOption["series"][] = [];

    const cellW = 100 / cols;
    const cellH = 100 / rows;
    const pad = { l: 10, r: 3, t: 6, b: 10 };

    geneCorrelations.forEach((corr, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;

      const left = `${col * cellW + pad.l}%`;
      const top = `${row * cellH + pad.t}%`;
      const width = `${cellW - pad.l - pad.r}%`;
      const height = `${cellH - pad.t - pad.b}%`;

      (grids as object[]).push({
        left, top, width, height, containLabel: false,
        borderColor: "#1e293b",
      });

      const axisIdx = i;
      (xAxes as object[]).push({
        type: "value",
        gridIndex: axisIdx,
        name: targetGene,
        nameLocation: "middle",
        nameGap: 20,
        nameTextStyle: { fontSize: 9, color: "#64748b" },
        axisLabel: { show: row === rows - 1, fontSize: 8, color: "#64748b" },
        splitLine: { lineStyle: { color: "#1e293b", type: "dashed" } },
        axisLine: { lineStyle: { color: "#334155" } },
      });

      (yAxes as object[]).push({
        type: "value",
        gridIndex: axisIdx,
        name: corr.mito_gene_display || corr.mito_gene,
        nameLocation: "middle",
        nameGap: 30,
        nameTextStyle: { fontSize: 9, color: "#64748b" },
        axisLabel: { show: col === 0, fontSize: 8, color: "#64748b" },
        splitLine: { lineStyle: { color: "#1e293b", type: "dashed" } },
        axisLine: { lineStyle: { color: "#334155" } },
      });

      const pointColor = MITO_COLORS[corr.mito_gene] || "#56B4E9";

      // Scatter points
      (series as object[]).push({
        type: "scatter",
        xAxisIndex: axisIdx,
        yAxisIndex: axisIdx,
        data: corr.scatter_x.map((x, j) => [x, corr.scatter_y[j]]),
        symbolSize: 3,
        itemStyle: { color: pointColor, opacity: 0.5 },
      });

      // Regression line
      (series as object[]).push({
        type: "line",
        xAxisIndex: axisIdx,
        yAxisIndex: axisIdx,
        data: corr.fit_x.map((x, j) => [x, corr.fit_y[j]]),
        lineStyle: { color: "#ef4444", width: 2 },
        symbol: "none",
        smooth: false,
      });

      // Annotation: r and p
      const sigSymbol = corr.p_value < 0.001 ? "***" : corr.p_value < 0.01 ? "**" : corr.p_value < 0.05 ? "*" : "ns";
      (series as object[]).push({
        type: "scatter",
        xAxisIndex: axisIdx,
        yAxisIndex: axisIdx,
        data: [],
        markPoint: {
          data: [{
            coord: [corr.fit_x[1] * 0.7 + corr.fit_x[0] * 0.3, corr.fit_y[1] * 0.95],
            symbol: "rect",
            symbolSize: [0, 0],
            label: {
              show: true,
              formatter: `r = ${corr.r.toFixed(3)} ${sigSymbol}\np = ${formatPValue(corr.p_value)}`,
              color: "#e2e8f0",
              fontSize: 9,
              fontWeight: "bold",
              backgroundColor: "rgba(15, 23, 42, 0.75)",
              padding: [3, 6],
              borderRadius: 3,
            },
          }],
        },
      });
    });

    return {
      grid: grids as EChartsOption["grid"],
      xAxis: xAxes as EChartsOption["xAxis"],
      yAxis: yAxes as EChartsOption["yAxis"],
      series: series as EChartsOption["series"],
      tooltip: {
        trigger: "item",
        formatter: (p: unknown) => {
          const pp = p as { data?: [number, number] };
          if (!pp.data || pp.data.length < 2) return "";
          return `${targetGene}: ${pp.data[0].toFixed(2)}<br/>Expression: ${pp.data[1].toFixed(2)}`;
        },
      },
    };
  }, [geneCorrelations, targetGene]);

  const nPairs = geneCorrelations.length;
  const sigPairs = geneCorrelations.filter(c => c.p_value < 0.05).length;
  const heightPx = Math.max(350, Math.ceil(nPairs / 4) * 280);

  return (
    <KiriChart
      title={t("mito.scatter_title", `${targetGene} × Mitochondrial Gene Correlations`)}
      option={option}
      loading={loading}
      error={error}
      height={`${heightPx}px`}
      sourceModule="atlas"
      dataSource="TCGA-COAD (GDC)"
      citation={`Pearson r | ${sigPairs}/${nPairs} significant (p < 0.05) | n=${geneCorrelations[0]?.n_samples || "?"}`}
    />
  );
}
