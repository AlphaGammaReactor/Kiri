/**
 * Kiri Atlas — Expression Heatmap Component (Enhanced)
 *
 * Publication-grade heatmap with:
 * - Data transformations (log2, Z-score)
 * - Hierarchical clustering with dendrograms
 * - Force-group by sample type (Normal | Tumor) with within-group clustering
 * - Multiple clinical annotation bars (type, stage, MSI)
 * - FDR-corrected significance markers (*, **, ***)
 * - Gene pathway tags (color blocks)
 * - Colorblind-friendly default gradient (blue-white-red)
 * - Zoom, pan, brush selection
 * - Enhanced interactive tooltips
 * - KiriChart export (SVG/PNG/PDF)
 */

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { KiriChart } from "./KiriChart";
import type { Provenance, DEResult } from "../services/api";
import { useTranslation } from "react-i18next";
import {
  applyLog2Transform,
  applyZScore,
  performClustering,
  groupThenClusterSamples,
  COLOR_PALETTES,
  DEFAULT_PALETTE,
  PATHWAY_TAGS,
  pValueToAsterisks,
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

export type SampleLabelMode = "full" | "group" | "colorbar";

export interface HeatmapOptions {
  transform: "none" | "log2" | "zscore";
  clusterRows: boolean;
  clusterCols: boolean;
  distanceMetric: DistanceMetric;
  linkageMethod: LinkageMethod;
  colorPalette: string;
  fontSize: number;
  showAnnotations: boolean;
  groupByType: boolean;
  showDendrogram: boolean;
  dendrogramWidth: number;
  colorRangeMin?: number;
  colorRangeMax?: number;
  sampleLabelMode: SampleLabelMode;
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
  groupByType: true,
  showDendrogram: false,
  dendrogramWidth: 40,
  sampleLabelMode: "full",
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
  /** DE results for real significance markers (FDR-corrected p-values) */
  deResults?: DEResult[];
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
  deResults,
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

  // ── Build DE lookup map ──
  const deLookup = useMemo(() => {
    const map = new Map<string, DEResult>();
    if (deResults) {
      for (const r of deResults) {
        map.set(r.gene, r);
      }
    }
    return map;
  }, [deResults]);

  // ── Clustering ──
  const { orderedGenes, orderedSamples, orderedIndices, normalCount: groupedNormalCount } = useMemo(() => {
    let geneOrder = genes.map((_, i) => i);
    let sampleOrder = samples.map((_, i) => i);
    let nCount = 0;

    // Row clustering (genes)
    if (options.clusterRows && genes.length >= 2) {
      const geneMatrix = genes.map((gene) => transformedValues[gene] || []);
      const result = performClustering(geneMatrix, options.distanceMetric, options.linkageMethod);
      if (result) geneOrder = result.order;
    }

    // Column ordering
    if (options.groupByType) {
      // Force-group by type, then cluster within each group
      const grouped = groupThenClusterSamples(
        samples,
        genes,
        transformedValues,
        options.distanceMetric,
        options.linkageMethod,
      );
      sampleOrder = grouped.order;
      nCount = grouped.normalCount;
    } else if (options.clusterCols && samples.length >= 2) {
      // Free clustering
      const sampleMatrix = samples.map((_, si) =>
        genes.map((gene) => (transformedValues[gene] || [])[si] ?? 0)
      );
      const result = performClustering(sampleMatrix, options.distanceMetric, options.linkageMethod);
      if (result) sampleOrder = result.order;
    } else {
      // Default sort: Normal first, then Tumor
      sampleOrder = samples
        .map((s, i) => ({ sample: s, idx: i }))
        .sort((a, b) => {
          if (a.sample.sample_type === "normal" && b.sample.sample_type !== "normal") return -1;
          if (a.sample.sample_type !== "normal" && b.sample.sample_type === "normal") return 1;
          return 0;
        })
        .map((s) => s.idx);
      nCount = samples.filter(s => s.sample_type === "normal").length;
    }

    return {
      orderedGenes: geneOrder.map((i) => genes[i]),
      orderedSamples: sampleOrder.map((i) => samples[i]),
      orderedIndices: { genes: geneOrder, samples: sampleOrder },
      normalCount: nCount || samples.filter(s => s.sample_type === "normal").length,
    };
  }, [genes, samples, transformedValues, options.clusterRows, options.clusterCols, options.groupByType, options.distanceMetric, options.linkageMethod]);

  // ── Gene significance (from real DE or fallback fold-change) ──
  const geneSignificance = useMemo(() => {
    const result: Record<string, { fc: number; significant: boolean; stars: string; adjustedP?: number }> = {};
    for (const gene of orderedGenes) {
      const de = deLookup.get(gene);
      if (de) {
        const stars = pValueToAsterisks(de.adjusted_p_value);
        result[gene] = {
          fc: Math.pow(2, de.log2_fold_change), // Convert log2FC back to FC for display
          significant: de.adjusted_p_value < 0.05,
          stars,
          adjustedP: de.adjusted_p_value,
        };
      } else {
        // Fallback: compute simple fold-change
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
          stars: "",
        };
      }
    }
    return result;
  }, [orderedGenes, transformedValues, samples, orderedIndices.samples, options.deFilter, deLookup]);

  // ── Build ECharts Option ──
  const option: EChartsOption = useMemo(() => {
    if (!orderedGenes.length || !orderedSamples.length) return {};

    const palette = COLOR_PALETTES[options.colorPalette] || COLOR_PALETTES[DEFAULT_PALETTE];
    const showOnlySig = options.deFilter?.showOnly ?? false;

    // Filter genes if showOnly is set
    const displayGenes = showOnlySig
      ? orderedGenes.filter(g => geneSignificance[g]?.significant)
      : orderedGenes;

    // Build heatmap data
    const heatmapData: [number, number, number][] = [];
    let minVal = Infinity;
    let maxVal = -Infinity;

    displayGenes.forEach((gene, yIdx) => {
      const geneVals = transformedValues[gene] || [];
      orderedIndices.samples.forEach((origIdx, xIdx) => {
        const val = geneVals[origIdx] ?? 0;
        heatmapData.push([xIdx, yIdx, val]);
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      });
    });

    // Apply custom color range if set — smart defaults for log2 and zscore
    const getDefaultMin = () => {
      if (options.transform === "log2") return 2;
      if (options.transform === "zscore") return -2;
      return isFinite(minVal) ? minVal : 0;
    };
    const getDefaultMax = () => {
      if (options.transform === "log2") return 5;
      if (options.transform === "zscore") return 2;
      return isFinite(maxVal) ? maxVal : 1;
    };
    const vmMin = options.colorRangeMin ?? getDefaultMin();
    const vmMax = options.colorRangeMax ?? getDefaultMax();

    // Sample labels based on display mode
    const labelMode = options.sampleLabelMode || "full";
    const sampleLabels = orderedSamples.map((s) => {
      if (labelMode === "group") return s.sample_type === "normal" ? "N" : "T";
      return `${s.sample_id.slice(-6)} (${s.sample_type === "normal" ? "N" : "T"})`;
    });
    const showAxisLabels = labelMode !== "colorbar";

    // Gene labels with significance asterisks and pathway tags
    const geneLabels = displayGenes.map((gene) => {
      const sig = geneSignificance[gene];
      const stars = sig?.stars || "";
      const tag = PATHWAY_TAGS[gene];
      const suffix = tag ? ` [${tag.name.slice(0, 6)}]` : "";
      return stars ? `${stars} ${gene}${suffix}` : `${gene}${suffix}`;
    });

    // Annotation bar series
    const annotationSeries: NonNullable<EChartsOption["series"]> = [];

    if (options.showAnnotations) {
      // Sample type bar (row -1)
      const typeBarData = orderedSamples.map((s, i) => ({
        value: [i, -1, 0] as [number, number, number],
        itemStyle: { color: SAMPLE_TYPE_COLORS[s.sample_type] || "#64748b" },
      }));
      annotationSeries.push({
        type: "heatmap",
        data: typeBarData,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tooltip: { formatter: (p: any) => `Type: ${orderedSamples[p.data.value[0]]?.sample_type || "—"}` } as any,
        silent: true,
      });

      // Stage bar (row -2)
      const stageBarData = orderedSamples.map((s, i) => ({
        value: [i, -2, 0] as [number, number, number],
        itemStyle: { color: STAGE_COLORS[s.stage] || "#334155" },
      }));
      annotationSeries.push({
        type: "heatmap",
        data: stageBarData,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tooltip: { formatter: (p: any) => `Stage: ${orderedSamples[p.data.value[0]]?.stage || "—"}` } as any,
        silent: true,
      });

      // MSI bar (row -3)
      const msiBarData = orderedSamples.map((s, i) => ({
        value: [i, -3, 0] as [number, number, number],
        itemStyle: { color: MSI_COLORS[s.msi_status] || "#334155" },
      }));
      annotationSeries.push({
        type: "heatmap",
        data: msiBarData,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tooltip: { formatter: (p: any) => `MSI: ${orderedSamples[p.data.value[0]]?.msi_status || "—"}` } as any,
        silent: true,
      });
    }

    // Determine dynamic grid to accommodate annotations
    const annotationOffset = options.showAnnotations ? 40 : 0;

    // Normal/Tumor split line position
    const normalCount = groupedNormalCount;

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
          if (yIdx < 0) return ""; // annotation bar
          const sample = orderedSamples[xIdx];
          const gene = displayGenes[yIdx];
          if (!sample || !gene) return "";
          const expr = d[2];
          const sig = geneSignificance[gene];
          const transformLabel = options.transform === "log2" ? "log₂" : options.transform === "zscore" ? "Z" : normalization.toUpperCase();
          const de = deLookup.get(gene);
          const pStr = de ? `FDR: <b>${de.adjusted_p_value < 0.001 ? de.adjusted_p_value.toExponential(2) : de.adjusted_p_value.toFixed(4)}</b>` : "";
          const pathwayTag = PATHWAY_TAGS[gene];
          const pathwayStr = pathwayTag ? `Pathway: ${pathwayTag.name}` : "";
          return `
            <div style="font-size:11px; max-width: 260px">
              <b style="font-style:italic">${gene}</b>${sig?.stars ? ` <span style="color:#f59e0b">${sig.stars}</span>` : ""}<br/>
              ${t("atlas.sample", "Sample")}: ${sample.sample_id}<br/>
              ${t("atlas.type", "Type")}: ${sample.sample_type}<br/>
              ${t("atlas.stage", "Stage")}: ${sample.stage || "—"}<br/>
              MSI: ${sample.msi_status || "—"}<br/>
              ${t("atlas.expression", "Expression")}: <b>${expr.toFixed(2)}</b> ${transformLabel}<br/>
              ${sig ? `FC: ${sig.fc.toFixed(2)}×` : ""}
              ${pStr ? `<br/>${pStr}` : ""}
              ${pathwayStr ? `<br/><span style="color:${pathwayTag?.color}">${pathwayStr}</span>` : ""}
            </div>
          `;
        },
      },
      grid: {
        left: 120,
        right: 24,
        top: 48 + annotationOffset,
        bottom: labelMode === "colorbar" ? 24 : (labelMode === "group" ? 36 : 80),
      },
      xAxis: {
        type: "category" as const,
        data: sampleLabels,
        axisLabel: {
          show: showAxisLabels,
          rotate: labelMode === "group" ? 0 : 45,
          fontSize: labelMode === "group" ? 9 : 7,
          color: "#64748b",
          interval: labelMode === "group"
            ? Math.max(0, Math.floor(sampleLabels.length / 40) - 1)
            : Math.max(0, Math.floor(sampleLabels.length / 30) - 1),
          formatter: labelMode === "group" ? undefined : ((v: string) => (v as string).slice(0, 12)),
        },
        axisTick: { show: showAxisLabels, length: 2, lineStyle: { color: "#334155" } },
        splitArea: { show: false },
        name: `Samples (n=${orderedSamples.length})`,
        nameLocation: "center" as const,
        nameGap: labelMode === "colorbar" ? 12 : (labelMode === "group" ? 25 : 45),
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
        nameGap: 100,
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
            const str = String(value);
            // Check if this gene is significant (starts with asterisks)
            const hasStars = str.startsWith("*");
            if (hasStars) {
              return `{sig|${str}}`;
            }
            // Check for pathway tag
            const baseGene = str.split(" [")[0];
            const tag = PATHWAY_TAGS[baseGene];
            if (tag) {
              return `{tag|${str}}`;
            }
            return str;
          },
          rich: {
            sig: {
              color: "#d97706",
              fontWeight: "bold" as const,
              fontStyle: "italic" as const,
              fontSize: options.fontSize,
            },
            tag: {
              color: "#60a5fa",
              fontStyle: "italic" as const,
              fontSize: options.fontSize,
            },
          },
        },
      },
      visualMap: {
        min: vmMin,
        max: vmMax,
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
            normalCount > 0 && normalCount < orderedSamples.length
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
                        <span style="color:#94a3b8;font-size:9px">${options.groupByType ? "Grouped + within-group clustering" : "Sorted Normal → Tumor"}</span>
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
  }, [orderedGenes, orderedSamples, orderedIndices, transformedValues, options, geneSignificance, normalization, t, source, deLookup, groupedNormalCount]);


  // ── Title ──
  const normalCount = samples.filter((s) => s.sample_type === "normal").length;
  const tumorCount = samples.filter((s) => s.sample_type === "tumor").length;
  const transformSuffix = options.transform !== "none" ? ` [${options.transform.toUpperCase()}]` : "";
  const clusterSuffix = options.clusterRows || options.clusterCols || options.groupByType ? " 🌲" : "";
  const parsedSource = source.includes("GDC") || source.includes("TCGA") ? "TCGA-COAD+READ" : source;
  const title = `${t("atlas.heatmapTitle", "Expression Heatmap")} — ${parsedSource} (n=${samples.length}: ${tumorCount}T / ${normalCount}N)${transformSuffix}${clusterSuffix}`;

  return (
    <div className="relative">
      {/* Sample Annotation Legend */}
      {options.showAnnotations && samples.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 mb-2 px-2">
          <span className="text-[10px] text-kiri-text-dim uppercase tracking-wider">Annotations:</span>
          <div className="flex flex-wrap items-center gap-3 text-[10px] text-kiri-text-muted">
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

          {/* Pathway tags legend */}
          {orderedGenes.some(g => PATHWAY_TAGS[g]) && (
            <>
              <span className="text-kiri-border">|</span>
              <span className="text-[10px] text-kiri-text-dim uppercase tracking-wider">
                {t("atlas.pathwayTag", "Pathways")}:
              </span>
              <div className="flex flex-wrap items-center gap-3 text-[10px]">
                {Object.entries(PATHWAY_TAGS)
                  .filter(([gene]) => orderedGenes.includes(gene))
                  .map(([gene, tag]) => (
                    <span key={gene} className="flex items-center gap-1 text-kiri-text-muted">
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                      <span className="italic">{gene}</span>: {tag.name}
                    </span>
                  ))}
              </div>
            </>
          )}

          {/* Significance legend when DE results available */}
          {deResults && deResults.length > 0 && (
            <>
              <span className="text-kiri-border">|</span>
              <div className="flex items-center gap-2 text-[10px] text-amber-400">
                <span>* p&lt;0.05</span>
                <span>** p&lt;0.01</span>
                <span>*** p&lt;0.001</span>
                <span className="text-kiri-text-dim">(FDR)</span>
              </div>
            </>
          )}
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
