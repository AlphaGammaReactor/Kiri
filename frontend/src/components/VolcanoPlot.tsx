/**
 * Kiri — Volcano Plot Component
 *
 * Reusable scatter plot showing log2FC vs -log10(FDR).
 * Highlights significant proteins/genes in red.
 * Exportable via KiriChart wrapper.
 */

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { KiriChart } from "./KiriChart";
import type { Provenance } from "../services/api";

interface VolcanoPoint {
  gene?: string;
  protein?: string;
  log2_fold_change: number;
  adjusted_p_value?: number;
  neg_log10_p?: number;
  neg_log10_fdr?: number;
  significant?: boolean;
  is_known_substrate?: boolean;
}

interface VolcanoPlotProps {
  data: VolcanoPoint[];
  lfcCutoff?: number;
  fdrCutoff?: number;
  title?: string;
  provenance?: Provenance | null;
  loading?: boolean;
  error?: string;
  sourceModule?: "atlas" | "interaction" | "clinical" | "discovery";
}

export function VolcanoPlot({
  data,
  lfcCutoff = 1.0,
  fdrCutoff = 0.05,
  title = "Volcano Plot",
  provenance,
  loading,
  error,
  sourceModule = "interaction",
}: VolcanoPlotProps) {

  const option: EChartsOption = useMemo(() => {
    if (!data || data.length === 0) return {};

    // Process data into series
    const nonSig: number[][] = [];
    const upReg: number[][] = [];
    const downReg: number[][] = [];
    const substrates: number[][] = [];
    const labels: Record<string, string[]> = {
      nonSig: [],
      upReg: [],
      downReg: [],
      substrates: [],
    };

    data.forEach((point) => {
      const lfc = point.log2_fold_change;
      const negLogP =
        point.neg_log10_p ??
        point.neg_log10_fdr ??
        (point.adjusted_p_value
          ? -Math.log10(Math.max(point.adjusted_p_value, 1e-300))
          : 0);
      const name = point.gene || point.protein || "";
      const isSig = point.significant ?? false;

      if (point.is_known_substrate && isSig) {
        substrates.push([lfc, negLogP]);
        labels.substrates.push(name);
      } else if (isSig && lfc > 0) {
        upReg.push([lfc, negLogP]);
        labels.upReg.push(name);
      } else if (isSig && lfc < 0) {
        downReg.push([lfc, negLogP]);
        labels.downReg.push(name);
      } else {
        nonSig.push([lfc, negLogP]);
        labels.nonSig.push(name);
      }
    });

    const negLogFDR = -Math.log10(Math.max(fdrCutoff, 1e-300));

    return {
      tooltip: {
        trigger: "item",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: Record<string, any>) => {
          const idx = params.dataIndex;
          const seriesName = params.seriesName;
          const key =
            seriesName === "Not Significant"
              ? "nonSig"
              : seriesName === "Up-regulated"
              ? "upReg"
              : seriesName === "Down-regulated"
              ? "downReg"
              : "substrates";
          const name = labels[key]?.[idx] || "";
          const [lfc, nlp] = params.data;
          return `<strong>${name}</strong><br/>log₂FC: ${lfc.toFixed(
            2
          )}<br/>-log₁₀(FDR): ${nlp.toFixed(2)}`;
        },
      },
      xAxis: {
        name: "log₂(Fold Change)",
        nameLocation: "center",
        nameGap: 28,
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.1)" } },
      },
      yAxis: {
        name: "-log₁₀(FDR)",
        nameLocation: "center",
        nameGap: 36,
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.1)" } },
      },
      series: [
        {
          name: "Not Significant",
          type: "scatter",
          data: nonSig,
          symbolSize: 5,
          itemStyle: { color: "rgba(148,163,184,0.3)" },
        },
        {
          name: "Up-regulated",
          type: "scatter",
          data: upReg,
          symbolSize: 7,
          itemStyle: { color: "#ef4444" },
        },
        {
          name: "Down-regulated",
          type: "scatter",
          data: downReg,
          symbolSize: 7,
          itemStyle: { color: "#3b82f6" },
        },
        {
          name: "Known Substrates",
          type: "scatter",
          data: substrates,
          symbolSize: 10,
          symbol: "diamond",
          itemStyle: { color: "#f59e0b", borderColor: "#fff", borderWidth: 1 },
        },
        // Threshold lines
        {
          type: "line",
          data: [
            [-lfcCutoff, 0],
            [-lfcCutoff, Math.max(...data.map((d) => d.neg_log10_fdr ?? d.neg_log10_p ?? 10), 10)],
          ],
          lineStyle: { type: "dashed", color: "rgba(148,163,184,0.4)" },
          silent: true,
          symbol: "none",
        },
        {
          type: "line",
          data: [
            [lfcCutoff, 0],
            [lfcCutoff, Math.max(...data.map((d) => d.neg_log10_fdr ?? d.neg_log10_p ?? 10), 10)],
          ],
          lineStyle: { type: "dashed", color: "rgba(148,163,184,0.4)" },
          silent: true,
          symbol: "none",
        },
        {
          type: "line",
          data: [
            [Math.min(...data.map((d) => d.log2_fold_change), -5), negLogFDR],
            [Math.max(...data.map((d) => d.log2_fold_change), 5), negLogFDR],
          ],
          lineStyle: { type: "dashed", color: "rgba(239,68,68,0.3)" },
          silent: true,
          symbol: "none",
        },
      ],
      legend: {
        bottom: 0,
        textStyle: { color: "#94a3b8", fontSize: 10 },
      },
    };
  }, [data, lfcCutoff, fdrCutoff]);

  return (
    <KiriChart
      title={title}
      option={option}
      provenance={provenance}
      loading={loading}
      error={error}
      height="420px"
      sourceModule={sourceModule}
    />
  );
}
