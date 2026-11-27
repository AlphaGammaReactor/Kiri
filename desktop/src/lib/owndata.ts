// Your own table: preview, check and import a CSV, TSV or Excel file into the open project (engine: app/kiri/owndata.py).
import { call } from "./analyses";
import { isTauri } from "./platform";

export type Role = "sample_id" | "group" | "time" | "event" | "value" | "unused";
export type Orientation = "samples_in_rows" | "genes_in_rows";
export type ImportCheck = { code: string; level: "problem" | "caution" | "info"; n?: number; rows?: number[]; values?: string[]; counts?: Record<string, number> };
export type Preview = {
  file_name: string; encoding: string; delimiter: string | null; sheets?: string[]; sheet?: string;
  orientation: Orientation; n_rows: number; columns: string[]; rows: string[][];
  roles: Record<string, Role>; time_unit: "days" | "months" | "years"; event_values: Record<string, 0 | 1 | null>;
  checks: ImportCheck[]; n_genes?: number; n_samples?: number;
};
export type Dataset = { id: string; name: string; n_samples: number; n_values: number; units: string; has_survival: boolean; groups: string[];
  file_name?: string; imported_at?: string; orientation?: Orientation; in_use?: boolean };

type Opts = { path: string; encoding?: string | null; sheet?: string | null; orientation?: Orientation | null };
export const owndata = {
  preview: (o: Opts) => call<Preview>("/import/preview", "POST", o),
  check: (o: Opts & { roles: Record<string, Role>; event_map: Record<string, 0 | 1 | null> }) =>
    call<{ checks: ImportCheck[]; event_values: Record<string, 0 | 1 | null> }>("/import/check", "POST", o),
  commit: (o: Opts & { roles: Record<string, Role>; event_map: Record<string, 0 | 1 | null>; name: string; time_unit: string; scale: string }) =>
    call<Dataset>("/import/commit", "POST", o),
  list: () => call<Dataset[]>("/datasets"),
  remove: (id: string) => call<{ ok: boolean }>(`/datasets/${encodeURIComponent(id)}`, "DELETE"),
};

const previewTable = import.meta.env.VITE_KIRI_TEST_TABLE as string | undefined;
export async function pickTableToOpen(title: string): Promise<string | null> {
  if (!isTauri) return previewTable ?? null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ title, multiple: false, directory: false, filters: [{ name: "Table", extensions: ["csv", "tsv", "txt", "tab", "xlsx", "xls"] }] });
  return typeof r === "string" ? r : null;
}

// Names of imported tables, so cohort labels can say "临床随访" rather than an id.
const names: Record<string, string> = {};
export const ownNames = { set: (id: string, name: string) => { names[id] = name; }, get: (id: string) => names[id] };

export const TEMPLATE_CLINICAL = "sample_id,group,time_months,event,GENE1,GENE2\nP-0001,high,34.2,1,8.12,5.40\nP-0002,low,61.0,0,6.03,5.95\nP-0003,high,12.5,1,7.88,4.90\n";
export const TEMPLATE_MATRIX = "gene\tS1\tS2\tS3\tS4\nTP53\t5.21\t6.02\t4.88\t5.73\nMDM2\t7.10\t6.45\t7.92\t6.81\n";
