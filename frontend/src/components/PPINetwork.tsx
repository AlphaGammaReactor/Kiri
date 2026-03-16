/**
 * Kiri — PPI Network Viewer
 *
 * Cytoscape.js-based interactive protein-protein interaction network.
 * Nodes colored by query status, edges weighted by STRING-DB confidence.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import cytoscape from "cytoscape";
import { Card, ProvenanceFooter, LoadingSkeleton, StatusBadge } from "./ui";
import type { Provenance } from "../services/api";
import { useAppDispatch } from "../store";
import { addPanel } from "../store/publicationSlice";
import { addToast } from "../store/errorSlice";

interface PPINode {
  id: string;
  label: string;
  is_query: boolean;
  sources: string[];
}

interface PPIEdge {
  source: string;
  target: string;
  string_score: number;
  evidence: string[];
  pubmed_ids: string[];
  sources: string[];
}

interface PPIData {
  nodes: PPINode[];
  edges: PPIEdge[];
  meta: {
    total_nodes: number;
    total_edges: number;
    sources_used: string[];
    query_genes: string[];
  };
}

interface PPINetworkProps {
  data: PPIData | null;
  provenance: Provenance | null;
  loading: boolean;
  confidence: number;
  onEdgeClick?: (edge: PPIEdge) => void;
  onNodeClick?: (node: PPINode) => void;
}

// Okabe-Ito colorblind-safe palette (from Kiri design system)
const COLORS = {
  queryNode: "#00bbf9",    // query gene — bright cyan
  partnerNode: "#8b8c89",  // interactor — muted gray
  edgeDefault: "#4a4b50",
  edgeStrong: "#00bbf9",
  edgeBoth: "#f5a623",     // found in both STRING-DB + BioGRID
  background: "#0a0b0e",
};

export function PPINetwork({
  data,
  provenance,
  loading,
  confidence,
  onEdgeClick,
  onNodeClick,
}: PPINetworkProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const handleAddToFigure = useCallback(() => {
    if (!cyRef.current) return;
    
    // Cytoscape PNG export
    const dataUrl = cyRef.current.png({ bg: '#ffffff', full: true, scale: 2 });
    
    const panelTitle = t("modules.interaction.ppi_title");
    dispatch(addPanel({
      sourceModule: "interaction",
      type: "png",
      data: dataUrl,
      title: panelTitle,
      legend: `Method: Cytoscape STRING-DB | Source: STRING/BioGRID | n=${data?.meta.total_nodes || 0} nodes, ${data?.meta.total_edges || 0} edges`,
      dataSource: "STRING-DB / BioGRID",
      citation: "Szklarczyk et al. (2023) STRING v12",
    }));

    dispatch(addToast({
      type: 'success',
      title: t('export.figure_added', '"{{name}}" added to Publication Engine', { name: panelTitle }),
      message: "PPI Network exported successfully.",
      duration: 3000,
    }));
  }, [dispatch, t, data]);

  // ── Stable callback refs ──
  // These let Cytoscape event handlers always call the latest callback
  // without needing to be in the useEffect dependency array.
  const onNodeClickRef = useRef(onNodeClick);
  const onEdgeClickRef = useRef(onEdgeClick);
  useEffect(() => { onNodeClickRef.current = onNodeClick; }, [onNodeClick]);
  useEffect(() => { onEdgeClickRef.current = onEdgeClick; }, [onEdgeClick]);

  // Track current data identity to know when to do a full rebuild vs. update
  const prevDataRef = useRef<PPIData | null>(null);

  // Build Cytoscape elements
  const buildElements = useCallback(
    (ppiData: PPIData, minConfidence: number) => {
      const filteredEdges = ppiData.edges.filter(
        (e) => e.string_score >= minConfidence || e.sources.includes("BioGRID")
      );

      // Only include nodes that have at least one visible edge
      const visibleNodeIds = new Set<string>();
      filteredEdges.forEach((e) => {
        visibleNodeIds.add(e.source);
        visibleNodeIds.add(e.target);
      });

      // Always show query genes
      ppiData.meta.query_genes.forEach((g) => visibleNodeIds.add(g));

      const nodes = ppiData.nodes
        .filter((n) => visibleNodeIds.has(n.id))
        .map((n) => ({
          data: {
            id: n.id,
            label: n.label,
            isQuery: n.is_query,
            sources: n.sources,
          },
        }));

      const edges = filteredEdges.map((e, i) => ({
        data: {
          id: `e-${i}-${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          score: e.string_score,
          evidence: e.evidence,
          pubmedIds: e.pubmed_ids,
          sources: e.sources,
          hasBothSources: e.sources.length > 1,
        },
      }));

      return [...nodes, ...edges];
    },
    []
  );

  // Shared layout options
  const layoutOptions = {
    name: "cose" as const,
    idealEdgeLength: () => 120,
    nodeOverlap: 20,
    animate: true,
    animationDuration: 500,
    randomize: false,
  };

  // Initialize Cytoscape — only depends on data (not callbacks)
  useEffect(() => {
    if (!containerRef.current || !data || data.nodes.length === 0) return;

    // If data identity hasn't changed (same object), skip rebuild
    if (cyRef.current && prevDataRef.current === data) return;
    prevDataRef.current = data;

    const elements = buildElements(data, confidence);

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-valign": "center" as const,
            "text-halign": "center" as const,
            "font-size": "10px",
            "font-family": "JetBrains Mono, monospace",
            "font-weight": "bold" as const,
            color: "#e8e9ed",
            "text-outline-color": "#0a0b0e",
            "text-outline-width": 2,
            "background-color": COLORS.partnerNode,
            "background-opacity": 0.85,
            width: 44,
            height: 44,
            "border-width": 2,
            "border-color": "#3a3b40",
            "border-opacity": 0.8,
            "overlay-padding": "4px",
            "overlay-opacity": 0,
            "transition-property": "border-color, border-width, width, height, background-opacity",
            "transition-duration": "150ms" as unknown as number,
          } as cytoscape.Css.Node,
        },
        {
          selector: "node[?isQuery]",
          style: {
            "background-color": COLORS.queryNode,
            "background-opacity": 0.95,
            "border-color": COLORS.queryNode,
            "border-width": 2.5,
            width: 54,
            height: 54,
          },
        },
        {
          selector: "node:active, node:selected",
          style: {
            "border-color": "#f5a623",
            "border-width": 3,
            "background-opacity": 1,
          },
        },
        {
          selector: "edge",
          style: {
            width: "mapData(score, 0, 1, 1, 5)",
            "line-color": COLORS.edgeDefault,
            "curve-style": "bezier" as const,
            opacity: 0.5,
            "overlay-opacity": 0,
            "transition-property": "opacity, line-color, width",
            "transition-duration": "150ms" as unknown as number,
          } as cytoscape.Css.Edge,
        },
        {
          selector: "edge[?hasBothSources]",
          style: {
            "line-color": COLORS.edgeBoth,
            opacity: 0.7,
          },
        },
      ],
      layout: layoutOptions,
      minZoom: 0.3,
      maxZoom: 3,
      wheelSensitivity: 0.3,
    });

    // ── Event handlers (use refs for stable callback access) ──

    cy.on("tap", "edge", (evt) => {
      const edgeData = evt.target.data();
      onEdgeClickRef.current?.({
        source: edgeData.source,
        target: edgeData.target,
        string_score: edgeData.score,
        evidence: edgeData.evidence || [],
        pubmed_ids: edgeData.pubmedIds || [],
        sources: edgeData.sources || [],
      });
    });

    cy.on("tap", "node", (evt) => {
      const nodeData = evt.target.data();
      onNodeClickRef.current?.({
        id: nodeData.id,
        label: nodeData.label,
        is_query: nodeData.isQuery,
        sources: nodeData.sources || [],
      });
    });

    cy.on("mouseover", "node", (evt) => {
      const node = evt.target;
      setHoveredNode(node.data("label"));
      node.style({ "border-color": "#f5a623", "border-width": 3, "background-opacity": 1 });
      // Dim non-neighbor elements
      const neighborhood = node.neighborhood().add(node);
      cy.elements().not(neighborhood).style("opacity", 0.15);
      neighborhood.style("opacity", 1);
    });

    cy.on("mouseout", "node", (evt) => {
      const node = evt.target;
      setHoveredNode(null);
      const isQuery = node.data("isQuery");
      node.style({
        "border-color": isQuery ? COLORS.queryNode : "#3a3b40",
        "border-width": isQuery ? 2.5 : 2,
        "background-opacity": isQuery ? 0.95 : 0.85,
      });
      // Restore all element opacity
      cy.elements().style("opacity", 1);
      // Re-apply default edge opacities
      cy.edges().forEach((edge) => {
        const hasBoth = edge.data("hasBothSources");
        edge.style("opacity", hasBoth ? 0.7 : 0.5);
      });
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, buildElements]);

  return (
    <Card
      title={t("modules.interaction.ppi_title")}
      className="h-full flex flex-col"
    >
      {loading ? (
        <LoadingSkeleton lines={6} />
      ) : !data || data.nodes.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-kiri-text-muted text-sm">
          {t("modules.interaction.no_interactions")}
        </div>
      ) : (
        <>
          {/* Legend */}
          <div className="flex items-center gap-4 mb-3 text-xs text-kiri-text-muted">
            <div className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: COLORS.queryNode }}
              />
              <span>{t("modules.interaction.query_gene")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: COLORS.partnerNode }}
              />
              <span>{t("modules.interaction.interactor")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-3 h-1 rounded"
                style={{ backgroundColor: COLORS.edgeBoth }}
              />
              <span>{t("modules.interaction.both_sources")}</span>
            </div>
            {data.meta.sources_used.map((src) => (
              <StatusBadge key={src} label={src} variant="info" />
            ))}
          </div>

          {/* Hover info — fixed height, never shifts layout */}
          <div className="relative h-5 mb-1">
            <div
              className="absolute inset-0 flex items-center text-xs font-mono transition-opacity duration-150"
              style={{ opacity: hoveredNode ? 1 : 0, color: COLORS.queryNode }}
            >
              {hoveredNode ?? "\u00A0"}
            </div>
          </div>

          {/* Graph container */}
          <div
            ref={containerRef}
            className="flex-1 min-h-[350px] rounded bg-kiri-bg border border-kiri-border"
          />

          {/* Stats and Export */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-4 text-xs text-kiri-text-dim font-mono">
              <span>
                {t("modules.interaction.nodes")}: {data.meta.total_nodes}
              </span>
              <span>
                {t("modules.interaction.edges")}: {data.meta.total_edges}
              </span>
            </div>
            <button
               onClick={handleAddToFigure}
               className="text-[10px] text-kiri-accent hover:text-white px-2 py-0.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors flex items-center gap-1"
               title="Add to Publication Engine Cart"
             >
               ＋ Figure
             </button>
          </div>

          <ProvenanceFooter provenance={provenance} compact />
        </>
      )}
    </Card>
  );
}
