// Correlation workspace: do two genes rise and fall together across patients? Scatter + Spearman (plan v2 screen 8).
import { useCallback, useRef, useState } from "react";
import { ArrowLeftRight, CircleAlert } from "lucide-react";
import { useT } from "../../i18n";
import type { StringKey } from "../../i18n/strings";
import type { ProjectSummary } from "../../lib/api";
import { fmt, fmtP, type CorrelationResult } from "../../lib/analyses";
import { Scatter } from "../../charts/Scatter";
import type { FigLang } from "../../charts/figStrings";
import { Frame, Param, Select, FigureCard, SideTabs, Method, EmptyState, LoadingState, ErrorState, CohortDownload, OutOfDate, useRunShortcut, RunButton } from "./Frame";
import { useAnalysis, cohortLabel } from "./useAnalysis";
import { errorText } from "./errors";

const FIGT = {
  en: { expr: "{g} expression, log2(TPM + 1)", stat: "Spearman ρ = {rho} (95% CI {lo} to {hi}) · p = {p}", n: "n = {n} patients · Pearson r = {r}" },
  zh: { expr: "{g} 表达量，log2(TPM + 1)", stat: "Spearman ρ = {rho}（95% CI {lo} 至 {hi}）· p = {p}", n: "n = {n} 位患者 · Pearson r = {r}" },
};
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? "")).replace(/= </g, "<");

export function Correlation({ p, figLang, onFigLang, say, onLater, onGuide, initial }: {
  p: ProjectSummary; figLang: FigLang; onFigLang: (l: FigLang) => void; say: (s: string) => void; onLater: () => void; onGuide: () => void; initial?: string[];
}) {
  const { t } = useT();
  const a = useAnalysis(["correlation"]);
  const r = a.current?.kind === "correlation" && !(a.current.result as { error?: string }).error ? (a.current.result as CorrelationResult) : null;
  const targets = p.project.targets.length ? p.project.targets : ["TP53"];
  const defaults = targets.length > 1 ? [targets[0], targets[1]] : [targets[0], targets[0] === "TP53" ? "MDM2" : "GAPDH"];
  const [g1, setG1] = useState(initial?.[0] ?? defaults[0]);
  const [g2, setG2] = useState(initial?.[1] ?? defaults[1]);
  const [synced, setSynced] = useState<string | null>(null);
  if (a.current && synced !== a.current.id) { setSynced(a.current.id); if (!initial || synced) { setG1(a.current.params.gene); setG2(a.current.params.gene2 ?? ""); } }
  const svgRef = useRef<SVGSVGElement>(null);
  const projects = a.cohort?.projects ?? p.project.datasets;
  const ok = !!g1.trim() && !!g2.trim() && g1.trim().toUpperCase() !== g2.trim().toUpperCase();
  const run = useCallback(() => a.run({ kind: "correlation", gene: g1, gene2: g2 }), [a, g1, g2]);
  useRunShortcut(run, a.phase.kind !== "running" && ok);
  const saved = a.current?.params;
  const stale = !!r && !!saved && (saved.gene !== g1.trim().toUpperCase() || saved.gene2 !== g2.trim().toUpperCase());
  const F = FIGT[figLang];
  const G1 = r?.gene ?? (g1.trim().toUpperCase() || "…"), G2 = r?.gene2 ?? (g2.trim().toUpperCase() || "…");
  const title = t("corr.title", { a: G1, b: G2 });
  const strength = r ? (Math.abs(r.rho) < 0.1 ? "negligible" : Math.abs(r.rho) < 0.3 ? "weak" : Math.abs(r.rho) < 0.5 ? "moderate" : "strong") : "negligible";

  const badges = (
    <>
      <span className="badge ok">● {cohortLabel(projects)} · {a.cohort?.own ? t("ws.ownSource") : "GDC"}</span>
      {r && <span className="badge">● {t("corr.badge.n", { n: r.n })}</span>}
      {r && !a.cohort?.own && <span className="badge ok">● {t("corr.badge.tumour")}</span>}
    </>
  );

  const params = (
    <>
      <div className="row-between"><span className="eyebrow">{t("ws.parameters")}</span><button className="link small" onClick={() => { setG1(defaults[0]); setG2(defaults[1]); }}>{t("ws.reset")}</button></div>
      <Param label={t("ws.cohort")} help={t("ws.cohort.help")} recommended>
        <Select value="c" options={[{ value: "c", label: cohortLabel(projects) }]} onChange={() => {}} />
        {a.cohort?.sample_slice && <p className="help">{t("ws.bundledNote")}</p>}
      </Param>
      <Param label={t("corr.geneX")} help={t("corr.geneX.help")}>
        <input className="text mono" list="kiri-targets-c" value={g1} onChange={(e) => setG1(e.target.value)} spellCheck={false} aria-label={t("corr.geneX")} />
      </Param>
      <button className="link small" style={{ alignSelf: "flex-start" }} onClick={() => { setG1(g2); setG2(g1); }}><ArrowLeftRight size={13} />{t("corr.swap")}</button>
      <Param label={t("corr.geneY")}>
        <input className="text mono" list="kiri-targets-c" value={g2} onChange={(e) => setG2(e.target.value)} spellCheck={false} aria-label={t("corr.geneY")} />
        <datalist id="kiri-targets-c">{targets.map((g) => <option key={g} value={g} />)}</datalist>
      </Param>
      <Param label={t("corr.samples")} help={t("corr.samples.help")} recommended>
        <Select value="tumour" options={[{ value: "tumour", label: t("corr.samples.tumour") }]} onChange={() => {}} />
      </Param>
      <Param label={t("corr.method")} help={t("corr.method.help")} recommended>
        <Select value="spearman" options={[{ value: "spearman", label: t("corr.method.spearman") }]} onChange={() => {}} />
        <p className="help">{t("corr.method.note")}</p>
      </Param>
      {!ok && g1.trim() && g2.trim() && <div className="excluded"><CircleAlert size={14} /><span>{t("corr.same")}</span></div>}
      {r && r.excluded > 0 && <div className="excluded"><CircleAlert size={14} /><span>{t("corr.excluded", { n: r.excluded })}</span></div>}
      <div className="run-row">
        <RunButton onClick={run} disabled={a.phase.kind === "running" || !ok} label={t("corr.run")} />
      </div>
    </>
  );

  let body;
  if (a.phase.kind === "running") body = <LoadingState steps={[t("load.cohort"), t("corr.load.pair"), t("corr.load.test"), t("load.checks")]} />;
  else if (a.phase.kind === "download") body = <CohortDownload a={a} runLabel={t("corr.run")} onRun={run} />;
  else if (a.phase.kind === "error") {
    const e = errorText(t, a.phase.code, { gene: String(a.phase.extra.gene ?? g1.toUpperCase()), ...a.phase.extra });
    body = <ErrorState {...e} code={a.phase.code} actions={<>
      {a.phase.code === "gene_not_in_cohort" && <button className="btn primary" onClick={() => a.download(projects)}>{t("dl.start")}</button>}
      <button className="btn" onClick={run}>{t("err.ws.retry")}</button></>} />;
  } else if (!r) body = a.loaded ? <EmptyState title={t("corr.empty.title")} body={t("corr.empty.body", { a: defaults[0], b: defaults[1] })} onRun={() => a.run({ kind: "correlation", gene: defaults[0], gene2: defaults[1] })} onGuide={onGuide} /> : null;

  const caption = r ? t("corr.caption", { a: r.gene, b: r.gene2, c: cohortLabel(r.data_version.projects), n: r.n }) : "";
  const plain = r ? t(r.p < 0.05 ? (r.rho > 0 ? "corr.plain.pos" : "corr.plain.neg") : "corr.plain.none",
    { a: r.gene, b: r.gene2, rho: fmt(r.rho), p: fmtP(r.p), n: r.n, s: t(`corr.s.${strength}` as StringKey) }) : "";

  const figure = body ? <div className="fig-state">{body}</div> : r && (
    <>
      {stale && <OutOfDate onRun={run} />}
      <FigureCard svgRef={svgRef} fileName={title} chartName={t("corr.chart")} why={t("corr.why")} figLang={figLang} onFigLang={onFigLang} onSaid={say} onLater={onLater} readOnly={p.read_only} analysis={a.current}
        caption={caption}
        notebookBody={() => ({ analysis_id: a.current?.id, kind: "correlation", gene: r.gene, title, summary: plain, checks: r.checks, meta: `${r.data_version.source} · ${r.data_version.built}` })}>
        <Scatter ref={svgRef} points={r.points} line={r.line} labels={{
          x: fill(F.expr, { g: r.gene }), y: fill(F.expr, { g: r.gene2 }),
          stat: fill(F.stat, { rho: fmt(r.rho), lo: fmt(r.rho_ci[0]), hi: fmt(r.rho_ci[1]), p: fmtP(r.p) }),
          n: fill(F.n, { n: r.n, r: fmt(r.pearson.r) }),
        }} />
      </FigureCard>
    </>
  );

  const explain = r ? (
    <>
      <div className="tiles">
        <div className="tile"><span className="eyebrow">{t("corr.rho").replace("ρ", "")}<span style={{ textTransform: "none" }}>ρ</span></span><b>{fmt(r.rho)}</b><span className="mono small">95% CI {fmt(r.rho_ci[0])} to {fmt(r.rho_ci[1])}</span></div>
        <div className="tile"><span className="eyebrow">{t("corr.p")}</span><b>{fmtP(r.p)}</b><span className="mono small">Pearson r = {fmt(r.pearson.r)}</span></div>
      </div>
      <div className="side-card shows">
        <span className="eyebrow">{t("ws.whatShows")}</span><span className="small muted">{t("ws.fromNumbers")}</span>
        <p className="plain">{plain}</p>
        <p className="small">{t("corr.note")}</p>
      </div>
      <Method title={t("corr.method.title")} body={t("corr.method.body")} cite="scipy · Spearman 1904 · Bonett & Wright 2000" />
      <div className="side-card next"><span className="eyebrow">{t("ws.next")}</span><p className="small">{t("corr.next")}</p></div>
    </>
  ) : (
    <>
      <Method title={t("corr.method.title")} body={t("corr.method.body")} cite="scipy · Spearman 1904" />
      <div className="side-empty">{t("ws.sideEmpty")}</div>
    </>
  );

  return <Frame crumb={`${p.project.name}  /  ${t("nav.analyses")}  /  ${t("nav.correlation")}`} title={title} badges={badges} params={params}
    figure={figure} side={<SideTabs explain={explain} checks={r?.checks ?? null} />} onLater={onLater} analysis={r ? a.current : null} say={say} cohorts={a} />;
}
