/**
 * Kiri Atlas — Gene Boxplots (Supplementary Plots)
 *
 * Publication-ready boxplot charts for differentially expressed genes.
 * All statistical information is embedded in the ECharts canvas
 * so it appears in SVG/PNG exports AND Publication Engine captures.
 *
 * Dual-mode rendering:
 *   - In-app: dark theme with light text (matches Kiri aesthetic)
 *   - Export: white background with dark text (journal-standard)
 *
 * The publicationOption prop on KiriChart handles the swap automatically.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { EChartsOption } from "echarts";
import { KiriChart } from "./KiriChart";
import type { DEResult } from "../services/api";
import type { Provenance } from "../services/api";

interface Sample {
  sample_id: string;
  sample_type: string;
  stage: string;
  msi_status: string;
  project: string;
}

interface GeneBoxplotsProps {
  values: Record<string, number[]>;
  samples: Sample[];
  deResults: DEResult[];
  topN?: number;
  provenance?: Provenance | null;
  className?: string;
}

// ── Color palettes ──
const NORMAL_COLOR = "#4393C3";
const NORMAL_FILL  = "rgba(67,147,195,0.15)";
const TUMOR_COLOR  = "#D6604D";
const TUMOR_FILL   = "rgba(214,96,77,0.15)";
const FONT         = "'Arial', 'Helvetica Neue', 'Helvetica', sans-serif";

// Dark theme (in-app)
const DARK = {
  title: "#e2e8f0",
  subtitle: "#94a3b8",
  axis: "#64748b",
  axisLine: "#334155",
  gridLine: "#1e293b",
  statsHeader: "#94a3b8",
  statsLabel: "#64748b",
  statsValue: "#cbd5e1",
  separator: "#334155",
  starColor: "#f59e0b",
  starDim: "#64748b",
};

// Light theme (publication export)
const LIGHT = {
  title: "#1e293b",
  subtitle: "#475569",
  axis: "#475569",
  axisLine: "#94a3b8",
  gridLine: "#e2e8f0",
  statsHeader: "#334155",
  statsLabel: "#64748b",
  statsValue: "#1e293b",
  separator: "#cbd5e1",
  starColor: "#d97706",
  starDim: "#94a3b8",
};

function boxplotStats(arr: number[]): [number, number, number, number, number] {
  if (arr.length === 0) return [0, 0, 0, 0, 0];
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  return [
    sorted[0],
    sorted[Math.floor(n * 0.25)],
    sorted[Math.floor(n * 0.5)],
    sorted[Math.floor(n * 0.75)],
    sorted[n - 1],
  ];
}

function pToStars(p: number): string {
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "ns";
}

/**
 * Build a complete ECharts option for a gene boxplot.
 * @param theme - color palette (DARK for app, LIGHT for publication)
 * @param bg - background color
 */
function buildOption(
  de: DEResult,
  normalVals: number[],
  tumorVals: number[],
  normalBox: [number, number, number, number, number],
  tumorBox: [number, number, number, number, number],
  theme: typeof DARK,
  bg: string,
): EChartsOption {
  const fdr = de.adjusted_p_value;
  const fdrStr = fdr < 0.001 ? fdr.toExponential(2) : fdr.toFixed(4);
  const fc = de.log2_fold_change;
  const fcLabel = `${fc > 0 ? "+" : ""}${fc.toFixed(2)}`;
  const stars = pToStars(fdr);

  const normalMean = normalVals.length > 0
    ? normalVals.reduce((a, b) => a + b, 0) / normalVals.length : 0;
  const tumorMean = tumorVals.length > 0
    ? tumorVals.reduce((a, b) => a + b, 0) / tumorVals.length : 0;

  // ── Graphic elements ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gfx: any[] = [];

  // Significance bracket
  if (stars !== "ns") {
    gfx.push({
      type: "group", left: "center", top: 78,
      children: [
        { type: "line", shape: { x1: -30, y1: 6, x2: 30, y2: 6 }, style: { stroke: theme.axis, lineWidth: 1 } },
        { type: "line", shape: { x1: -30, y1: 6, x2: -30, y2: 10 }, style: { stroke: theme.axis, lineWidth: 1 } },
        { type: "line", shape: { x1: 30, y1: 6, x2: 30, y2: 10 }, style: { stroke: theme.axis, lineWidth: 1 } },
        {
          type: "text", left: "center", top: -8,
          style: { text: stars, font: `bold 12px ${FONT}`, fill: theme.starColor, textAlign: "center" },
        },
      ],
    });
  }

  // ── Statistics table (below legend) ──
  const tblY = 410;

  gfx.push({
    type: "line", left: 16, top: tblY - 6,
    shape: { x1: 0, y1: 0, x2: 440, y2: 0 },
    style: { stroke: theme.separator, lineWidth: 1 },
  });

  gfx.push({
    type: "text", left: 16, top: tblY + 2,
    style: { text: "Statistics", font: `bold 9px ${FONT}`, fill: theme.statsHeader },
  });

  const rows = [
    [
      { label: "Normal (n)", value: String(normalVals.length), color: theme.statsValue },
      { label: "Tumor (n)",  value: String(tumorVals.length),  color: theme.statsValue },
      { label: "N Mean",     value: normalMean.toFixed(2),     color: NORMAL_COLOR },
      { label: "T Mean",     value: tumorMean.toFixed(2),      color: TUMOR_COLOR },
    ],
    [
      { label: "log₂FC",   value: fcLabel,  color: theme.statsValue, bold: true },
      { label: "FDR",       value: fdrStr,   color: theme.statsValue },
      { label: "Sig.",      value: stars,    color: stars === "ns" ? theme.starDim : theme.starColor, bold: true },
    ],
  ];

  const colW = 120;
  const rowStartY = tblY + 18;
  const rowH = 16;

  rows.forEach((cols, ri) => {
    cols.forEach((cell, ci) => {
      const x = 16 + ci * colW;
      const y = rowStartY + ri * rowH;
      gfx.push({
        type: "text", left: x, top: y,
        style: { text: `${cell.label}:`, font: `9px ${FONT}`, fill: theme.statsLabel },
      });
      gfx.push({
        type: "text", left: x + 62, top: y,
        style: {
          text: cell.value,
          font: `${"bold" in cell && cell.bold ? "bold " : ""}10px ${FONT}`,
          fill: cell.color,
        },
      });
    });
  });

  return {
    backgroundColor: bg,
    textStyle: { fontFamily: FONT },
    title: {
      text: `{gene|${de.gene}}`,
      subtext: `FDR = ${fdrStr}   |   log₂FC = ${fcLabel}`,
      left: "center", top: 10,
      textStyle: {
        fontSize: 16, fontWeight: "bold", fontFamily: FONT, color: theme.title,
        rich: {
          gene: { fontStyle: "italic", fontSize: 16, fontWeight: "bold", fontFamily: FONT, color: theme.title },
        },
      },
      subtextStyle: { fontSize: 11, fontFamily: FONT, color: theme.subtitle, lineHeight: 20 },
    },
    legend: {
      data: [
        { name: "Normal", itemStyle: { color: NORMAL_COLOR } },
        { name: "Tumor",  itemStyle: { color: TUMOR_COLOR } },
      ],
      bottom: 80, left: "center",
      textStyle: { color: theme.subtitle, fontSize: 9, fontFamily: FONT },
      itemWidth: 12, itemHeight: 8,
    },
    grid: { left: 55, right: 20, top: 100, bottom: 120 },
    xAxis: {
      type: "category" as const,
      data: [`Normal (n=${normalVals.length})`, `Tumor (n=${tumorVals.length})`],
      axisLabel: { fontSize: 10, fontFamily: FONT, color: theme.axis, fontWeight: "bold", interval: 0 },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: theme.axisLine } },
    },
    yAxis: {
      type: "value" as const,
      name: `${de.gene} mRNA Expression (log₂)`,
      nameTextStyle: { fontSize: 10, fontFamily: FONT, color: theme.axis },
      axisLabel: { fontSize: 9, fontFamily: FONT, color: theme.axis },
      splitLine: { lineStyle: { color: theme.gridLine, type: "dashed" as const } },
      axisLine: { show: true, lineStyle: { color: theme.axisLine } },
    },
    graphic: gfx,
    series: [
      {
        name: "Normal", type: "boxplot",
        data: [{ value: normalBox, itemStyle: { color: NORMAL_FILL, borderColor: NORMAL_COLOR, borderWidth: 2 } }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        encode: undefined as any,
      },
      {
        name: "Tumor", type: "boxplot",
        data: [
          { value: [0,0,0,0,0], itemStyle: { borderWidth: 0, color: "transparent", borderColor: "transparent", opacity: 0 } },
          { value: tumorBox, itemStyle: { color: TUMOR_FILL, borderColor: TUMOR_COLOR, borderWidth: 2 } },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        encode: undefined as any,
      },
      {
        type: "scatter",
        data: normalVals.map(v => [0 + (Math.random() - 0.5) * 0.25, v]),
        symbolSize: 3, itemStyle: { color: NORMAL_COLOR, opacity: 0.35 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        silent: true as any,
      },
      {
        type: "scatter",
        data: tumorVals.map(v => [1 + (Math.random() - 0.5) * 0.25, v]),
        symbolSize: 3, itemStyle: { color: TUMOR_COLOR, opacity: 0.35 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        silent: true as any,
      },
    ],
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(20,20,28,0.96)",
      borderColor: "rgba(255,255,255,0.06)",
      textStyle: { color: "#e2e8f0", fontSize: 10, fontFamily: FONT },
    },
    color: [NORMAL_COLOR, TUMOR_COLOR],
  };
}

export function GeneBoxplots({
  values,
  samples,
  deResults,
  topN = 5,
  provenance,
  className = "",
}: GeneBoxplotsProps) {
  const { t } = useTranslation();

  const topGenes = useMemo(() => {
    return [...deResults]
      .filter(r => r.adjusted_p_value < 0.05)
      .sort((a, b) => a.adjusted_p_value - b.adjusted_p_value)
      .slice(0, topN);
  }, [deResults, topN]);

  const chartData = useMemo(() => {
    return topGenes.map(de => {
      const geneVals = values[de.gene] || [];
      const tumorVals: number[] = [];
      const normalVals: number[] = [];
      samples.forEach((s, i) => {
        const v = geneVals[i] ?? 0;
        if (s.sample_type === "normal") normalVals.push(v);
        else tumorVals.push(v);
      });

      const normalBox = boxplotStats(normalVals);
      const tumorBox = boxplotStats(tumorVals);

      // Dark theme option for in-app display
      const displayOption = buildOption(de, normalVals, tumorVals, normalBox, tumorBox, DARK, "transparent");
      // Light theme option for publication export
      const pubOption = buildOption(de, normalVals, tumorVals, normalBox, tumorBox, LIGHT, "#ffffff");

      return { gene: de.gene, displayOption, pubOption };
    });
  }, [topGenes, values, samples]);

  if (chartData.length === 0) return null;

  return (
    <div className={className}>
      <h3 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider mb-3">
        {t("atlas.boxplots", "Expression Distribution (Top Significant Genes)")}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {chartData.map(({ gene, displayOption, pubOption }) => (
          <KiriChart
            key={gene}
            title={`${gene} — Tumor vs Normal`}
            option={displayOption}
            publicationOption={pubOption}
            provenance={provenance}
            height="480px"
            sourceModule="atlas"
            dataSource={provenance?.source || "TCGA"}
            citation="Wilcoxon rank-sum test, BH FDR correction"
          />
        ))}
      </div>
    </div>
  );
}
