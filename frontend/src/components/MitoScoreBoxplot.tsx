/**
 * Kiri — Mitochondrial Function Score Boxplot
 *
 * Boxplot comparing mitochondrial function scores between
 * high/low expression groups for PARL/MAVS.
 * Shows:
 * - Box-and-whisker for each group
 * - Wilcoxon p-value annotation
 * - Maxstat cutpoint disclosure
 * - Jittered individual data points
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { KiriChart } from "./KiriChart";
import type { EChartsOption } from "echarts";
import type { MitoScoreComparison } from "../services/api";

interface MitoScoreBoxplotProps {
  comparisons: Record<string, MitoScoreComparison>;
  loading?: boolean;
  error?: string;
}

function formatPValue(p: number): string {
  if (p < 0.0001) return p.toExponential(2);
  if (p < 0.01) return p.toFixed(4);
  return p.toFixed(3);
}

function sigStars(p: number): string {
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "ns";
}

export function MitoScoreBoxplot({
  comparisons,
  loading,
  error,
}: MitoScoreBoxplotProps) {
  const { t } = useTranslation();

  const genes = Object.keys(comparisons).filter(g => !comparisons[g].error);

  const option = useMemo((): EChartsOption => {
    if (genes.length === 0) {
      return {
        title: {
          text: "No mitochondrial score data",
          left: "center", top: "center",
          textStyle: { color: "#64748b", fontSize: 14 },
        },
      };
    }

    // Build categories: Gene High, Gene Low for each gene
    const categories: string[] = [];
    const boxData: number[][] = [];
    const scatterData: [number, number][] = [];
    const colors: string[] = [];

    const geneColors = ["#E69F00", "#56B4E9", "#009E73", "#D55E00"];

    genes.forEach((gene, gi) => {
      const comp = comparisons[gene];
      const color = geneColors[gi % geneColors.length];

      // High group
      const hIdx = categories.length;
      categories.push(`${gene} High`);
      boxData.push([
        comp.high_group.min, comp.high_group.q1, comp.high_group.median,
        comp.high_group.q3, comp.high_group.max,
      ]);
      colors.push(color);

      // Jitter points for high group
      comp.high_group.values.forEach(v => {
        scatterData.push([hIdx + (Math.random() - 0.5) * 0.3, v]);
      });

      // Low group
      const lIdx = categories.length;
      categories.push(`${gene} Low`);
      boxData.push([
        comp.low_group.min, comp.low_group.q1, comp.low_group.median,
        comp.low_group.q3, comp.low_group.max,
      ]);
      colors.push(`${color}88`);

      // Jitter points for low group
      comp.low_group.values.forEach(v => {
        scatterData.push([lIdx + (Math.random() - 0.5) * 0.3, v]);
      });
    });

    // Build p-value annotations
    const markLineData: object[] = [];
    genes.forEach((gene, gi) => {
      const comp = comparisons[gene];
      const hIdx = gi * 2;
      const lIdx = gi * 2 + 1;
      const maxY = Math.max(comp.high_group.max, comp.low_group.max) * 1.05;

      markLineData.push({
        // Horizontal connector
        type: "scatter",
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: [],
        markPoint: {
          data: [{
            coord: [(hIdx + lIdx) / 2, maxY],
            symbol: "rect",
            symbolSize: [0, 0],
            label: {
              show: true,
              formatter: `p = ${formatPValue(comp.p_value)} ${sigStars(comp.p_value)}`,
              color: comp.significant ? "#22c55e" : "#94a3b8",
              fontSize: 10,
              fontWeight: "bold",
            },
          }],
        },
      });
    });

    return {
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) => {
          const p = params as { componentType: string; name: string; data: number[] | [number, number] };
          if (p.componentType === "series" && Array.isArray(p.data) && p.data.length === 5) {
            return `<b>${p.name}</b><br/>
              Min: ${p.data[0].toFixed(3)}<br/>
              Q1: ${p.data[1].toFixed(3)}<br/>
              Median: ${p.data[2].toFixed(3)}<br/>
              Q3: ${p.data[3].toFixed(3)}<br/>
              Max: ${p.data[4].toFixed(3)}`;
          }
          return "";
        },
      },
      grid: { left: 60, right: 30, top: 40, bottom: 60, containLabel: true },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: {
          color: "#94a3b8",
          fontSize: 10,
          rotate: 20,
        },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        name: t("mito.mito_score_label", "Mitochondrial Function Score"),
        nameTextStyle: { color: "#94a3b8", fontSize: 10 },
        splitLine: { lineStyle: { color: "#1e293b", type: "dashed" } },
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#94a3b8" },
      },
      series: [
        // Boxplot
        {
          type: "boxplot",
          data: boxData.map((d, i) => ({
            value: d,
            itemStyle: {
              color: `${colors[i]}33`,
              borderColor: colors[i],
              borderWidth: 2,
            },
          })),
        },
        // Jitter scatter
        {
          type: "scatter",
          data: scatterData,
          symbolSize: 3,
          itemStyle: { color: "#94a3b8", opacity: 0.4 },
        },
        // P-value annotations
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(markLineData as any[]),
      ],
    };
  }, [comparisons, genes, t]);

  // Build citation
  const citationParts = genes.map(g => {
    const c = comparisons[g];
    return `${g}: p=${formatPValue(c.p_value)}`;
  });

  return (
    <KiriChart
      title={t("mito.boxplot_title", "Mitochondrial Function Score — High vs Low Expression")}
      option={option}
      loading={loading}
      error={error}
      height="420px"
      sourceModule="atlas"
      dataSource="TCGA-COAD (GDC)"
      citation={`ssGSEA (MitoCarta) | Maxstat cutpoint | ${citationParts.join(" | ")}`}
    />
  );
}
