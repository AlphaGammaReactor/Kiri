// Gene set score workspace: my gene against a process described by marker genes (built-in cited sets or my own).
// Views: gene vs score, marker heatmap, high vs low, four-group survival, enrichment, across cancers.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, Download } from "lucide-react";
import { useT } from "../../i18n";
import { en as EN, zh as ZH, type StringKey } from "../../i18n/strings";
import type { ProjectSummary } from "../../lib/api";
import { call, fmt, fmtP, type Check, type DataVersion, type Group } from "../../lib/analyses";
import { Scatter } from "../../charts/Scatter";
import { BoxPoints } from "../../charts/BoxPoints";
import { Heatmap, KM4, GseaCurve, Forest, type Surv4, type GseaCurveT } from "../../charts/SigCharts";
import { FIG } from "../../charts/figure";
import type { FigLang } from "../../charts/figStrings";
import { Frame, Param, Select, FigureCard, SideTabs, Method, EmptyState, LoadingState, ErrorState, DownloadState, OutOfDate, useRunShortcut, runKeys } from "./Frame";
import { useAnalysis, cohortLabel } from "./useAnalysis";
import { errorText } from "./errors";

export type GeneSet = { id: string; name: string; genes: string[]; about: string; cite: string[]; mixed: boolean; stroma: boolean; mito: boolean };
type Gsea = { set: string; size: number; es: number | null; nes: number | null; p: number | null; p_adj: number | null; leading_edge: string[] };
export type SignatureResult = {
  kind: "signature"; gene: string; set: string; set_name: string; set_name_zh: string; cite: string[]; units: string; n: number; excluded: number;
  members: string[]; missing: string[]; note: string; rho: number; rho_ci: [number, number]; p: number;
  line: { slope: number; intercept: number }; points: [number, number][];
  per_member: { gene: string; rho: number; p: number; p_adj: number }[]; heatmap: { labels: string[]; rho: (number | null)[][] };
  alpha: number | null; mean_inter: number | null; leave_one_out: { gene: string; rho: number }[];
  groups: { cut: number; items: (Group & { key: "high" | "low" })[]; test: { p: number }; rank_biserial: number };
  survival: (Surv4 & { error?: undefined }) | { error: string; n: number } | null;
  enrichment: { results: Gsea[]; curve: GseaCurveT | null; n_genes: number; top_pos: [string, number][]; top_neg: [string, number][] } | null;
  across?: { rows: { cohort: string; projects: string[]; n: number; rho?: number; lo?: number; hi?: number; p?: number; p_adj?: number; error?: string }[]; tested: number; positive: number; negative: number; current: string };
  checks: Check[]; data_version: DataVersion; error?: undefined;
};

type View = "scatter" | "heatmap" | "groups" | "survival" | "enrichment" | "across";
const VIEWS: View[] = ["scatter", "heatmap", "groups", "survival", "enrichment", "across"];
const FIGT = {
  en: { expr: "{g} expression, log2(TPM + 1)", score: "{s} score (mean z-score)", stat: "Spearman ρ = {rho} (95% CI {lo} to {hi}) · p = {p}", n: "n = {n} patients · {k} genes in the score" },
  zh: { expr: "{g} 表达量，log2(TPM + 1)", score: "{s} 评分（z 分数均值）", stat: "Spearman ρ = {rho}（95% CI {lo} 至 {hi}）· p = {p}", n: "n = {n} 位患者 · 评分含 {k} 个基因" },
};
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? "")).replace(/= </g, "<");
const parseGenes = (s: string) => [...new Set(s.split(/[\s,;，、]+/).map((g) => g.trim().toUpperCase()).filter(Boolean))];

let cache: { lang: string; items: GeneSet[] } | null = null;
export function useGeneSets(lang: string) {
  const [sets, setSets] = useState<GeneSet[]>(cache?.lang === lang ? cache.items : []);
  useEffect(() => {
    if (cache?.lang === lang) return;
    call<{ items: GeneSet[] }>(`/genesets?language=${lang}`).then((r) => { cache = { lang, items: r.items }; setSets(r.items); }).catch(() => {});
  }, [lang]);
  return sets;
}

/** The built-in set to start with: one that contains a partner gene of the project, else the mitochondrial UPR markers. */
export function defaultSet(sets: GeneSet[], targets: string[]) {
  const partner = targets.slice(1);
  return sets.find((s) => partner.some((g) => s.genes.includes(g)))?.id ?? sets.find((s) => targets.some((g) => s.genes.includes(g)))?.id ?? "uprmt_markers";
}

export function Signature({ p, figLang, onFigLang, say, onLater, onGuide }: {
  p: ProjectSummary; figLang: FigLang; onFigLang: (l: FigLang) => void; say: (s: string) => void; onLater: () => void; onGuide: () => void;
}) {
  const { t, lang } = useT();
  const sets = useGeneSets(lang);
  const a = useAnalysis(["signature"]);
  const r = a.current?.kind === "signature" && !(a.current.result as { error?: string }).error ? (a.current.result as unknown as SignatureResult) : null;
  const targets = p.project.targets.length ? p.project.targets : ["PARL"];
  const [gene, setGene] = useState(targets[0]);
  const [setId, setSetId] = useState<string>("");
  const [custom, setCustom] = useState("");
  const [view, setView] = useState<View>("scatter");
  const [synced, setSynced] = useState<string | null>(null);
  if (!setId && sets.length && !a.current) setSetId(defaultSet(sets, targets));
  if (a.current && synced !== a.current.id) {
    const prm = a.current.params as { gene: string; set_id?: string; members?: string[] };
    setSynced(a.current.id); setGene(prm.gene); setSetId(prm.set_id ?? "uprmt_markers");
    if (prm.set_id === "custom") setCustom((prm.members ?? []).join(", "));
  }
  const svgRef = useRef<SVGSVGElement>(null);
  const projects = a.cohort?.projects ?? p.project.datasets;
  const chosen = sets.find((s) => s.id === setId);
  const customGenes = useMemo(() => parseGenes(custom), [custom]);
  const members = setId === "custom" ? customGenes : chosen?.genes ?? [];
  const G = gene.trim().toUpperCase();
  const ok = !!G && !!setId && members.filter((g) => g !== G).length >= 3;
  const run = useCallback(() => a.run({ kind: "signature" as never, gene, set_id: setId, members: setId === "custom" ? customGenes : [] } as never), [a, gene, setId, customGenes]);
  useRunShortcut(run, a.phase.kind !== "running" && ok);
  const saved = a.current?.params as { gene?: string; set_id?: string; members?: string[] } | undefined;
  const stale = !!r && !!saved && (saved.gene !== G || saved.set_id !== setId || (setId === "custom" && (saved.members ?? []).join(",") !== customGenes.join(",")));
  const F = FIGT[figLang];
  const setName = (res: SignatureResult | null) => res ? (figLang === "zh" ? res.set_name_zh : res.set_name) : (setId === "custom" ? t("sig.set.custom").replace("…", "") : chosen?.name ?? "…");
  const SN = r ? (lang === "zh" ? r.set_name_zh : r.set_name) : setName(null);
  const SNfig = setName(r);
  const title = t("sig.title", { g: r?.gene ?? (G || "…"), s: SN });
  const strength = r ? (Math.abs(r.rho) < 0.1 ? "negligible" : Math.abs(r.rho) < 0.3 ? "weak" : Math.abs(r.rho) < 0.5 ? "moderate" : "strong") : "negligible";

  const badges = (
    <>
      <span className="badge ok">● {cohortLabel(projects)} · GDC</span>
      {r && <span className="badge">● {t("corr.badge.n", { n: r.n })}</span>}
      {r && <span className={`badge ${r.missing.length ? "" : "ok"}`}>● {t("sig.badge.members", { n: r.members.length, m: r.members.length + r.missing.length })}</span>}
    </>
  );

  const params = (
    <>
      <div className="row-between"><span className="eyebrow">{t("ws.parameters")}</span><button className="link small" onClick={() => { setGene(targets[0]); setSetId(defaultSet(sets, targets)); }}>{t("ws.reset")}</button></div>
      <Param label={t("ws.cohort")} help={t("ws.cohort.help")} recommended>
        <Select value="c" options={[{ value: "c", label: cohortLabel(projects) }]} onChange={() => {}} />
        {a.cohort?.sample_slice && <p className="help">{t("ws.bundledNote")}</p>}
      </Param>
      <Param label={t("sig.geneMine")} help={t("sig.geneMine.help")}>
        <input className="text mono" list="kiri-targets-s" value={gene} onChange={(e) => setGene(e.target.value)} spellCheck={false} aria-label={t("sig.geneMine")} />
        <datalist id="kiri-targets-s">{targets.map((g) => <option key={g} value={g} />)}</datalist>
      </Param>
      <Param label={t("sig.set")} help={t("sig.set.help")}>
        <Select value={setId || "uprmt_markers"} options={[...sets.map((s) => ({ value: s.id, label: s.name })), { value: "custom", label: t("sig.set.custom") }]} onChange={setSetId} />
        {setId === "custom" ? (
          <>
            <textarea className="text mono sig-genes" rows={3} value={custom} placeholder={t("sig.custom.placeholder")} onChange={(e) => setCustom(e.target.value)} aria-label={t("sig.custom.label")} spellCheck={false} />
            <p className="help">{t("sig.custom.help")} · {t("sig.custom.count", { n: customGenes.length })}</p>
          </>
        ) : chosen && (
          <>
            <div className="sig-chips">{chosen.genes.map((g) => <span key={g} className={`chip mono ${g === G ? "off" : ""}`}>{g}</span>)}</div>
            <button className="link small" style={{ alignSelf: "flex-start" }} onClick={() => { setCustom(chosen.genes.join(", ")); setSetId("custom"); }}>{t("sig.editAsOwn")}</button>
          </>
        )}
        {members.includes(G) && <p className="help">{t("sig.selfRemoved", { g: G })}</p>}
      </Param>
      <Param label={t("sig.score")} help={t("sig.score.help")} recommended>
        <Select value="zmean" options={[{ value: "zmean", label: t("sig.score.zmean") }]} onChange={() => {}} />
        <p className="help">{t("sig.score.note")}</p>
      </Param>
      {r && r.missing.length > 0 && <div className="excluded"><CircleAlert size={14} /><span>{t("sig.missingNote", { g: r.missing.join(", ") })}</span></div>}
      <div className="run-row">
        <button className="btn primary" onClick={run} disabled={a.phase.kind === "running" || !ok}>{t("sig.run")}</button>
        <span className="kbd">{runKeys}</span>
      </div>
    </>
  );

  let body;
  if (a.phase.kind === "running") body = <LoadingState steps={[t("load.cohort"), t("sig.load.genes"), t("sig.load.score"), t("sig.load.tests"), t("load.checks")]} />;
  else if (a.phase.kind === "download") body = <DownloadState project={a.phase.projects.join(", ")} state={a.cohort?.packs[a.phase.projects[0]]} onDownload={() => a.download((a.phase as { projects: string[] }).projects)} />;
  else if (a.phase.kind === "error") {
    const ex = a.phase.extra as Record<string, unknown>;
    const flat = { gene: String(ex.gene ?? G), ...ex, present: ((ex.present as string[]) ?? []).join(", ") || "–", missing: ((ex.missing as string[]) ?? []).join(", ") || "–" };
    const e = errorText(t, a.phase.code, flat);
    body = <ErrorState {...e} code={a.phase.code} actions={<>
      {(a.phase.code === "gene_not_in_cohort" || a.phase.code === "too_few_members") && <button className="btn primary" onClick={() => a.download(projects)}>{t("dl.start")}</button>}
      <button className="btn" onClick={run}>{t("err.ws.retry")}</button></>} />;
  } else if (!r) body = a.loaded ? <EmptyState title={t("sig.empty.title")} body={t("sig.empty.body", { g: G || targets[0], s: SN })} onRun={run} onGuide={onGuide} /> : null;

  const fileName = `${title} · ${t(`sig.view.${view}` as StringKey)}`;
  const strWord = t(`corr.s.${strength}` as StringKey);
  const plain = r ? t(r.p < 0.05 ? (r.rho > 0 ? "sig.plain.pos" : "sig.plain.neg") : "sig.plain.none", { g: r.gene, s: SN, rho: fmt(r.rho), p: fmtP(r.p), n: r.n, str: strWord }) : "";
  const groupDir = r ? (r.groups.test.p >= 0.05 ? "similar" : r.groups.rank_biserial > 0 ? "higher" : "lower") : "similar";
  const groupPlain = r ? t(groupDir === "similar" ? "sig.groups.plainSame" : "sig.groups.plain", { g: r.gene, s: SN, dir: t(`sig.dir.${groupDir}` as StringKey), cut: fmt(r.groups.cut), p: fmtP(r.groups.test.p), rb: fmt(r.groups.rank_biserial) }) : "";
  const linked = r ? r.per_member.filter((m) => m.p_adj < 0.05).length : 0;
  const ownSet = r?.set === "custom" ? null : sets.find((s) => s.id === r?.set);
  const enrMain = r?.enrichment?.results.find((x) => x.set === r.set);
  const caption = r ? t("sig.caption", { g: r.gene, s: SN, k: r.members.length, c: cohortLabel(r.data_version.projects), n: r.n }) : "";
  const surv = r?.survival && !("error" in r.survival && r.survival.error) ? (r.survival as Surv4) : null;
  const forestRows = (r?.across?.rows ?? []).filter((x) => x.rho != null).map((x) => ({
    label: x.projects.map((pp) => pp.replace("TCGA-", "")).join("+"), n: x.n, rho: x.rho!, lo: x.lo!, hi: x.hi!, p_adj: x.p_adj, current: x.cohort === r?.across?.current,
  }));

  const chart = () => {
    if (!r) return null;
    const figG = r.gene;
    if (view === "scatter") return <Scatter ref={svgRef} points={r.points} line={r.line} labels={{
      x: fill(F.expr, { g: figG }), y: fill(F.score, { s: SNfig }),
      stat: fill(F.stat, { rho: fmt(r.rho), lo: fmt(r.rho_ci[0]), hi: fmt(r.rho_ci[1]), p: fmtP(r.p) }), n: fill(F.n, { n: r.n, k: r.members.length }) }} />;
    if (view === "heatmap") return <Heatmap ref={svgRef} labels={r.heatmap.labels} rho={r.heatmap.rho} padj={r.per_member.map((m) => m.p_adj)}
      text={{ title: tf("sig.heat.title", { g: figG, s: SNfig }), legend: "ρ", note: tf("sig.heat.note", { g: figG }) }} />;
    if (view === "groups") return <BoxPoints ref={svgRef} groups={r.groups.items} showPoints colors={(k) => (k === "high" ? FIG.high : FIG.low)} labels={{
      yTitle: tf("sig.groups.y", { s: SNfig }), group: (k) => tf(k === "high" ? "sig.groups.high" : "sig.groups.low", { g: figG }),
      stat: tf("sig.groups.stat", { p: fmtP(r.groups.test.p), rb: fmt(r.groups.rank_biserial) }) }} />;
    if (view === "survival") return surv ? <KM4 ref={svgRef} s={surv} labels={{
      yTitle: tf("sig.surv.y"), xTitle: tf("sig.surv.x"), atRisk: tf("sig.surv.atRisk"), stat: tf("sig.surv.stat", { p: fmtP(surv.logrank.p) }),
      group: (k) => tf(`sig.surv.g.${k}` as StringKey, { g: figG }), short: (k) => `${figG}${k.startsWith("gene_high") ? "↑" : "↓"} S${k.endsWith("score_high") ? "↑" : "↓"}` }} />
      : <div className="state"><p>{t("sig.surv.none", { n: (r.survival as { n?: number } | null)?.n ?? 0 })}</p></div>;
    if (view === "enrichment") return r.enrichment?.curve && enrMain ? <GseaCurve ref={svgRef} c={r.enrichment.curve} labels={{
      title: tf("sig.enr.title", { s: SNfig, g: figG }), yTitle: tf("sig.enr.y"), xTitle: tf("sig.enr.x", { n: r.enrichment.n_genes.toLocaleString(), g: figG }),
      left: tf("sig.enr.left", { g: figG }), right: tf("sig.enr.right", { g: figG }), stat: tf("sig.enr.stat", { nes: fmt(enrMain.nes), p: fmtP(enrMain.p), q: fmtP(enrMain.p_adj) }) }} />
      : <div className="state"><div className="state-icon"><Download size={22} /></div><p>{t("sig.enr.needs")}</p>
        <button className="btn primary" onClick={() => a.download(projects)}>{t("sig.enr.download")}</button></div>;
    return forestRows.length ? <Forest ref={svgRef} rows={forestRows} title={tf("sig.across.title", { g: figG, s: SNfig })} xTitle={tf("sig.across.x")} nLabel={tf("sig.across.n")} /> : null;
  };
  // Figure text follows the figure language, like the other workspaces.
  function tf(k: StringKey, v?: Record<string, string | number>) { return figLang === lang ? t(k, v) : figStr(k, figLang, v); }

  const views = r && (
    <div className="segmented sig-views" aria-label={t("nav.signature")}>
      {VIEWS.map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{t(`sig.view.${v}` as StringKey)}</button>)}
    </div>
  );

  const figure = body ? <div className="fig-state">{body}</div> : r && (
    <>
      {stale && <OutOfDate onRun={run} />}
      {views}
      <FigureCard svgRef={svgRef} fileName={fileName} chartName={t(`sig.chart.${view}` as StringKey)} why={t(`sig.why.${view}` as StringKey)} figLang={figLang} onFigLang={onFigLang} onSaid={say} onLater={onLater} readOnly={p.read_only} analysis={a.current}
        caption={view === "groups" ? groupPlain : view === "across" ? t("sig.across.summary", { t: r.across?.tested ?? 0, pos: r.across?.positive ?? 0, neg: r.across?.negative ?? 0 }) : caption}
        notebookBody={() => ({ analysis_id: a.current?.id, kind: "signature", gene: r.gene, title: `${title} · ${t(`sig.view.${view}` as StringKey)}`, summary: view === "groups" ? groupPlain : plain, checks: r.checks, meta: `${r.data_version.source} · ${r.data_version.built}` })}>
        {chart()}
      </FigureCard>
      {view === "survival" && surv && !surv.enough && <p className="warn-text small">{t("sig.surv.few", { n: surv.fewest_events })}</p>}
      {view === "across" && (r.across?.tested ?? 0) <= 1 && <p className="help">{t("sig.across.one")}</p>}
      {view === "across" && (r.across?.tested ?? 0) > 1 && <p className="help">{t("sig.across.more")}</p>}
    </>
  );

  const explain = r ? (
    <>
      <div className="tiles">
        <div className="tile"><span className="eyebrow"><span style={{ textTransform: "none" }}>ρ</span></span><b>{fmt(r.rho)}</b><span className="mono small">95% CI {fmt(r.rho_ci[0])} to {fmt(r.rho_ci[1])}</span></div>
        <div className="tile"><span className="eyebrow">{t("corr.p")}</span><b>{fmtP(r.p)}</b><span className="mono small">n = {r.n}</span></div>
        <div className="tile"><span className="eyebrow">{t("sig.tile.members")}</span><b>{linked}/{r.members.length}</b><span className="mono small">{t("sig.tile.membersSub", { k: linked, n: r.members.length })}</span></div>
        <div className="tile"><span className="eyebrow">{t("sig.tile.alpha")}</span><b>{fmt(r.alpha)}</b><span className="mono small">{t("sig.tile.alphaSub")}</span></div>
      </div>
      <div className="side-card shows">
        <span className="eyebrow">{t("ws.whatShows")}</span><span className="small muted">{t("ws.fromNumbers")}</span>
        <p className="plain">{plain}</p>
        <p className="plain">{groupPlain}</p>
        <p className="small">{t("sig.note", { g: r.gene })}</p>
      </div>
      {ownSet && (
        <div className="side-card">
          <span className="eyebrow">{t("sig.about")}</span>
          <b className="method-title">{ownSet.name}</b>
          <p className="small">{ownSet.about}</p>
          <p className="mono cite-line">{ownSet.cite.join(" · ")}</p>
        </div>
      )}
      {view === "enrichment" && r.enrichment && (
        <div className="side-card sig-enr"><span className="eyebrow">{t("sig.enr.table")}</span>
          <p className="help">{t("sig.enr.note")}</p>
          <table className="tbl">
            <thead><tr><th>{t("sig.enr.col.set")}</th><th className="num">{t("sig.enr.col.nes")}</th><th className="num">{t("sig.enr.col.q")}</th></tr></thead>
            <tbody>{[...r.enrichment.results].filter((x) => x.nes != null).sort((x, y) => (y.nes ?? 0) - (x.nes ?? 0)).map((x) => (
              <tr key={x.set} className={x.set === r.set ? "on" : ""}><td>{sets.find((s) => s.id === x.set)?.name ?? x.set}</td><td className="num">{fmt(x.nes)}</td><td className="num">{fmtP(x.p_adj)}</td></tr>
            ))}</tbody>
          </table>
          <p className="small"><b>{t("sig.enr.topPos", { g: r.gene })}:</b> <span className="mono">{r.enrichment.top_pos.slice(0, 10).map(([g, v]) => `${g} ${fmt(v)}`).join(" · ")}</span></p>
        </div>
      )}
      <Method title={t("sig.method.title")} body={t("sig.method.body")} cite="Cronbach 1951 · Subramanian et al. PNAS 2005 · Lee et al. PLoS Comput Biol 2008" />
      <div className="side-card next"><span className="eyebrow">{t("ws.next")}</span><p className="small">{t("sig.next")}</p></div>
    </>
  ) : (
    <>
      {chosen && setId !== "custom" && (
        <div className="side-card"><span className="eyebrow">{t("sig.about")}</span><b className="method-title">{chosen.name}</b><p className="small">{chosen.about}</p><p className="mono cite-line">{chosen.cite.join(" · ")}</p></div>
      )}
      <Method title={t("sig.method.title")} body={t("sig.method.body")} cite="Cronbach 1951 · Subramanian et al. PNAS 2005" />
      <div className="side-empty">{t("ws.sideEmpty")}</div>
    </>
  );

  return <Frame crumb={`${p.project.name}  /  ${t("nav.analyses")}  /  ${t("nav.signature")}`} title={title} badges={badges} params={params}
    figure={figure} side={<SideTabs explain={explain} checks={r?.checks ?? null} />} onLater={onLater} analysis={r ? a.current : null} say={say} />;
}

// Figure text in the other language (the figure language can differ from the interface language).
function figStr(k: StringKey, l: FigLang, v?: Record<string, string | number>) {
  const s = (l === "zh" ? ZH : EN)[k] ?? k;
  return v ? s.replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? "")) : s;
}
