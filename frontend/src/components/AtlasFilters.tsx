/**
 * Kiri Atlas — Filter Controls Component (Enhanced)
 *
 * Dynamic data source buttons from project config, plus new controls:
 * - Data transformation (log2, Z-score)
 * - Clustering (distance metric, linkage method)
 * - Color palette picker
 * - Font size control
 * - Sample annotation toggle
 * - DE filter (fold-change threshold)
 */

import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import type { AvailableSource } from "../hooks/useProjectDataSources";
import type { HeatmapOptions, SampleLabelMode } from "./ExpressionHeatmap";
import { COLOR_PALETTES, type DistanceMetric, type LinkageMethod } from "../utils/heatmapUtils";
import { DataSourceBadge } from "./ui";

interface AtlasFiltersProps {
  /** Selected stages */
  stages: string[];
  onStagesChange: (stages: string[]) => void;

  /** MSI status filter */
  msiFilter: string[];
  onMsiChange: (msi: string[]) => void;

  /** Normalization method */
  normalization: string;
  onNormalizationChange: (method: string) => void;

  /** Active data source */
  dataSource: string;
  onDataSourceChange: (source: string) => void;

  /** Available data sources from the project */
  availableSources: AvailableSource[];

  /** Sample counts for display */
  sampleCount?: number;
  tumorCount?: number;
  normalCount?: number;

  /** Heatmap options */
  heatmapOptions: HeatmapOptions;
  onHeatmapOptionsChange: (opts: HeatmapOptions) => void;
}

const STAGES = ["Stage I", "Stage II", "Stage III", "Stage IV"];
const MSI_OPTIONS = ["MSI-H", "MSI-L", "MSS"];
const NORM_METHODS = [
  { value: "tpm", label: "TPM" },
  { value: "fpkm", label: "FPKM" },
  { value: "tmm", label: "TMM" },
  { value: "quantile", label: "Quantile" },
  { value: "counts", label: "Raw Counts" },
];

const TRANSFORMS = [
  { value: "none", label: "None" },
  { value: "log2", label: "Log₂(x+1)" },
  { value: "zscore", label: "Z-Score" },
];

const DISTANCE_METRICS: { value: DistanceMetric; label: string }[] = [
  { value: "euclidean", label: "Euclidean" },
  { value: "pearson", label: "Pearson" },
  { value: "spearman", label: "Spearman" },
];

const LINKAGE_METHODS: { value: LinkageMethod; label: string }[] = [
  { value: "ward", label: "Ward" },
  { value: "average", label: "Average" },
  { value: "complete", label: "Complete" },
  { value: "single", label: "Single" },
];

export function AtlasFilters({
  stages,
  onStagesChange,
  msiFilter,
  onMsiChange,
  normalization,
  onNormalizationChange,
  dataSource,
  onDataSourceChange,
  availableSources,
  sampleCount,
  tumorCount,
  normalCount,
  heatmapOptions,
  onHeatmapOptionsChange,
}: AtlasFiltersProps) {
  const { t } = useTranslation();

  const toggleStage = (stage: string) => {
    const next = stages.includes(stage)
      ? stages.filter((s) => s !== stage)
      : [...stages, stage];
    onStagesChange(next);
  };

  const toggleMsi = (msi: string) => {
    const next = msiFilter.includes(msi)
      ? msiFilter.filter((m) => m !== msi)
      : [...msiFilter, msi];
    onMsiChange(next);
  };

  const updateOption = <K extends keyof HeatmapOptions>(key: K, value: HeatmapOptions[K]) => {
    onHeatmapOptionsChange({ ...heatmapOptions, [key]: value });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-kiri-surface border border-kiri-border rounded-lg p-4 space-y-5 max-h-[calc(100vh-120px)] overflow-y-auto scrollbar-thin"
    >
      {/* ── Data Source ── */}
      <section>
        <h3 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider mb-2.5">
          {t("atlas.dataSource", "Data Source")}
          <span className="ml-1 text-[10px] font-normal text-kiri-text-dim">
            ({availableSources.length})
          </span>
        </h3>

        {/* Expression sources — selectable for heatmap */}
        <p className="text-[9px] text-kiri-text-dim uppercase tracking-wider mb-1.5">
          {t("atlas.expressionData", "Expression Data")}
        </p>
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {availableSources
            .filter((src) => ["tcga", "geo", "cptac", "scrna", "custom"].includes(src.type))
            .map((src) => (
              <button
                key={src.type}
                onClick={() => onDataSourceChange(src.type)}
                title={src.detail || src.label}
                className={`text-xs px-2 py-2 rounded-md border transition-all duration-150 flex flex-col items-center gap-0.5 ${
                  dataSource === src.type
                    ? "border-kiri-accent bg-kiri-accent-glow text-kiri-accent"
                    : "border-kiri-border text-kiri-text-muted hover:border-kiri-border-focus hover:text-kiri-text"
                }`}
              >
                <span className="text-base">{src.icon}</span>
                <span className="font-medium leading-tight">{src.label}</span>
                <DataSourceBadge sourceType={src.type} />
                {src.detail && (
                  <span className="text-[7px] text-kiri-text-dim leading-tight truncate w-full text-center">
                    {src.detail}
                  </span>
                )}
              </button>
            ))}
        </div>


      </section>

      {/* ── Normalization ── */}
      <section>
        <h3 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider mb-2.5">
          {t("atlas.normalization", "Normalization")}
        </h3>
        <div className="space-y-1">
          {NORM_METHODS.map((method) => (
            <button
              key={method.value}
              onClick={() => onNormalizationChange(method.value)}
              className={`w-full text-left text-xs px-3 py-1.5 rounded transition-colors ${
                normalization === method.value
                  ? "bg-kiri-accent-glow text-kiri-accent border border-kiri-accent-dim"
                  : "text-kiri-text-muted hover:text-kiri-text hover:bg-kiri-surface-hover"
              }`}
            >
              {method.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Data Transform ── */}
      <section>
        <h3 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider mb-2.5">
          {t("atlas.transform", "Data Transform")}
        </h3>
        <div className="space-y-1">
          {TRANSFORMS.map((tr) => (
            <button
              key={tr.value}
              onClick={() => updateOption("transform", tr.value as HeatmapOptions["transform"])}
              className={`w-full text-left text-xs px-3 py-1.5 rounded transition-colors ${
                heatmapOptions.transform === tr.value
                  ? "bg-kiri-accent-glow text-kiri-accent border border-kiri-accent-dim"
                  : "text-kiri-text-muted hover:text-kiri-text hover:bg-kiri-surface-hover"
              }`}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Clustering ── */}
      <section>
        <h3 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider mb-2.5">
          {t("atlas.clustering", "Clustering")}
        </h3>
        <div className="space-y-2">
          {/* Force-group by type */}
          <label className="flex items-center gap-2 text-xs text-kiri-text-muted hover:text-kiri-text cursor-pointer">
            <input
              type="checkbox"
              checked={heatmapOptions.groupByType}
              onChange={(e) => updateOption("groupByType", e.target.checked)}
              className="rounded border-kiri-border bg-kiri-bg accent-kiri-accent w-3.5 h-3.5"
            />
            <span>{t("atlas.groupByType", "Group by sample type")}</span>
          </label>

          <label className="flex items-center gap-2 text-xs text-kiri-text-muted hover:text-kiri-text cursor-pointer">
            <input
              type="checkbox"
              checked={heatmapOptions.clusterRows}
              onChange={(e) => updateOption("clusterRows", e.target.checked)}
              className="rounded border-kiri-border bg-kiri-bg accent-kiri-accent w-3.5 h-3.5"
            />
            <span>{t("atlas.clusterGenes", "Cluster genes (rows)")}</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-kiri-text-muted hover:text-kiri-text cursor-pointer">
            <input
              type="checkbox"
              checked={heatmapOptions.clusterCols}
              onChange={(e) => {
                updateOption("clusterCols", e.target.checked);
                // If turning on free clustering, turn off force-grouping
                if (e.target.checked) updateOption("groupByType", false);
              }}
              className="rounded border-kiri-border bg-kiri-bg accent-kiri-accent w-3.5 h-3.5"
            />
            <span>{t("atlas.clusterSamples", "Cluster samples (cols)")}</span>
          </label>

          {(heatmapOptions.clusterRows || heatmapOptions.clusterCols || heatmapOptions.groupByType) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="space-y-2 pl-2 border-l-2 border-kiri-border ml-1"
            >
              <div>
                <p className="text-[10px] text-kiri-text-dim mb-1">{t("atlas.distanceMetric", "Distance")}</p>
                <select
                  value={heatmapOptions.distanceMetric}
                  onChange={(e) => updateOption("distanceMetric", e.target.value as DistanceMetric)}
                  className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1 text-kiri-text focus:border-kiri-accent outline-none"
                >
                  {DISTANCE_METRICS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-[10px] text-kiri-text-dim mb-1">{t("atlas.linkageMethod", "Linkage")}</p>
                <select
                  value={heatmapOptions.linkageMethod}
                  onChange={(e) => updateOption("linkageMethod", e.target.value as LinkageMethod)}
                  className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1 text-kiri-text focus:border-kiri-accent outline-none"
                >
                  {LINKAGE_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </motion.div>
          )}

          {/* Dendrogram controls */}
          <div className="pt-1 space-y-1">
            <label className="flex items-center gap-2 text-xs text-kiri-text-muted hover:text-kiri-text cursor-pointer">
              <input
                type="checkbox"
                checked={heatmapOptions.showDendrogram}
                onChange={(e) => updateOption("showDendrogram", e.target.checked)}
                className="rounded border-kiri-border bg-kiri-bg accent-kiri-accent w-3.5 h-3.5"
              />
              <span>{t("atlas.showDendrogram", "Show dendrograms")}</span>
            </label>
            {heatmapOptions.showDendrogram && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="pl-2 border-l-2 border-kiri-border ml-1"
              >
                <p className="text-[10px] text-kiri-text-dim mb-1">
                  {t("atlas.dendrogramWidth", "Width")}: {heatmapOptions.dendrogramWidth}px
                </p>
                <input
                  type="range"
                  min={20}
                  max={80}
                  step={5}
                  value={heatmapOptions.dendrogramWidth}
                  onChange={(e) => updateOption("dendrogramWidth", Number(e.target.value))}
                  className="w-full h-1 bg-kiri-border rounded-lg appearance-none cursor-pointer accent-kiri-accent"
                />
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* ── Color Range ── */}
      <section>
        <h3 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider mb-2.5">
          {t("atlas.colorRange", "Color Scale Range")}
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <p className="text-[10px] text-kiri-text-dim mb-0.5">{t("atlas.colorRangeMin", "Min")}</p>
            <input
              type="number"
              step="0.5"
              value={heatmapOptions.colorRangeMin ?? ""}
              placeholder={heatmapOptions.transform === "log2" ? "2" : heatmapOptions.transform === "zscore" ? "-2" : "auto"}
              onChange={(e) => updateOption("colorRangeMin", e.target.value ? Number(e.target.value) : undefined)}
              className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1 text-kiri-text focus:border-kiri-accent outline-none placeholder:text-kiri-text-dim/50"
            />
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-kiri-text-dim mb-0.5">{t("atlas.colorRangeMax", "Max")}</p>
            <input
              type="number"
              step="0.5"
              value={heatmapOptions.colorRangeMax ?? ""}
              placeholder={heatmapOptions.transform === "log2" ? "5" : heatmapOptions.transform === "zscore" ? "2" : "auto"}
              onChange={(e) => updateOption("colorRangeMax", e.target.value ? Number(e.target.value) : undefined)}
              className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1 text-kiri-text focus:border-kiri-accent outline-none placeholder:text-kiri-text-dim/50"
            />
          </div>
        </div>
        <button
          onClick={() => {
            const tr = heatmapOptions.transform;
            const suggestedMin = tr === "log2" ? 2 : tr === "zscore" ? -2 : undefined;
            const suggestedMax = tr === "log2" ? 5 : tr === "zscore" ? 2 : undefined;
            onHeatmapOptionsChange({ ...heatmapOptions, colorRangeMin: suggestedMin, colorRangeMax: suggestedMax });
          }}
          className="mt-1.5 text-[10px] text-kiri-accent hover:text-white px-2 py-0.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors"
        >
          ↺ {t("atlas.resetRange", "Reset to suggested")}
        </button>
      </section>

      {/* ── Stage Filter ── */}
      <section>
        <h3 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider mb-2.5">
          {t("atlas.stageFilter", "Tumor Stage")}
        </h3>
        <div className="space-y-1">
          {STAGES.map((stage) => (
            <label
              key={stage}
              className="flex items-center gap-2 text-xs text-kiri-text-muted hover:text-kiri-text cursor-pointer py-0.5"
            >
              <input
                type="checkbox"
                checked={stages.includes(stage)}
                onChange={() => toggleStage(stage)}
                className="rounded border-kiri-border bg-kiri-bg accent-kiri-accent w-3.5 h-3.5"
              />
              <span>{stage}</span>
            </label>
          ))}
        </div>
      </section>

      {/* ── MSI Status ── */}
      <section>
        <h3 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider mb-2.5">
          {t("atlas.msiFilter", "MSI Status")}
        </h3>
        <div className="space-y-1">
          {MSI_OPTIONS.map((msi) => (
            <label
              key={msi}
              className="flex items-center gap-2 text-xs text-kiri-text-muted hover:text-kiri-text cursor-pointer py-0.5"
            >
              <input
                type="checkbox"
                checked={msiFilter.includes(msi)}
                onChange={() => toggleMsi(msi)}
                className="rounded border-kiri-border bg-kiri-bg accent-kiri-accent w-3.5 h-3.5"
              />
              <span>{msi}</span>
            </label>
          ))}
        </div>
      </section>

      {/* ── Appearance ── */}
      <section>
        <h3 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider mb-2.5">
          {t("atlas.appearance", "Appearance")}
        </h3>
        <div className="space-y-3">
          {/* Color Palette */}
          <div>
            <p className="text-[10px] text-kiri-text-dim mb-1.5">{t("atlas.colorPalette", "Color gradient")}</p>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(COLOR_PALETTES).map(([key, palette]) => (
                <button
                  key={key}
                  onClick={() => updateOption("colorPalette", key)}
                  className={`text-[10px] px-2 py-1.5 rounded border transition-all ${
                    heatmapOptions.colorPalette === key
                      ? "border-kiri-accent bg-kiri-accent-glow text-kiri-accent"
                      : "border-kiri-border text-kiri-text-muted hover:border-kiri-border-focus"
                  }`}
                >
                  <div
                    className="h-1.5 rounded-full mb-0.5"
                    style={{
                      background: `linear-gradient(to right, ${palette.colors[0]}, ${palette.colors[Math.floor(palette.colors.length / 2)]}, ${palette.colors[palette.colors.length - 1]})`,
                    }}
                  />
                  {palette.name}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div>
            <p className="text-[10px] text-kiri-text-dim mb-1">{t("atlas.fontSize", "Font size")}: {heatmapOptions.fontSize}px</p>
            <input
              type="range"
              min={8}
              max={16}
              step={1}
              value={heatmapOptions.fontSize}
              onChange={(e) => updateOption("fontSize", Number(e.target.value))}
              className="w-full h-1 bg-kiri-border rounded-lg appearance-none cursor-pointer accent-kiri-accent"
            />
          </div>

          {/* Annotations Toggle */}
          <label className="flex items-center gap-2 text-xs text-kiri-text-muted hover:text-kiri-text cursor-pointer">
            <input
              type="checkbox"
              checked={heatmapOptions.showAnnotations}
              onChange={(e) => updateOption("showAnnotations", e.target.checked)}
              className="rounded border-kiri-border bg-kiri-bg accent-kiri-accent w-3.5 h-3.5"
            />
            <span>{t("atlas.showAnnotations", "Sample annotations")}</span>
          </label>

          {/* Sample Label Mode */}
          <div className="pt-1">
            <p className="text-[10px] text-kiri-text-dim mb-1.5">
              {t("atlas.sampleLabels", "Sample labels")}
            </p>
            <div className="space-y-1">
              {([
                { value: "full" as SampleLabelMode, label: t("atlas.labelFull", "Full Labels") },
                { value: "group" as SampleLabelMode, label: t("atlas.labelGroup", "Group Only (N/T)") },
                { value: "colorbar" as SampleLabelMode, label: t("atlas.labelColorbar", "Color Bars Only") },
              ]).map((mode) => (
                <label
                  key={mode.value}
                  className="flex items-center gap-2 text-xs text-kiri-text-muted hover:text-kiri-text cursor-pointer"
                >
                  <input
                    type="radio"
                    name="sampleLabelMode"
                    checked={heatmapOptions.sampleLabelMode === mode.value}
                    onChange={() => updateOption("sampleLabelMode", mode.value)}
                    className="w-3 h-3 accent-kiri-accent"
                  />
                  <span>{mode.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Sample Count ── */}
      {sampleCount != null && (
        <section className="pt-3 border-t border-kiri-border">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold text-kiri-text font-mono">{sampleCount}</p>
              <p className="text-[10px] text-kiri-text-dim uppercase tracking-wider">
                {t("atlas.totalSamples", "Total")}
              </p>
            </div>
            <div>
              <p className="text-lg font-bold text-kiri-error font-mono">{tumorCount ?? "—"}</p>
              <p className="text-[10px] text-kiri-text-dim uppercase tracking-wider">
                {t("atlas.tumorLabel", "Tumor")}
              </p>
            </div>
            <div>
              <p className="text-lg font-bold text-kiri-success font-mono">{normalCount ?? "—"}</p>
              <p className="text-[10px] text-kiri-text-dim uppercase tracking-wider">
                {t("atlas.normalLabel", "Normal")}
              </p>
            </div>
          </div>
        </section>
      )}
    </motion.div>
  );
}
