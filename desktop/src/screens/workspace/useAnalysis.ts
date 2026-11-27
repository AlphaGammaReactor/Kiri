// State shared by the analysis workspaces: the stored result, running, errors, and cohort downloads.
import { ownNames } from "../../lib/owndata";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../lib/api";
import { analyses, type Analysis, type CohortStatus, type Kind, type RunParams } from "../../lib/analyses";
import { busy } from "../../lib/busy";
import { progress } from "../../lib/progress";

export type Phase =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "error"; code: string; extra: Record<string, unknown> }
  | { kind: "download"; projects: string[] };

export function useAnalysis(kinds: Kind[]) {
  const [current, setCurrent] = useState<Analysis | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [cohort, setCohort] = useState<CohortStatus | null>(null);
  const poll = useRef<number>(0);

  // Remember the imported table's name so badges and pickers show it rather than its id.
  const keep = useCallback((c: CohortStatus) => { if (c.own) ownNames.set(c.own.id, c.own.name); setCohort(c); }, []);
  const refreshCohort = useCallback(() => analyses.cohort().then(keep).catch(() => {}), [keep]);

  useEffect(() => {
    let stop = false;
    (async () => {
      refreshCohort();
      try {
        const list = await analyses.list();
        const last = list.find((a) => kinds.includes(a.kind));
        if (last && !stop) setCurrent(await analyses.get(last.id));
      } catch { /* no project */ }
      if (!stop) setLoaded(true);
    })();
    return () => { stop = true; clearInterval(poll.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(async (p: RunParams) => {
    setPhase({ kind: "running" });
    const job = busy.start(`${p.kind === "survival" ? "Survival" : p.kind === "correlation" ? "Correlation" : "Expression"} · ${p.gene.trim().toUpperCase()}${p.gene2 ? ` · ${p.gene2.trim().toUpperCase()}` : ""}`);
    let failed: string | undefined;
    const started = Date.now();
    try {
      const sameGene = current && current.params.gene === p.gene.trim().toUpperCase() && current.kind === p.kind
        && (current.params.gene2 ?? "") === (p.gene2 ?? "").trim().toUpperCase()
        && (current.params.title ?? "") === (p.title ?? "");
      const a = await analyses.run({ ...p, replace: sameGene ? current!.id : undefined });
      // Keep the progress view on screen long enough to read.
      const wait = 700 - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      failed = (a.result as { error?: string }).error;
      if ((a.result as { error?: string }).error) setPhase({ kind: "error", code: (a.result as { error: string }).error, extra: a.result as Record<string, unknown> });
      else { setPhase({ kind: "idle" }); progress.mark("run"); }
      setCurrent(a);
    } catch (e) {
      failed = e instanceof ApiError ? e.code : "engine";
      if (e instanceof ApiError && (e.code === "needs_download" || e.code === "gene_not_in_cohort")) {
        const projects = (e.extra.projects as string[] | undefined) ?? cohort?.projects ?? [];
        setPhase(e.code === "needs_download" ? { kind: "download", projects } : { kind: "error", code: e.code, extra: e.extra });
      } else if (e instanceof ApiError) setPhase({ kind: "error", code: e.code, extra: e.extra });
      else setPhase({ kind: "error", code: "engine", extra: {} });
    } finally { busy.end(job, failed); }
  }, [current, cohort]);

  const download = useCallback(async (projects: string[]) => {
    for (const p of projects) await analyses.download(p).catch(() => {});
    clearInterval(poll.current);
    poll.current = window.setInterval(async () => {
      const c = await analyses.cohort().catch(() => null);
      if (!c) return;
      keep(c);
      const states = projects.map((p) => c.packs[p]);
      if (states.every((s) => s?.ready)) { clearInterval(poll.current); setPhase({ kind: "idle" }); }
      if (states.some((s) => s?.state === "failed")) clearInterval(poll.current);
    }, 1000);
  }, []);

  return { current, loaded, phase, setPhase, cohort, run, download, refreshCohort };
}

/** A short label for the cohort: "TCGA-COAD + READ". */
export function cohortLabel(projects: string[]) {
  if (!projects.length) return "–";
  if (projects[0].startsWith("own:")) return ownNames.get(projects[0]) ?? projects[0].slice(4);
  const [first, ...rest] = projects;
  return [first, ...rest.map((p) => p.replace("TCGA-", ""))].join(" + ");
}
