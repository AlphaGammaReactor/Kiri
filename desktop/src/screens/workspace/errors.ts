// What happened, why, and what to do, for each error code an analysis can return.
import type { StringKey } from "../../i18n/strings";

type T = (k: StringKey, v?: Record<string, string | number>) => string;
const KNOWN = ["gene_not_in_cohort", "too_few_patients", "too_few_normal", "too_few_stages", "no_cohort", "read_only", "slice_missing", "too_few_pairs", "same_gene", "no_groups", "too_few_groups", "de_small_groups", "de_few_genes", "too_few_members", "needs_internet"];

export function errorText(t: T, code: string, extra: Record<string, unknown>) {
  const v: Record<string, string | number> = {};
  for (const [k, x] of Object.entries(extra)) if (typeof x === "string" || typeof x === "number") v[k] = x;
  const c = KNOWN.includes(code) ? code : "other";
  return {
    what: t(`errw.${c}.what` as StringKey, { ...v, code }),
    why: t(`errw.${c}.why` as StringKey, v),
    todo: t(`errw.${c}.todo` as StringKey, v),
  };
}
