// Immune context: which immune cell types rise and fall with my gene across tumours.
// Marker scores per cell type (Danaher et al. 2017), Spearman with my gene, also after removing overall immune content.
import { useCallback, useMemo, useRef, useState } from "react";
import { useT } from "../../i18n";
import type { ProjectSummary } from "../../lib/api";
import { fmt, fmtP, type ImmuneResult } from "../../lib/analyses";
import { Immune as ImmuneChart } from "../../charts/Immune";
import { Scatter } from "../../charts/Scatter";
import type { FigLang } from "../../charts/figStrings";
import { Frame, Param, Select, FigureCard, SideTabs, Method, EmptyState, LoadingState, ErrorState, DownloadState, OutOfDate, useRunShortcut, runKeys } from "./Frame";
import { useAnalysis, cohortLabel } from "./useAnalysis";
import { errorText } from "./errors";

type View = "cells" | "scatter";

const FIGT = {
  en: { x: "Spearman ρ with {g} across tumours", raw: "ρ with 95% CI", adj: "after removing overall immune content", stat: "markers · BH q", none: "markers not in the data",
    expr: "{g} expression, log2(TPM + 1)", score: "{c} score (mean z of markers)", sc: "Spearman ρ = {rho} (95% CI {lo} to {hi}) · q = {q}", n: "n = {n} tumours · {k} marker genes" },
  zh: { x: "与 {g} 的 Spearman ρ（肿瘤样本）", raw: "ρ 及 95% CI", adj: "去除总体免疫含量后", stat: "标志基因 · BH q", none: "数据中无标志基因",
    expr: "{g} 表达量，log2(TPM + 1)", score: "{c} 评分（标志基因 z 值均值）", sc: "Spearman ρ = {rho}（95% CI {lo} 至 {hi}）· q = {q}", n: "n = {n} 个肿瘤 · {k} 个标志基因" },
};
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? "")).replace(/= </g, "<");

export function Immune({ p, figLang, onFigLang, say, onLater, onGuide, initialGene }: {
  p: ProjectSummary; figLang: FigLang; onFigLang: (l: FigLang) => void; say: (s: string) => void; onLater: () => void; onGuide: () => void; initialGene?: string;
}) {
  const { t, lang } = useT();
  const a = useAnalysis(["immune"]);
  const r = a.current?.kind === "immune" && !(a.current.result as { error?: string }).error ? (a.current.result as ImmuneResult) : null;
  const targets = p.project.targets.length ? p.project.targets : ["TP53"];
  const [gene, setGene] = useState(initialGene || targets[0]);
  const [view, setView] = useState<View>("cells");
  const [cell, setCell] = useState<string>("");
  const [synced, setSynced] = useState<string | null>(null);
  if (a.current && synced !== a.current.id) { setSynced(a.current.id); if (!initialGene || synced) setGene(a.current.params.gene); setCell(""); }
  const svgRef = useRef<SVGSVGElement>(null);
  const projects = a.cohort?.projects ?? p.project.datasets;
  const run = useCallback(() => a.run({ kind: "immune", gene }), [a, gene]);
  useRunShortcut(run, a.phase.kind !== "running" && !!gene.trim());
  const stale = !!r && !!a.current && a.current.params.gene !== gene.trim().toUpperCase();
  const F = FIGT[figLang];
  const G = r?.gene ?? (gene.trim().toUpperCase() || "…");
  const title = t("imm.title", { g: G });
  const nm = (c: { name: string; zh: string }, l: string = lang) => (l === "zh" ? c.zh : c.name);
  const tested = r ? r.rows.filter((x) => x.rho != null) : [];
  const shown = r ? (cell && r.points.cells[cell] ? cell : r.top ?? tested.find((x) => x.id !== "cd45")?.id ?? "cd45") : "";
  const sel = r?.rows.find((x) => x.id === shown);

  const scatter = useMemo(() => {
    if (!r || !sel) return null;
    const ys = r.points.cells[sel.id] ?? [];
    const pts = r.points.x.map((x, i) => [x, ys[i]] as [number, number]).filter(([x, y]) => x != null && y != null);
    const n = pts.length, mx = pts.reduce((s, q) => s + q[0], 0) / n, my = pts.reduce((s, q) => s + q[1], 0) / n;
    const sxx = pts.reduce((s, q) => s + (q[0] - mx) ** 2, 0), sxy = pts.reduce((s, q) => s + (q[0] - mx) * (q[1] - my), 0);
    const slope = sxx ? sxy / sxx : 0;
    return { pts, line: { slope, intercept: my - slope * mx } };
  }, [r, sel]);

  const badges = (
    <>
      <span className="badge ok">● {cohortLabel(projects)} · {a.cohort?.own ? t("ws.ownSource") : "GDC"}</span>
      {r && <span className="badge">● {t("imm.badge.n", { n: r.n })}</span>}
      {r && <span className="badge ok">● {t("imm.badge.sig", { u: r.pos.length, d: r.neg.length })}</span>}
    </>
  );

  const params = (
    <>
      <div className="row-between"><span className="eyebrow">{t("ws.parameters")}</span>
        <button className="link small" onClick={() => { setView("cells"); setCell(""); }}>{t("ws.reset")}</button></div>
      <Param label={t("ws.cohort")} help={t("ws.cohort.help")} recommended>
        <Select value="c" options={[{ value: "c", label: cohortLabel(projects) }]} onChange={() => {}} />
        {a.cohort?.sample_slice && <p className="help">{t("ws.bundledNote")}</p>}
      </Param>
      <Param label={t("ws.gene")} help={t("ws.gene.help")}>
        <input className="text mono" list="kiri-targets-imm" value={gene} onChange={(e) => setGene(e.target.value)} spellCheck={false} aria-label={t("ws.gene")} />
        <datalist id="kiri-targets-imm">{targets.map((g) => <option key={g} value={g} />)}</datalist>
        {targets.length > 1 && (
          <div className="ws-genes" role="group" aria-label={t("ws.projectGenes")}>
            {targets.map((g) => <button key={g} className={`chip ${gene.trim().toUpperCase() === g.toUpperCase() ? "on" : ""}`} onClick={() => setGene(g)}>{g}</button>)}
          </div>
        )}
      </Param>
      <Param label={t("imm.view")}>
        <div className="segmented full">
          <button aria-pressed={view === "cells"} onClick={() => setView("cells")}>{t("imm.view.cells")}</button>
          <button aria-pressed={view === "scatter"} onClick={() => setView("scatter")}>{t("imm.view.scatter")}</button>
        </div>
      </Param>
      {view === "scatter" && r && (
        <Param label={t("imm.cell")}>
          <Select value={shown} onChange={setCell} options={tested.map((x) => ({ value: x.id, label: nm(x) }))} />
        </Param>
      )}
      <p className="help">{t("imm.source.help")}</p>
      <div className="run-row">
        <button className="btn primary" onClick={run} disabled={a.phase.kind === "running" || !gene.trim()}>{t("imm.run")}</button>
        <span className="kbd">{runKeys}</span>
      </div>
    </>
  );

  let body;
  if (a.phase.kind === "running") body = <LoadingState steps={[t("load.cohort"), t("imm.load.markers"), t("imm.load.test"), t("load.checks")]} />;
  else if (a.phase.kind === "download") body = <DownloadState project={a.phase.projects.join(", ")} state={a.cohort?.packs[a.phase.projects[0]]} onDownload={() => a.download((a.phase as { projects: string[] }).projects)} />;
  else if (a.phase.kind === "error") {
    const e = errorText(t, a.phase.code, { gene: String(a.phase.extra.gene ?? gene.toUpperCase()), ...a.phase.extra });
    body = <ErrorState {...e} code={a.phase.code} actions={<>
      {a.phase.code === "gene_not_in_cohort" && <button className="btn primary" onClick={() => a.download(projects)}>{t("dl.start")}</button>}
      <button className="btn" onClick={run}>{t("err.ws.retry")}</button></>} />;
  } else if (!r) body = a.loaded ? <EmptyState title={t("imm.empty.title")} body={t("imm.empty.body", { g: gene.toUpperCase() })} onRun={run} onGuide={onGuide} /> : null;

  const top = r?.rows.find((x) => x.id === r.top);
  const list = (ids: string[]) => ids.map((id) => r?.rows.find((x) => x.id === id)).filter(Boolean).map((x) => nm(x!)).join(lang === "zh" ? "、" : ", ");
  const plain = r ? [
    r.pos.length || r.neg.length ? t("imm.plain", { g: r.gene, u: r.pos.length, d: r.neg.length, k: tested.filter((x) => x.id !== "cd45").length }) : t("imm.plainNone", { g: r.gene }),
    r.pos.length ? t("imm.plain.pos", { list: list(r.pos.slice(0, 4)) }) : "",
    r.neg.length ? t("imm.plain.neg", { list: list(r.neg.slice(0, 4)) }) : "",
    top ? t(top.rho_adj != null && Math.abs(top.rho_adj) >= 0.1 && Math.sign(top.rho_adj) === Math.sign(top.rho ?? 0) ? "imm.plain.adjKeeps" : "imm.plain.adjLoses",
      { c: nm(top), rho: fmt(top.rho ?? 0), adj: fmt(top.rho_adj ?? 0) }) : "",
  ].filter(Boolean).join(" ") : "";
  const caption = r ? t(view === "cells" ? "imm.caption" : "imm.caption.scatter", { g: r.gene, c: sel ? nm(sel) : "", n: r.n, co: cohortLabel(r.data_version.projects) }) : "";

  const figure = body ? <div className="fig-state">{body}</div> : r && (
    <div className="de-stack">
      {stale && <OutOfDate onRun={run} />}
      <FigureCard svgRef={svgRef} fileName={view === "cells" ? title : `${title} – ${sel ? nm(sel, figLang) : ""}`} chartName={t(view === "cells" ? "imm.chart" : "imm.chart.scatter")} why={t("imm.why")}
        figLang={figLang} onFigLang={onFigLang} onSaid={say} onLater={onLater} readOnly={p.read_only} analysis={a.current} caption={caption}
        notebookBody={() => ({ analysis_id: a.current?.id, kind: "immune", gene: r.gene, title, summary: plain, checks: r.checks, meta: `${r.data_version.source} · ${r.data_version.built}` })}>
        {view === "cells" || !scatter || !sel ? (
          <ImmuneChart ref={svgRef} highlight={r.top ?? undefined}
            rows={r.rows.map((x) => ({ id: x.id, label: nm(x, figLang), rho: x.rho, lo: x.lo, hi: x.hi, rho_adj: x.rho_adj, p_adj: x.p_adj, have: x.have.length, total: x.markers.length, self: x.self }))}
            labels={{ x: fill(F.x, { g: r.gene }), raw: F.raw, adj: F.adj, stat: F.stat, none: F.none }} />
        ) : (
          <Scatter ref={svgRef} points={scatter.pts} line={scatter.line} labels={{
            x: fill(F.expr, { g: r.gene }), y: fill(F.score, { c: nm(sel, figLang) }),
            stat: fill(F.sc, { rho: fmt(sel.rho ?? 0), lo: fmt(sel.lo ?? 0), hi: fmt(sel.hi ?? 0), q: fmtP(sel.p_adj) }),
            n: fill(F.n, { n: sel.n ?? r.n, k: sel.have.length }),
          }} />
        )}
      </FigureCard>
    </div>
  );

  const explain = r ? (
    <>
      <div className="tiles">
        <div className="tile"><span className="eyebrow">{t("imm.tile.pos")}</span><b className="de-up">{r.pos.length}</b><span className="small">{list(r.pos.slice(0, 3)) || "–"}</span></div>
        <div className="tile"><span className="eyebrow">{t("imm.tile.neg")}</span><b className="de-down">{r.neg.length}</b><span className="small">{list(r.neg.slice(0, 3)) || "–"}</span></div>
      </div>
      <div className="side-card shows">
        <span className="eyebrow">{t("ws.whatShows")}</span><span className="small muted">{t("ws.fromNumbers")}</span>
        <p className="plain">{plain}</p>
        <p className="small">{t("imm.note")}</p>
      </div>
      <Method title={t("imm.method.title")} body={t("imm.method.body")} cite="scipy · Danaher et al. 2017 · Spearman 1904 · Benjamini & Hochberg 1995" />
      <div className="side-card next"><span className="eyebrow">{t("ws.next")}</span><p className="small">{t("imm.next")}</p></div>
    </>
  ) : (
    <>
      <Method title={t("imm.method.title")} body={t("imm.method.body")} cite="Danaher et al. 2017" />
      <div className="side-empty">{t("ws.sideEmpty")}</div>
    </>
  );

  return <Frame crumb={`${p.project.name}  /  ${t("nav.analyses")}  /  ${t("nav.immune")}`} title={title} badges={badges} params={params}
    figure={figure} side={<SideTabs explain={explain} checks={r?.checks ?? null} />} onLater={onLater} analysis={r ? a.current : null} say={say} />;
}
