/**
 * Kiri — Enrichment Panel Component
 *
 * Visualizes gene set enrichment results (ORA) from gseapy.
 * Displays enriched terms as interactive dot plots and sortable tables.
 * Supports GO, KEGG, Reactome, and MSigDB Hallmark libraries.
 */

import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { KiriChart } from "./KiriChart";
import { Card, StatusBadge, Stat, InfoTooltip } from "./ui";
import {
  fetchEnrichment,
  type EnrichmentResult,
  type Provenance,
} from "../services/api";
import { EnrichmentBubbleChart } from "./EnrichmentBubbleChart";

const LIBRARY_OPTIONS = [
  { key: "go_bp", label: "GO Biological Process", icon: "🧬" },
  { key: "go_mf", label: "GO Molecular Function", icon: "⚙️" },
  { key: "go_cc", label: "GO Cellular Component", icon: "🏗️" },
  { key: "kegg", label: "KEGG Pathways", icon: "🗺️" },
  { key: "reactome", label: "Reactome Pathways", icon: "🔄" },
  { key: "hallmark", label: "MSigDB Hallmarks", icon: "🎯" },
];

interface EnrichmentPanelProps {
  genes: string[];
  projectId?: string;
}

export function EnrichmentPanel({ genes, projectId }: EnrichmentPanelProps) {
  const { t } = useTranslation();

  // State
  const [selectedLibraries, setSelectedLibraries] = useState<string[]>(["go_bp", "kegg", "hallmark"]);
  const [cutoff, setCutoff] = useState(0.05);
  const [topN, setTopN] = useState(20);
  const [data, setData] = useState<EnrichmentResult | null>(null);
  const [provenance, setProvenance] = useState<Provenance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeLib, setActiveLib] = useState<string>("");
  const [viewMode, setViewMode] = useState<"chart" | "table" | "bubble">("chart");

  // Toggle library selection
  const toggleLibrary = (key: string) => {
    setSelectedLibraries((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Run enrichment
  const runEnrichment = useCallback(async () => {
    if (genes.length === 0 || selectedLibraries.length === 0) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetchEnrichment(
        genes,
        selectedLibraries,
        cutoff,
        topN,
        projectId
      );

      if (response.status === "success" && response.data) {
        setData(response.data);
        setProvenance(response.provenance);
        // Auto-select first library with results
        const firstWithResults = Object.entries(response.data.results).find(
          ([, terms]) => terms.length > 0
        );
        if (firstWithResults) {
          setActiveLib(firstWithResults[0]);
        } else if (response.data.libraries.length > 0) {
          setActiveLib(response.data.libraries[0]);
        }
      } else {
        setError(response.errors?.join("; ") || t("enrichment.run_failed"));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("enrichment.run_failed"));
    } finally {
      setLoading(false);
    }
  }, [genes, selectedLibraries, cutoff, topN, projectId, t]);

  // Active library terms
  const activeTerms = useMemo(() => {
    if (!data || !activeLib) return [];
    return data.results[activeLib] || [];
  }, [data, activeLib]);

  // Build dot plot chart options
  const chartOptions = useMemo(() => {
    if (activeTerms.length === 0) return null;

    const terms = [...activeTerms].reverse(); // Bottom-to-top in chart
    const maxGenes = Math.max(...terms.map((t) => (t.genes?.length ?? 0)), 1);

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item" as const,
        formatter: (params: { data: [number, number, number, string, string[], number] }) => {
          const [pval, , geneCount, term, geneList, adjP] = params.data;
          return `<div style="max-width:350px"><strong>${term}</strong><br/>` +
            `p-value: ${pval.toExponential(2)}<br/>` +
            `Adj. p: ${adjP.toExponential(2)}<br/>` +
            `Genes: ${geneCount}<br/>` +
            (geneList?.length ? `<em>${geneList.slice(0, 10).join(", ")}${geneList.length > 10 ? "..." : ""}</em>` : "") +
            `</div>`;
        },
      },
      grid: {
        left: "40%",
        right: "10%",
        top: "5%",
        bottom: "12%",
      },
      xAxis: {
        name: "-log₁₀(adj. p-value)",
        nameLocation: "middle" as const,
        nameGap: 30,
        type: "value" as const,
        nameTextStyle: { color: "#94a3b8", fontSize: 11 },
        axisLabel: { color: "#94a3b8", fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      yAxis: {
        type: "category" as const,
        data: terms.map((t) => {
          // Truncate long term names
          const name = t.term.replace(/\(GO:\d+\)/, "").trim();
          return name.length > 45 ? name.slice(0, 42) + "..." : name;
        }),
        axisLabel: { color: "#e2e8f0", fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      series: [
        {
          type: "scatter",
          symbolSize: (val: number[]) => Math.max(6, Math.min(30, (val[2] / maxGenes) * 30)),
          data: terms.map((term) => {
            const negLogP = -Math.log10(Math.max(term.adjusted_p_value, 1e-300));
            const geneCount = term.genes?.length ?? 0;
            return [
              negLogP,
              term.term.replace(/\(GO:\d+\)/, "").trim().slice(0, 45),
              geneCount,
              term.term,
              term.genes || [],
              term.adjusted_p_value,
            ];
          }),
          itemStyle: {
            color: (params: { data: number[] }) => {
              const pval = params.data[5];
              if (pval < 0.001) return "#22d3ee";
              if (pval < 0.01) return "#06b6d4";
              if (pval < 0.05) return "#0891b2";
              return "#64748b";
            },
          },
        },
      ],
    };
  }, [activeTerms]);

  return (
    <div className="space-y-4">
      {/* ── Controls ── */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-kiri-text flex items-center gap-2">
                {t("enrichment.title")}
                <InfoTooltip tooltipKey="tooltips.enrichment" />
              </h3>
              <p className="text-xs text-kiri-text-muted mt-0.5">
                {t("enrichment.subtitle")}
              </p>
            </div>
            {data && (
              <Stat
                label={t("enrichment.significant_terms")}
                value={data.total_significant}
              />
            )}
          </div>

          {/* Library selector chips */}
          <div className="flex flex-wrap gap-2">
            {LIBRARY_OPTIONS.map((lib) => (
              <button
                key={lib.key}
                onClick={() => toggleLibrary(lib.key)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                  selectedLibraries.includes(lib.key)
                    ? "bg-kiri-accent-glow border-kiri-accent text-kiri-accent"
                    : "border-kiri-border text-kiri-text-muted hover:border-kiri-text-dim hover:text-kiri-text"
                }`}
              >
                <span className="mr-1">{lib.icon}</span>
                {lib.label}
              </button>
            ))}
          </div>

          {/* Settings row */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-kiri-text-muted">{t("enrichment.cutoff")}</label>
              <select
                value={cutoff}
                onChange={(e) => setCutoff(Number(e.target.value))}
                className="text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1 text-kiri-text focus:border-kiri-accent outline-none"
              >
                <option value={0.001}>p &lt; 0.001</option>
                <option value={0.01}>p &lt; 0.01</option>
                <option value={0.05}>p &lt; 0.05</option>
                <option value={0.1}>p &lt; 0.1</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-kiri-text-muted">{t("enrichment.top_n")}</label>
              <select
                value={topN}
                onChange={(e) => setTopN(Number(e.target.value))}
                className="text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1 text-kiri-text focus:border-kiri-accent outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            <button
              onClick={runEnrichment}
              disabled={loading || genes.length === 0 || selectedLibraries.length === 0}
              className="ml-auto text-xs px-4 py-2 rounded-lg bg-kiri-accent text-kiri-bg font-semibold hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {loading ? t("common.loading") : t("enrichment.run_button")}
            </button>
          </div>

          {genes.length === 0 && (
            <p className="text-xs text-kiri-warning">
              {t("enrichment.no_genes_warning")}
            </p>
          )}
          {genes.length > 0 && genes.length < 15 && (
            <p className="text-xs text-kiri-warning/80">
              ⚠️ {t("enrichment.small_gene_warning", "Small gene list ({{count}} genes). ORA with <15 genes often yields few or zero significant results after multiple-testing correction. Consider relaxing the p-value cutoff to p < 0.1.").replace("{{count}}", String(genes.length))}
            </p>
          )}
        </div>
      </Card>

      {/* ── Error ── */}
      {error && (
        <Card className="border-kiri-error/30 bg-kiri-error/5">
          <div className="text-center py-4 space-y-2">
            <p className="text-sm text-kiri-error font-medium">❌ {t("enrichment.run_failed")}</p>
            <p className="text-xs text-kiri-text-dim max-w-lg mx-auto">{error}</p>
            <p className="text-xs text-kiri-text-dim max-w-lg mx-auto">
              {t("enrichment.error_hint", "This may happen if the gene list is too short, the backend service is unavailable, or the selected libraries have no matching annotations for these genes.")}
            </p>
            <button
              onClick={runEnrichment}
              disabled={loading || genes.length === 0}
              className="text-xs text-kiri-accent hover:underline mt-1"
            >
              {t("common.retry")}
            </button>
          </div>
        </Card>
      )}

      {/* ── Results ── */}
      <AnimatePresence>
        {data && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Library tabs */}
            <div className="flex items-center gap-1 border-b border-kiri-border pb-0">
              {data.libraries.map((lib) => {
                const count = data.results[lib]?.length ?? 0;
                const label = data.library_labels[lib] || lib;
                return (
                  <button
                    key={lib}
                    onClick={() => setActiveLib(lib)}
                    className={`text-xs px-3 py-2 rounded-t-lg border-b-2 transition-colors ${
                      activeLib === lib
                        ? "border-kiri-accent text-kiri-accent bg-kiri-surface"
                        : "border-transparent text-kiri-text-muted hover:text-kiri-text"
                    }`}
                  >
                    {label}
                    <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-kiri-surface-hover">
                      {count}
                    </span>
                  </button>
                );
              })}

              {/* View mode toggle */}
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setViewMode("chart")}
                  className={`text-xs px-2 py-1 rounded ${viewMode === "chart" ? "bg-kiri-accent-glow text-kiri-accent" : "text-kiri-text-muted"}`}
                  title="Dot Plot"
                >
                  📊
                </button>
                <button
                  onClick={() => setViewMode("bubble")}
                  className={`text-xs px-2 py-1 rounded ${viewMode === "bubble" ? "bg-kiri-accent-glow text-kiri-accent" : "text-kiri-text-muted"}`}
                  title="Bubble Chart"
                >
                  🫧
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  className={`text-xs px-2 py-1 rounded ${viewMode === "table" ? "bg-kiri-accent-glow text-kiri-accent" : "text-kiri-text-muted"}`}
                  title="Table"
                >
                  📋
                </button>
              </div>
            </div>

            {/* Content */}
            {activeTerms.length === 0 ? (
              <div className="space-y-4">
                <Card>
                  <div className="text-center py-8 text-kiri-text-muted space-y-2">
                    <p className="text-3xl mb-1">🔍</p>
                    <p className="text-sm font-medium">{t("enrichment.no_results")}</p>
                    <p className="text-xs text-kiri-text-dim max-w-md mx-auto">
                      {data.small_gene_list
                        ? t("enrichment.small_list_explain", "Your gene list has only {{count}} genes. Over-Representation Analysis with fewer than ~15 genes rarely produces statistically significant results after multiple-testing correction — this is expected, not an error.").replace("{{count}}", String(data.gene_count))
                        : t("enrichment.no_results_hint", "No enriched terms passed the adjusted p-value threshold. Try relaxing the cutoff (e.g. p < 0.1), selecting different gene set libraries, or adding more genes to your list (minimum 3 recommended).")}
                    </p>
                    <div className="flex items-center justify-center gap-3 mt-2">
                      {cutoff > 0.05 ? null : (
                        <button
                          onClick={() => { setCutoff(0.1); setTimeout(() => runEnrichment(), 100); }}
                          className="text-[10px] px-2 py-1 rounded border border-kiri-border text-kiri-text-muted hover:text-kiri-accent hover:border-kiri-accent transition-colors"
                        >
                          Try p &lt; 0.1
                        </button>
                      )}
                      <button
                        onClick={runEnrichment}
                        className="text-[10px] px-2 py-1 rounded border border-kiri-border text-kiri-text-muted hover:text-kiri-accent hover:border-kiri-accent transition-colors"
                      >
                        🔄 {t("common.retry")}
                      </button>
                    </div>
                  </div>
                </Card>

                {/* Near-miss terms */}
                {data.near_miss_terms && activeLib && data.near_miss_terms[activeLib]?.length > 0 && (
                  <Card>
                    <h4 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider mb-2">
                      {t("enrichment.near_miss_title", "Closest Terms (did not pass threshold)")}
                    </h4>
                    <p className="text-[10px] text-kiri-text-dim mb-3">
                      {t("enrichment.near_miss_hint", "These terms had the lowest adjusted p-values but did not pass your cutoff of {{cutoff}}. They may still be biologically relevant.").replace("{{cutoff}}", String(data.cutoff))}
                    </p>
                    <div className="space-y-1.5">
                      {data.near_miss_terms[activeLib].map((term, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-xs p-2 rounded bg-kiri-bg/50 border border-kiri-border/30"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-kiri-text-muted truncate" title={term.term}>
                              {term.term}
                            </p>
                            <div className="flex flex-wrap gap-0.5 mt-0.5">
                              {(term.genes || []).slice(0, 5).map((g) => (
                                <span
                                  key={g}
                                  className="text-[9px] font-mono px-1 py-0.5 rounded bg-kiri-surface-hover text-kiri-text-dim"
                                >
                                  {g}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="text-right ml-3 shrink-0">
                            <p className="font-mono text-kiri-warning/70">
                              adj. p = {term.adjusted_p_value.toExponential(2)}
                            </p>
                            {term.overlap && (
                              <p className="text-[9px] text-kiri-text-dim">{term.overlap}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            ) : viewMode === "bubble" ? (
              <EnrichmentBubbleChart
                terms={activeTerms}
                libraryLabel={data.library_labels[activeLib] || activeLib}
              />
            ) : viewMode === "chart" ? (
              <Card>
                <KiriChart
                  option={(chartOptions || {}) as import("echarts").EChartsOption}
                  height={`${Math.max(300, activeTerms.length * 28)}px`}
                  sourceModule="discovery"
                  dataSource={provenance?.source || "gseapy"}
                  citation={provenance?.method || "Over-Representation Analysis"}
                  title={`Enrichment: ${activeLib}`}
                />
              </Card>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-kiri-border">
                        <th className="text-left py-2 px-2 text-kiri-text-dim font-medium">
                          {t("enrichment.col_term")}
                        </th>
                        <th className="text-right py-2 px-2 text-kiri-text-dim font-medium">
                          {t("enrichment.col_pvalue")}
                        </th>
                        <th className="text-right py-2 px-2 text-kiri-text-dim font-medium">
                          {t("enrichment.col_adj_pvalue")}
                        </th>
                        <th className="text-left py-2 px-2 text-kiri-text-dim font-medium">
                          {t("enrichment.col_overlap")}
                        </th>
                        <th className="text-left py-2 px-2 text-kiri-text-dim font-medium">
                          {t("enrichment.col_genes")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeTerms.map((term, i) => (
                        <tr
                          key={i}
                          className="border-b border-kiri-border/30 hover:bg-kiri-surface-hover transition-colors"
                        >
                          <td className="py-2 px-2 text-kiri-text max-w-xs truncate" title={term.term}>
                            {term.term}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-kiri-text-muted">
                            {term.p_value.toExponential(2)}
                          </td>
                          <td className="py-2 px-2 text-right font-mono">
                            <span
                              className={
                                term.adjusted_p_value < 0.001
                                  ? "text-cyan-400"
                                  : term.adjusted_p_value < 0.01
                                  ? "text-cyan-500"
                                  : term.adjusted_p_value < 0.05
                                  ? "text-cyan-600"
                                  : "text-kiri-text-muted"
                              }
                            >
                              {term.adjusted_p_value.toExponential(2)}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-kiri-text-muted">
                            {term.overlap || "-"}
                          </td>
                          <td className="py-2 px-2 max-w-[200px]">
                            <div className="flex flex-wrap gap-0.5">
                              {(term.genes || []).slice(0, 5).map((g) => (
                                <span
                                  key={g}
                                  className="text-[10px] font-mono px-1 py-0.5 rounded bg-kiri-accent-glow text-kiri-accent"
                                >
                                  {g}
                                </span>
                              ))}
                              {(term.genes?.length ?? 0) > 5 && (
                                <span className="text-[10px] text-kiri-text-dim">
                                  +{(term.genes?.length ?? 0) - 5}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Provenance footer */}
            {provenance && (
              <div className="flex items-center gap-4 text-[10px] text-kiri-text-dim">
                <span>
                  {t("trust.source")}: {provenance.source}
                </span>
                <span>
                  {t("trust.method")}: {provenance.method}
                </span>
                {data.cache_hit && (
                  <StatusBadge label="CACHED" variant="info" />
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
