/**
 * Kiri Atlas — Gene Boxplots (Supplementary Plots)
 *
 * Publication-ready boxplot charts for the top N most significant
 * differentially expressed genes: Tumor vs Normal distributions
 * with Wilcoxon p-value annotations and embedded statistics cards.
 *
 * Design aligned with high-impact journal standards:
 * - Distinct Normal (blue) / Tumor (red-orange) color coding
 * - Significance asterisks (*, **, ***) above boxes
 * - Y-axis: "{Gene} mRNA Expression (log₂)"
 * - Statistics card embedded via ECharts graphic for combined SVG export
 * - Arial/Helvetica font, 10-12px
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
  /** Expression values per gene */
  values: Record<string, number[]>;
  /** Sample metadata (aligned with value arrays) */
  samples: Sample[];
  /** DE results for significance annotations */
  deResults: DEResult[];
  /** Max number of genes to plot */
  topN?: number;
  /** Provenance for export */
  provenance?: Provenance | null;
  className?: string;
}

// ── Journal-standard color palette ──
const NORMAL_COLOR = "#4393C3";       // Blue — control group
const NORMAL_FILL  = "rgba(67,147,195,0.15)";
const TUMOR_COLOR  = "#D6604D";       // Red-orange — experimental group
const TUMOR_FILL   = "rgba(214,96,77,0.15)";
const FONT_FAMILY  = "'Arial', 'Helvetica Neue', 'Helvetica', sans-serif";

/**
 * Compute boxplot stats: min, q1, median, q3, max
 */
function boxplotStats(arr: number[]): [number, number, number, number, number] {
  if (arr.length === 0) return [0, 0, 0, 0, 0];
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  const q1Idx = Math.floor(n * 0.25);
  const medIdx = Math.floor(n * 0.5);
  const q3Idx = Math.floor(n * 0.75);
  return [
    sorted[0],
    sorted[q1Idx],
    sorted[medIdx],
    sorted[q3Idx],
    sorted[n - 1],
  ];
}

function pToStars(p: number): string {
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "ns";
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

  // Get top N significant genes sorted by adjusted p-value
  const topGenes = useMemo(() => {
    return [...deResults]
      .filter(r => r.adjusted_p_value < 0.05)
      .sort((a, b) => a.adjusted_p_value - b.adjusted_p_value)
      .slice(0, topN);
  }, [deResults, topN]);

  // Build chart options for each gene
  const chartOptions = useMemo(() => {
    return topGenes.map(de => {
      const geneVals = values[de.gene] || [];

      // Split by sample type
      const tumorVals: number[] = [];
      const normalVals: number[] = [];
      samples.forEach((s, i) => {
        const v = geneVals[i] ?? 0;
        if (s.sample_type === "normal") normalVals.push(v);
        else tumorVals.push(v);
      });

      const normalBox = boxplotStats(normalVals);
      const tumorBox = boxplotStats(tumorVals);

      const fdr = de.adjusted_p_value;
      const fdrStr = fdr < 0.001
        ? fdr.toExponential(2)
        : fdr.toFixed(4);

      const fc = de.log2_fold_change;
      const fcLabel = `${fc > 0 ? "+" : ""}${fc.toFixed(2)}`;
      const stars = pToStars(fdr);

      // Compute means for the stats card
      const normalMean = normalVals.length > 0
        ? normalVals.reduce((a, b) => a + b, 0) / normalVals.length
        : 0;
      const tumorMean = tumorVals.length > 0
        ? tumorVals.reduce((a, b) => a + b, 0) / tumorVals.length
        : 0;

      // ── ECharts graphic elements: Stats card embedded in canvas ──
      const statsRows = [
        { metric: "Gene",       value: de.gene },
        { metric: "FDR",        value: fdrStr },
        { metric: "log₂FC",    value: fcLabel },
        { metric: "N (n)",      value: String(normalVals.length) },
        { metric: "T (n)",      value: String(tumorVals.length) },
        { metric: "N Mean",     value: normalMean.toFixed(2) },
        { metric: "T Mean",     value: tumorMean.toFixed(2) },
        { metric: "Sig.",       value: stars },
      ];

      // Build graphic text elements for the stats card (right side)
      const statsCardX = "68%"; // positioned to the right of boxplot
      const statsCardYStart = 80;
      const lineHeight = 18;

      const statsValueX = "96%"; // right-aligned value column
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const graphicElements: any[] = [
        // Stats card header
        {
          type: "text",
          left: statsCardX,
          top: statsCardYStart - 18,
          style: {
            text: "Statistics",
            font: `bold 10px ${FONT_FAMILY}`,
            fill: "#94a3b8",
          },
        },
        // Header underline
        {
          type: "line",
          left: statsCardX,
          top: statsCardYStart - 4,
          shape: { x1: 0, y1: 0, x2: 90, y2: 0 },
          style: { stroke: "#334155", lineWidth: 1 },
        },
      ];

      statsRows.forEach((row, idx) => {
        const y = statsCardYStart + idx * lineHeight;
        // Metric label
        graphicElements.push({
          type: "text",
          left: statsCardX,
          top: y,
          style: {
            text: row.metric,
            font: `10px ${FONT_FAMILY}`,
            fill: "#64748b",
          },
        });
        // Value
        graphicElements.push({
          type: "text",
          left: statsValueX,
          top: y,
          style: {
            text: row.value,
            font: `bold 10px ${FONT_FAMILY}`,
            fill: row.metric === "Sig."
              ? (stars === "ns" ? "#64748b" : "#f59e0b")
              : "#e2e8f0",
            textAlign: "right",
          },
        });
      });

      // ── Significance annotation above the boxes ──
      if (stars !== "ns") {
        graphicElements.push({
          type: "group",
          left: "center",
          top: 56,
          children: [
            // Bracket line
            {
              type: "line",
              shape: { x1: -30, y1: 6, x2: 30, y2: 6 },
              style: { stroke: "#94a3b8", lineWidth: 1 },
            },
            // Left tick
            {
              type: "line",
              shape: { x1: -30, y1: 6, x2: -30, y2: 10 },
              style: { stroke: "#94a3b8", lineWidth: 1 },
            },
            // Right tick
            {
              type: "line",
              shape: { x1: 30, y1: 6, x2: 30, y2: 10 },
              style: { stroke: "#94a3b8", lineWidth: 1 },
            },
            // Stars text
            {
              type: "text",
              left: "center",
              top: -6,
              style: {
                text: stars,
                font: `bold 12px ${FONT_FAMILY}`,
                fill: "#f59e0b",
                textAlign: "center",
              },
            },
          ],
        });
      }

      const option: EChartsOption = {
        textStyle: {
          fontFamily: FONT_FAMILY,
        },
        title: {
          text: `{gene|${de.gene}}`,
          subtext: `FDR = ${fdrStr}   |   log₂FC = ${fcLabel}`,
          left: "32%",
          top: 6,
          textStyle: {
            fontSize: 14,
            fontWeight: "bold",
            fontFamily: FONT_FAMILY,
            color: "#e2e8f0",
            rich: {
              gene: {
                fontStyle: "italic",
                fontSize: 14,
                fontWeight: "bold",
                fontFamily: FONT_FAMILY,
                color: "#e2e8f0",
              },
            },
          },
          subtextStyle: {
            fontSize: 10,
            fontFamily: FONT_FAMILY,
            color: "#94a3b8",
            lineHeight: 16,
          },
        },
        legend: {
          data: [
            { name: "Normal", itemStyle: { color: NORMAL_COLOR } },
            { name: "Tumor",  itemStyle: { color: TUMOR_COLOR } },
          ],
          bottom: 2,
          left: "25%",
          textStyle: { color: "#94a3b8", fontSize: 9, fontFamily: FONT_FAMILY },
          itemWidth: 12,
          itemHeight: 8,
        },
        grid: {
          left: 55,
          right: "36%",
          top: 80,
          bottom: 55,
        },
        xAxis: {
          type: "category" as const,
          data: [
            `Normal (n=${normalVals.length})`,
            `Tumor (n=${tumorVals.length})`,
          ],
          axisLabel: {
            fontSize: 10,
            fontFamily: FONT_FAMILY,
            color: "#94a3b8",
            fontWeight: "bold",
            interval: 0,       // force ALL category labels to render
          },
          axisTick: { show: false },
          axisLine: { lineStyle: { color: "#334155" } },
        },
        yAxis: {
          type: "value" as const,
          name: `${de.gene} mRNA Expression (log₂)`,
          nameTextStyle: {
            fontSize: 10,
            fontFamily: FONT_FAMILY,
            color: "#64748b",
            padding: [0, 0, 0, 0],
          },
          axisLabel: {
            fontSize: 9,
            fontFamily: FONT_FAMILY,
            color: "#64748b",
          },
          splitLine: { lineStyle: { color: "#1e293b", type: "dashed" as const } },
          axisLine: { show: true, lineStyle: { color: "#334155" } },
        },
        graphic: graphicElements,
        series: [
          // Normal boxplot
          {
            name: "Normal",
            type: "boxplot",
            data: [{
              value: normalBox,
              itemStyle: {
                color: NORMAL_FILL,
                borderColor: NORMAL_COLOR,
                borderWidth: 2,
              },
            }],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            encode: undefined as any,
          },
          // Tumor boxplot
          {
            name: "Tumor",
            type: "boxplot",
            data: [
              // Pad first slot with invisible entry so Tumor aligns to second category
              {
                value: [0, 0, 0, 0, 0],
                itemStyle: { borderWidth: 0, color: "transparent", borderColor: "transparent", opacity: 0 },
              },
              {
                value: tumorBox,
                itemStyle: {
                  color: TUMOR_FILL,
                  borderColor: TUMOR_COLOR,
                  borderWidth: 2,
                },
              },
            ],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            encode: undefined as any,
          },
          // Scatter overlay: Normal data points
          {
            type: "scatter",
            data: normalVals.map(v => [0 + (Math.random() - 0.5) * 0.25, v]),
            symbolSize: 3,
            itemStyle: { color: NORMAL_COLOR, opacity: 0.35 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            silent: true as any,
          },
          // Scatter overlay: Tumor data points
          {
            type: "scatter",
            data: tumorVals.map(v => [1 + (Math.random() - 0.5) * 0.25, v]),
            symbolSize: 3,
            itemStyle: { color: TUMOR_COLOR, opacity: 0.35 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            silent: true as any,
          },
        ],
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(20, 20, 28, 0.96)",
          borderColor: "rgba(255,255,255,0.06)",
          textStyle: { color: "#e2e8f0", fontSize: 10, fontFamily: FONT_FAMILY },
        },
        // Force these exact colors for the series
        color: [NORMAL_COLOR, TUMOR_COLOR],
      };

      return { gene: de.gene, option, pValue: de.adjusted_p_value };
    });
  }, [topGenes, values, samples]);

  if (chartOptions.length === 0) return null;

  return (
    <div className={className}>
      <h3 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider mb-3">
        {t("atlas.boxplots", "Expression Distribution (Top Significant Genes)")}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {chartOptions.map(({ gene, option }) => (
          <KiriChart
            key={gene}
            title={`${gene} — Tumor vs Normal`}
            option={option}
            provenance={provenance}
            height="400px"
            sourceModule="atlas"
            dataSource={provenance?.source || "TCGA"}
            citation={`Wilcoxon rank-sum test, BH FDR correction`}
          />
        ))}
      </div>
    </div>
  );
}
