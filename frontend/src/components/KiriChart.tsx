/**
 * Kiri — Chart Wrapper Component
 *
 * Wraps ECharts instances with:
 * - Provenance footer (data source, method, sample count)
 * - Export controls (SVG/PNG)
 * - Loading/error states
 * - Responsive sizing
 */

import { useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { Card, ProvenanceFooter, ChartSkeleton, StatusBadge } from "./ui";
import type { Provenance } from "../services/api";
import { useAppDispatch } from "../store";
import { addPanel } from "../store/publicationSlice";
import { addToast } from "../store/errorSlice";

interface KiriChartProps {
  title?: string;
  option: EChartsOption;
  provenance?: Provenance | null;
  loading?: boolean;
  error?: string;
  height?: string;
  className?: string;
  /** If true, renders the AI-Suggested badge on the card */
  aiGenerated?: boolean;
  /** Identifies which module generated this chart for the publication engine */
  sourceModule?: 'atlas' | 'interaction' | 'clinical' | 'discovery';
  /** Data source label for the publication panel (e.g. "TCGA-COAD (GDC)") */
  dataSource?: string;
  /** Citation / method label for the publication panel */
  citation?: string;
}

export function KiriChart({
  title,
  option,
  provenance,
  loading,
  error,
  height = "320px",
  className = "",
  aiGenerated,
  sourceModule = "atlas",
  dataSource,
  citation,
}: KiriChartProps) {
  const chartRef = useRef<ReactECharts>(null);
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  // Apply Nature Cell Biology defaults
  const enhancedOption: EChartsOption = {
    ...option,
    backgroundColor: "transparent",
    textStyle: {
      fontFamily: "'Inter', system-ui, sans-serif",
      color: "#94a3b8",
      fontSize: 11,
    },
    grid: {
      containLabel: true,
      left: 16,
      right: 16,
      top: 32,
      bottom: 8,
      ...(option.grid && typeof option.grid === "object" && !Array.isArray(option.grid) ? option.grid : {}),
    },
    // Colorblind-safe palette (Okabe-Ito + extensions)
    color: [
      "#E69F00", // orange
      "#56B4E9", // sky blue
      "#009E73", // bluish green
      "#F0E442", // yellow
      "#0072B2", // blue
      "#D55E00", // vermillion
      "#CC79A7", // reddish purple
      "#999999", // gray
    ],
  };

  const handleExport = useCallback(
    (format: "svg" | "png") => {
      const instance = chartRef.current?.getEchartsInstance();
      if (!instance) return;

      const url = instance.getDataURL({
        type: format === "svg" ? "svg" : "png",
        pixelRatio: format === "png" ? 3 : 1, // 300 DPI for PNG
        backgroundColor: "#ffffff",
      });

      const link = document.createElement("a");
      link.download = `kiri-${title?.toLowerCase().replace(/\s+/g, "-") || "chart"}.${format}`;
      link.href = url;
      link.click();
    },
    [title]
  );

  const handleAddToFigure = useCallback(() => {
    const instance = chartRef.current?.getEchartsInstance();
    if (!instance) return;

    const dataUrl = instance.getDataURL({
      type: "png",
      pixelRatio: 3,
      backgroundColor: "#ffffff",
    });

    const panelTitle = title || "Analysis Plot";
    const moduleLabels: Record<string, string> = { atlas: "Atlas", interaction: "Interaction Lab", clinical: "Clinical Suite", discovery: "AI Discovery" };
    const resolvedDataSource = dataSource || provenance?.source || moduleLabels[sourceModule] || sourceModule;
    const resolvedCitation = citation || (provenance?.method ? `${provenance.method} (${provenance.source})` : undefined);

    dispatch(addPanel({
      sourceModule,
      type: "png",
      data: dataUrl,
      title: panelTitle,
      legend: `Method: ECharts | Source: ${resolvedDataSource} | n=${provenance?.sample_count || "Unknown"}`,
      dataSource: resolvedDataSource,
      citation: resolvedCitation,
    }));

    dispatch(addToast({
      type: 'success',
      title: t('export.figure_added', '"{{name}}" added to Publication Engine', { name: panelTitle }),
      message: resolvedDataSource,
      duration: 3000,
    }));
  }, [title, provenance, sourceModule, dataSource, citation, dispatch, t]);

  if (loading) {
    return <ChartSkeleton className={className} />;
  }

  if (error) {
    return (
      <Card title={title} className={className}>
        <div className="flex items-center gap-2 text-sm text-kiri-error">
          <StatusBadge label="Error" variant="error" />
          <span>{error}</span>
        </div>
      </Card>
    );
  }

  return (
    <Card title={title} className={className} aiGenerated={aiGenerated}>
      {/* Export controls */}
      <div className="flex justify-end gap-2 mb-2">
        <button
          onClick={() => handleExport("svg")}
          className="text-[10px] text-kiri-text-dim hover:text-kiri-text px-2 py-0.5 rounded border border-kiri-border hover:border-kiri-border-focus transition-colors"
        >
          SVG
        </button>
        <button
          onClick={() => handleExport("png")}
          className="text-[10px] text-kiri-text-dim hover:text-kiri-text px-2 py-0.5 rounded border border-kiri-border hover:border-kiri-border-focus transition-colors"
        >
          PNG @3×
        </button>
        <button
          onClick={handleAddToFigure}
          className="text-[10px] text-kiri-accent hover:text-white px-2 py-0.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors flex items-center gap-1 ml-2"
          title="Add to Publication Engine Cart"
        >
          ＋ Figure
        </button>
      </div>

      {/* Chart */}
      <ReactECharts
        ref={chartRef}
        option={enhancedOption}
        style={{ height, width: "100%" }}
        opts={{ renderer: "svg" }}
        notMerge
      />

      {/* Provenance */}
      <ProvenanceFooter provenance={provenance ?? null} compact />
    </Card>
  );
}
