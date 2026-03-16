/**
 * Kiri — Interactomics & Regulatory Network Page
 *
 * Phase 9 module with 6 analysis tabs:
 * 1. Network — Enhanced PPI (STRING + BioGRID + IntAct, mito annotations)
 * 2. Co-Expression — Heatmap of correlated genes (|r| > 0.6)
 * 3. Proteomics — CoIP-MS volcano plot + heatmap
 * 4. Differential Expression — Public dataset DE with substrate annotations
 * 5. Substrates — Candidate substrate prediction
 * 6. Regulatory Network — Integrated mechanistic graph
 *
 * All analyses are project-scoped via the Redux store's active project.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppSelector } from "../store";
import { motion } from "framer-motion";
import { Card, StatusBadge, ChartSkeleton } from "../components/ui";
import { PPINetwork } from "../components/PPINetwork";
import { InteractomicsHeatmap } from "../components/InteractomicsHeatmap";
import { SubstrateTable } from "../components/SubstrateTable";
import { RegulatoryGraph } from "../components/RegulatoryGraph";
import {
  fetchEnhancedPPI,
  fetchCoexpressionHeatmap,
  fetchSubstrateScan,
  fetchRegulatoryNetwork,
  getErrorMessage,
} from "../services/api";
import type { Provenance } from "../services/api";

type TabId = "network" | "coexpression" | "proteomics" | "de" | "substrates" | "regulatory";

const TABS: { id: TabId; labelKey: string; fallback: string; icon: string }[] = [
  { id: "network", labelKey: "interactomics.tab_network", fallback: "Network", icon: "🕸️" },
  { id: "coexpression", labelKey: "interactomics.tab_coexpression", fallback: "Co-Expression", icon: "📊" },
  { id: "proteomics", labelKey: "interactomics.tab_proteomics", fallback: "Proteomics", icon: "🧪" },
  { id: "de", labelKey: "interactomics.tab_de", fallback: "Differential Expression", icon: "🌋" },
  { id: "substrates", labelKey: "interactomics.tab_substrates", fallback: "Substrates", icon: "✂️" },
  { id: "regulatory", labelKey: "interactomics.tab_regulatory", fallback: "Regulatory Network", icon: "🔬" },
];

function InteractomicsPage() {
  const { t } = useTranslation();
  const selectedGenes = useAppSelector((s) => s.app.selectedGenes);
  const activeProject = useAppSelector((s) => s.project.activeProject);
  const projectId = activeProject?.id;

  const [activeTab, setActiveTab] = useState<TabId>("network");

  // Data states
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [networkData, setNetworkData] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [coexprData, setCoexprData] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [substrateData, setSubstrateData] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [regulatoryData, setRegulatoryData] = useState<any>(null);

  const [networkProv, setNetworkProv] = useState<Provenance | null>(null);
  const [coexprProv, setCoexprProv] = useState<Provenance | null>(null);
  const [regulatoryProv, setRegulatoryProv] = useState<Provenance | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // Network controls
  const [highConfidence, setHighConfidence] = useState(false);
  const [showMitoOnly, setShowMitoOnly] = useState(false);

  // Stable genes reference
  const genes = useMemo(() => selectedGenes, [selectedGenes]);

  // Fetch data when tab changes
  const fetchData = useCallback(async () => {
    if (genes.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      switch (activeTab) {
        case "network": {
          if (!networkData) {
            const resp = await fetchEnhancedPPI(
              genes, 0.4, highConfidence, true, true, projectId
            );
            if (resp.status === "success") {
              setNetworkData(resp.data);
              setNetworkProv(resp.provenance);
            } else {
              setError(resp.errors?.join("; ") || "Failed to fetch network");
            }
          }
          break;
        }
        case "coexpression": {
          if (!coexprData) {
            const resp = await fetchCoexpressionHeatmap(
              genes, ["TCGA-COAD", "TCGA-READ"], 0.6, 50, projectId
            );
            if (resp.status === "success") {
              setCoexprData(resp.data);
              setCoexprProv(resp.provenance);
            } else {
              setError(resp.errors?.join("; ") || "Failed to fetch co-expression data");
            }
          }
          break;
        }
        case "substrates": {
          if (!substrateData) {
            const resp = await fetchSubstrateScan(genes, undefined, true, projectId);
            if (resp.status === "success") {
              setSubstrateData(resp.data);
            } else {
              setError(resp.errors?.join("; ") || "Failed to run substrate scan");
            }
          }
          break;
        }
        case "regulatory": {
          if (!regulatoryData) {
            const resp = await fetchRegulatoryNetwork(
              genes, ["TCGA-COAD", "TCGA-READ"],
              true, true, true, true, projectId
            );
            if (resp.status === "success") {
              setRegulatoryData(resp.data);
              setRegulatoryProv(resp.provenance);
            } else {
              setError(resp.errors?.join("; ") || "Failed to build regulatory network");
            }
          }
          break;
        }
        // proteomics and de require user-uploaded data — show placeholder
        default:
          break;
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [activeTab, projectId, highConfidence, genes, networkData, coexprData, substrateData, regulatoryData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Re-fetch network when confidence filter changes
  const handleConfidenceToggle = async () => {
    setHighConfidence(!highConfidence);
    setNetworkData(null); // Force refetch
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-kiri-text tracking-tight">
            {t("interactomics.title", "Interactomics & Regulatory Network")}
          </h1>
          <p className="text-sm text-kiri-text-muted mt-1">
            {t("interactomics.subtitle", "Multi-omics integration: PPI networks, co-expression, proteomics, substrates, and regulatory mechanisms")}
          </p>
        </div>
        <StatusBadge label="Phase 9" variant="info" />
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 border-b border-kiri-border mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 text-sm px-4 py-2.5 border-b-2 transition-colors font-medium whitespace-nowrap ${
              activeTab === tab.id
                ? "border-kiri-accent text-kiri-accent"
                : "border-transparent text-kiri-text-muted hover:text-kiri-text"
            }`}
          >
            <span>{tab.icon}</span>
            <span>{t(tab.labelKey, tab.fallback)}</span>
          </button>
        ))}
      </div>

      {/* Error display */}
      {error && (
        <Card className="mb-4">
          <div className="flex items-center gap-2 text-sm text-kiri-error">
            <StatusBadge label="Error" variant="error" />
            <span>{error}</span>
            <button
              onClick={() => { setError(""); fetchData(); }}
              className="ml-auto text-kiri-accent hover:text-white text-xs px-2 py-1 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors"
            >
              Retry
            </button>
          </div>
        </Card>
      )}

      {/* No genes state */}
      {genes.length === 0 && (
        <Card>
          <div className="text-center py-12 text-kiri-text-muted">
            <p className="text-4xl mb-3">🕸️</p>
            <p className="text-sm">
              {t("interactomics.no_project_genes", "Add protein targets to your project to analyze their interaction network.")}
            </p>
          </div>
        </Card>
      )}

      {/* Tab Content — Only render when genes are present */}
      {genes.length > 0 && (
        <>
          {activeTab === "network" && (
            <div className="space-y-4">
              {/* Controls */}
              <Card>
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 text-sm text-kiri-text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={highConfidence}
                      onChange={handleConfidenceToggle}
                      className="rounded border-kiri-border bg-kiri-surface"
                    />
                    {t("interactomics.high_confidence", "High confidence only (>0.7)")}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-kiri-text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showMitoOnly}
                      onChange={() => setShowMitoOnly(!showMitoOnly)}
                      className="rounded border-kiri-border bg-kiri-surface"
                    />
                    {t("interactomics.mito_only", "Highlight mitochondrial proteins")}
                  </label>
                  {networkData?.meta && (
                    <div className="ml-auto text-xs text-kiri-text-dim space-x-4">
                      <span>{networkData.meta.total_nodes} nodes</span>
                      <span>{networkData.meta.total_edges} edges</span>
                      <span>{networkData.meta.high_confidence_count} high-confidence</span>
                      <span>{networkData.meta.mitochondrial_node_count} mitochondrial</span>
                      <span>Sources: {networkData.meta.sources_used?.join(", ")}</span>
                    </div>
                  )}
                </div>
              </Card>

              {loading ? (
                <ChartSkeleton />
              ) : networkData ? (
                <PPINetwork
                  data={networkData}
                  provenance={networkProv}
                  loading={false}
                  confidence={highConfidence ? 0.7 : 0.4}
                />
              ) : !error ? (
                <Card>
                  <div className="text-center text-kiri-text-muted text-sm py-8">
                    {t("interactomics.no_project_genes", "Add protein targets to your project to analyze their interaction network.")}
                  </div>
                </Card>
              ) : null}
            </div>
          )}

          {activeTab === "coexpression" && (
            <div className="space-y-4">
              {loading ? (
                <ChartSkeleton />
              ) : coexprData?.matrix ? (
                <InteractomicsHeatmap
                  matrix={coexprData.matrix}
                  title={t("interactomics.coexpr_heatmap", "Co-Expression Correlation Heatmap (|r| ≥ 0.6)")}
                  provenance={coexprProv}
                  mode="correlation"
                />
              ) : !error ? (
                <Card>
                  <div className="text-center text-kiri-text-muted text-sm py-8">
                    {t("interactomics.no_coexpr", "Add protein targets to your project to run co-expression analysis.")}
                  </div>
                </Card>
              ) : null}
            </div>
          )}

          {activeTab === "proteomics" && (
            <Card title={t("interactomics.proteomics_title", "CoIP-MS / Proteomics Analysis")}>
              <div className="text-center text-kiri-text-muted text-sm py-8 space-y-3">
                <p>
                  {t("interactomics.proteomics_upload", "Upload a proteomics abundance matrix (CSV) or search PRIDE for published CoIP-MS datasets.")}
                </p>
                <div className="flex justify-center gap-3">
                  <button className="text-xs text-kiri-accent hover:text-white px-3 py-1.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors">
                    📁 Upload Data
                  </button>
                  <button className="text-xs text-kiri-accent hover:text-white px-3 py-1.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors">
                    🔍 Search PRIDE
                  </button>
                </div>
              </div>
            </Card>
          )}

          {activeTab === "de" && (
            <Card title={t("interactomics.de_title", "Public Dataset Differential Expression")}>
              <div className="text-center text-kiri-text-muted text-sm py-8 space-y-3">
                <p>
                  {t("interactomics.de_upload", "Upload expression data or search GEO for knockdown/overexpression datasets related to your target genes.")}
                </p>
                <div className="flex justify-center gap-3">
                  <button className="text-xs text-kiri-accent hover:text-white px-3 py-1.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors">
                    📁 Upload Data
                  </button>
                  <button className="text-xs text-kiri-accent hover:text-white px-3 py-1.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors">
                    🔍 Search GEO
                  </button>
                </div>
              </div>
            </Card>
          )}

          {activeTab === "substrates" && (
            <div className="space-y-4">
              {loading ? (
                <ChartSkeleton />
              ) : substrateData ? (
                <>
                  {/* Summary stats */}
                  <Card>
                    <div className="flex gap-6 text-xs text-kiri-text-muted">
                      <span>Scanned: <strong className="text-kiri-text">{substrateData.total_scanned}</strong> proteins</span>
                      <span>With hits: <strong className="text-kiri-text">{substrateData.total_with_hits}</strong></span>
                      <span>TM candidates: <strong className="text-kiri-accent">{substrateData.tm_hit_candidates}</strong></span>
                      <span>Motif: <code className="text-kiri-accent">{substrateData.motif_pattern}</code></span>
                    </div>
                  </Card>
                  <SubstrateTable
                    candidates={substrateData.candidates}
                    motifPattern={substrateData.motif_pattern}
                  />
                </>
              ) : !error ? (
                <Card>
                  <div className="text-center text-kiri-text-muted text-sm py-8">
                    {t("interactomics.no_substrates", "No substrate prediction results. Add protein targets to your project.")}
                  </div>
                </Card>
              ) : null}
            </div>
          )}

          {activeTab === "regulatory" && (
            <div className="space-y-4">
              {loading ? (
                <ChartSkeleton />
              ) : regulatoryData ? (
                <>
                  {/* Legend for functional categories */}
                  {regulatoryData.functions && (
                    <Card>
                      <div className="flex flex-wrap gap-3 text-xs">
                        {Object.entries(regulatoryData.functions as Record<string, { label: string; color: string; genes_in_network: string[] }>).map(
                          ([, func]) =>
                            func.genes_in_network.length > 0 && (
                              <span
                                key={func.label}
                                className="flex items-center gap-1"
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-full"
                                  style={{ backgroundColor: func.color }}
                                />
                                <span className="text-kiri-text-muted">
                                  {func.label} ({func.genes_in_network.length})
                                </span>
                              </span>
                            )
                        )}
                      </div>
                    </Card>
                  )}
                  <RegulatoryGraph
                    nodes={regulatoryData.nodes}
                    edges={regulatoryData.edges}
                    edgeColors={regulatoryData.meta?.edge_colors}
                    title={t("interactomics.regulatory_title", "Integrated Regulatory Network")}
                    provenance={regulatoryProv}
                  />
                </>
              ) : !error ? (
                <Card>
                  <div className="text-center text-kiri-text-muted text-sm py-8">
                    {t("interactomics.no_regulatory", "Add protein targets to build a regulatory network.")}
                  </div>
                </Card>
              ) : null}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

export default InteractomicsPage;
