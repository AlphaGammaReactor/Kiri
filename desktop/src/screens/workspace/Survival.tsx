// Survival workspace: Kaplan–Meier, log-rank, Cox (page 13 and the seven states on page 15 of the design).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import { useT } from "../../i18n";
import type { ProjectSummary } from "../../lib/api";
import { fmt, fmtP, type SurvivalResult } from "../../lib/analyses";
import { KM } from "../../charts/KM";
import { figText, fillFig, probTitle, type FigLang } from "../../charts/figStrings";
import { Frame, Param, Select, FigureCard, SideTabs, Method, EmptyState, LoadingState, ErrorState, CohortDownload, OutOfDate, useRunShortcut, RunButton } from "./Frame";
import { useAnalysis, cohortLabel } from "./useAnalysis";
import { errorText } from "./errors";

type Cut = "median" | "quartile" | "optimal" | "mutation";
type Endpoint = "OS" | "PFI" | "DSS";
/** Endpoint words for sentences: {ep} inside a sentence, {Ep} at its start, {abbr} for short labels. */
export const epVars = (t: ReturnType<typeof useT>["t"], e?: string) => {
  const k = (e === "PFI" || e === "DSS" ? e : "OS") as Endpoint;
  return { ep: t(`surv.ep.${k}` as const), Ep: t(`surv.Ep.${k}` as const), abbr: k };
};

type Adj = "age" | "stage" | "purity";
export function Survival({ p, figLang, onFigLang, say, onLater, onGuide, initialGene }: {
  p: ProjectSummary; figLang: FigLang; onFigLang: (l: FigLang) => void; say: (s: string) => void; onLater: () => void; onGuide: () => void; initialGene?: string;
}) {
  const { t } = useT();
  const a = useAnalysis(["survival"]);
  const r = a.current?.kind === "survival" && !(a.current.result as { error?: string }).error ? (a.current.result as SurvivalResult) : null;
  const saved = a.current?.params;
  const targets = p.project.targets.length ? p.project.targets : ["TP53"];
  const [gene, setGene] = useState<string>(initialGene || targets[0]);
  const [cut, setCut] = useState<Cut>((saved?.cut as Cut) ?? "median");
  const [adjust, setAdjust] = useState<Adj[]>((saved?.adjust as Adj[]) ?? ["age", "stage"]);
  const [endpoint, setEndpoint] = useState<Endpoint>((saved?.endpoint as Endpoint) ?? "OS");
  const [synced, setSynced] = useState<string | null>(null);
  // When a stored analysis loads, show its settings.
  if (a.current && synced !== a.current.id) {
    setSynced(a.current.id);
    const keepAsked = !synced && !!initialGene && a.current.params.gene !== initialGene.toUpperCase();
    if (!keepAsked) { setGene(a.current.params.gene); setCut((a.current.params.cut as Cut) ?? "median"); setAdjust((a.current.params.adjust as Adj[]) ?? []); setEndpoint((a.current.params.endpoint as Endpoint) ?? "OS"); }
  }
  const svgRef = useRef<SVGSVGElement>(null);
  const projects = a.cohort?.projects ?? p.project.datasets;
  // Your own table has no age or stage columns, so the model is never adjusted.
  const own = a.cohort?.own;
  const adj = useMemo(() => (own ? [] : adjust), [own, adjust]);
  const ep: Endpoint = own ? "OS" : endpoint;
  const run = useCallback(() => a.run({ kind: "survival", gene, cut, adjust: adj, endpoint: ep }), [a, gene, cut, adj, ep]);
  useRunShortcut(run, a.phase.kind !== "running" && !!gene.trim());
  // Arriving from "Is this gene linked to survival?": run it straight away unless it is already the stored result.
  const asked = useRef(false);
  useEffect(() => {
    if (!initialGene || asked.current || !a.loaded) return;
    asked.current = true;
    if (a.current?.params.gene !== initialGene.toUpperCase()) a.run({ kind: "survival", gene: initialGene, cut, adjust: adj, endpoint: ep });
  }, [a.loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const stale = !!r && !!saved && (saved.gene !== gene.trim().toUpperCase() || saved.cut !== cut || [...(saved.adjust ?? [])].sort().join() !== [...adj].sort().join() || (saved.endpoint ?? "OS") !== ep);
  const F = figText[figLang];

  const cox = r ? (r.cox_adjusted ?? r.cox) : null;
  const n = r ? r.groups.high.n + r.groups.low.n : 0;
  const events = r ? r.groups.high.events + r.groups.low.events : 0;
  const pShown = r ? (r.cut === "optimal" ? r.p_report : r.logrank.p) : null;
  const cutText = (c: Cut) => t(`surv.cut.${c}` as const);

  const title = t((r?.cut ?? cut) === "mutation" ? "surv.titleMut" : "surv.title", { g: r?.gene ?? (gene.trim().toUpperCase() || "…"), ...epVars(t, r?.endpoint ?? ep) });
  const badges = (
    <>
      <span className="badge ok">● {cohortLabel(projects)} · {own ? t("ws.ownSource") : "GDC"}</span>
      {r && <span className="badge">● {t("surv.badge.n", { n, e: events })}</span>}
      {r && <span className="badge ok">● {cutText(r.cut)}</span>}
    </>
  );

  const params = (
    <>
      <div className="row-between"><span className="eyebrow">{t("ws.parameters")}</span><button className="link small" onClick={() => { setCut("median"); setAdjust(["age", "stage"]); }}>{t("ws.reset")}</button></div>
      <Param label={t("ws.cohort")} help={t("ws.cohort.help")} recommended>
        <Select value="c" options={[{ value: "c", label: cohortLabel(projects) }]} onChange={() => {}} />
        {a.cohort?.sample_slice && <p className="help">{t("ws.bundledNote")}</p>}
      </Param>
      <Param label={t("ws.gene")} help={t("ws.gene.help")}>
        <input className="text mono" list="kiri-targets" value={gene} onChange={(e) => setGene(e.target.value)} spellCheck={false} aria-label={t("ws.gene")} />
        <datalist id="kiri-targets">{targets.map((g) => <option key={g} value={g} />)}</datalist>
        {p.project.targets.length > 1 && (
          <div className="ws-genes" role="group" aria-label={t("ws.projectGenes")}>
            {p.project.targets.map((g) => (
              <button key={g} className={`chip ${gene.trim().toUpperCase() === g.toUpperCase() ? "on" : ""}`} aria-pressed={gene.trim().toUpperCase() === g.toUpperCase()} onClick={() => setGene(g)}>{g}</button>
            ))}
          </div>
        )}
      </Param>
      <Param label={t("surv.endpoint")} help={t("surv.endpoint.help")}>
        <Select<Endpoint> value={ep} onChange={setEndpoint} options={[
          { value: "OS", label: t("surv.os") }, { value: "PFI", label: t("surv.pfi"), disabled: !!own }, { value: "DSS", label: t("surv.dss"), disabled: !!own },
        ]} />
        {own && <p className="help">{t("surv.ownOnlyOS")}</p>}
      </Param>
      <Param label={t("surv.split")} help={t("surv.split.help")} recommended={cut === "median"}>
        <Select<Cut> value={cut} onChange={setCut} options={[
          { value: "median", label: t("surv.cut.median") }, { value: "quartile", label: t("surv.cut.quartile") }, { value: "optimal", label: t("surv.cut.optimal") },
          { value: "mutation", label: t("surv.cut.mutation"), disabled: !!own },
        ]} />
        <p className="help">{t(`surv.cut.${cut}.help` as const)}</p>
      </Param>
      {!own && <Param label={t("surv.adjust")} help={t("surv.adjust.help")}>
        <div className="row-gap">
          {(["age", "stage", "purity"] as const).map((k) => (
            <button key={k} className={`chip ${adjust.includes(k) ? "on" : ""}`} aria-pressed={adjust.includes(k)}
              onClick={() => setAdjust((x) => x.includes(k) ? x.filter((y) => y !== k) : [...x, k])}>{t(`surv.adj.${k}` as const)}</button>
          ))}
        </div>
      </Param>}
      {r && r.counts.no_survival + r.counts.no_expression > 0 && (
        <div className="excluded"><CircleAlert size={14} /><span>{t("surv.excluded", { n: r.counts.no_survival + r.counts.no_expression })}</span></div>
      )}
      <div className="run-row">
        <RunButton onClick={run} disabled={a.phase.kind === "running" || !gene.trim()} label={t("surv.run")} />
      </div>
    </>
  );

  let body;
  if (a.phase.kind === "running") body = <LoadingState steps={[t("load.cohort"), t("load.split", { g: gene.toUpperCase() }), t("load.cox"), t("load.checks")]} />;
  else if (a.phase.kind === "download") body = <CohortDownload a={a} runLabel={t("surv.run")} onRun={run} />;
  else if (a.phase.kind === "error") {
    const e = errorText(t, a.phase.code, { gene: gene.toUpperCase(), ...a.phase.extra });
    body = <ErrorState {...e} code={a.phase.code} actions={<>
      {a.phase.code === "gene_not_in_cohort" && <button className="btn primary" onClick={() => a.download(projects)}>{t("dl.start")}</button>}
      <button className="btn" onClick={run}>{t("err.ws.retry")}</button></>} />;
  } else if (own && !own.survival) body = <EmptyState title={t("surv.ownNoSurv.title")} body={t("surv.ownNoSurv.body")} onGuide={onGuide} />;
  else if (!r) body = a.loaded ? <EmptyState title={t("surv.empty.title")} body={t("surv.empty.body")} onRun={() => { setGene(targets[0]); a.run({ kind: "survival", gene: targets[0], cut: "median", adjust: own ? [] : ["age", "stage"] }); }} onGuide={onGuide} /> : null;

  const figure = body ? <div className="fig-state">{body}</div> : r && (
    <>
      {stale && <OutOfDate onRun={run} />}
      <FigureCard svgRef={svgRef} fileName={title} chartName={t("surv.chart")} why={t("surv.why")} figLang={figLang} onFigLang={onFigLang} onSaid={say} onLater={onLater} readOnly={p.read_only} analysis={a.current}
        caption={t(r.cut === "mutation" ? "surv.captionMut" : "surv.caption", { c: cohortLabel(r.data_version.projects), cut: cutText(r.cut).toLowerCase(), g: r.gene, ...epVars(t, r.endpoint) })}
        notebookBody={() => ({ analysis_id: a.current?.id, kind: "survival", gene: r.gene, title: `${t("surv.chart")} · ${title}`, summary: cox ? plainSurvival(r, cox, pShown, n, t) : "", checks: r.checks, meta: `${r.data_version.source} · ${r.data_version.built}` })}>
        <KM ref={svgRef} r={r} labels={{
          yTitle: probTitle(F, r.endpoint), xTitle: F.months, atRisk: F.atRisk, highShort: r.cut === "mutation" ? F.mutShort : F.highShort, lowShort: r.cut === "mutation" ? F.wtShort : F.lowShort,
          high: `${r.gene} ${r.cut === "mutation" ? F.mutated : F.high} (n = ${r.groups.high.n})`, low: `${r.gene} ${r.cut === "mutation" ? F.notMutated : F.low} (n = ${r.groups.low.n})`,
          stat: fillFig(r.cut === "optimal" ? F.hrLineAdj : r.cox_adjusted ? F.aHR : F.hrLine, { hr: fmt(cox!.hr), lo: fmt(cox!.lo), hi: fmt(cox!.hi), p: fmtP(pShown) }),
        }} />
      </FigureCard>
    </>
  );

  const explain = r && cox ? (
    <>
      <div className="tiles">
        <div className="tile"><span className="eyebrow">{r.cox_adjusted ? t("surv.hrAdj") : t("surv.hr")}</span><b>{fmt(cox.hr)}</b><span className="mono small">95% CI {fmt(cox.lo)}–{fmt(cox.hi)}</span></div>
        <div className="tile"><span className="eyebrow">{r.cut === "optimal" ? t("surv.pAdj") : t("surv.logrankP")}</span><b>{fmtP(pShown)}</b><span className="mono small">χ² = {fmt(r.logrank.statistic)}, df 1</span></div>
      </div>
      <p className="mono small median-line">{t(r.cut === "mutation" ? "surv.medianMut" : "surv.medianOS", { h: medianText(r.groups.high.median, t), l: medianText(r.groups.low.median, t), ...epVars(t, r.endpoint) })}</p>
      <div className="side-card shows">
        <span className="eyebrow">{t("ws.whatShows")}</span><span className="small muted">{t("ws.fromNumbers")}</span>
        <p className="plain">{plainSurvival(r, cox, pShown, n, t)}</p>
        <p className="small">{t("surv.association")}</p>
      </div>
      <Method title={cox.covariates.length > 1 ? t("surv.method.titleAdj", { c: cox.covariates.filter((c) => c !== "high").map((c) => t(c === "age" ? "surv.adj.age" : c === "purity" ? "surv.adj.purity" : "surv.adj.stage").toLowerCase()).join(t("ws.and")) }) : t("surv.method.title")}
        body={t("surv.method.body")} cite="lifelines · Kaplan & Meier 1958 · Cox 1972" />
      <div className="side-card next"><span className="eyebrow">{t("ws.next")}</span><p className="small">{t("surv.next")}</p></div>
    </>
  ) : (
    <>
      <Method title={t("surv.method.title")} body={t("surv.method.bodyEmpty")} cite="lifelines · Kaplan & Meier 1958 · Cox 1972" />
      <div className="side-empty">{t("ws.sideEmpty")}</div>
    </>
  );

  return <Frame crumb={`${p.project.name}  /  ${t("nav.analyses")}  /  ${t("nav.survival")}`} title={title} badges={badges} params={params}
    figure={figure} side={<SideTabs explain={explain} checks={r?.checks ?? null} />} onLater={onLater} analysis={r ? a.current : null} say={say} cohorts={a} />;
}

function medianText(m: number | null, t: ReturnType<typeof useT>["t"]) { return m == null ? t("surv.notReached") : t("surv.months", { m: fmt(m, 1) }); }

export function plainSurvival(r: SurvivalResult, cox: { hr: number; lo: number; hi: number }, p: number | null, n: number, t: ReturnType<typeof useT>["t"]) {
  const v = { ...epVars(t, r.endpoint), g: r.gene, hr: fmt(cox.hr), lo: fmt(cox.lo), hi: fmt(cox.hi), p: fmtP(p), n };
  if (r.cut === "mutation") return t(p != null && p < 0.05 ? (cox.hr > 1 ? "surv.plain.mut.shorter" : "surv.plain.mut.longer") : "surv.plain.mut.none", v);
  if (p != null && p < 0.05) return t(cox.hr > 1 ? "surv.plain.shorter" : "surv.plain.longer", v);
  return t("surv.plain.none", v);
}

