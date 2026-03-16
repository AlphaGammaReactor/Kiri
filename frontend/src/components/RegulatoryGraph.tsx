/**
 * Kiri — Regulatory Network Graph Component
 *
 * ECharts graph visualization for the integrated regulatory network.
 * Nodes colored by functional category, edges by evidence type.
 * Falls back to force-directed layout.
 */

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { KiriChart } from "./KiriChart";
import type { Provenance } from "../services/api";

interface NetworkNode {
  id: string;
  label: string;
  node_type: string;
  color?: string;
  functional_categories?: string[];
  evidence_sources?: string[];
}

interface NetworkEdge {
  source: string;
  target: string;
  edge_type: string;
  weight: number;
  color?: string;
  details?: string;
}

interface RegulatoryGraphProps {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  edgeColors?: Record<string, string>;
  title?: string;
  provenance?: Provenance | null;
  loading?: boolean;
  error?: string;
}

const NODE_TYPE_SIZES: Record<string, number> = {
  target: 35,
  interactor: 18,
  "co-expressed": 14,
  deg: 16,
  substrate: 20,
  function: 28,
};

export function RegulatoryGraph({
  nodes,
  edges,
  edgeColors,
  title = "Regulatory Network",
  provenance,
  loading,
  error,
}: RegulatoryGraphProps) {
  const option: EChartsOption = useMemo(() => {
    if (!nodes || nodes.length === 0) return {};

    const categories = [
      { name: "Target Gene" },
      { name: "PPI Interactor" },
      { name: "Co-expressed" },
      { name: "Differentially Expressed" },
      { name: "Substrate Candidate" },
      { name: "Functional Category" },
    ];

    const catMap: Record<string, number> = {
      target: 0,
      interactor: 1,
      "co-expressed": 2,
      deg: 3,
      substrate: 4,
      function: 5,
    };

    const graphNodes = nodes.map((n) => ({
      id: n.id,
      name: n.label || n.id,
      symbolSize: NODE_TYPE_SIZES[n.node_type] ?? 15,
      category: catMap[n.node_type] ?? 1,
      itemStyle: {
        color: n.color || "#74b9ff",
        borderColor: n.node_type === "target" ? "#fff" : "transparent",
        borderWidth: n.node_type === "target" ? 2 : 0,
      },
      label: {
        show: n.node_type === "target" || n.node_type === "function" || n.node_type === "substrate",
        fontSize: n.node_type === "target" ? 11 : 9,
        color: "#e2e8f0",
      },
    }));

    const graphEdges = edges.map((e) => ({
      source: e.source,
      target: e.target,
      lineStyle: {
        color: e.color || edgeColors?.[e.edge_type] || "#636e72",
        width: Math.max(1, e.weight * 3),
        curveness: 0.2,
        opacity: 0.6,
        type: e.edge_type === "function_member" ? ("dashed" as const) : ("solid" as const),
      },
      tooltip: {
        formatter: () =>
          `<strong>${e.source} → ${e.target}</strong><br/>Type: ${e.edge_type}<br/>${e.details || ""}`,
      },
    }));

    return {
      tooltip: {},
      legend: {
        data: categories.map((c) => c.name),
        bottom: 5,
        textStyle: { color: "#94a3b8", fontSize: 10 },
      },
      series: [
        {
          type: "graph",
          layout: "force",
          data: graphNodes,
          links: graphEdges,
          categories,
          roam: true,
          draggable: true,
          force: {
            repulsion: 200,
            edgeLength: [50, 150],
            gravity: 0.1,
          },
          emphasis: {
            focus: "adjacency",
            lineStyle: { width: 4 },
          },
          lineStyle: {
            opacity: 0.6,
          },
          label: {
            position: "right",
            fontSize: 10,
          },
        },
      ],
    };
  }, [nodes, edges, edgeColors]);

  return (
    <KiriChart
      title={title}
      option={option}
      provenance={provenance}
      loading={loading}
      error={error}
      height="520px"
      sourceModule="interaction"
    />
  );
}
