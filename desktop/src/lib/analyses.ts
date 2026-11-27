// Analyses on the open project: run, list, and the data behind them.
import { engineFetch } from "./engine";
import { ApiError } from "./api";

export type Check = { check: string; status: "pass" | "caution" | "problem" | "info"; code: string; vars: Record<string, unknown> };
export type Curve = { n: number; events: number; time: number[]; surv: number[]; lo: number[]; hi: number[]; censor_times: number[]; censor_surv: number[]; median: number | null };
export type Cox = { hr: number; lo: number; hi: number; p: number; n: number; covariates: string[]; ph_p: number | null };
export type SurvivalResult = {
  kind: "survival"; gene: string; endpoint: string; cut: "median" | "quartile" | "optimal"; cut_value: number;
  cut_info: { p_min?: number; tried?: number; p_adjusted?: number; low?: number; high?: number };
  groups: { high: Curve; low: Curve }; at_risk: { ticks: number[]; high: number[]; low: number[] };
  logrank: { statistic: number; p: number }; p_report: number; cox: Cox; cox_adjusted: Cox | null;
  stability: { cutpoints: { quantile: number; hr: number; p: number }[]; bootstrap_same_direction: number | null };
  counts: { patients: number; no_expression: number; no_survival: number };
  checks: Check[]; data_version: DataVersion; error?: undefined;
};
export type Summary = { n: number; median?: number | null; q1?: number | null; q3?: number | null; min?: number | null; max?: number | null; mean?: number | null };
export type Group = { key: string; n: number; median: number; q1: number; q3: number; min: number; max: number; mean: number; values: number[] };
export type ExpressionResult = {
  kind: "expression_tn" | "expression_stage" | "expression_group"; gene: string; units: string; paired?: boolean;
  groups: Group[]; test: { name: string; statistic: number; p: number; n_pairs?: number };
  effect: { median_diff?: number; rank_biserial?: number; rb_ci?: [number, number]; epsilon_squared?: number };
  pairwise?: { a: string; b: string; p: number; p_adj: number }[];
  per_project?: { project: string; tumour: Group; normal: Group; p: number | null; p_adj: number | null }[];
  excluded: number; matched_cases?: number; checks: Check[]; data_version: DataVersion; error?: undefined;
};
export type CorrelationResult = {
  kind: "correlation"; gene: string; gene2: string; units: string; n: number; rho: number; rho_ci: [number, number]; p: number;
  pearson: { r: number; p: number }; line: { slope: number; intercept: number }; points: [number, number][];
  outliers: number; rho_without_outliers: number; excluded: number; checks: Check[]; data_version: DataVersion; error?: undefined;
};
export type ErrorResult = { kind: string; gene: string; error: string; [k: string]: unknown };
export type DataVersion = { cohort: string; projects: string[]; source: string; units: string; built: string };
export type Kind = "survival" | "expression_tn" | "expression_stage" | "expression_group" | "correlation" | "de" | "signature" | "across" | "immune" | "interactions" | "bench";
export type RunParams = { kind: Kind; gene: string; gene2?: string; set_id?: string; members?: string[]; check_only?: boolean; cut?: "median" | "quartile" | "optimal"; adjust?: ("age" | "stage")[]; paired?: boolean; replace?: string;
  compare?: "tn" | "gene" | "group"; group_a?: string | null; group_b?: string | null; lfc?: number; q?: number; library?: PathwayLibrary; normal?: "tcga" | "tcga_gtex";
  mode?: "qpcr" | "values"; text?: string; ref?: string; control?: string | null; log?: boolean; title?: string };
export type Headline = { p_report?: number | null; error?: string | null; hr?: number | null; p?: number | null; rho?: number | null; n?: number | null; worst?: "pass" | "caution" | "problem" | null };
export type Analysis<R = SurvivalResult | ExpressionResult | CorrelationResult | DEResult | AcrossResult | ImmuneResult | InteractionsResult | BenchResult | ErrorResult> = {
  id: string; kind: Kind; params: RunParams & { projects: string[] }; result: R; data_versions: DataVersion;
  created_at: string; updated_at: string; saved?: boolean;
};
export type Note = {
  id: string; kind: "figure" | "text" | "result"; pinned: boolean; created_at: string; changed_since: boolean;
  body: { analysis_id?: string; kind?: Kind; gene?: string; title?: string; summary?: string; caption?: string; svg?: string; text?: string; checks?: Check[]; meta?: string };
};
export type PathwayLibrary = "hallmark" | "reactome";
export type DEGene = { gene: string; lfc: number; mean_a: number; mean_b: number; t: number; p: number; p_adj: number; dir: "up" | "down" | "" };
export type EnrichRow = { id: string; name: string; size: number; k: number; ratio: number; fold: number; p: number; p_adj: number; genes: string[] };
export type DEResult = {
  kind: "de"; compare: "tn" | "gene" | "group"; gene: string | null; labels: [string, string]; n: [number, number];
  n_tested: number; n_low: number; n_up: number; n_down: number; thresholds: { lfc: number; q: number };
  volcano: [string, number, number, "up" | "down" | ""][]; top_up: DEGene[]; top_down: DEGene[];
  enrichment: { library: PathwayLibrary | null; n_sets?: number; up: EnrichRow[]; down: EnrichRow[] };
  test: { name: string; correction: string }; checks: Check[]; data_version: DataVersion; excluded: number;
};
export type AcrossResult = {
  kind: "across"; gene: string; normal: "tcga" | "tcga_gtex"; units: string; n_tested: number; n_up: number; n_down: number; up: string[]; down: string[];
  rows: { code: string; tumour: Summary; normal: Summary; n_tcga_normal: number; n_gtex: number; gtex_site: string | null; p: number | null; p_adj?: number; diff: number | null; points_t: number[]; points_n: number[] }[];
  checks: Check[]; data_version: DataVersion; test: { name: string; correction: string };
};
export type ImmuneCell = { id: string; name: string; zh: string; markers: string[]; have: string[]; missing: string[]; rho: number | null; lo?: number; hi?: number; p?: number; p_adj?: number;
  rho_adj?: number; p_adj_partial?: number; q_partial?: number; alpha?: number | null; self?: boolean; n?: number };
export type ImmuneResult = {
  kind: "immune"; gene: string; n: number; rows: ImmuneCell[]; pos: string[]; neg: string[]; top: string | null; overall_rho: number | null;
  points: { x: number[]; cells: Record<string, number[]> }; checks: Check[]; data_version: DataVersion; citation: string;
};
export type Partner = { gene: string; score: number; experiments: number; databases: number; textmining: number; coexpression: number;
  neighborhood: number; fusion: number; cooccurrence: number; rho?: number | null; lo?: number; hi?: number; p?: number; p_adj?: number };
export type InteractionsResult = {
  kind: "interactions"; gene: string; partners: Partner[]; edges: [string, string, number][];
  protein: { accession: string; name: string; length: number; locations: string[]; features: { kind: string; start: number; end: number; label: string }[] } | null;
  alphafold: { id: string; version: number | string; mean: number } | null; plddt: number[];
  bands: { very_high: number; confident: number; low: number; very_low: number } | null;
  n: number; together: string[]; opposite: string[]; strong: number; experimental: string[]; string_version: string | null; fetched: string;
  checks: Check[]; citations: Record<string, string>; data_version: DataVersion;
};
export type BenchGroupR = { group: string; n: number; mean: number | null; lo: number | null; hi: number | null; p?: number | null; p_adj?: number | null;
  log2fc?: number[]; values?: number[]; fold?: number | null; dct_mean?: number | null; sd?: number | null; samples?: string[] };
export type BenchResult = {
  kind: "bench"; mode: "qpcr" | "values"; ref?: string; control: string; groups: string[]; genes?: string[]; targets?: string[]; log?: boolean;
  panels: { gene: string; groups: BenchGroupR[]; overall_p: number | null; test: "welch_t" | "welch_anova_holm" }[];
  n_samples?: number; checks: Check[]; data_version: DataVersion;
};
export type PathwayInfo = { id: PathwayLibrary; available: boolean; version?: string; licence?: string; citation?: string; source?: string; n?: number };
export type OwnCohort = { id: string; name: string; n: number; values: number; survival: boolean; groups: string[]; units: string };
export type CohortStatus = { own?: OwnCohort; projects: string[]; sample_slice: string | null; packs: Record<string, { ready: boolean; state: string; done?: number; total?: number; file?: string; error?: string }> };

export async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await engineFetch(`/api/v1/kiri${path}`, {
    method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const { error, detail, ...extra } = data as { error?: string; detail?: string };
    throw new ApiError(error ?? `http_${r.status}`, detail ?? "", extra);
  }
  return data as T;
}

export type BoardSpec = {
  title: string; panels: string[]; width: "single" | "onehalf" | "double"; cols: number;
  font: "Arial" | "Helvetica"; size: number; letters: "upper" | "lower" | "none"; align: "top" | "centre" | "bottom";
};
export type Board = BoardSpec & { id: string; created_at: string };

export const analyses = {
  run: (p: RunParams) => call<Analysis>("/analyses/run", "POST", p),
  pathways: () => call<PathwayInfo[]>("/pathways"),
  list: () => call<(Omit<Analysis, "result"> & { headline: Headline })[]>("/analyses"),
  get: (id: string) => call<Analysis>(`/analyses/${id}`),
  rows: (id: string) => call<{ columns: string[]; rows: (string | number | null)[][]; units: string; cut_value?: number; data_version: DataVersion }>(`/analyses/${id}/rows`),
  exportPdf: (path: string, svg: string) => call<{ path: string; bytes: number }>("/export/pdf", "POST", { path, svg }),
  cohort: () => call<CohortStatus>("/cohort"),
  download: (project: string) => call<CohortStatus["packs"][string]>(`/cohort/download?project=${encodeURIComponent(project)}`, "POST"),
  note: (kind: "figure" | "text" | "result", body: Record<string, unknown>) => call<{ id: string; count: number }>("/notebook", "POST", { kind, body }),
  notes: () => call<Note[]>("/notebook"),
  patchNote: (id: string, p: { pinned?: boolean; text?: string }) => call(`/notebook/${id}`, "PATCH", p),
  deleteNote: (id: string) => call(`/notebook/${id}`, "DELETE"),
  exportReport: (b: { path: string; format: "pdf" | "html" | "docx"; title: string; labels: Record<string, string> }) =>
    call<{ path: string; entries: number }>("/notebook/export", "POST", b),
  exportSummary: (b: { path: string; format: "pdf" | "html" | "docx"; title: string; intro: string[]; items: { analysis_id: string; title: string; summary: string; checks: unknown[]; svg?: string }[]; labels: Record<string, string>; one_page?: boolean; byline?: string; footer?: string }) =>
    call<{ path: string; entries: number }>("/summary/export", "POST", b),
  boards: () => call<Board[]>("/boards"),
  createBoard: (b: Partial<BoardSpec>) => call<Board>("/boards", "POST", b),
  saveBoard: (b: Board) => { const { id, created_at: _c, ...spec } = b; return call<Board>(`/boards/${id}`, "PUT", spec); },
  deleteBoard: (id: string) => call(`/boards/${id}`, "DELETE"),
  exportFile: (path: string, data: Uint8Array) => {
    let s = "";
    for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
    return call<{ path: string; bytes: number }>("/export", "POST", { path, data_base64: btoa(s) });
  },
};

export const fmtP = (p: number | null | undefined) =>
  p == null ? "–" : p < 0.001 ? "< 0.001" : p < 0.01 ? p.toFixed(3) : p.toFixed(2);
export const fmt = (x: number | null | undefined, d = 2) => (x == null ? "–" : x.toFixed(d));
