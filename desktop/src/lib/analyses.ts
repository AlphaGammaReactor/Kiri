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
export type Group = { key: string; n: number; median: number; q1: number; q3: number; min: number; max: number; mean: number; values: number[] };
export type ExpressionResult = {
  kind: "expression_tn" | "expression_stage"; gene: string; units: string; paired?: boolean;
  groups: Group[]; test: { name: string; statistic: number; p: number; n_pairs?: number };
  effect: { median_diff?: number; rank_biserial?: number; rb_ci?: [number, number]; epsilon_squared?: number };
  pairwise?: { a: string; b: string; p: number; p_adj: number }[];
  per_project?: { project: string; tumour: Group; normal: Group; p: number | null; p_adj: number | null }[];
  excluded: number; matched_cases?: number; checks: Check[]; data_version: DataVersion; error?: undefined;
};
export type ErrorResult = { kind: string; gene: string; error: string; [k: string]: unknown };
export type DataVersion = { cohort: string; projects: string[]; source: string; units: string; built: string };
export type Kind = "survival" | "expression_tn" | "expression_stage";
export type RunParams = { kind: Kind; gene: string; cut?: "median" | "quartile" | "optimal"; adjust?: ("age" | "stage")[]; paired?: boolean; replace?: string };
export type Analysis<R = SurvivalResult | ExpressionResult | ErrorResult> = {
  id: string; kind: Kind; params: RunParams & { projects: string[] }; result: R; data_versions: DataVersion;
  created_at: string; updated_at: string; saved?: boolean;
};
export type Note = {
  id: string; kind: "figure" | "text" | "result"; pinned: boolean; created_at: string; changed_since: boolean;
  body: { analysis_id?: string; kind?: Kind; gene?: string; title?: string; summary?: string; caption?: string; svg?: string; text?: string; checks?: Check[]; meta?: string };
};
export type CohortStatus = { projects: string[]; sample_slice: string | null; packs: Record<string, { ready: boolean; state: string; done?: number; total?: number; file?: string; error?: string }> };

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

export const analyses = {
  run: (p: RunParams) => call<Analysis>("/analyses/run", "POST", p),
  list: () => call<(Omit<Analysis, "result"> & { headline: Record<string, number | null> })[]>("/analyses"),
  get: (id: string) => call<Analysis>(`/analyses/${id}`),
  cohort: () => call<CohortStatus>("/cohort"),
  download: (project: string) => call<CohortStatus["packs"][string]>(`/cohort/download?project=${encodeURIComponent(project)}`, "POST"),
  note: (kind: "figure" | "text" | "result", body: Record<string, unknown>) => call<{ id: string; count: number }>("/notebook", "POST", { kind, body }),
  notes: () => call<Note[]>("/notebook"),
  patchNote: (id: string, p: { pinned?: boolean; text?: string }) => call(`/notebook/${id}`, "PATCH", p),
  deleteNote: (id: string) => call(`/notebook/${id}`, "DELETE"),
  exportReport: (b: { path: string; format: "pdf" | "html"; title: string; labels: Record<string, string> }) =>
    call<{ path: string; entries: number }>("/notebook/export", "POST", b),
  exportFile: (path: string, data: Uint8Array) => {
    let s = "";
    for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
    return call<{ path: string; bytes: number }>("/export", "POST", { path, data_base64: btoa(s) });
  },
};

export const fmtP = (p: number | null | undefined) =>
  p == null ? "–" : p < 0.001 ? "< 0.001" : p < 0.01 ? p.toFixed(3) : p.toFixed(2);
export const fmt = (x: number | null | undefined, d = 2) => (x == null ? "–" : x.toFixed(d));
