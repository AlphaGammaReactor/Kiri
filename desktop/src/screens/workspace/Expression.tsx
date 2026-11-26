// Expression workspace: tumour against normal tissue, or across stages (page 13 of the design).
import { useCallback, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import { useT } from "../../i18n";
import type { ProjectSummary } from "../../lib/api";
import { fmt, fmtP, type ExpressionResult, type Group } from "../../lib/analyses";
import { BoxPoints } from "../../charts/BoxPoints";
import { FIG } from "../../charts/figure";
import { figText, fillFig, stars, type FigLang } from "../../charts/figStrings";
import { Frame, Param, Select, FigureCard, SideTabs, Method, EmptyState, LoadingState, ErrorState, DownloadState, OutOfDate, useRunShortcut, runKeys } from "./Frame";
import { useAnalysis, cohortLabel } from "./useAnalysis";
import { errorText } from "./errors";

type Mode = "tn" | "stage";
const STAGE_COLORS: Record<string, string> = { I: "#7a9a5a", II: "#2a6fa8", III: "#c8641a", IV: "#a3392b" };

export function Expression({ p, figLang, onFigLang, say, onLater, onGuide, onSurvival }: {
  p: ProjectSummary; figLang: FigLang; onFigLang: (l: FigLang) => void; say: (s: string) => void; onLater: () => void; onGuide: () => void; onSurvival: (gene: string) => void;
}) {
  const { t } = useT();
  const a = useAnalysis(["expression_tn", "expression_stage"]);
  const r = a.current && !(a.current.result as { error?: string }).error && a.current.kind !== "survival" ? (a.current.result as ExpressionResult) : null;
  const saved = a.current?.params;
  const targets = p.project.targets.length ? p.project.targets : ["TP53"];
  const [gene, setGene] = useState<string>(targets[0]);
  const [mode, setMode] = useState<Mode>("tn");
  const [paired, setPaired] = useState(false);
  const [points, setPoints] = useState(true);
  const [synced, setSynced] = useState<string | null>(null);
  if (a.current && synced !== a.current.id) {
    setSynced(a.current.id);
    setGene(a.current.params.gene); setMode(a.current.kind === "expression_stage" ? "stage" : "tn"); setPaired(!!a.current.params.paired);
  }
  const svgRef = useRef<SVGSVGElement>(null);
  const projects = a.cohort?.projects ?? p.project.datasets;
  const kind = mode === "tn" ? "expression_tn" : "expression_stage";
  const run = useCallback(() => a.run({ kind, gene, paired: mode === "tn" ? paired : false }), [a, kind, gene, paired, mode]);
  useRunShortcut(run, a.phase.kind !== "running" && !!gene.trim());
  const stale = !!r && !!saved && (saved.gene !== gene.trim().toUpperCase() || saved.kind !== kind || (mode === "tn" && !!saved.paired !== paired));
  const F = figText[figLang];

  // Figure groups: per project when the cohort has several, else tumour and normal.
  let groups: Group[] = [];
  let brackets: { a: string; b: string; text: string }[] = [];
  let colors = (k: string) => (k.endsWith("normal") ? FIG.normal : FIG.tumour);
  let groupLabel = (k: string) => k;
  if (r?.kind === "expression_tn") {
    const per = (r.per_project ?? []).filter((e) => e.normal.n > 0);
    if (per.length > 1) {
      groups = per.flatMap((e) => [{ ...e.normal, key: `${e.project}|normal` }, { ...e.tumour, key: `${e.project}|tumour` }]);
      brackets = per.map((e) => ({ a: `${e.project}|normal`, b: `${e.project}|tumour`, text: stars(e.p_adj) }));
      groupLabel = (k) => `${k.split("|")[0].replace("TCGA-", "")} ${k.endsWith("normal") ? F.normal : F.tumour}`;
    } else {
      groups = [r.groups[1], r.groups[0]];
      brackets = [{ a: r.groups[1].key, b: r.groups[0].key, text: stars(r.test.p) }];
      groupLabel = (k) => (k === "normal" ? F.normal : F.tumour);
    }
  } else if (r?.kind === "expression_stage") {
    groups = r.groups;
    colors = (k) => STAGE_COLORS[k] ?? FIG.ink;
    groupLabel = (k) => `${F.stage} ${k}`;
  }
  const statLine = !r ? "" : r.kind === "expression_stage" ? fillFig(F.kw, { p: fmtP(r.test.p) })
    : r.test.name === "wilcoxon_signed_rank" ? fillFig(F.signedRank, { p: fmtP(r.test.p), n: r.test.n_pairs ?? 0 }) : fillFig(F.rankSum, { p: fmtP(r.test.p) });

  const title = mode === "tn" ? t("expr.title.tn", { g: r?.gene ?? (gene.trim().toUpperCase() || "…") }) : t("expr.title.stage", { g: r?.gene ?? (gene.trim().toUpperCase() || "…") });
  const nSamples = r ? r.groups.reduce((s, g) => s + g.n, 0) : 0;
  const badges = (
    <>
      <span className="badge ok">● {cohortLabel(projects)} · GDC</span>
      {r && <span className="badge">● {t("expr.badge.n", { n: nSamples })}</span>}
    </>
  );

  const params = (
    <>
      <div className="row-between"><span className="eyebrow">{t("ws.parameters")}</span><button className="link small" onClick={() => { setMode("tn"); setPaired(false); setPoints(true); }}>{t("ws.reset")}</button></div>
      <Param label={t("ws.gene")} help={t("ws.gene.help")}>
        <input className="text mono" list="kiri-targets-e" value={gene} onChange={(e) => setGene(e.target.value)} spellCheck={false} aria-label={t("ws.gene")} />
        <datalist id="kiri-targets-e">{targets.map((g) => <option key={g} value={g} />)}</datalist>
      </Param>
      <Param label={t("expr.compare")}>
        <div className="segmented full">
          <button aria-pressed={mode === "tn"} onClick={() => setMode("tn")}>{t("expr.mode.normal")}</button>
          <button aria-pressed={mode === "stage"} onClick={() => setMode("stage")}>{t("expr.mode.stage")}</button>
          <button aria-pressed={false} onClick={onLater} title={t("common.notYet")} className="muted">{t("expr.mode.cancers")}</button>
        </div>
      </Param>
      {mode === "tn" && (
        <Param label={t("expr.normalRef")} help={t("expr.normalRef.help")} recommended>
          <Select value="tcga" options={[{ value: "tcga", label: t("expr.ref.tcga") }, { value: "gtex", label: t("expr.ref.gtex"), disabled: true }]} onChange={() => {}} />
        </Param>
      )}
      <Param label={t("expr.test")} help={t("expr.test.help")} recommended>
        <Select value={mode === "stage" ? "kw" : paired ? "sr" : "rs"} onChange={(v) => setPaired(v === "sr")} options={mode === "stage"
          ? [{ value: "kw", label: t("expr.test.kw") }]
          : [{ value: "rs", label: t("expr.test.rs") }, { value: "sr", label: t("expr.test.sr") }]} />
        <p className="help">{mode === "stage" ? t("expr.test.kw.help") : paired ? t("expr.test.sr.help") : t("expr.test.rs.help")}</p>
      </Param>
      <label className="toggle-row"><span>{t("expr.points")}</span><span className="switch"><input type="checkbox" checked={points} onChange={(e) => setPoints(e.target.checked)} /><span /></span></label>
      {r && r.excluded > 0 && <div className="excluded"><CircleAlert size={14} /><span>{t(r.kind === "expression_stage" ? "expr.excludedStage" : "expr.excluded", { n: r.excluded })}</span></div>}
      <div className="run-row">
        <button className="btn primary" onClick={run} disabled={a.phase.kind === "running" || !gene.trim()}>{t("expr.run")}</button>
        <span className="kbd">{runKeys}</span>
      </div>
    </>
  );

  let body;
  if (a.phase.kind === "running") body = <LoadingState steps={[t("load.cohort"), t("load.groups"), t("load.test"), t("load.checks")]} />;
  else if (a.phase.kind === "download") body = <DownloadState project={a.phase.projects.join(", ")} state={a.cohort?.packs[a.phase.projects[0]]} onDownload={() => a.download((a.phase as { projects: string[] }).projects)} />;
  else if (a.phase.kind === "error") {
    const e = errorText(t, a.phase.code, { gene: gene.toUpperCase(), ...a.phase.extra });
    body = <ErrorState {...e} code={a.phase.code} actions={<>
      {a.phase.code === "gene_not_in_cohort" && <button className="btn primary" onClick={() => a.download(projects)}>{t("dl.start")}</button>}
      {a.phase.code === "too_few_normal" && <button className="btn primary" onClick={() => { setMode("stage"); a.run({ kind: "expression_stage", gene }); }}>{t("expr.tryStage")}</button>}
      <button className="btn" onClick={run}>{t("err.ws.retry")}</button></>} />;
  } else if (!r) body = a.loaded ? <EmptyState title={t("expr.empty.title")} body={t("expr.empty.body")} onRun={() => { setGene(targets[0]); setMode("tn"); a.run({ kind: "expression_tn", gene: targets[0] }); }} onGuide={onGuide} /> : null;

  const caption = !r ? "" : r.kind === "expression_stage"
    ? t("expr.caption.stage", { g: r.gene, c: cohortLabel(r.data_version.projects) })
    : t("expr.caption.tn", { g: r.gene, c: cohortLabel(r.data_version.projects), test: r.test.name === "wilcoxon_signed_rank" ? t("expr.test.sr") : t("expr.test.rs") });

  const figure = body ? <div className="fig-state">{body}</div> : r && (
    <>
      {stale && <OutOfDate onRun={run} />}
      <FigureCard svgRef={svgRef} fileName={title} chartName={t("expr.chart")} why={t("expr.why")} figLang={figLang} onFigLang={onFigLang} onSaid={say} onLater={onLater} readOnly={p.read_only}
        caption={caption} notebookBody={() => ({ analysis_id: a.current?.id, kind: r.kind, gene: r.gene, title, summary: plainExpression(r, t), checks: r.checks, meta: `${r.data_version.source} · ${r.data_version.built}` })}>
        <BoxPoints ref={svgRef} groups={groups} colors={colors} showPoints={points}
          labels={{ yTitle: `${r.gene} ${F.expr}`, group: groupLabel, stat: statLine, brackets }} />
      </FigureCard>
    </>
  );

  const explain = r ? (
    <>
      <div className="side-card">
        <span className="eyebrow">{t("expr.perGroup")}</span>
        <table className="mini">
          <tbody>
            {r.kind === "expression_tn" && (r.per_project?.length ? r.per_project : [{ project: cohortLabel(r.data_version.projects), tumour: r.groups[0], normal: r.groups[1], p_adj: r.test.p }]).map((e) => (
              <tr key={e.project}><td>{e.project.replace("TCGA-", "")}</td><td className="mono">T {e.tumour.n} · N {e.normal.n}</td><td className="mono">{e.normal.n >= 3 ? `p ${fmtP(e.p_adj)}` : t("expr.noNormal")}</td></tr>
            ))}
            {r.kind === "expression_stage" && r.groups.map((g) => <tr key={g.key}><td>{t("expr.stageN", { s: g.key })}</td><td className="mono">n {g.n}</td><td className="mono">{t("expr.med", { m: fmt(g.median) })}</td></tr>)}
          </tbody>
        </table>
      </div>
      <div className="side-card shows">
        <span className="eyebrow">{t("ws.whatShows")}</span><span className="small muted">{t("ws.fromNumbers")}</span>
        <p className="plain">{plainExpression(r, t)}</p>
        <p className="small">{r.kind === "expression_tn" ? t("expr.note.tn") : t("expr.note.stage")}</p>
      </div>
      <Method title={r.kind === "expression_stage" ? t("expr.method.stage") : r.test.name === "wilcoxon_signed_rank" ? t("expr.method.sr") : t("expr.method.rs")}
        body={r.kind === "expression_stage" ? t("expr.method.stage.body") : t("expr.method.tn.body")} cite="scipy · Mann & Whitney 1947 · Kruskal & Wallis 1952" />
      <div className="side-card next">
        <span className="eyebrow">{t("ws.next")}</span>
        <button className="link" onClick={() => onSurvival(r.gene)}>{t("expr.next", { g: r.gene })}</button>
      </div>
    </>
  ) : (
    <>
      <Method title={t("expr.method.rs")} body={t("expr.method.tn.body")} cite="scipy · Mann & Whitney 1947" />
      <div className="side-empty">{t("ws.sideEmpty")}</div>
    </>
  );

  return <Frame crumb={`${p.project.name}  /  ${t("nav.analyses")}  /  ${t("nav.expression")}`} title={title} badges={badges} params={params}
    figure={figure} side={<SideTabs explain={explain} checks={r?.checks ?? null} />} onLater={onLater} />;
}

function plainExpression(r: ExpressionResult, t: ReturnType<typeof useT>["t"]) {
  if (r.kind === "expression_stage") return t(r.test.p < 0.05 ? "expr.plain.stage" : "expr.plain.stageNone", { g: r.gene, p: fmtP(r.test.p) });
  const [tu, no] = r.groups;
  const v = { g: r.gene, a: fmt(tu.median), b: fmt(no.median), p: fmtP(r.test.p) };
  if (r.test.p < 0.05) return t((r.effect.median_diff ?? 0) > 0 ? "expr.plain.higher" : "expr.plain.lower", v);
  return t("expr.plain.none", v);
}
