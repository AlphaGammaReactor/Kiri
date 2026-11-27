// Typed calls to the engine's project API.
import { engineFetch } from "./engine";

export type Project = {
  name: string; question: string; template: TemplateId; targets: string[]; cancers: string[];
  datasets: string[]; standard_panel: boolean; review_of?: string;
};
export type ProjectSummary = {
  path: string; file_name: string; read_only: boolean;
  read_only_reason: null | "newer_format" | "open_elsewhere" | "no_write_access";
  manifest: Record<string, string>; project: Project;
  counts: { analyses: number; figures: number; notebook: number; versions: number };
  versions: { id: string; name: string; created_at: string }[];
};
export type RecentItem = {
  path: string; name: string; question: string; template: TemplateId; targets: string[];
  review: boolean; opened_at: string; exists: boolean;
};
export type TemplateId = "blank" | "one_gene" | "two_gene" | "own_table" | "course";
export type GeneCheck = { input: string; status: "ok" | "alias" | "unknown"; symbol?: string; name?: string; suggestions?: string[] };
export type GeneHit = { symbol: string; name: string; match: "symbol" | "alias"; via?: string };
export type Cancer = { code: string; en: string; zh: string; project: string };

export class ApiError extends Error {
  constructor(public code: string, public detail: string, public extra: Record<string, unknown>) { super(code); }
}

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await engineFetch(`/api/v1/kiri${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const { error, detail, ...extra } = data as { error?: string; detail?: string };
    throw new ApiError(error ?? `http_${r.status}`, detail ?? "", extra);
  }
  return data as T;
}

export const api = {
  recent: () => call<{ items: RecentItem[] }>("/recent").then((r) => r.items),
  forget: (path: string) => call("/recent", "DELETE", { path }),
  create: (body: Partial<Project> & { path: string; language: string }) => call<ProjectSummary>("/new", "POST", body),
  sample: (language: string) => call<ProjectSummary>(`/sample?language=${language}`, "POST"),
  open: (path: string) => call<ProjectSummary>("/open", "POST", { path }),
  current: () => call<ProjectSummary>("/project"),
  patch: (patch: Partial<Project>) => call<ProjectSummary>("/project", "PATCH", patch),
  saveVersion: (name: string) => call<{ id: string; name: string; created_at: string }>("/versions", "POST", { name }),
  saveCopy: (path: string) => call<{ path: string }>("/save-copy", "POST", { path }),
  restoreAutosave: (path: string) => call<ProjectSummary>("/restore-autosave", "POST", { path }),
  close: () => call("/close", "POST"),
  checkGene: (q: string) => call<GeneCheck>(`/genes/check?q=${encodeURIComponent(q)}`),
  searchGenes: (q: string) => call<{ items: GeneHit[] }>(`/genes/search?q=${encodeURIComponent(q)}`).then((r) => r.items),
  cancers: () => call<{ items: Cancer[] }>("/cancers").then((r) => r.items),
};
