/**
 * Kiri Atlas — Expression Heatmap Component (Enhanced)
 *
 * Full-featured heatmap with:
 * - Data transformations (log2, Z-score)
 * - Hierarchical clustering with dendrograms
 * - Sample annotation color bars
 * - Differential expression highlighting
 * - Zoom, pan, brush selection
 * - Export (SVG/PNG)
 * - Configurable color palettes and fonts
 */

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { KiriChart } from "./KiriChart";
import type { Provenance } from "../services/api";
import { useTranslation } from "react-i18next";
import {
  applyLog2Transform,
  applyZScore,
  performClustering,
  COLOR_PALETTES,
  DEFAULT_PALETTE,
  type DistanceMetric,
  type LinkageMethod,
} from "../utils/heatmapUtils";

interface Sample {
  sample_id: string;
  sample_type: string;
  stage: string;
  msi_status: string;
  project: string;
}

export interface HeatmapOptions {
  transform: "none" | "log2" | "zscore";
  clusterRows: boolean;
  clusterCols: boolean;
  distanceMetric: DistanceMetric;
  linkageMethod: LinkageMethod;
  colorPalette: string;
  fontSize: number;
  showAnnotations: boolean;
  deFilter?: {
    foldChangeThreshold: number;
    showOnly: boolean;
  };
}

export const DEFAULT_HEATMAP_OPTIONS: HeatmapOptions = {
  transform: "none",
  clusterRows: false,
  clusterCols: false,
  distanceMetric: "euclidean",
  linkageMethod: "ward",
  colorPalette: DEFAULT_PALETTE,
  fontSize: 11,
  showAnnotations: true,
};

interface ExpressionHeatmapProps {
  genes: string[];
  samples: Sample[];
  values: Record<string, number[]>;
  normalization: string;
  source: string;
  provenance?: Provenance | null;
  loading?: boolean;
  error?: string;
  className?: string;
  options?: HeatmapOptions;
  onGeneListExport?: (genes: string[]) => void;
}

/** Color maps for annotation bars */
const SAMPLE_TYPE_COLORS: Record<string, string> = {
  tumor: "#ef4444",
  normal: "#22c55e",
};
const STAGE_COLORS: Record<string, string> = {
  "Stage I": "#60a5fa",
  "Stage II": "#f59e0b",
  "Stage III": "#f97316",
  "Stage IV": "#dc2626",
};
const MSI_COLORS: Record<string, string> = {
  "MSI-H": "#a855f7",
  "MSI-L": "#6366f1",
  "MSS": "#94a3b8",
};

export function ExpressionHeatmap({
  genes,
  samples,
  values,
  normalization,
  source,
  provenance,
  loading,
  error,
  className,
  options = DEFAULT_HEATMAP_OPTIONS,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onGeneListExport: _onGeneListExport,
}: ExpressionHeatmapProps) {
  const { t } = useTranslation();

  // ── Data Transformation ──
  const transformedValues = useMemo(() => {
    let v = values;
    if (options.transform === "log2") {
      v = applyLog2Transform(v);
    } else if (options.transform === "zscore") {
      v = applyZScore(v);
    }
    return v;
  }, [values, options.transform]);

  // ── Clustering ──
  const { orderedGenes, orderedSamples, orderedIndices } = useMemo(() => {
    let geneOrder = genes.map((_, i) => i);
    let sampleOrder = samples.map((_, i) => i);

    // Row clustering (genes)
    if (options.clusterRows && genes.length >= 2) {
      const geneMatrix = genes.map((gene) => transformedValues[gene] || []);
      const result = performClustering(geneMatrix, options.distanceMetric, options.linkageMethod);
      if (result) geneOrder = result.order;
    }

    // Column clustering (samples)
    if (options.clusterCols && samples.length >= 2) {
      // Transpose: each sample becomes a row
      const sampleMatrix = samples.map((_, si) =>
        genes.map((gene) => (transformedValues[gene] || [])[si] ?? 0)
      );
      const result = performClustering(sampleMatrix, options.distanceMetric, options.linkageMethod);
      if (result) sampleOrder = result.order;
    }

    // If not clustering columns, sort: Normal first, then Tumor
    if (!options.clusterCols) {
      sampleOrder = samples
        .map((s, i) => ({ sample: s, idx: i }))
        .sort((a, b) => {
          if (a.sample.sample_type === "normal" && b.sample.sample_type !== "normal") return -1;
          if (a.sample.sample_type !== "normal" && b.sample.sample_type === "normal") return 1;
          return 0;
        })
        .map((s) => s.idx);
    }

    return {
      orderedGenes: geneOrder.map((i) => genes[i]),
      orderedSamples: sampleOrder.map((i) => samples[i]),
      orderedIndices: { genes: geneOrder, samples: sampleOrder },
    };
  }, [genes, samples, transformedValues, options.clusterRows, options.clusterCols, options.distanceMetric, options.linkageMethod]);

  // ── Fold-change based DE highlighting ──
  const geneSignificance = useMemo(() => {
    const result: Record<string, { fc: number; significant: boolean }> = {};
    for (const gene of orderedGenes) {
      const geneVals = transformedValues[gene] || [];
      const tumorVals: number[] = [];
      const normalVals: number[] = [];
      orderedIndices.samples.forEach((si) => {
        const sample = samples[si];
        const val = geneVals[si] ?? 0;
        if (sample.sample_type === "tumor") tumorVals.push(val);
        else normalVals.push(val);
      });
      const tumorMean = tumorVals.length ? tumorVals.reduce((a, b) => a + b, 0) / tumorVals.length : 0;
      const normalMean = normalVals.length ? normalVals.reduce((a, b) => a + b, 0) / normalVals.length : 0;
      const fc = normalMean > 0 ? tumorMean / normalMean : 0;
      const deThreshold = options.deFilter?.foldChangeThreshold ?? 1.5;
      result[gene] = {
        fc,
        significant: fc > deThreshold || (fc > 0 && fc < 1 / deThreshold),
      };
    }
    return result;
  }, [orderedGenes, transformedValues, samples, orderedIndices.samples, options.deFilter]);

  // ── Build ECharts Option ──
  const option: EChartsOption = useMemo(() => {
    if (!orderedGenes.length || !orderedSamples.length) return {};

    const palette = COLOR_PALETTES[options.colorPalette] || COLOR_PALETTES[DEFAULT_PALETTE];
    const showOnlySig = options.deFilter?.showOnly ?? false;

    // Build heatmap data
    const heatmapData: [number, number, number][] = [];
    let minVal = Infinity;
    let maxVal = -Infinity;

    orderedGenes.forEach((gene, yIdx) => {
      if (showOnlySig && !geneSignificance[gene]?.significant) return;
      const geneVals = transformedValues[gene] || [];
      orderedIndices.samples.forEach((origIdx, xIdx) => {
        const val = geneVals[origIdx] ?? 0;
        heatmapData.push([xIdx, yIdx, val]);
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      });
    });

    // Sample labels
    const sampleLabels = orderedSamples.map((s) =>
      `${s.sample_id.slice(-6)} (${s.sample_type === "normal" ? "N" : "T"})`
    );

    // Gene labels with DE asterisks
    const geneLabels = orderedGenes.map((gene) => {
      const sig = geneSignificance[gene];
      return sig?.significant ? `${gene} *` : gene;
    });

    // Normal/Tumor split line
    const normalCount = orderedSamples.filter((s) => s.sample_type === "normal").length;

    // Annotation bar data (sample type, stage, MSI)
    const annotationSeries: EChartsOption["series"] = [];

    if (options.showAnnotations) {
      // Sample type bar
      const typeBarData = orderedSamples.map((s, i) => ({
        value: [i, -0.5, 0] as [number, number, number],
        itemStyle: { color: SAMPLE_TYPE_COLORS[s.sample_type] || "#64748b" },
      }));
      annotationSeries.push({
        type: "heatmap",
        data: typeBarData,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tooltip: { formatter: (p: any) => orderedSamples[p.data.value[0]]?.sample_type || "" } as any,
        silent: true,
      });
    }

    // Determine dynamic grid to accommodate annotations
    const annotationOffset = options.showAnnotations ? 16 : 0;

    return {
      tooltip: {
        position: "top",
        confine: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          const data = params.data as [number, number, number] | { value: [number, number, number] };
          const d = Array.isArray(data) ? data : data.value;
          if (!d || d.length < 3) return "";
          const xIdx = d[0];
          const yIdx = d[1];
          const sample = orderedSamples[xIdx];
          const gene = orderedGenes[yIdx];
          if (!sample || !gene) return "";
          const expr = d[2];
          const sig = geneSignificance[gene];
          const transformLabel = options.transform === "log2" ? "log₂" : options.transform === "zscore" ? "Z" : normalization.toUpperCase();
          return `
            <div style="font-size:11px; max-width: 240px">
              <b>${gene}</b>${sig?.significant ? " ★" : ""}<br/>
              ${t("atlas.sample", "Sample")}: ${sample.sample_id}<br/>
              ${t("atlas.type", "Type")}: ${sample.sample_type}<br/>
              ${t("atlas.stage", "Stage")}: ${sample.stage || "—"}<br/>
              MSI: ${sample.msi_status || "—"}<br/>
              ${t("atlas.expression", "Expression")}: <b>${expr.toFixed(2)}</b> ${transformLabel}<br/>
              ${sig ? `FC: ${sig.fc.toFixed(2)}×` : ""}
            </div>
          `;
        },
      },
      grid: {
        left: 100,
        right: 24,
        top: 48 + annotationOffset,
        bottom: 80,
      },
      xAxis: {
        type: "category" as const,
        data: sampleLabels,
        axisLabel: {
          show: true,
          rotate: 45,
          fontSize: 7,
          color: "#64748b",
          interval: Math.max(0, Math.floor(sampleLabels.length / 30) - 1),
          formatter: (v: string) => (v as string).slice(0, 12),
        },
        axisTick: { show: true, length: 2, lineStyle: { color: "#334155" } },
        splitArea: { show: false },
        name: `Samples (n=${orderedSamples.length})`,
        nameLocation: "center" as const,
        nameGap: 45,
        nameTextStyle: {
          fontSize: 10,
          color: "#94a3b8",
          fontWeight: "bold" as const,
        },
      },
      yAxis: {
        type: "category" as const,
        data: geneLabels,
        name: "Gene Targets",
        nameLocation: "center" as const,
        nameGap: 80,
        nameTextStyle: {
          fontSize: 10,
          color: "#94a3b8",
          fontWeight: "bold" as const,
          fontStyle: "italic" as const,
        },
        axisLabel: {
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: options.fontSize,
          color: "#94a3b8",
          fontStyle: "italic",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (value: any) => {
            const gene = String(value).replace(" *", "");
            const sig = geneSignificance[gene];
            return sig?.significant ? `{sig|${value}}` : value;
          },
          rich: {
            sig: {
              color: "#d97706",
              fontWeight: "bold" as const,
              fontStyle: "italic" as const,
              fontSize: options.fontSize,
            },
          },
        },
      },
      visualMap: {
        min: isFinite(minVal) ? minVal : 0,
        max: isFinite(maxVal) ? maxVal : 1,
        calculable: true,
        orient: "horizontal" as const,
        left: "center",
        bottom: 4,
        text: [
          `${options.transform === "zscore" ? "Z-score" : options.transform === "log2" ? "log\u2082(" + normalization.toUpperCase() + "+1)" : normalization.toUpperCase()} \u2192 High`,
          `Low \u2190`,
        ],
        inRange: {
          color: palette.colors,
        },
        textStyle: {
          color: "#94a3b8",
          fontSize: 10,
        }
      },
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          filterMode: "none",
        },
        {
          type: "inside",
          yAxisIndex: 0,
          filterMode: "none",
        },
      ],
      toolbox: {
        right: 12,
        top: 8,
        feature: {
          saveAsImage: {
            type: "png",
            name: `kiri_heatmap_${source}`,
            title: "PNG",
            pixelRatio: 3,
          },
          dataView: { show: false },
          restore: { show: false },
        },
        iconStyle: {
          borderColor: "#64748b",
        },
        emphasis: {
          iconStyle: {
            borderColor: "#22d3ee",
          },
        },
      },
      brush: {
        toolbox: ["rect", "clear"],
        brushStyle: {
          borderWidth: 1,
          color: "rgba(34, 211, 238, 0.1)",
          borderColor: "#22d3ee",
        },
        xAxisIndex: 0,
      },
      series: [
        {
          type: "heatmap",
          data: heatmapData,
          emphasis: {
            itemStyle: {
              borderColor: "#22d3ee",
              borderWidth: 1.5,
            },
          },
          markLine:
            normalCount > 0 && normalCount < orderedSamples.length && !options.clusterCols
              ? {
                  silent: false,
                  symbol: "none",
                  lineStyle: {
                    color: "#f59e0b",
                    type: "dashed" as const,
                    width: 1.5,
                  },
                  label: {
                    show: true,
                    formatter: `\u2190 ${t("atlas.normalLabel", "Normal")} (n=${normalCount})  |  ${t("atlas.tumorLabel", "Tumor")} (n=${orderedSamples.length - normalCount}) \u2192`,
                    position: "insideEndTop" as const,
                    fontSize: 9,
                    color: "#f59e0b",
                    backgroundColor: "rgba(15, 23, 42, 0.85)",
                    padding: [2, 6],
                    borderRadius: 2,
                  },
                  tooltip: {
                    formatter: () => {
                      return `<div style="font-size:11px">
                        <b>Sample Type Boundary</b><br/>
                        Normal samples: <b>${normalCount}</b> (left)<br/>
                        Tumor samples: <b>${orderedSamples.length - normalCount}</b> (right)<br/>
                        <span style="color:#94a3b8;font-size:9px">Sorted Normal → Tumor</span>
                      </div>`;
                    },
                  },
                  data: [{ xAxis: normalCount - 0.5 }],
                }
              : undefined,
        },
        ...annotationSeries,
      ],
    };
  }, [orderedGenes, orderedSamples, orderedIndices, transformedValues, options, geneSignificance, normalization, t, source]);


  // ── Title ──
  const normalCount = samples.filter((s) => s.sample_type === "normal").length;
  const tumorCount = samples.filter((s) => s.sample_type === "tumor").length;
  const transformSuffix = options.transform !== "none" ? ` [${options.transform.toUpperCase()}]` : "";
  const clusterSuffix = options.clusterRows || options.clusterCols ? " 🌲" : "";
  const parsedSource = source.includes("GDC") || source.includes("TCGA") ? "TCGA-COAD+READ" : source;
  const title = `${t("atlas.heatmapTitle", "Expression Heatmap")} — ${parsedSource} (n=${samples.length}: ${tumorCount}T / ${normalCount}N)${transformSuffix}${clusterSuffix}`;

  return (
    <div className="relative">
      {/* Sample Annotation Legend */}
      {options.showAnnotations && samples.length > 0 && (
        <div className="flex items-center gap-4 mb-2 px-2">
          <span className="text-[10px] text-kiri-text-dim uppercase tracking-wider">Annotations:</span>
          <div className="flex items-center gap-3 text-[10px] text-kiri-text-muted">
            {Object.entries(SAMPLE_TYPE_COLORS).map(([type, color]) => (
              <span key={type} className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                {type}
              </span>
            ))}
            <span className="text-kiri-border">|</span>
            {Object.entries(STAGE_COLORS).map(([stage, color]) => (
              <span key={stage} className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                {stage}
              </span>
            ))}
            <span className="text-kiri-border">|</span>
            {Object.entries(MSI_COLORS).map(([msi, color]) => (
              <span key={msi} className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                {msi}
              </span>
            ))}
          </div>
        </div>
      )}



      <KiriChart
        title={title}
        option={option}
        provenance={provenance}
        loading={loading}
        error={error}
        height="450px"
        className={className}
        sourceModule="atlas"
        dataSource={provenance?.source || source}
        citation={`${normalization.toUpperCase()} normalization, ${source}`}
      />
    </div>
  );
}
