// Data folder, downloaded cohorts and problem reports (engine side: app/kiri/system_api.py).
import { call } from "./analyses";

export type StoredCohort = { project: string; bytes: number; ready: boolean; samples?: number | null; genes?: number | null; state: string; done?: number; total?: number; error?: string };
export type Storage = { data_dir: string; cohorts: StoredCohort[]; cohort_bytes: number; projects_bytes: number; free_bytes: number };
export type ReportInfo = { text: string; lang: string; level: string; screen: string; error: string; app: string };

export const system = {
  storage: () => call<Storage>("/storage"),
  removeCohort: (project: string) => call<{ ok: boolean }>(`/storage/cohort?project=${encodeURIComponent(project)}`, "DELETE"),
  reveal: () => call<{ ok: boolean }>("/storage/reveal", "POST"),
  reportPreview: (b: ReportInfo) => call<{ diagnostics: string }>("/report/preview", "POST", b),
  reportOpen: (b: ReportInfo) => call<{ url: string }>("/report/open", "POST", b),
};

export const fmtBytes = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`;
