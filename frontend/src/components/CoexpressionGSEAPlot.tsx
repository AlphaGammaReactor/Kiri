/**
 * Kiri — GSEA Enrichment Score Plot for Co-Expression Analysis
 *
 * Displays GSEA enrichment results for mitochondrial-related pathways:
 * - Horizontal bar chart showing NES (Normalized Enrichment Score) per pathway
 * - Color-coded by significance (FDR < 0.25 = significant)
 * - NES, p-value, and FDR annotations
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { KiriChart } from "./KiriChart";
import type { EChartsOption } from "echarts";
import type { GSEATerm } from "../services/api";

interface CoexpressionGSEAPlotProps {
  terms: GSEATerm[];
  highlightedTerms: GSEATerm[];
  targetGene: string;
  totalSignificant: number;
  loading?: boolean;
  error?: string;
}

export function CoexpressionGSEAPlot({
  terms,
  highlightedTerms,
  targetGene,
  totalSignificant,
  loading,
  error,
}: CoexpressionGSEAPlotProps) {
  const { t } = useTranslation();

  const option = useMemo((): EChartsOption => {
    // Use highlighted terms if available, otherwise top 15 terms
    const safeTerms = terms ?? [];
    const safeHighlighted = highlightedTerms ?? [];
    const displayTerms = safeHighlighted.length > 0
      ? safeHighlighted
      : safeTerms.slice(0, 15);

    if (displayTerms.length === 0) {
      return { title: { text: "No GSEA results", left: "center", top: "center", textStyle: { color: "#64748b", fontSize: 14 } } };
    }

    // Sort by NES descending
    const sorted = [...displayTerms].sort((a, b) => a.nes - b.nes);

    const categories = sorted.map(t => {
      // Clean pathway name for display
      let name = t.term
        .replace(/^HALLMARK_/i, "")
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());
      if (name.length > 35) name = name.substring(0, 32) + "…";
      return name;
    });

    const nesValues = sorted.map(t => t.nes);
    const colors = sorted.map(t =>
      t.significant
        ? (t.nes > 0 ? "#ef4444" : "#3b82f6")
        : "#64748b"
    );

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) => {
          const p = (params as { dataIndex: number }[])?.[0];
          if (!p) return "";
          const term = sorted[p.dataIndex];
          return `<b>${term.term.replace(/_/g, " ")}</b><br/>
            NES: <b>${term.nes.toFixed(3)}</b><br/>
            p-value: ${term.p_value < 0.001 ? term.p_value.toExponential(2) : term.p_value.toFixed(4)}<br/>
            FDR: ${term.fdr < 0.001 ? term.fdr.toExponential(2) : term.fdr.toFixed(4)}<br/>
            ${term.significant ? "✅ Significant" : "⚪ Not significant"}`;
        },
      },
      grid: {
        left: 200,
        right: 40,
        top: 28,
        bottom: 40,
      },
      xAxis: {
        type: "value",
        name: "NES",
        nameLocation: "middle",
        nameGap: 25,
        nameTextStyle: { color: "#94a3b8", fontSize: 11 },
        splitLine: { lineStyle: { color: "#1e293b", type: "dashed" } },
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#94a3b8" },
      },
      yAxis: {
        type: "category",
        data: categories,
        axisLabel: {
          color: "#94a3b8",
          fontSize: 10,
          width: 180,
          overflow: "truncate",
        },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [{
        type: "bar",
        data: nesValues.map((v, i) => ({
          value: v,
          itemStyle: { color: colors[i], borderRadius: v > 0 ? [0, 3, 3, 0] : [3, 0, 0, 3] },
        })),
        barWidth: "60%",
        label: {
          show: true,
          position: "right",
          formatter: (p: { dataIndex: number }) => {
            const term = sorted[p.dataIndex];
            return term.significant ? `★ ${term.nes.toFixed(2)}` : term.nes.toFixed(2);
          },
          color: "#94a3b8",
          fontSize: 9,
        },
      }],
      // Reference line at 0
      markLine: {
        silent: true,
        data: [{ xAxis: 0 }],
        lineStyle: { color: "#475569", type: "solid" },
      },
    };
  }, [terms, highlightedTerms]);

  return (
    <KiriChart
      title={t("mito.gsea_title", `GSEA Enrichment — ${targetGene} Co-expressed Genes`)}
      option={option}
      loading={loading}
      error={error}
      height="400px"
      sourceModule="atlas"
      dataSource="TCGA-COAD (GDC)"
      citation={`GSEA Pre-Ranked (MSigDB Hallmark) | ${totalSignificant} significant pathways`}
    />
  );
}
