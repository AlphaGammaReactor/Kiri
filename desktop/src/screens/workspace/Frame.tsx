// The layout every analysis workspace shares: header, parameters, figure card, and the Explain / Reliability panel.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Copy, Download, NotebookPen, LayoutPanelLeft, Table2, Code2, ChevronDown, CircleHelp, ShieldCheck, Check, TriangleAlert, CircleX, Info, Loader2, RotateCcw, CloudDownload, Activity, WifiOff } from "lucide-react";
import { useT } from "../../i18n";
import type { StringKey } from "../../i18n/strings";
import { analyses, fmt, fmtP, type Analysis, type Check as CheckT } from "../../lib/analyses";
import { DataTableDialog, ReproduceDialog } from "./Tools";
import { copyPng, pngBytes, svgText } from "../../charts/figure";
import { pickExportPath } from "../../lib/files";
import { progress } from "../../lib/progress";
import { FigureViewer } from "../../charts/FigureViewer";
import { Mascot } from "../../shell/Mascot";
import { addToBoard } from "../../charts/board";
import { Dialog } from "../../shell/Dialog";
import { api, type Cancer } from "../../lib/api";
import { cohortLabel } from "./useAnalysis";
import { downloads, usePacks } from "../../lib/downloads";
import { fmtBytes } from "../../lib/system";

/** What a workspace hands the frame so "Check in another cohort" can run the same analysis elsewhere. */
export type CohortSwitch = { other: string[] | null; home: string[]; checkIn: (ps: string[] | null) => void; phase?: { kind: string; projects?: string[] } };

export const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
export const runKeys = isMac ? "⌘ ↩" : "Ctrl Enter";

export function useRunShortcut(run: () => void, enabled: boolean) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (enabled && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [run, enabled]);
}

export function Frame({ crumb, title, badges, params, figure, side, onLater, analysis, say, cohorts }: {
  crumb: string; title: string; badges: ReactNode; params: ReactNode; figure: ReactNode; side: ReactNode; onLater: () => void;
  analysis?: Analysis | null; say?: (s: string) => void; cohorts?: CohortSwitch | null;
}) {
  const { t } = useT();
  const [repro, setRepro] = useState(false);
  const [pick, setPick] = useState(false);
  const usable = !!analysis && !(analysis.result as { error?: string }).error;
  const packs = usePacks();
  const waiting = cohorts?.phase?.kind === "download" && (cohorts.phase.projects ?? []).some((p) => packs[p]?.state === "downloading");
  return (
    <div className="ws">
      <div className="ws-head">
        <div style={{ minWidth: 0 }}>
          <div className="crumb mono">{crumb}</div>
          <h1 className="page ws-title">{title}</h1>
          <div className="ws-badges">{badges}</div>
          {usable && Object.entries(((analysis!.result as { data_version?: { renamed?: Record<string, string> } }).data_version?.renamed) ?? {}).map(([asked, used]) => (
            <div key={asked} className="ws-other small" title={t("alias.tip")}><span>{t("alias.note", { a: asked, u: used })}</span></div>
          ))}
          {cohorts?.other && <div className="ws-other small">
            <span>{t("other.now", { c: cohortLabel(cohorts.other) })}</span>
            <button className="link small" onClick={() => cohorts.checkIn(null)}>{t("other.back", { c: cohortLabel(cohorts.home) })}</button>
          </div>}
        </div>
        <div className="ws-actions">
          <button className="btn ghost" onClick={() => (usable ? setRepro(true) : say?.(t("repro.none")))} title={t("repro.tip")}>{t("ws.reproduce")}</button>
          {cohorts ? <button className="btn" data-tour="other" onClick={() => (usable ? setPick(true) : say?.(t("other.none")))} title={t("other.tip")}>{t("ws.checkOther")}</button>
            : cohorts === undefined && <button className="btn" onClick={onLater} title={t("common.notYet")}>{t("ws.checkOther")}</button>}
        </div>
      </div>
      <div className="ws-grid">
        <aside className="card ws-params"><WaitCtx.Provider value={waiting}>{params}</WaitCtx.Provider></aside>
        <section className="card ws-fig">{figure}</section>
        <aside className="ws-side">{side}</aside>
      </div>
      {repro && analysis && <ReproduceDialog a={analysis} fileName={title} onClose={() => setRepro(false)} say={say ?? (() => {})} />}
      {pick && cohorts && analysis && <OtherCohortDialog current={analysis.params.projects ?? []} home={cohorts.home}
        onPick={(ps) => { setPick(false); cohorts.checkIn(ps); }} onClose={() => setPick(false)} />}
    </div>
  );
}

/** Pick another TCGA cohort to repeat the analysis in, with the same gene and settings. */
function OtherCohortDialog({ current, home, onPick, onClose }: { current: string[]; home: string[]; onPick: (ps: string[] | null) => void; onClose: () => void }) {
  const { t, lang } = useT();
  const [list, setList] = useState<Cancer[] | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { api.cancers().then(setList).catch(() => setList([])); }, []);
  const name = (c: Cancer) => (lang === "en" ? c.en : lang === "zh" ? c.zh : `${c.zh} · ${c.en}`);
  const ql = q.trim().toLowerCase();
  const shown = (list ?? []).filter((c) => !ql || `${c.code} ${c.project} ${c.en} ${c.zh}`.toLowerCase().includes(ql));
  const isHome = (p: string) => home.length === 1 && home[0] === p;
  const backHome = current.join() !== home.join() && home.length > 0;
  return (
    <Dialog title={t("ws.checkOther")} onClose={onClose} width={560}
      footer={<>
        {backHome && <button className="btn ghost" onClick={() => onPick(null)}>{t("other.back", { c: cohortLabel(home) })}</button>}
        <span style={{ flex: 1 }} />
        <button className="btn ghost" onClick={onClose}>{t("file.cancel")}</button>
        <button className="btn primary" disabled={!sel} onClick={() => sel && onPick([sel])}>{t("other.run", { c: sel ?? "…" })}</button>
      </>}>
      <p className="small" style={{ marginTop: 0 }}>{t("other.body")}</p>
      <label className="input" style={{ margin: "10px 0" }}><input autoFocus placeholder={t("other.search")} value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="other-list" role="listbox" aria-label={t("ws.checkOther")}>
        {list === null && <p className="muted small">…</p>}
        {shown.map((c) => {
          const here = current.length === 1 && current[0] === c.project;
          return <button key={c.project} role="option" aria-selected={sel === c.project} disabled={here} className="other-item"
            onClick={() => setSel(c.project)} onDoubleClick={() => !here && onPick([c.project])}>
            <span className="mono">{c.code}</span><span>{name(c)}</span>
            {here ? <span className="badge sm">{t("other.here")}</span> : isHome(c.project) ? <span className="badge sm">{t("other.home")}</span> : null}
          </button>;
        })}
      </div>
      <p className="help">{t("other.note")}</p>
    </Dialog>
  );
}

export function Param({ label, help, recommended, children }: { label: string; help?: string; recommended?: boolean; children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="param">
      <div className="param-head">
        <span>{label}{help && <span className="tip" title={help} aria-label={help}><CircleHelp size={12} /></span>}</span>
        {recommended && <span className="rec mono">{t("ws.recommended")}</span>}
      </div>
      {children}
    </div>
  );
}

export function Select<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <div className="sel">
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
      <ChevronDown size={15} />
    </div>
  );
}

export function FigureCard({ svgRef, chartName, why, caption, fileName, figLang, onFigLang, children, notebookBody, onSaid, onLater, readOnly, analysis }: {
  svgRef: RefObject<SVGSVGElement | null>; chartName: string; why: string; caption: string; fileName: string; figLang: "en" | "zh"; onFigLang: (l: "en" | "zh") => void;
  children: ReactNode; notebookBody: () => Record<string, unknown>; onSaid: (s: string) => void; onLater: () => void; readOnly: boolean;
  analysis?: Analysis | null;
}) {
  const { t } = useT();
  const [tool, setTool] = useState<null | "table" | "code">(null);
  const savePdf = async () => {
    setSaveMenu(false);
    if (!svgRef.current) return;
    const path = await pickExportPath(t("fig.saveTitle"), fileName, "pdf");
    if (!path) return;
    try { const r = await analyses.exportPdf(path, svgText(svgRef.current)); onSaid(t("fig.saved", { p: r.path })); } catch { onSaid(t("fig.saveFailed")); }
  };
  const [whyOpen, setWhyOpen] = useState(false);
  const [saveMenu, setSaveMenu] = useState(false);
  const copy = async () => { if (svgRef.current) onSaid((await copyPng(svgRef.current)) ? t("fig.copied") : t("fig.copyFailed")); };
  const save = async (ext: "png" | "svg") => {
    setSaveMenu(false);
    if (!svgRef.current) return;
    const path = await pickExportPath(t("fig.saveTitle"), fileName, ext);
    if (!path) return;
    const bytes = ext === "png" ? await pngBytes(svgRef.current) : new TextEncoder().encode(svgText(svgRef.current));
    try { const r = await analyses.exportFile(path, bytes); onSaid(t("fig.saved", { p: r.path })); } catch { onSaid(t("fig.saveFailed")); }
  };
  const toBoard = async () => {
    if (readOnly) { onSaid(t("fig.readOnly")); return; }
    if (!analysis) { onLater(); return; }
    try { onSaid(await addToBoard(analysis.id, t)); } catch { onSaid(t("fig.readOnly")); }
  };
  const send = async () => {
    if (readOnly) { onSaid(t("fig.readOnly")); return; }
    try {
      const svg = svgRef.current ? svgText(svgRef.current) : "";
      const r = await analyses.note("figure", { ...notebookBody(), svg, caption });
      onSaid(t("fig.sent", { n: r.count }));
      progress.mark("save");
    } catch { onSaid(t("fig.sendFailed")); }
  };
  return (
    <>
      <div className="fig-top">
        <span className="eyebrow">{t("fig.label", { n: 1 })}</span>
        <div className="fig-tools">
          <button className="tool" title={t("fig.copy")} aria-label={t("fig.copy")} onClick={copy}><Copy size={16} /></button>
          <div style={{ position: "relative" }}>
            <button className="tool" title={t("fig.save")} aria-label={t("fig.save")} onClick={() => setSaveMenu((v) => !v)}><Download size={16} /></button>
            {saveMenu && (
              <div className="menu" style={{ right: "auto", left: 0 }}>
                <button onClick={() => save("png")}>{t("fig.savePng")}</button>
                <button onClick={() => save("svg")}>{t("fig.saveSvg")}</button>
                <button onClick={savePdf}>{t("fig.savePdfVector")}</button>
              </div>
            )}
          </div>
          <button className="btn primary sm" data-tour="notebook" onClick={send}><NotebookPen size={15} />{t("fig.sendNotebook")}</button>
          <button className="tool" data-tour="board" title={t("fig.board")} aria-label={t("fig.board")} onClick={toBoard}><LayoutPanelLeft size={16} /></button>
          <button className="tool" title={t("fig.table")} aria-label={t("fig.table")} onClick={() => (analysis ? setTool("table") : onLater())}><Table2 size={16} /></button>
          <button className="tool" title={t("fig.code")} aria-label={t("fig.code")} onClick={() => (analysis ? setTool("code") : onLater())}><Code2 size={16} /></button>
        </div>
      </div>
      <div className="fig-row">
        <div className="sel chart-sel" title={t("fig.otherCharts")}>
          <span>{chartName}</span><span className="badge ok sm">● {t("ws.recommended")}</span><ChevronDown size={15} />
        </div>
        <div style={{ position: "relative" }}>
          <button className="link" onClick={() => setWhyOpen((v) => !v)}><CircleHelp size={14} />{t("fig.why")}</button>
          {whyOpen && <div className="pop" role="dialog" onClick={() => setWhyOpen(false)}>{why}</div>}
        </div>
        <span className="badge ok sm fig-check"><ShieldCheck size={13} />{t("fig.checkPassed")}</span>
      </div>
      <FigureViewer>{children}</FigureViewer>
      {tool === "table" && analysis && <DataTableDialog a={analysis} fileName={fileName} onClose={() => setTool(null)} say={onSaid} />}
      {tool === "code" && analysis && <ReproduceDialog a={analysis} fileName={fileName} initialTab="r" onClose={() => setTool(null)} say={onSaid} />}
      <div className="fig-foot">
        <p className="caption">{caption}</p>
        <label className="sel small-sel">
          <span className="mono">{t("fig.lang")}</span>
          <select value={figLang} onChange={(e) => onFigLang(e.target.value as "en" | "zh")}>
            <option value="en">English</option><option value="zh">中文</option>
          </select>
        </label>
      </div>
    </>
  );
}

export function SideTabs({ explain, checks }: { explain: ReactNode; checks: CheckT[] | null }) {
  const { t } = useT();
  const [tab, setTab] = useState<"explain" | "rel">("explain");
  const worst = !checks ? null : checks.some((c) => c.status === "problem") ? "problem" : checks.some((c) => c.status === "caution") ? "caution" : "pass";
  return (
    <>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "explain"} onClick={() => setTab("explain")}>{t("ws.explain")}</button>
        <button role="tab" aria-selected={tab === "rel"} onClick={() => { setTab("rel"); if (checks) progress.mark("reliable"); }}>
          {t("ws.reliability")}{worst && <span className={`rel-dot ${worst}`} />}
        </button>
      </div>
      <div className="side-scroll">{tab === "explain" ? explain : <Reliability checks={checks} />}</div>
    </>
  );
}

export const CHECK_TITLE: Record<string, StringKey> = {
  data: "rel.t.data", enough: "rel.t.enough", assumptions: "rel.t.assumptions", multiple: "rel.t.multiple",
  effect: "rel.t.effect", stability: "rel.t.stability", replication: "rel.t.replication", reproducibility: "rel.t.reproducibility",
  coherence: "rel.t.coherence", leave_one_out: "rel.t.leave_one_out", mito_content: "rel.t.mito_content", proliferation: "rel.t.proliferation",
  set_kind: "rel.t.set_kind", causality: "rel.t.causality",
};

export function fmtVars(v: Record<string, unknown>) {
  const out: Record<string, string | number> = {};
  for (const [k, x] of Object.entries(v)) {
    if (x == null) out[k] = "–";
    else if (typeof x === "number") out[k] = k.startsWith("p") && k !== "patients" ? fmtP(x) : k === "boot_same" ? Math.round(x * 100) : Number.isInteger(x) ? x : fmt(x);
    else out[k] = String(x);
  }
  return out;
}

export function Reliability({ checks }: { checks: CheckT[] | null }) {
  const { t } = useT();
  if (!checks) return <div className="side-empty">{t("rel.empty")}</div>;
  const n = (s: string) => checks.filter((c) => c.status === s).length;
  const icon = (s: string) => s === "pass" ? <Check size={13} /> : s === "caution" ? <TriangleAlert size={13} /> : s === "problem" ? <CircleX size={13} /> : <Info size={13} />;
  return (
    <div>
      <div className="rel-sum">
        <span><span className="rel-dot pass" />{t("rel.pass", { n: n("pass") })}</span>
        <span><span className="rel-dot caution" />{t("rel.caution", { n: n("caution") })}</span>
        <span><span className="rel-dot problem" />{t("rel.problem", { n: n("problem") })}</span>
      </div>
      <ul className="rel-list">
        {checks.map((c) => (
          <li key={c.check}>
            <span className={`rel-icon ${c.status}`}>{icon(c.status)}</span>
            <div>
              <b>{t(CHECK_TITLE[c.check] ?? "rel.t.data")}</b>
              <p>{t(`rel.${c.code}` as StringKey, fmtVars(c.vars))}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Method({ title, body, cite }: { title: string; body: string; cite: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  return (
    <div className="side-card">
      <button className="side-card-head" onClick={() => setOpen((v) => !v)}><span className="eyebrow">{t("ws.method")}</span><ChevronDown size={15} style={{ transform: open ? "rotate(180deg)" : undefined }} /></button>
      {open && <><b className="method-title">{title}</b><p className="small">{body}</p><p className="mono cite-line">{cite}</p></>}
    </div>
  );
}

// ── States ──
export function EmptyState({ title, body, onRun, onGuide }: { title: string; body: string; onRun?: () => void; onGuide: () => void }) {
  const { t } = useT();
  return (
    <div className="state">
      <div className="state-icon"><Activity size={22} /></div>
      <div className="state-title">{title}</div>
      <p>{body}</p>
      <div className="row-gap">{onRun && <button className="btn primary" onClick={onRun}>{t("ws.runSample")}</button>}<button className="btn ghost" onClick={onGuide}>{t("ws.whichFigure")}</button></div>
    </div>
  );
}

export function LoadingState({ steps }: { steps: string[] }) {
  const { t } = useT();
  const [i, setI] = useState(0);
  const timer = useRef<number>(0);
  useEffect(() => { timer.current = window.setInterval(() => setI((x) => Math.min(steps.length - 1, x + 1)), 900); return () => clearInterval(timer.current); }, [steps.length]);
  return (
    <div className="state">
      <Mascot pose="thinking" size={88} />
      <div className="state-title"><Loader2 size={18} className="spin" />{t("ws.running")}</div>
      <ul className="steps">{steps.map((s, k) => <li key={s} className={k < i ? "done" : k === i ? "now" : ""}>{k < i ? <Check size={13} /> : <span className="dotx" />}{s}</li>)}</ul>
      <p className="small muted">{t("ws.keepWorking")}</p>
    </div>
  );
}

export function ErrorState({ what, why, todo, code, actions }: { what: string; why: string; todo: string; code: string; actions: ReactNode }) {
  const { t } = useT();
  return (
    <div className="state left">
      {code !== "needs_internet" && <Mascot pose="oops" size={80} />}
      {code === "needs_internet"
        ? <div className="state-title"><WifiOff size={20} style={{ color: "var(--color-status-warning, #b7791f)" }} />{t("err.ws.offline")}</div>
        : <div className="state-title"><CircleX size={20} style={{ color: "var(--color-status-danger)" }} />{t("err.ws.title")}</div>}
      <div className="err-grid">
        <span className="eyebrow">{t("err.ws.what")}</span><p>{what}</p>
        <span className="eyebrow">{t("err.ws.why")}</span><p>{why}</p>
        <span className="eyebrow">{t("err.ws.todo")}</span><p>{todo}</p>
      </div>
      <div className="row-gap">{actions}</div>
      {code !== "needs_internet" && <div className="mono small muted">{t("err.ws.code", { c: code })}</div>}
    </div>
  );
}

/** "TCGA-COAD and READ": the projects of a download, named once. */
export function cohortName(projects: string[], and: string) {
  return projects.map((p, i) => (i ? p.replace(/^TCGA-/, "") : p)).join(and);
}

const STEPS: { key: string; files: string[] }[] = [
  { key: "dl.step.expr", files: ["expr"] },
  { key: "dl.step.clin", files: ["survival", "clinical"] },
  { key: "dl.step.check", files: ["convert"] },
  { key: "dl.step.extra", files: ["mutation", "copies"] },
];
const stepOf = (file?: string) => Math.max(0, STEPS.findIndex((s) => s.files.includes(file ?? "")));

/** The four cohort download states (design page 15): needs download, downloading, ready, failed.
 *  The panel follows what is on disk, so a finished download shows Ready, never "needs download" again. */
export function CohortDownload({ a, runLabel, onRun }: {
  a: { phase: { kind: string; projects?: string[] }; download: (ps: string[]) => void }; runLabel: string; onRun: () => void;
}) {
  const { t } = useT();
  const all = usePacks();
  const projects = a.phase.projects ?? [];
  const name = cohortName(projects, t("dl.and"));
  const st = projects.map((p) => ({ project: p, ...(all[p] ?? { ready: false, state: "idle" }) }));
  const failed = st.find((s) => s.state === "failed");
  const busyNow = st.filter((s) => s.state === "downloading");
  const ready = st.length > 0 && st.every((s) => s.ready);
  const mb = (n?: number) => fmtBytes(n ?? 0);

  if (ready) {
    const bytes = st.reduce((x, s) => x + (s.bytes ?? 0), 0), n = st.reduce((x, s) => x + (s.samples ?? 0), 0);
    return (
      <div className="state dl-state">
        <div className="state-icon"><Check size={22} /></div>
        <div className="state-title">{t(projects.length > 1 ? "dl.ready.titleMany" : "dl.ready.title", { c: name })}</div>
        <p>{t("dl.ready.body")}</p>
        <div className="mono small muted">{[bytes ? mb(bytes) : "", n ? t("dl.ready.n", { n }) : "", st[0].built ?? ""].filter(Boolean).join(" · ")}</div>
        <div className="row-gap dl-actions"><RunButton label={runLabel} onClick={onRun} /></div>
      </div>
    );
  }
  if (failed) {
    const reason = failed.reason ?? "other";
    return (
      <div className="state left dl-state">
        <div className="state-icon bad"><TriangleAlert size={22} /></div>
        <div className="state-title">{failed.total ? t("dl.fail.at", { a: mb(failed.done), b: mb(failed.total) }) : t("dl.fail.title", { c: name })}</div>
        <div className="err-grid">
          <span className="eyebrow">{t("err.ws.what")}</span><p>{t(`dl.why.${reason}.what` as StringKey, { p: failed.project })}</p>
          <span className="eyebrow">{t("err.ws.why")}</span><p>{t(`dl.why.${reason}.why` as StringKey)}</p>
          <span className="eyebrow">{t("err.ws.todo")}</span><p>{t(reason === "disk" ? "dl.todo.disk" : failed.done ? "dl.todo.retry" : "dl.todo.retry0", { a: mb(failed.done) })}</p>
        </div>
        <div className="row-gap dl-actions"><button className="btn primary" onClick={() => a.download(projects)}><RotateCcw size={15} />{t("dl.retryNow")}</button></div>
        <div className="mono small muted">{t("err.ws.code", { c: `DL-${reason}` })}{failed.error ? ` · ${failed.error}` : ""}
          {" · "}<button className="link small" onClick={() => navigator.clipboard?.writeText(`DL-${reason} ${failed.project} ${failed.error ?? ""} ${(failed as { detail?: string }).detail ?? ""}`.trim())}>{t("dl.copy")}</button></div>
      </div>
    );
  }
  if (busyNow.length) {
    const now = busyNow[0];
    const pct = now.total ? Math.min(100, Math.round(((now.done ?? 0) / now.total) * 100)) : 0;
    const left = downloads.secondsLeft(now.project);
    const at = stepOf(now.file);
    const sizeLine = now.file === "convert" ? t("dl.preparing", { p: now.project })
      : now.total ? [`${mb(now.done)} / ${mb(now.total)}`, left != null ? t("dl.left", { s: left < 90 ? `${left} s` : `${Math.round(left / 60)} min` }) : ""].filter(Boolean).join(" · ") : mb(now.done);
    return (
      <div className="state dl-state">
        <div className="state-title">{t("dl.busy.title", { c: name })}</div>
        <div className="dl-bar"><div className="progress"><span style={{ width: `${Math.max(2, now.file === "convert" ? 100 : pct)}%` }} /></div>
          <div className="row-between mono small muted"><span>{projects.length > 1 ? `${now.project} · ` : ""}{now.file === "convert" ? "" : `${pct}%`}</span><span>{sizeLine}</span></div></div>
        <ul className="dl-steps">
          {STEPS.map((s, i) => <li key={s.key} className={i < at ? "done" : i === at ? "now" : ""}>
            {i < at ? <Check size={14} /> : i === at ? <Loader2 size={14} className="spin" /> : <span className="dot" />}{t(s.key as StringKey)}</li>)}
        </ul>
        <p className="small">{t("dl.busy.body")}</p>
        <button className="btn" onClick={() => downloads.cancel(projects)}>{t("dl.cancel")}</button>
      </div>
    );
  }
  const stopped = st.some((s) => s.cancelled);
  return (
    <div className="state dl-state">
      <div className="state-icon"><CloudDownload size={22} /></div>
      <div className="state-title">{t("dl.need.title", { c: name })}</div>
      <p>{t("dl.body")}</p>
      {stopped && <p className="small muted">{t("dl.stopped")}</p>}
      <div className="row-gap dl-actions"><button className="btn primary" onClick={() => a.download(projects)}><CloudDownload size={15} />{t(stopped ? "dl.resume" : "dl.start")}</button></div>
      <p className="small muted">{t("dl.where")}</p>
    </div>
  );
}

/** True while this screen's cohort is downloading: the run button waits (design page 15). */
export const WaitCtx = createContext(false);

export function OutOfDate({ onRun }: { onRun: () => void }) {
  const { t } = useT();
  return <div className="stale"><TriangleAlert size={15} /><span>{t("ws.stale")}</span><button className="btn sm" onClick={onRun}>{t("ws.runAgain")}</button></div>;
}

/** The run button: one line, full width, with its shortcut inside. A long name is cut with "…" and shown whole on hover. */
export function RunButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  const { t } = useT();
  const waiting = useContext(WaitCtx);
  return (
    <button className="btn primary run-btn" onClick={onClick} disabled={disabled || waiting} title={waiting ? t("dl.waiting") : `${label} (${runKeys})`} aria-keyshortcuts={isMac ? "Meta+Enter" : "Control+Enter"}>
      <span className="run-label">{label}</span>
      <kbd className="btn-kbd">{runKeys}</kbd>
    </button>
  );
}
