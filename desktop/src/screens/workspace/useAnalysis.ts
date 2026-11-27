// State shared by the analysis workspaces: the stored result, running, errors, and cohort downloads.
import { ownNames } from "../../lib/owndata";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../lib/api";
import { analyses, type Analysis, type CohortStatus, type Kind, type RunParams } from "../../lib/analyses";
import { busy } from "../../lib/busy";
import { downloads } from "../../lib/downloads";
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
  // "Check in another cohort": TCGA projects that replace the project's own cohort until the person goes back.
  const [other, setOther] = useState<string[] | null>(null);
  const otherRef = useRef<string[] | null>(null);
  const home = useRef<string[]>([]);

  // Remember the imported table's name so badges and pickers show it rather than its id.
  const keep = useCallback((c: CohortStatus) => { if (c.own) ownNames.set(c.own.id, c.own.name); downloads.seen(c.packs); setCohort(c); }, []);
  const refreshCohort = useCallback(() => analyses.cohort(otherRef.current).then(keep).catch(() => {}), [keep]);
  const useOther = (ps: string[] | null) => { otherRef.current = ps; setOther(ps); };

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const c0 = await analyses.cohort();
        home.current = c0.projects;
        const list = await analyses.list();
        const last = list.find((a) => kinds.includes(a.kind));
        // The newest result was checked in another cohort: stay there.
        const ps = last?.params.projects ?? [];
        if (!stop && ps.length && ps[0].startsWith("TCGA-") && ps.join() !== c0.projects.join()) useOther(ps);
        if (!stop) {
          const c = await analyses.cohort(otherRef.current).catch(() => null);
          if (c) {
            keep(c);
            // Came back while this cohort is still downloading: show the download, not an old result.
            const busyPs = Object.entries(c.packs).filter(([, s]) => s.state === "downloading").map(([p]) => p);
            if (busyPs.length) setPhase({ kind: "download", projects: busyPs });
          }
        }
        if (last && !stop) setCurrent(await analyses.get(last.id));
      } catch { refreshCohort(); /* no project */ }
      if (!stop) setLoaded(true);
    })();
    return () => { stop = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(async (p: RunParams) => {
    setPhase({ kind: "running" });
    const job = busy.start(`${p.kind === "survival" ? "Survival" : p.kind === "correlation" ? "Correlation" : "Expression"} · ${p.gene.trim().toUpperCase()}${p.gene2 ? ` · ${p.gene2.trim().toUpperCase()}` : ""}`);
    let failed: string | undefined;
    const started = Date.now();
    try {
      const sameGene = current && current.params.gene === p.gene.trim().toUpperCase() && current.kind === p.kind
        && (current.params.gene2 ?? "") === (p.gene2 ?? "").trim().toUpperCase()
        && (current.params.title ?? "") === (p.title ?? "")
        && (current.params.projects ?? []).join() === (otherRef.current ?? home.current).join();
      const a = await analyses.run({ ...p, projects: otherRef.current ?? undefined, replace: sameGene ? current!.id : undefined });
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
        if (e.code === "needs_download") { const c = await analyses.cohort(otherRef.current).catch(() => null); if (c) keep(c); }
        // Asked again for a download that is on disk: say so rather than going round in a circle.
        const onDisk = e.code === "needs_download" && projects.length > 0 && projects.every((x) => downloads.isReady(x));
        if (onDisk) setPhase({ kind: "error", code: "download_incomplete", extra: { projects: projects.join(", ") } });
        else setPhase(e.code === "needs_download" ? { kind: "download", projects } : { kind: "error", code: e.code, extra: e.extra });
      } else if (e instanceof ApiError) setPhase({ kind: "error", code: e.code, extra: e.extra });
      else setPhase({ kind: "error", code: "engine", extra: {} });
    } finally { busy.end(job, failed); }
  }, [current, cohort, keep]);

  // Downloads are followed app-wide (lib/downloads); the panel reads what is on disk and offers the run.
  const download = useCallback(async (projects: string[]) => {
    try {
      await downloads.start(projects);
    } catch (e) {
      setPhase({ kind: "error", code: e instanceof ApiError ? e.code : "engine", extra: e instanceof ApiError ? e.extra : {} });
    }
  }, []);
  /** Show the same analysis in other projects (null: back to the project's own cohort). An earlier
   *  result there with the same settings is reopened rather than run again. */
  const basis = useRef<Analysis | null>(null);
  const checkIn = useCallback(async (ps: string[] | null) => {
    const cur = current ?? basis.current;
    if (!cur) return;
    basis.current = cur;
    // Never leave the old cohort's numbers on screen under the new cohort's name.
    setCurrent(null);
    useOther(ps && ps.join() !== home.current.join() ? ps : null);
    refreshCohort();
    const target = (otherRef.current ?? home.current).join();
    const same = (x: Omit<Analysis, "result">) => x.kind === cur.kind && x.params.gene === cur.params.gene
      && (x.params.gene2 ?? "") === (cur.params.gene2 ?? "") && (x.params.set_id ?? "") === (cur.params.set_id ?? "")
      && (x.params.projects ?? []).join() === target;
    const earlier = (await analyses.list().catch(() => [])).find(same);
    if (earlier) { setPhase({ kind: "idle" }); setCurrent(await analyses.get(earlier.id)); return; }
    const { projects: _p, ...params } = cur.params; // eslint-disable-line @typescript-eslint/no-unused-vars
    await run({ ...params, kind: cur.kind, replace: undefined });
  }, [current, refreshCohort, run]); // eslint-disable-line react-hooks/exhaustive-deps

  return { current, loaded, phase, setPhase, cohort, run, download, refreshCohort, other, home: home.current, checkIn };
}

/** A short label for the cohort: "TCGA-COAD + READ". */
export function cohortLabel(projects: string[]) {
  if (!projects.length) return "–";
  if (projects[0].startsWith("own:")) return ownNames.get(projects[0]) ?? projects[0].slice(4);
  const [first, ...rest] = projects;
  return [first, ...rest.map((p) => p.replace("TCGA-", ""))].join(" + ");
}
