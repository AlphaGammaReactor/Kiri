/**
 * Kiri — API Client
 *
 * Centralized HTTP client with:
 * - Response envelope unwrapping
 * - Provenance metadata extraction
 * - Error handling with user-facing messages
 * - Automatic retry for transient failures
 */

import axios, { AxiosError } from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api";

export interface Provenance {
  source: string;
  method: string;
  timestamp: string;
  sample_count: number | null;
  version: string;
  cache_hit: boolean;
}

export interface ApiResponse<T = unknown> {
  status: "success" | "error";
  data: T | null;
  provenance: Provenance | null;
  warnings: string[];
  errors: string[];
}

const client = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

/** Export raw client for direct use in Redux thunks */
export const apiClient = client;

// Retry wrapper for transient failures
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  delayMs = 1000
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * Make a GET request and unwrap the response envelope.
 */
export async function apiGet<T = unknown>(
  path: string,
  params?: Record<string, string | number>
): Promise<ApiResponse<T>> {
  const resp = await withRetry(() => client.get<ApiResponse<T>>(path, { params }));
  return resp.data;
}

/**
 * Make a POST request and unwrap the response envelope.
 */
export async function apiPost<T = unknown>(
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  const resp = await withRetry(() => client.post<ApiResponse<T>>(path, body));
  return resp.data;
}

/**
 * Make a PATCH request and unwrap the response envelope.
 */
export async function apiPatch<T = unknown>(
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  const resp = await withRetry(() => client.patch<ApiResponse<T>>(path, body));
  return resp.data;
}

/**
 * Make a PUT request and unwrap the response envelope.
 */
export async function apiPut<T = unknown>(
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  const resp = await withRetry(() => client.put<ApiResponse<T>>(path, body));
  return resp.data;
}

/**
 * Make a DELETE request and unwrap the response envelope.
 */
export async function apiDelete<T = unknown>(
  path: string
): Promise<ApiResponse<T>> {
  const resp = await withRetry(() => client.delete<ApiResponse<T>>(path));
  return resp.data;
}

/**
 * Validate a gene symbol against HGNC.
 */
export async function validateGene(symbol: string) {
  return apiGet<{
    valid: boolean;
    symbol: string;
    name: string | null;
    hgnc: string;
  }>(`/v1/validation/gene/${encodeURIComponent(symbol)}`);
}

/**
 * Validate a list of gene symbols.
 */
export async function validateGenes(symbols: string[]) {
  return apiPost<{
    results: Record<string, { valid: boolean; symbol: string; name: string }>;
    valid_genes: string[];
    invalid_genes: string[];
    all_valid: boolean;
  }>("/v1/validation/genes", { symbols });
}

/**
 * Fetch the full pre-loaded protein catalog.
 */
export async function fetchProteinCatalog() {
  return apiGet<Array<{
    gene_symbol: string;
    uniprot_id: string;
    protein_name: string;
    organism: string;
    function_summary: string;
    sequence_length: number;
    hgnc_id?: string;
    category?: string;
    keywords?: string[];
  }>>("/v1/proteins/catalog");
}

/**
 * Search the protein catalog by query.
 */
export async function searchProteinCatalog(query: string) {
  return apiGet<Array<{
    gene_symbol: string;
    uniprot_id: string;
    protein_name: string;
    organism: string;
    function_summary: string;
    sequence_length: number;
    category?: string;
  }>>("/v1/proteins/search", { q: query });
}

/**
 * Validate a PubMed ID (anti-hallucination check).
 */
export async function validatePmid(pmid: string) {
  return apiPost<{
    valid: boolean;
    pmid: string;
    title: string;
    authors: string[];
    journal: string;
    year: string;
  }>(`/v1/validation/pmid/${encodeURIComponent(pmid)}`);
}


// ══════════════════════════════
//  Interaction Lab
// ══════════════════════════════

/**
 * Fetch merged PPI network from STRING-DB + BioGRID.
 */
export async function fetchPPINetwork(genes: string[], confidence = 0.4, projectId?: string) {
  const params: Record<string, string | number> = { confidence };
  if (genes && genes.length > 0) params.genes = genes.join(",");
  if (projectId) params.project_id = projectId;

  return apiGet<{
    nodes: Array<{ id: string; label: string; is_query: boolean; sources: string[] }>;
    edges: Array<{
      source: string;
      target: string;
      string_score: number;
      evidence: string[];
      pubmed_ids: string[];
      sources: string[];
    }>;
    meta: { total_nodes: number; total_edges: number; sources_used: string[]; query_genes: string[] };
  }>("/v1/interaction/ppi", params);
}

/**
 * Fetch AlphaFold protein structure (accepts gene symbol or UniProt ID).
 */
export async function fetchProteinStructure(identifier: string) {
  return apiGet<{
    found: boolean;
    uniprot_id: string;
    entry_id: string;
    gene: string;
    model_url: string;
    cif_url: string;
    pae_image_url: string;
    sequence_length: number;
    confidence_version: number;
    plddt_thresholds: { very_high: number; confident: number; low: number; very_low: number };
    error?: string;
  }>(`/v1/interaction/structure/${encodeURIComponent(identifier)}`);
}

/**
 * Run PARL cleavage motif analysis on a protein.
 */
export async function analyzeCleavage(uniprotId: string, motifPattern?: string) {
  return apiPost<{
    uniprot_id: string;
    protein_name: string;
    motif_pattern: string;
    total_hits: number;
    cleavage_sites: Array<{
      position: number;
      motif_match: string;
      flanking_sequence: string;
      flanking_start: number;
      flanking_end: number;
      in_tm_region: boolean;
      p_score: number;
    }>;
    sequence_length: number;
    tm_region: { start: number; end: number } | null;
  }>("/v1/interaction/cleavage", {
    uniprot_id: uniprotId,
    ...(motifPattern ? { motif_pattern: motifPattern } : {}),
  });
}

/**
 * Get PubMed citations for an interaction between two genes.
 */
export async function fetchInteractionCitations(geneA?: string, geneB?: string, maxResults = 10, projectId?: string) {
  const params: Record<string, string | number> = { max_results: maxResults };
  if (geneA) params.gene_a = geneA;
  if (geneB) params.gene_b = geneB;
  if (projectId) params.project_id = projectId;

  return apiGet<{
    gene_a: string;
    gene_b: string;
    total_found: number;
    citations: Array<{
      pmid: string;
      title: string;
      authors: string[];
      journal: string;
      year: string;
      doi: string;
      validated: boolean;
    }>;
  }>("/v1/interaction/citations", params);
}

/**
 * Fetch rich interaction context for a protein pair.
 * Returns mechanism, GO terms, KEGG pathways, shared biology, and axis data.
 */
export async function fetchInteractionContext(geneA: string, geneB: string) {
  return apiGet<{
    gene_a: string;
    gene_b: string;
    interaction_type: string;
    mechanism: string;
    effect_on_target: string;
    cellular_effect: string;
    subcellular_location: string;
    directionality: string;
    shared_go_terms: Array<{ id: string; name: string }>;
    shared_pathways: Array<{ id: string; name: string }>;
    go_a: { gene: string; terms: Array<{ id: string; name: string; aspect: string }> };
    go_b: { gene: string; terms: Array<{ id: string; name: string; aspect: string }> };
    pathways_a: Array<{ id: string; name: string }>;
    pathways_b: Array<{ id: string; name: string }>;
    pathway_axis: {
      id: string;
      name: string;
      steps: Array<{ gene: string; role: string; label: string }>;
      modulator: { gene: string; role: string; target: string; effect: string };
    } | null;
    is_curated: boolean;
  }>("/v1/interaction/context", { gene_a: geneA, gene_b: geneB });
}


// ══════════════════════════════
//  Multi-Omics Atlas
// ══════════════════════════════

/**
 * Fetch TCGA expression data for gene set from GDC.
 */
export async function fetchExpression(
  genes: string[],
  projectIds: string[] = ["TCGA-COAD", "TCGA-READ"],
  normalization: string = "tpm",
  projectId?: string
) {
  return apiPost<{
    genes: string[];
    samples: Array<{
      sample_id: string;
      sample_type: string;
      stage: string;
      msi_status: string;
      project: string;
    }>;
    values: Record<string, number[]>;
    normalization: string;
    source: string;
    sample_count: number;
  }>("/v1/atlas/expression", {
    genes: genes && genes.length > 0 ? genes : undefined,
    project_ids: projectIds,
    normalization,
    project_id: projectId
  });
}

/**
 * Fetch clinical metadata from GDC.
 */
export async function fetchClinical(
  projectIds: string[] = ["TCGA-COAD", "TCGA-READ"],
  stageFilter?: string[],
  msiFilter?: string[],
  projectId?: string
) {
  return apiPost<{
    records: Array<{
      case_id: string;
      submitter_id: string;
      stage: string;
      vital_status: string;
      days_to_death: number | null;
      days_to_last_follow_up: number | null;
      project: string;
    }>;
    total: number;
  }>("/v1/atlas/clinical", {
    project_ids: projectIds,
    stage_filter: stageFilter,
    msi_filter: msiFilter,
    project_id: projectId
  });
}

/**
 * Fetch GEO validation dataset.
 */
export async function fetchGeoDataset(accession: string, genes: string[], projectId?: string) {
  return apiPost<{
    genes: string[];
    samples: Array<{
      sample_id: string;
      sample_type: string;
      stage: string;
      msi_status: string;
      project: string;
    }>;
    values: Record<string, number[]>;
    normalization: string;
    source: string;
    sample_count: number;
    dataset_info: { title: string; platform: string; samples: number };
  }>("/v1/atlas/geo", { accession, genes: genes && genes.length > 0 ? genes : undefined, project_id: projectId });
}

/**
 * Upload a custom CSV/TSV dataset.
 */
export async function uploadCustomDataset(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const resp = await withRetry(() =>
    client.post<ApiResponse<{
      genes: string[];
      samples: Array<{
        sample_id: string;
        sample_type: string;
        stage: string;
        msi_status: string;
        project: string;
      }>;
      values: Record<string, number[]>;
      normalization: string;
      source: string;
      sample_count: number;
    }>>("/v1/atlas/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  );
  return resp.data;
}


// ══════════════════════════════
//  Temporal Clustering & Immune Deconvolution
// ══════════════════════════════

export async function fetchTemporalClusters(
  expressionMatrix: Record<string, number[]>,
  stageLabels: string[],
  nClusters = 6,
  fuzziness = 2.0
) {
  return apiPost<{
    stages: string[];
    clusters: Array<{
      id: number;
      label: string;
      centroid: number[];
      centroid_norm: number[];
      centroid_smooth: number[];
      genes: string[];
      gene_count: number;
      memberships: Record<string, number>;
      pattern: string;
    }>;
    gene_assignments: Record<string, { cluster: number; membership: number }>;
    n_genes: number;
  }>("/v1/atlas/temporal-clustering", {
    expression_matrix: expressionMatrix,
    stage_labels: stageLabels,
    n_clusters: nClusters,
    fuzziness,
  });
}

export async function fetchImmuneDeconvolution(
  expressionMatrix: Record<string, number[]> | null,
  projectIds?: string[],
  method: "cibersort" | "nnls" = "cibersort",
  sampleIds?: string[],
  permutations = 100
) {
  return apiPost<{
    method: string;
    cell_types: string[];
    samples: Array<{
      sample_id: string;
      proportions: Record<string, number>;
      p_value: number | null;
      correlation: number | null;
      rmse: number | null;
    }>;
    summary: Record<string, { mean: number; median: number; std: number }>;
    palette: Record<string, string>;
  }>("/v1/atlas/immune-deconvolution", {
    expression_matrix: expressionMatrix,
    project_ids: projectIds,
    method,
    sample_ids: sampleIds,
    permutations,
  });
}

// ══════════════════════════════
//  Multi-Cohort Validation & Pan-Survival
// ══════════════════════════════

export interface CohortInput {
  name: string;
  expression: Record<string, number[]>;
  groups: string[];
}

export async function fetchValidationGrid(
  genes: string[],
  cohortData: CohortInput[] | null,
  groupA = "tumor",
  groupB = "normal",
  pCutoff = 0.05,
  fcCutoff = 1.0,
  projectIds?: string[]
) {
  return apiPost<{
    genes: string[];
    cohorts: string[];
    grid: Record<string, Record<string, {
      log2fc: number;
      p_value: number;
      adj_p_value: number;
      significant: boolean;
      test_used: string;
      effect_size_d: number | null;
    }>>;
    intersect_genes: string[];
    direction_matrix: Record<string, Record<string, number>>;
    concordance: Record<string, { direction: number; status: "consistent" | "mixed" | "no_signal"; cohort_count: number }>;
  }>("/v1/atlas/validation-grid", {
    genes,
    cohort_data: cohortData,
    group_a: groupA,
    group_b: groupB,
    p_cutoff: pCutoff,
    fc_cutoff: fcCutoff,
    project_ids: projectIds,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchPanSurvival(
  genes: string[],
  expressionData: Record<string, number[]> | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clinicalRecords: Array<Record<string, any>> | null,
  projectIds?: string[],
  metrics: string[] = ["OS", "DFS", "PFS", "DSS"],
  covariates?: string[]
) {
  return apiPost<{
    genes: string[];
    metrics: string[];
    results: Record<string, Array<{
      metric: string;
      hr: number;
      ci_lower: number;
      ci_upper: number;
      p_value: number;
      n_samples: number;
      n_events: number;
      concordance_index: number;
      significant: boolean;
    }>>;
    gene_summaries: Record<string, { avg_hr: number; sig_count: number; risk_direction: "risk" | "protective" | "neutral" }>;
  }>("/v1/atlas/pan-survival", {
    genes,
    expression_data: expressionData,
    clinical_records: clinicalRecords,
    project_ids: projectIds,
    metrics,
    covariates,
  });
}

// ══════════════════════════════
//  Gene Set Enrichment Analysis
// ══════════════════════════════

export interface EnrichmentTerm {
  term: string;
  p_value: number;
  adjusted_p_value: number;
  overlap?: string;
  odds_ratio?: number | null;
  combined_score?: number | null;
  genes?: string[];
  near_miss?: boolean;
}

export interface EnrichmentResult {
  results: Record<string, EnrichmentTerm[]>;
  near_miss_terms: Record<string, EnrichmentTerm[]>;
  gene_count: number;
  input_genes: string[];
  libraries: string[];
  library_labels: Record<string, string>;
  cutoff: number;
  total_significant: number;
  small_gene_list: boolean;
  cache_hit: boolean;
  error?: string;
}

/**
 * Run Over-Representation Analysis (ORA) against gene set libraries.
 */
export async function fetchEnrichment(
  genes: string[],
  geneSets?: string[],
  cutoff = 0.05,
  topN = 20,
  projectId?: string,
) {
  return apiPost<EnrichmentResult>("/v1/atlas/enrichment", {
    genes,
    gene_sets: geneSets,
    cutoff,
    top_n: topN,
    project_id: projectId,
  });
}

/**
 * List available gene set libraries for enrichment.
 */
export async function fetchEnrichmentLibraries() {
  return apiGet<Array<{ key: string; name: string; label: string }>>("/v1/atlas/enrichment/libraries");
}


// ══════════════════════════════
//  Mitochondrial Gene Analysis (Mito Lab)
// ══════════════════════════════

export interface CoexpressionScanResult {
  target_gene: string;
  n_samples: number;
  total_genes_scanned: number;
  correlated_genes: Array<{
    gene: string;
    r: number;
    p_value: number;
    direction: "positive" | "negative";
  }>;
  n_correlated: number;
  r_cutoff: number;
  p_cutoff: number;
}

export interface GSEATerm {
  term: string;
  nes: number;
  p_value: number;
  fdr: number;
  lead_genes: string[];
  gene_set_size: number;
  significant: boolean;
}

export interface MitoCorrelation {
  target_gene: string;
  mito_gene: string;
  mito_gene_display: string;
  r: number;
  p_value: number;
  n_samples: number;
  slope: number;
  intercept: number;
  fit_x: number[];
  fit_y: number[];
  scatter_x: number[];
  scatter_y: number[];
}

export interface MitoScoreComparison {
  gene: string;
  cutpoint: number;
  cutpoint_method: string;
  p_value: number;
  test_statistic: number;
  test_method: string;
  significant: boolean;
  high_group: {
    min: number; q1: number; median: number; q3: number; max: number;
    mean: number; std: number; n: number; values: number[];
  };
  low_group: {
    min: number; q1: number; median: number; q3: number; max: number;
    mean: number; std: number; n: number; values: number[];
  };
  error?: string;
}

/**
 * Run genome-wide co-expression scan + GSEA enrichment.
 */
export async function fetchCoexpression(
  genes: string[],
  projectIds: string[] = ["TCGA-COAD", "TCGA-READ"],
  rCutoff = 0.3,
  pCutoff = 0.05,
  topN = 200,
  projectId?: string,
) {
  return apiPost<{
    coexpression_scans: Record<string, CoexpressionScanResult>;
    gsea_results: Record<string, {
      all_terms: GSEATerm[];
      highlighted_terms: GSEATerm[];
      total_terms: number;
      total_significant: number;
      method: string;
      gene_count: number;
    }>;
    mito_correlations: {
      correlations: MitoCorrelation[];
      n_pairs: number;
      n_samples: number;
      core_mito_gene_labels: Record<string, string>;
    };
    sample_count: number;
    source: string;
    cache_hit: boolean;
  }>("/v1/atlas/coexpression", {
    genes,
    project_ids: projectIds,
    r_cutoff: rCutoff,
    p_cutoff: pCutoff,
    top_n: topN,
    project_id: projectId,
  });
}

/**
 * Compute scatter correlations between target and core mitochondrial genes.
 */
export async function fetchMitoCorrelation(
  genes: string[],
  projectIds: string[] = ["TCGA-COAD", "TCGA-READ"],
  mitoGenes?: string[],
  projectId?: string,
) {
  return apiPost<{
    correlations: MitoCorrelation[];
    n_pairs: number;
    n_samples: number;
    core_mito_gene_labels: Record<string, string>;
  }>("/v1/atlas/mito-correlation", {
    genes,
    project_ids: projectIds,
    mito_genes: mitoGenes,
    project_id: projectId,
  });
}

/**
 * Compute ssGSEA mitochondrial function score + high/low group comparison.
 */
export async function fetchMitoScore(
  genes: string[],
  projectIds: string[] = ["TCGA-COAD", "TCGA-READ"],
  cutpointMethod = "maxstat",
  projectId?: string,
) {
  return apiPost<{
    mito_scores: {
      scores: number[];
      n_samples: number;
      n_genes_used: number;
      n_genes_total: number;
      genes_used: string[];
      mean_score: number;
      std_score: number;
    };
    comparisons: Record<string, MitoScoreComparison>;
    sample_count: number;
    source: string;
    cache_hit: boolean;
  }>("/v1/atlas/mito-score", {
    genes,
    project_ids: projectIds,
    cutpoint_method: cutpointMethod,
    project_id: projectId,
  });
}
/**
 * Extract a user-facing error message from an API error.
 */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axErr = error as AxiosError<ApiResponse>;
    if (axErr.response?.data?.errors?.length) {
      return axErr.response.data.errors.join("; ");
    }
    if (axErr.response?.status === 502) {
      return "An external service is temporarily unavailable. Please try again.";
    }
    if (axErr.code === "ECONNABORTED") {
      return "Request timed out. The computation may be running in the background.";
    }
    return "A network error occurred. Please check your connection.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred.";
}

// ══════════════════════════════
//  Clinical & Prognostic Suite
// ══════════════════════════════

export async function fetchSurvivalAnalysis(
  genes: string[],
  projectIds: string[] = ["TCGA-COAD", "TCGA-READ"],
  cutpointMethod: "maxstat" | "median" | "custom" = "maxstat",
  customCutpoint?: number
) {
  return apiPost<{
    curves: Array<{
      group_name: string;
      n_samples: number;
      median_survival: number | null;
      time: number[];
      survival: number[];
      ci_lower: number[];
      ci_upper: number[];
    }>;
    p_value: number;
    cutpoint_value: number;
    cutpoint_method: string;
    at_risk_table: {
      time_points: number[];
      groups: Record<string, number[]>;
    };
  }>("/v1/clinical/survival", {
    genes,
    project_ids: projectIds,
    cutpoint_method: cutpointMethod,
    custom_cutpoint: customCutpoint,
  });
}

export async function fetchCoxRegression(
  genes: string[],
  covariates: string[] = ["stage"],
  projectIds: string[] = ["TCGA-COAD", "TCGA-READ"]
) {
  return apiPost<{
    hazard_ratios: Array<{
      variable: string;
      hr: number;
      ci_lower: number;
      ci_upper: number;
      p_value: number;
      significant: boolean;
    }>;
    concordance_index: number;
    n_samples: number;
    n_events: number;
  }>("/v1/clinical/cox", {
    genes,
    covariates,
    project_ids: projectIds,
  });
}

export async function fetchRSF(
  genes: string[],
  projectIds: string[] = ["TCGA-COAD", "TCGA-READ"],
  nEstimators: number = 100
) {
  return apiPost<{
    feature_importances: Array<{
      feature: string;
      importance: number;
    }>;
    concordance_index: number;
    n_samples: number;
    n_estimators: number;
  }>("/v1/clinical/rsf", {
    genes,
    project_ids: projectIds,
    n_estimators: nEstimators,
  });
}

export async function fetchSynergyScore(
  geneA: string,
  geneB: string,
  projectIds: string[] = ["TCGA-COAD", "TCGA-READ"],
  cutpointMethod: "median" | "maxstat" = "median"
) {
  return apiPost<{
    gene_a: string;
    gene_b: string;
    interaction_p_value: number;
    combined_hr: number;
    synergy_type: string;
    concordance_index: number;
    n_samples: number;
    at_risk_table: {
      time_points: number[];
      groups: Record<string, number[]>;
    };
    curves: Array<{
      group_name: string;
      n_samples: number;
      median_survival: number | null;
      time: number[];
      survival: number[];
      ci_lower: number[];
      ci_upper: number[];
    }>;
  }>("/v1/clinical/synergy", {
    gene_a: geneA,
    gene_b: geneB,
    project_ids: projectIds,
    cutpoint_method: cutpointMethod,
  });
}

// ══════════════════════════════
//  AI-Augmented Discovery
// ══════════════════════════════

export async function getLiteratureInsights(query: string, context?: string) {
  return apiPost<{
    summary: string;
    novelty_score: number;
    claims: Array<{
      text: string;
      pmids: string[];
      verified_pmids: string[];
      confidence: number;
      is_quarantined: boolean;
    }>;
    validation_stats: {
      total_pmids: number;
      valid: number;
      quarantined: number;
    };
  }>("/v1/discovery/literature", { query, context });
}

export async function validatePMIDs(pmids: string[]) {
  return apiPost<{
    results: Record<string, { valid: boolean; pmid: string; title?: string }>;
    valid_count: number;
    invalid_count: number;
    quarantined: string[];
    all_valid: boolean;
  }>("/v1/discovery/validate", { pmids });
}

// ══════════════════════════════
//  Drug Discovery
// ══════════════════════════════

export async function fetchDrugInteractions(genes: string[]) {
  return apiGet<{
    interactions: Record<
      string,
      Array<{
        drug_name: string;
        drug_id: string;
        pharmacology: string;
        indication: string;
        evidence_level: "High" | "Medium" | "Low";
        source: string;
      }>
    >;
  }>("/v1/drugs/interactions", { genes: genes.join(",") });
}

export async function fetchTargetRanking(genes: string[]) {
  return apiGet<{
    rankings: Array<{
      gene: string;
      score: number;
      drug_count: number;
      high_evidence_drugs: number;
      ctd_associations: number;
      chembl_bioactivities: number;
      total_references: number;
      druggability_tier: string;
    }>;
  }>("/v1/drugs/ranking", { genes: genes.join(",") });
}

export async function fetchPubChemCompounds(genes: string[]) {
  return apiGet<{
    compounds: Record<
      string,
      Array<{
        cid: number;
        name: string;
        iupac_name: string;
        molecular_formula: string;
        molecular_weight: number;
        xlogp: number | null;
        tpsa: number | null;
        hbond_donors: number;
        hbond_acceptors: number;
        canonical_smiles: string;
        inchi_key: string;
        target_gene: string;
        source: string;
      }>
    >;
  }>("/v1/drugs/pubchem", { genes: genes.join(",") });
}

export async function searchPubChemByName(query: string) {
  return apiGet<{
    compounds: Array<{
      cid: number;
      name: string;
      iupac_name: string;
      molecular_formula: string;
      molecular_weight: number;
      xlogp: number | null;
      tpsa: number | null;
      canonical_smiles: string;
      source: string;
    }>;
  }>("/v1/drugs/pubchem", { query });
}

export async function fetchCompoundDescription(cid: number) {
  return apiGet<{
    cid: number;
    descriptions: Array<{
      title: string;
      description: string;
      source_name: string;
      url: string;
    }>;
    source: string;
  }>(`/v1/drugs/pubchem/${cid}/description`);
}

export async function fetchChEMBLBioactivities(genes: string[]) {
  return apiGet<{
    bioactivities: Record<
      string,
      {
        gene_symbol: string;
        target: {
          chembl_id: string;
          pref_name: string;
          target_type: string;
          organism: string;
        } | null;
        activities: Array<{
          molecule_chembl_id: string;
          molecule_name: string;
          activity_type: string;
          value: number | null;
          units: string;
          relation: string;
          assay_type: string;
          pchembl_value: number | null;
          source: string;
        }>;
        total_count: number;
        source: string;
      }
    >;
  }>("/v1/drugs/chembl", { genes: genes.join(",") });
}

export async function fetchRecommendedSources(cancerType: string) {
  return apiGet<{
    cancer_type: string;
    label: string;
    recommended_sources: string[];
    tcga_projects: string[];
    geo_accessions: string[];
    notes: string;
  }>("/v1/projects/recommendations", { cancer_type: cancerType });
}

// ══════════════════════════════
//  Publication Engine
// ══════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generatePublicationFigure(payload: { panels: any[]; options: any }) {
  // Return raw response for Blob data
  return await apiClient.post("/v1/export/generate", payload, {
    responseType: "blob",
  });
}


// ══════════════════════════════
//  PDM Vault
// ══════════════════════════════

export interface AssayRecord {
  id: string;
  project_id: string;
  assay_type: string;
  title: string;
  gene_symbol: string;
  conditions: Record<string, unknown>;
  results: Record<string, unknown>;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface LabImageRecord {
  id: string;
  project_id: string;
  image_type: string;
  title: string;
  gene_symbol: string;
  file_path: string;
  tags: string[];
  metadata_json: Record<string, unknown>;
  notes: string;
  created_at: string;
}

export interface AnimalExperimentRecord {
  id: string;
  project_id: string;
  model_type: string;
  title: string;
  gene_symbol: string;
  groups: Record<string, unknown>;
  measurements: Record<string, unknown>;
  notes: string;
  created_at: string;
  updated_at: string;
}

// ── Assays ──

export async function fetchAssays(projectId: string) {
  return apiGet<AssayRecord[]>("/v1/pdm/assays", { project_id: projectId });
}

export async function createAssay(data: {
  project_id: string;
  assay_type: string;
  title: string;
  gene_symbol: string;
  conditions: Record<string, unknown>;
  results: Record<string, unknown>;
  notes?: string;
}) {
  return apiPost<AssayRecord>("/v1/pdm/assays", data);
}

export async function deleteAssay(assayId: string) {
  return apiDelete<{ deleted: boolean; id: string }>(`/v1/pdm/assays/${assayId}`);
}

// ── Lab Images ──

export async function fetchLabImages(projectId: string) {
  return apiGet<LabImageRecord[]>("/v1/pdm/images", { project_id: projectId });
}

export async function createLabImage(data: {
  project_id: string;
  image_type: string;
  title: string;
  gene_symbol: string;
  file_path?: string;
  tags?: string[];
  metadata_json?: Record<string, unknown>;
  notes?: string;
}) {
  return apiPost<LabImageRecord>("/v1/pdm/images", data);
}

export async function deleteLabImage(imageId: string) {
  return apiDelete<{ deleted: boolean; id: string }>(`/v1/pdm/images/${imageId}`);
}

// ── Animal Experiments ──

export async function fetchAnimalExperiments(projectId: string) {
  return apiGet<AnimalExperimentRecord[]>("/v1/pdm/animal-models", { project_id: projectId });
}

export async function createAnimalExperiment(data: {
  project_id: string;
  model_type: string;
  title: string;
  gene_symbol: string;
  groups?: Record<string, unknown>;
  measurements?: Record<string, unknown>;
  notes?: string;
}) {
  return apiPost<AnimalExperimentRecord>("/v1/pdm/animal-models", data);
}

export async function deleteAnimalExperiment(experimentId: string) {
  return apiDelete<{ deleted: boolean; id: string }>(`/v1/pdm/animal-models/${experimentId}`);
}


// ══════════════════════════════
//  Data Source Hydration
// ══════════════════════════════

/**
 * Trigger hydration for a data source (fetches data from external APIs and caches it).
 */
export async function hydrateDataSource(projectId: string, sourceId: string) {
  return apiPost<{
    id: string;
    status: string;
    total_count?: number;
    gene_count?: number;
    message?: string;
  }>(`/v1/projects/${projectId}/sources/${sourceId}/hydrate`);
}

/**
 * Get cached data for a data source.
 */
export async function fetchSourceCachedData(projectId: string, sourceId: string) {
  return apiGet<{
    id: string;
    source_type: string;
    status: string;
    cached_data: Record<string, unknown> | null;
    last_fetched_at: string | null;
  }>(`/v1/projects/${projectId}/sources/${sourceId}/data`);
}

/**
 * Get current status of a data source (for polling during hydration).
 */
export async function fetchSourceStatus(projectId: string, sourceId: string) {
  return apiGet<{
    id: string;
    status: string;
    sample_count: number;
    last_fetched_at: string | null;
  }>(`/v1/projects/${projectId}/sources/${sourceId}/status`);
}


// ══════════════════════════════
//* ── Module 7: Protein-Protein Docking ── */

export async function runProteinDocking(
  projectId: string,
  receptorGene: string,
  ligandGene: string,
  algorithm: string = "cluspro"
): Promise<ApiResponse<{ job_id: string; status: string; message: string }>> {
  const resp = await apiClient.post<
    ApiResponse<{ job_id: string; status: string; message: string }>
  >("/v1/docking/run", {
    project_id: projectId,
    receptor_gene: receptorGene,
    ligand_gene: ligandGene,
    algorithm,
  });
  return resp.data;
}

export async function fetchTaskStatus(taskId: string) {
  return apiGet<{
    task_id: string;
    status: "pending" | "running" | "completed" | "failed";
    progress: number;
    result: any | null;
    error: string | null;
  }>(`/v1/tasks/${taskId}`);
}
// ══════════════════════════════


// ══════════════════════════════
//  Cross-Validation
// ══════════════════════════════

export interface GeneEvidence {
  gene_symbol: string;
  dry_lab: boolean;
  wet_lab: { assays: number; images: number; animal_models: number };
  total_evidence: number;
}

export interface VariableSyncResult {
  genes: GeneEvidence[];
  summary: { total_genes: number; dry_only: number; wet_only: number; both: number };
}

export interface OverlayResult {
  gene_symbol: string;
  assays: AssayRecord[];
  images: LabImageRecord[];
  animal_models: AnimalExperimentRecord[];
  evidence_count: number;
  evidence_types: string[];
}

export interface ConcordanceGene {
  gene_symbol: string;
  dry_lab: boolean;
  wet_lab_evidence: { assays: number; images: number; animal_models: number };
  wet_lab_types: number;
  concordance_level: "strong" | "partial" | "dry_only" | "wet_only";
}

export interface ConcordanceResult {
  genes: ConcordanceGene[];
  overall: { strong: number; partial: number; dry_only: number; wet_only: number };
}

export async function fetchVariableSync(projectId: string) {
  return apiGet<VariableSyncResult>("/v1/cross-validation/sync", { project_id: projectId });
}

export async function fetchOverlay(projectId: string, geneSymbol: string) {
  return apiGet<OverlayResult>("/v1/cross-validation/overlay", { project_id: projectId, gene_symbol: geneSymbol });
}

export async function fetchConcordance(projectId: string) {
  return apiGet<ConcordanceResult>("/v1/cross-validation/concordance", { project_id: projectId });
}


// ══════════════════════════════
//  DNB (Dynamic Network Biomarker)
// ══════════════════════════════

export interface DNBModule {
  name: string;
  genes: string[];
  genes_found: number;
  scores_by_stage: Record<string, number>;
  peak_stage: string;
  is_tipping_point: boolean;
  components: {
    sd_i: Record<string, number>;
    pcc_i: Record<string, number>;
    pcc_e: Record<string, number>;
  };
}

export interface DNBResult {
  stages: string[];
  modules: DNBModule[];
  composite_scores: Record<string, number>;
  tipping_point: string | null;
  method: string;
}

export async function fetchDNBAnalysis(
  expressionMatrix: Record<string, number[]>,
  stageLabels: string[],
  modules?: Record<string, string[]>,
) {
  // DNB analysis is compute-heavy — use an extended timeout
  const resp = await withRetry(() =>
    client.post<ApiResponse<DNBResult>>("/v1/dnb/analyze", {
      expression_matrix: expressionMatrix,
      stage_labels: stageLabels,
      modules: modules ?? undefined,
    }, { timeout: 60000 })
  );
  return resp.data;
}

export async function fetchDNBModules() {
  return apiGet<{
    modules: { name: string; genes: string[]; gene_count: number }[];
    total: number;
  }>("/v1/dnb/modules");
}


// ══════════════════════════════
//  Project Snapshots & Duplication
// ══════════════════════════════

export interface SnapshotSummary {
  id: string;
  name: string;
  description: string;
  created_at: string;
  protein_count: number;
  source_count: number;
}

export async function createSnapshot(projectId: string, name: string, description = "") {
  return apiPost<SnapshotSummary>(`/v1/projects/${projectId}/snapshots`, { name, description });
}

export async function listSnapshots(projectId: string) {
  return apiGet<SnapshotSummary[]>(`/v1/projects/${projectId}/snapshots`);
}

export async function restoreSnapshot(projectId: string, snapshotId: string) {
  return apiPost<Record<string, unknown>>(`/v1/projects/${projectId}/snapshots/${snapshotId}/restore`, {});
}

export async function duplicateProject(projectId: string) {
  return apiPost<Record<string, unknown>>(`/v1/projects/${projectId}/duplicate`, {});
}


// ══════════════════════════════
//  Publication State Persistence
// ══════════════════════════════

export interface PersistedPublicationState {
  panels: Array<{
    id: string;
    sourceModule: string;
    type: string;
    data: string;
    title: string;
    legend: string;
    dataSource?: string;
    citation?: string;
  }>;
  options: {
    layout?: string;
    palette?: string;
    language?: string;
    style?: string;
    format?: string;
  };
}

export async function savePublicationState(projectId: string, state: PersistedPublicationState) {
  return apiPut<{ saved: boolean; panel_count: number }>(
    `/v1/projects/${projectId}/publication-state`,
    state
  );
}

export async function fetchPublicationState(projectId: string) {
  return apiGet<PersistedPublicationState>(`/v1/projects/${projectId}/publication-state`);
}


// ══════════════════════════════
//  File Upload & Management
// ══════════════════════════════

export interface UploadedFile {
  id: string;
  filename: string;
  original_name: string;
  file_type: string;  // "expression" | "image" | "document" | "data"
  file_size: number;
  mime_type: string;
  has_parsed_data: boolean;
  parsed_summary: {
    genes: string[];
    sample_count: number;
    row_count: number;
    col_count: number;
  } | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UploadedFileDetail extends UploadedFile {
  parsed_data: {
    genes: string[];
    samples: string[];
    values: Record<string, number[]>;
    row_count: number;
    col_count: number;
  } | null;
}

export async function uploadProjectFile(projectId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await client.post(`/v1/uploads/${projectId}/files`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function fetchProjectFiles(projectId: string) {
  return apiGet<UploadedFile[]>(`/v1/uploads/${projectId}/files`);
}

export async function fetchProjectFileDetail(projectId: string, fileId: string) {
  return apiGet<UploadedFileDetail>(`/v1/uploads/${projectId}/files/${fileId}`);
}

export async function deleteProjectFile(projectId: string, fileId: string) {
  return apiDelete<{ deleted: boolean; id: string }>(`/v1/uploads/${projectId}/files/${fileId}`);
}

// ══════════════════════════════
//  Per-Page UI State
// ══════════════════════════════

export async function fetchUiState(projectId: string) {
  return await apiGet<Record<string, unknown>>(`/v1/projects/${projectId}/ui-state`);
}

export async function patchUiState(projectId: string, state: Record<string, unknown>) {
  return await apiPatch<{ saved: boolean; pages: string[] }>(`/v1/projects/${projectId}/ui-state`, state);
}
