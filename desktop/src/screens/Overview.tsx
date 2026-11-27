// Project overview: the question, what has been run, where you left off, and the one-page summary.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Compass, Lock, Search, ChartSpline, SlidersHorizontal, BarChart3, ChartScatter, NotebookPen, FileText, Play, Loader2, ChevronRight, Layers } from "lucide-react";
import { useT } from "../i18n";
import type { StringKey } from "../i18n/strings";
import type { ProjectSummary } from "../lib/api";
import { analyses, fmt, fmtP, type Kind, type Note, type RunParams } from "../lib/analyses";
import { busy } from "../lib/busy";
import { pickExportPath } from "../lib/files";
import { progress } from "../lib/progress";
import { APP_VERSION } from "../lib/platform";
import { Dialog } from "../shell/Dialog";
import { cohortLabel } from "./workspace/useAnalysis";
import { svgDataUrl } from "../charts/figure";
import { panelFor } from "../charts/panels";
import type { FigLang } from "../charts/figStrings";

const TPL: Record<string, StringKey> = {
  blank: "home.tpl.blank", one_gene: "np.tpl.one", two_gene: "home.tpl.two", own_table: "np.tpl.table", course: "home.tpl.course",
};

type Row = Awaited<ReturnType<typeof analyses.list>>[number];
export type OpenTarget = { kind: Kind | "correlation"; gene?: string };

const KIND_ICON: Record<string, typeof ChartSpline> = {
  survival: ChartSpline, expression_tn: SlidersHorizontal, expression_stage: BarChart3, correlation: ChartScatter, signature: Layers,
};

export function Overview({ p, say, onOpen, onNotebook, onGuide, onRefresh, figLang = "en" }: {
  figLang?: FigLang;
  p: ProjectSummary; say: (s: string) => void; onOpen: (t: OpenTarget) => void; onNotebook: () => void;
  onGuide: (q?: string) => void; onRefresh: () => void;
}) {
  const { t, lang } = useT();
  const pr = p.project;
  const locale = lang === "en" ? "en-GB" : "zh-CN";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState<null | "confirm" | { i: number; n: number; what: string } | { done: number; n: number; bad: string[] }>(null);
  const [summary, setSummary] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [r, n] = await Promise.all([analyses.list().catch(() => [] as Row[]), analyses.notes().catch(() => [] as Note[])]);
    setRows(r); setNotes(n);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!menu) return;
    const h = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    window.addEventListener("mousedown", h); return () => window.removeEventListener("mousedown", h);
  }, [menu]);

  const kindName = (k: string) => t(`ov.kind.${k}` as StringKey);
  const when = (iso: string) => {
    const d = new Date(iso), now = new Date();
    if (d.toDateString() === now.toDateString()) return t("home.today", { t: d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) });
    return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
  };
  const stat = (r: Row) => {
    const h = r.headline;
    if (h.error) return t("ov.stat.failed");
    if (r.kind === "survival") return `${t("ov.stat.hr", { v: fmt(h.hr) })} · ${t("ov.stat.p", { v: fmtP(h.p_report) })}`;
    if (r.kind === ("correlation" as Kind) || r.kind === ("signature" as Kind)) return `${t("ov.stat.rho", { v: fmt(h.rho) })} · ${t("ov.stat.p", { v: fmtP(h.p) })}`;
    return t("ov.stat.p", { v: fmtP(h.p) });
  };
  const inNotebook = useMemo(() => new Set(notes.map((n) => n.body.analysis_id).filter(Boolean) as string[]), [notes]);
  const genesOf = (r: Row) => r.kind === "bench" ? ((r.params as { title?: string }).title || "–") : r.params.gene + ((r.params as { gene2?: string }).gene2 ? ` · ${(r.params as { gene2?: string }).gene2}` : "");

  // Where you left off
  const last = rows?.[0];
  const created = new Date(p.manifest.created).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  const next = useMemo(() => {
    if (!rows) return "";
    const ok = rows.filter((r) => !r.headline.error);
    const has = (k: Kind, g: string) => ok.some((r) => r.kind === k && r.params.gene === g);
    const targets = pr.targets.length ? pr.targets : [];
    const caution = ok.find((r) => r.headline.worst === "problem" || r.headline.worst === "caution");
    for (const g of targets) {
      if (!has("expression_tn", g)) return t("ov.next.expr", { g });
      if (!has("survival", g)) return t("ov.next.survival", { g });
      if (!has("expression_stage", g)) return t("ov.next.stage", { g });
    }
    if (!ok.length) return t("ov.nextFirst");
    if (caution && !inNotebook.has(caution.id)) return t("ov.next.caution", { k: kindName(caution.kind), g: genesOf(caution) });
    if (ok.some((r) => !inNotebook.has(r.id))) return t("ov.next.notebook");
    return t("ov.next.summary");
  }, [rows, inNotebook, pr.targets, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // The standard panel: for each target, tumour vs normal, by stage, and survival.
  const panelJobs: RunParams[] = pr.targets.flatMap((g) => [
    { kind: "expression_tn" as Kind, gene: g },
    { kind: "expression_stage" as Kind, gene: g },
    { kind: "survival" as Kind, gene: g, cut: "median" as const, adjust: ["age", "stage"] as ("age" | "stage")[] },
  ]);
  const runPanel = async () => {
    const list = rows ?? [];
    const bad: string[] = [];
    let done = 0;
    for (let i = 0; i < panelJobs.length; i++) {
      const job = panelJobs[i];
      const what = `${kindName(job.kind)} · ${job.gene}`;
      setPanel({ i: i + 1, n: panelJobs.length, what });
      const id = busy.start(what);
      let code: string | undefined;
      try {
        const existing = list.find((r) => r.kind === job.kind && r.params.gene === job.gene);
        const a = await analyses.run({ ...job, replace: existing?.id });
        code = (a.result as { error?: string }).error;
      } catch (e) { code = (e as { code?: string }).code ?? "engine"; }
      busy.end(id, code);
      if (code) bad.push(what); else { done++; progress.mark("run"); }
      await load();
    }
    setPanel({ done, n: panelJobs.length, bad });
    onRefresh();
  };

  const running = panel && typeof panel === "object" && "i" in panel;
  const finished = panel && typeof panel === "object" && "done" in panel ? panel : null;
  const latestNotes = notes.slice(-3).reverse();

  return (
    <div className="ov">
      {p.read_only && p.read_only_reason && (
        <div className="note warn" style={{ marginTop: 0, marginBottom: 12 }}><Lock size={16} /> {t(`ov.readOnly.${p.read_only_reason}`)}</div>
      )}
      <div className="home-head">
        <div style={{ minWidth: 0 }}>
          <div className="mono crumb">{pr.name} &nbsp;/&nbsp; {t("ov.crumb")}</div>
          <h1 className="page" style={{ margin: "4px 0 8px" }}>{pr.question || pr.name}</h1>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {pr.targets.length > 0 && <span className="badge ok">● {pr.targets.join(" · ")}</span>}
            {pr.cancers.length > 0 && <span className="badge">● {pr.cancers.join(", ")}</span>}
            <span className="badge">● {t("ov.tpl", { t: t(TPL[pr.template] ?? "home.tpl.blank") })}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flex: "none" }}>
          <button className="btn" onClick={() => setSummary(true)}><FileText size={15} />{t("ov.summary")}</button>
          <button className="btn primary" disabled={!!running || p.read_only} onClick={() => (pr.targets.length ? setPanel("confirm") : say(t("ov.panel.noTargets")))}>
            {running ? <Loader2 size={15} className="spin" /> : <Play size={14} />}{t("ov.panel")}
          </button>
        </div>
      </div>

      {running && <div className="ov-panel-bar"><Loader2 size={15} className="spin" /><span>{t("ov.panel.running", panel as { i: number; n: number; what: string })}</span>
        <div className="progress" style={{ flex: 1 }}><span style={{ width: `${((panel as { i: number }).i - 1) / (panel as { n: number }).n * 100}%` }} /></div></div>}
      {finished && <div className={`ov-panel-bar ${finished.bad.length ? "warn" : "ok"}`}>
        <span>{t("ov.panel.done", { ok: finished.done, n: finished.n })} {finished.bad.length > 0 && t("ov.panel.someFailed", { bad: finished.bad.join(", ") })}</span>
        <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => setPanel(null)}>{t("err.close")}</button></div>}

      <section className="left-off">
        <div className="row-between"><h2 className="card-title">{t("ov.left")}</h2></div>
        <div className="left-off-grid">
          <div><div className="eyebrow">{t("ov.lastResults")}</div>
            <p>{last ? t("ov.last", { k: kindName(last.kind), g: genesOf(last), s: stat(last) }) : t("ov.noResults")}</p></div>
          <div><div className="eyebrow">{t("ov.changed")}</div>
            <p>{last ? t("ov.changedAt", { k: kindName(last.kind), g: genesOf(last), w: when(last.updated_at) }) : t("ov.created", { d: created })}</p></div>
          <div><div className="eyebrow">{t("ov.next")}</div><p>{next || t("ov.nextFirst")}</p></div>
        </div>
      </section>

      <div className="home-grid" style={{ gridTemplateColumns: "1fr 330px" }}>
        <section className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="row-between"><span className="eyebrow">{t("ov.analyses")}{rows?.length ? ` · ${rows.length}` : ""}</span>
            <div style={{ position: "relative" }} ref={menuRef}>
              <button className="btn ghost" style={{ height: 24, fontSize: 12.5 }} onClick={() => setMenu((v) => !v)} aria-expanded={menu}>{t("ov.newAnalysis")}</button>
              {menu && (
                <div className="menu" style={{ minWidth: 240 }}>
                  <button onClick={() => { setMenu(false); onOpen({ kind: "expression_tn", gene: pr.targets[0] }); }}><span className="row-gap"><SlidersHorizontal size={14} />{t("ov.new.expr")}</span></button>
                  <button onClick={() => { setMenu(false); onOpen({ kind: "expression_stage", gene: pr.targets[0] }); }}><span className="row-gap"><BarChart3 size={14} />{t("ov.new.stage")}</span></button>
                  <button onClick={() => { setMenu(false); onOpen({ kind: "survival", gene: pr.targets[0] }); }}><span className="row-gap"><ChartSpline size={14} />{t("ov.new.survival")}</span></button>
                  <button onClick={() => { setMenu(false); onOpen({ kind: "correlation" }); }}><span className="row-gap"><ChartScatter size={14} />{t("ov.new.correlation")}</span></button>
                  <button onClick={() => { setMenu(false); onOpen({ kind: "signature" }); }}><span className="row-gap"><Layers size={14} />{t("ov.new.signature")}</span></button>
                </div>
              )}
            </div>
          </div>
          {rows && rows.length > 0 ? (
            <ul className="ov-list">
              {rows.map((r) => {
                const Icon = KIND_ICON[r.kind] ?? ChartSpline;
                return (
                  <li key={r.id}>
                    <button className="ov-row" onClick={() => onOpen({ kind: r.kind, gene: r.params.gene })}>
                      <span className="file-icon"><Icon size={16} /></span>
                      <span className="ov-row-text"><b>{kindName(r.kind)} · {genesOf(r)}</b><span className="mono muted">{cohortLabel(r.params.projects ?? [])}</span></span>
                      <span className={`mono ov-stat ${r.headline.error ? "warn-text" : ""}`}>{stat(r)}</span>
                      {r.headline.worst && <span className={`rel-dot ${r.headline.worst}`} title={t("ws.reliability")} />}
                      {inNotebook.has(r.id) ? <span className="badge ok sm"><NotebookPen size={11} /> {t("ov.inNotebook")}</span> : <span className="ov-nb-gap" />}
                      <span className="mono muted when">{when(r.updated_at)}</span>
                      <ChevronRight size={15} color="var(--color-text-muted)" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <div className="empty"><p>{rows ? t("ov.analyses.empty") : ""}</p></div>}
        </section>
        <div className="home-right">
          <section className="card">
            <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 500 }}><Compass size={16} color="var(--color-accent-text)" />{t("home.show.title")}</div>
            <label className="input" style={{ marginTop: 10 }}><Search size={15} color="var(--color-text-muted)" />
              <input placeholder={t("ov.askAbout", { g: pr.targets.join(lang === "en" ? " or " : "或") || "…" })}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) onGuide((e.target as HTMLInputElement).value); }} /></label>
          </section>
          <section className="card" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="eyebrow">{t("ov.notebook")}</span>
            {latestNotes.length === 0 ? <p className="muted" style={{ fontSize: 13, margin: 0 }}>{t("ov.notebook.empty")}</p> : (
              <>
                {latestNotes.map((n) => (
                  <button key={n.id} className="ov-note" onClick={onNotebook}>
                    {n.body.svg ? <img className="ov-thumb" alt="" src={svgDataUrl(n.body.svg)} /> : <span className="ov-thumb text"><NotebookPen size={16} /></span>}
                    <span className="ov-note-text"><b>{n.body.title || t("ov.nb.note")}</b><span className="muted">{(n.body.text || n.body.summary || "").slice(0, 90)}</span></span>
                  </button>
                ))}
                <button className="btn ghost sm" style={{ alignSelf: "flex-start", marginTop: "auto" }} onClick={onNotebook}>{t("ov.nb.open", { n: notes.length })}</button>
              </>
            )}
          </section>
        </div>
      </div>

      {panel === "confirm" && (
        <Dialog title={t("ov.panel.title")} onClose={() => setPanel(null)}
          footer={<><button className="btn ghost" onClick={() => setPanel(null)}>{t("file.cancel")}</button><button className="btn primary" onClick={runPanel}>{t("ov.panel.go", { n: panelJobs.length })}</button></>}>
          <p>{t("ov.panel.body", { n: panelJobs.length, c: pr.datasets.join(", ") || pr.cancers.join(", ") })}</p>
          <ul className="ov-panel-list">
            {panelJobs.map((j) => <li key={j.kind + j.gene}><span className="mono">{j.gene}</span> {kindName(j.kind)}</li>)}
          </ul>
        </Dialog>
      )}
      {summary && <SummaryDialog p={p} rows={(rows ?? []).filter((r) => !r.headline.error)} kindName={kindName} genesOf={genesOf} figLang={figLang}
        onClose={() => setSummary(false)} say={say} />}
    </div>
  );
}

function SummaryDialog({ p, rows, kindName, genesOf, figLang, onClose, say }: {
  p: ProjectSummary; rows: Row[]; kindName: (k: string) => string; genesOf: (r: Row) => string; figLang: FigLang;
  onClose: () => void; say: (s: string) => void;
}) {
  const { t, lang } = useT();
  const [fmtSel, setFmt] = useState<"pdf" | "html" | "docx">("pdf");
  const [busyNow, setBusy] = useState(false);
  const [onPage, setOnPage] = useState<string[]>(() => defaultPanels(rows, p.project.targets));
  const pr = p.project;
  const one = fmtSel === "pdf";
  const toggle = (id: string) => setOnPage((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length < 4 ? [...s, id] : s);
  const go = async () => {
    const path = await pickExportPath(t("ov.sum.title"), `${pr.name} – ${t("ov.sum.title")}`, fmtSel);
    if (!path) return;
    setBusy(true);
    const chosen = one ? onPage.map((id) => rows.find((r) => r.id === id)!).filter(Boolean) : rows;
    const full = await Promise.all(chosen.map((r) => analyses.get(r.id).catch(() => null)));
    const dv = full.find((a) => a?.data_versions)?.data_versions;
    const items = chosen.map((r, i) => {
      const panel = full[i] ? panelFor(full[i]!, figLang, t) : null;
      return { analysis_id: r.id, title: `${kindName(r.kind)} · ${genesOf(r)}`, summary: panel?.summary ?? "", checks: panel?.checks ?? [], svg: panel?.svg };
    });
    const date = new Date().toLocaleDateString(lang === "en" ? "en-GB" : "zh-CN", { day: "numeric", month: "short", year: "numeric" });
    const cohort = cohortLabel(dv?.projects ?? pr.datasets);
    const byline = [date, dv ? `${cohort} (${dv.source.split(" ")[0]} ${dv.built})` : cohort, `Kiri ${APP_VERSION}`].join(" · ");
    const n = (k: string) => items.reduce((s, it) => s + it.checks.filter((c) => c.status === k).length, 0);
    const rest = rows.filter((r) => !onPage.includes(r.id)).map((r) => `${kindName(r.kind)} · ${genesOf(r)}`);
    const footer = [t("ov.sum.footer", { c: n("caution"), p: n("problem") }), rest.length ? t("ov.sum.alsoIn", { l: rest.join("; ") }) : ""].filter(Boolean).join(" ");
    const intro = [
      t("ov.sum.targets", { t: pr.targets.join(", ") || "–", c: pr.cancers.join(", ") || "–" }),
      dv ? t("ov.sum.data", { d: `${dv.source} · ${dv.units} · ${dv.built}` }) : "",
      t("ov.sum.made", { v: APP_VERSION, d: date }),
    ];
    try {
      const r = await analyses.exportSummary({ path, format: fmtSel, title: pr.question || pr.name, intro, items, one_page: one, byline, footer,
        labels: { question: t("nb.l.question"), reliability: t("ws.reliability"), pass: t("nb.l.pass"), caution: t("nb.l.caution"), problem: t("nb.l.problem"), generated: t("nb.l.generated") } });
      say(t("ov.sum.done", { p: r.path })); onClose();
      if (fmtSel === "docx") progress.mark("word");
    } catch { say(t("ov.sum.failed")); }
    setBusy(false);
  };
  return (
    <Dialog title={t("ov.sum.title")} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>{t("file.cancel")}</button><button className="btn primary" onClick={go} disabled={busyNow || !rows.length || (one && !onPage.length)}>{t("ov.sum.go")}</button></>}>
      <p>{!rows.length ? t("ov.sum.none") : one ? t("ov.sum.bodyPage") : t("ov.sum.bodyFull")}</p>
      {rows.length > 0 && (<>
        <div className="row-gap">
          <button className={`option ${fmtSel === "pdf" ? "on" : ""}`} onClick={() => setFmt("pdf")}><b>{t("ov.sum.f.page")}</b></button>
          <button className={`option ${fmtSel === "docx" ? "on" : ""}`} onClick={() => setFmt("docx")}><b>{t("ov.sum.f.word")}</b></button>
          <button className={`option ${fmtSel === "html" ? "on" : ""}`} onClick={() => setFmt("html")}><b>{t("ov.sum.f.html")}</b></button>
        </div>
        {one ? (<>
          <div className="eyebrow sum-pick-head">{t("ov.sum.pick", { n: onPage.length })}</div>
          <ul className="sum-pick">
            {rows.map((r) => {
              const on = onPage.includes(r.id);
              return <li key={r.id}><label className={on ? "on" : ""}>
                <input type="checkbox" checked={on} disabled={!on && onPage.length >= 4} onChange={() => toggle(r.id)} />
                <b>{kindName(r.kind)} · {genesOf(r)}</b>
                <span className="small muted">{on ? t("ov.sum.panel", { n: onPage.indexOf(r.id) + 1 }) : t("ov.sum.nbOnly")}</span>
              </label></li>;
            })}
          </ul>
        </>) : (
          <ul className="ov-panel-list">{rows.map((r) => <li key={r.id}><b>{kindName(r.kind)} · {genesOf(r)}</b></li>)}</ul>
        )}
      </>)}
    </Dialog>
  );
}

// Four panels by default: one of each kind in reading order (expression, survival, stage, correlation), then the rest.
const PANEL_ORDER = ["expression_tn", "survival", "expression_stage", "correlation"];
function defaultPanels(rows: Row[], targets: string[]) {
  const pick: string[] = [];
  const first = (targets[0] ?? "").toUpperCase();
  for (const k of PANEL_ORDER) {
    const r = rows.find((x) => x.kind === k && x.params.gene === first && !pick.includes(x.id)) ?? rows.find((x) => x.kind === k && !pick.includes(x.id));
    if (r) pick.push(r.id);
  }
  for (const r of rows) if (pick.length < 4 && !pick.includes(r.id)) pick.push(r.id);
  return pick.slice(0, 4);
}
