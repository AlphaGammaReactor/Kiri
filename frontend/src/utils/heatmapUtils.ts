/**
 * Kiri — Heatmap Utility Functions
 *
 * Pure functions for data transformation, hierarchical clustering,
 * dendrogram rendering, color palette definitions, and pathway tags.
 */

import { agnes, type Cluster } from "ml-hclust";

// ══════════════════════════════
//  Data Transformations
// ══════════════════════════════

/** Log2(x + 1) transform for expression values */
export function applyLog2Transform(
  values: Record<string, number[]>
): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const gene in values) {
    result[gene] = values[gene].map(v => Math.log2((v || 0) + 1));
  }
  return result;
}

/** Row-wise Z-score normalization: (x - mean) / std per gene */
export function applyZScore(
  values: Record<string, number[]>
): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const gene in values) {
    const row = values[gene];
    const n = row.length;
    if (n === 0) {
      result[gene] = [];
      continue;
    }
    const mean = row.reduce((a, b) => a + b, 0) / n;
    const variance = row.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance) || 1; // Avoid division by zero
    result[gene] = row.map(v => (v - mean) / std);
  }
  return result;
}

// ══════════════════════════════
//  Distance Metrics
// ══════════════════════════════

export type DistanceMetric = "euclidean" | "pearson" | "spearman";

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

function pearsonCorrelationDistance(a: number[], b: number[]): number {
  const n = a.length;
  if (n === 0) return 1;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const dA = a[i] - meanA;
    const dB = b[i] - meanB;
    num += dA * dB;
    denA += dA * dA;
    denB += dB * dB;
  }
  const den = Math.sqrt(denA) * Math.sqrt(denB);
  const r = den === 0 ? 0 : num / den;
  return 1 - r; // Distance = 1 - correlation
}

function rankArray(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  for (let i = 0; i < indexed.length; i++) {
    ranks[indexed[i].i] = i;
  }
  return ranks;
}

function spearmanDistance(a: number[], b: number[]): number {
  return pearsonCorrelationDistance(rankArray(a), rankArray(b));
}

function getDistanceFn(metric: DistanceMetric): (a: number[], b: number[]) => number {
  switch (metric) {
    case "pearson":  return pearsonCorrelationDistance;
    case "spearman": return spearmanDistance;
    default:         return euclideanDistance;
  }
}

// ══════════════════════════════
//  Hierarchical Clustering
// ══════════════════════════════

export type LinkageMethod = "ward" | "average" | "complete" | "single";

export interface ClusterResult {
  order: number[];
  tree: Cluster;
}

/**
 * Perform hierarchical clustering on a matrix of values.
 * Returns the leaf order and the cluster tree for dendrogram rendering.
 */
export function performClustering(
  matrix: number[][],
  metric: DistanceMetric = "euclidean",
  linkage: LinkageMethod = "ward"
): ClusterResult | null {
  if (matrix.length < 2) return null;

  try {
    // Build distance matrix
    const n = matrix.length;
    const distanceMatrix: number[][] = [];
    const distFn = getDistanceFn(metric);

    for (let i = 0; i < n; i++) {
      distanceMatrix[i] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          distanceMatrix[i][j] = 0;
        } else if (j < i) {
          distanceMatrix[i][j] = distanceMatrix[j][i];
        } else {
          distanceMatrix[i][j] = distFn(matrix[i], matrix[j]);
        }
      }
    }

    // For ward linkage, agnes needs the data; for others, the distance matrix
    const tree = agnes(distanceMatrix, {
      method: linkage === "ward" ? "ward" : linkage,
      isDistanceMatrix: true,
    });

    // Extract leaf order from the tree
    const order = getLeafOrder(tree);

    return { order, tree };
  } catch {
    console.warn("Clustering failed, returning original order");
    return null;
  }
}

/** Recursively extract leaf indices from the cluster tree in order */
function getLeafOrder(cluster: Cluster): number[] {
  if (cluster.isLeaf) {
    return [cluster.index];
  }
  const left = cluster.children[0] ? getLeafOrder(cluster.children[0]) : [];
  const right = cluster.children[1] ? getLeafOrder(cluster.children[1]) : [];
  return [...left, ...right];
}


// ══════════════════════════════
//  Group-Then-Cluster
// ══════════════════════════════

interface SampleLike {
  sample_type: string;
}

/**
 * Force-group samples by type (Normal first, Tumor second),
 * then independently cluster within each group.
 *
 * This produces the publication-standard layout where the two
 * biological conditions are visually separated, with hierarchical
 * clustering revealing structure within each group.
 */
export function groupThenClusterSamples<S extends SampleLike>(
  samples: S[],
  genes: string[],
  values: Record<string, number[]>,
  metric: DistanceMetric = "euclidean",
  linkage: LinkageMethod = "ward",
): { order: number[]; normalCount: number; tumorCount: number } {
  // Split by group
  const normalIndices: number[] = [];
  const tumorIndices: number[] = [];
  samples.forEach((s, i) => {
    if (s.sample_type === "normal") normalIndices.push(i);
    else tumorIndices.push(i);
  });

  // Cluster within each group
  const clusterWithinGroup = (indices: number[]): number[] => {
    if (indices.length < 2) return indices;
    // Build sample matrix for this group (each sample = row of gene values)
    const matrix = indices.map(si =>
      genes.map(gene => (values[gene] || [])[si] ?? 0)
    );
    const result = performClustering(matrix, metric, linkage);
    if (result) {
      return result.order.map(i => indices[i]);
    }
    return indices;
  };

  const orderedNormal = clusterWithinGroup(normalIndices);
  const orderedTumor = clusterWithinGroup(tumorIndices);

  return {
    order: [...orderedNormal, ...orderedTumor],
    normalCount: orderedNormal.length,
    tumorCount: orderedTumor.length,
  };
}


// ══════════════════════════════
//  Dendrogram → ECharts
// ══════════════════════════════

export interface DendrogramLine {
  x1: number; y1: number;
  x2: number; y2: number;
}

/**
 * Convert a cluster tree into line segments for ECharts custom graphic rendering.
 * 
 * @param tree - the cluster tree from agnes
 * @param leafPositions - map from leaf index to pixel position (x for row, y for column)
 * @param maxHeight - max pixel height for the dendrogram
 */
export function dendrogramToLines(
  tree: Cluster,
  leafPositions: Map<number, number>,
  maxHeight: number
): DendrogramLine[] {
  const lines: DendrogramLine[] = [];
  const maxDist = tree.height || 1;

  function getPosition(node: Cluster): { pos: number; height: number } {
    if (node.isLeaf) {
      return {
        pos: leafPositions.get(node.index) ?? 0,
        height: 0,
      };
    }
    const left = getPosition(node.children[0]);
    const right = getPosition(node.children[1]);
    const h = (node.height / maxDist) * maxHeight;

    // Horizontal lines from children to join height
    lines.push({ x1: left.pos, y1: left.height, x2: left.pos, y2: h });
    lines.push({ x1: right.pos, y1: right.height, x2: right.pos, y2: h });
    // Connecting line at join height
    lines.push({ x1: left.pos, y1: h, x2: right.pos, y2: h });

    return {
      pos: (left.pos + right.pos) / 2,
      height: h,
    };
  }

  getPosition(tree);
  return lines;
}

// ══════════════════════════════
//  Pathway Tags (PARL-MAVS axis)
// ══════════════════════════════

export interface PathwayTag {
  name: string;
  color: string;
  kegg?: string;
}

/** Gene → pathway annotation for the PARL-MAVS regulatory axis */
export const PATHWAY_TAGS: Record<string, PathwayTag> = {
  PARL:  { name: "Mitochondrial Protease", color: "#f97316", kegg: "GO:0005739" },
  MAVS:  { name: "Innate Immunity",        color: "#22c55e", kegg: "GO:0045087" },
  DDX58: { name: "RIG-I Signaling",        color: "#3b82f6", kegg: "hsa04622" },
  IRF3:  { name: "Transcription Factor",   color: "#a855f7", kegg: "GO:0045087" },
  IFNB1: { name: "Interferon Response",    color: "#ec4899", kegg: "R-HSA-168928" },
};


// ══════════════════════════════
//  Significance Helpers
// ══════════════════════════════

/**
 * Map FDR-corrected p-value to asterisk notation.
 * Returns "" if not significant, or "*" / "**" / "***".
 */
export function pValueToAsterisks(adjustedPValue: number): string {
  if (adjustedPValue < 0.001) return "***";
  if (adjustedPValue < 0.01)  return "**";
  if (adjustedPValue < 0.05)  return "*";
  return "";
}


// ══════════════════════════════
//  Color Palettes
// ══════════════════════════════

export interface ColorPalette {
  name: string;
  colors: string[];
}

export const COLOR_PALETTES: Record<string, ColorPalette> = {
  blueWhiteRed: {
    name: "Blue–White–Red",
    colors: [
      "#2166ac", "#4393c3", "#92c5de", "#d1e5f0",
      "#f7f7f7",
      "#fddbc7", "#f4a582", "#d6604d", "#b2182b",
    ],
  },
  viridis: {
    name: "Viridis",
    colors: [
      "#440154", "#482878", "#3e4989", "#31688e",
      "#26828e", "#1f9e89", "#35b779", "#6ece58",
      "#b5de2b", "#fde725",
    ],
  },
  magma: {
    name: "Magma",
    colors: [
      "#000004", "#180f3d", "#440f76", "#721f81",
      "#9e2f7f", "#cd4071", "#f1605d", "#fd9668",
      "#feca8d", "#fcfdbf",
    ],
  },
  inferno: {
    name: "Inferno",
    colors: [
      "#000004", "#1b0c41", "#4a0c6b", "#781c6d",
      "#a52c60", "#cf4446", "#ed6925", "#fb9b06",
      "#f7d13d", "#fcffa4",
    ],
  },
  plasma: {
    name: "Plasma",
    colors: [
      "#0d0887", "#46039f", "#7201a8", "#9c179e",
      "#bd3786", "#d8576b", "#ed7953", "#fb9f3a",
      "#fdca26", "#f0f921",
    ],
  },
  blueRed: {
    name: "Blue ↔ Red",
    colors: [
      "#2166ac", "#4393c3", "#92c5de", "#d1e5f0",
      "#f7f7f7", "#fddbc7", "#f4a582", "#d6604d",
      "#b2182b",
    ],
  },
  coolwarm: {
    name: "Cool–Warm",
    colors: [
      "#3b4cc0", "#5977e3", "#7b9ff9", "#a4c0fc",
      "#c9d7ef", "#edd1c2", "#f0a98b", "#e36c56",
      "#b40426",
    ],
  },
};

export const DEFAULT_PALETTE = "blueWhiteRed";
