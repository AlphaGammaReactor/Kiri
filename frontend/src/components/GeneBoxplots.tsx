/**
 * Kiri Atlas — Gene Boxplots (Supplementary Plots)
 *
 * Auto-generates boxplot/violin ECharts plots for the top N most
 * significant genes, showing Tumor vs Normal distributions with
 * Wilcoxon p-value annotations.
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

      const pStr = de.adjusted_p_value < 0.001
        ? de.adjusted_p_value.toExponential(2)
        : de.adjusted_p_value.toFixed(4);

      const fc = de.log2_fold_change;
      const fcLabel = `log₂FC = ${fc > 0 ? "+" : ""}${fc.toFixed(2)}`;

      const option: EChartsOption = {
        title: {
          text: `{gene|${de.gene}}`,
          subtext: `FDR = ${pStr}  |  ${fcLabel}`,
          left: "center",
          top: 6,
          textStyle: {
            fontSize: 13,
            fontWeight: "bold",
            color: "#e2e8f0",
            rich: {
              gene: {
                fontStyle: "italic",
                fontSize: 13,
                fontWeight: "bold",
                color: "#e2e8f0",
              },
            },
          },
          subtextStyle: {
            fontSize: 10,
            color: "#94a3b8",
          },
        },
        grid: {
          left: 50,
          right: 20,
          top: 60,
          bottom: 40,
        },
        xAxis: {
          type: "category" as const,
          data: [
            `Normal (n=${normalVals.length})`,
            `Tumor (n=${tumorVals.length})`,
          ],
          axisLabel: { fontSize: 10, color: "#94a3b8" },
          axisTick: { show: false },
        },
        yAxis: {
          type: "value" as const,
          name: "Expression",
          nameTextStyle: { fontSize: 9, color: "#64748b" },
          axisLabel: { fontSize: 9, color: "#64748b" },
          splitLine: { lineStyle: { color: "#1e293b" } },
        },
        series: [
          {
            type: "boxplot",
            data: [normalBox, tumorBox],
            itemStyle: {
              borderWidth: 1.5,
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            encode: undefined as any,
            colorBy: "data" as const,
          },
          // Overlay individual data points as scatter
          {
            type: "scatter",
            data: normalVals.map(v => [0 + (Math.random() - 0.5) * 0.3, v]),
            symbolSize: 3,
            itemStyle: { color: "#22c55e", opacity: 0.4 },
          },
          {
            type: "scatter",
            data: tumorVals.map(v => [1 + (Math.random() - 0.5) * 0.3, v]),
            symbolSize: 3,
            itemStyle: { color: "#ef4444", opacity: 0.4 },
          },
        ],
        color: ["#22c55e", "#ef4444"],
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {chartOptions.map(({ gene, option }) => (
          <KiriChart
            key={gene}
            title={`${gene} — Tumor vs Normal`}
            option={option}
            provenance={provenance}
            height="280px"
            sourceModule="atlas"
            dataSource={provenance?.source || "TCGA"}
            citation={`Wilcoxon rank-sum test, BH FDR correction`}
          />
        ))}
      </div>
    </div>
  );
}
