// The layout every analysis workspace shares: header, parameters, figure card, and the Explain / Reliability panel.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Copy, Download, NotebookPen, LayoutPanelLeft, Table2, Code2, ChevronDown, CircleHelp, ShieldCheck, Check, TriangleAlert, CircleX, Info, Loader2, RotateCcw, CloudDownload, Activity, WifiOff } from "lucide-react";
import { useT } from "../../i18n";
import type { StringKey } from "../../i18n/strings";
import { analyses, fmt, fmtP, type Analysis, type Check as CheckT } from "../../lib/analyses";
import { DataTableDialog, ReproduceDialog } from "./Tools";
import { copyPng, pngBytes, svgText } from "../../charts/figure";
import { pickExportPath } from "../../lib/files";
import { progress } from "../../lib/progress";
import { FigureViewer } from "../../charts/FigureViewer";
import { addToBoard } from "../../charts/board";

export const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
export const runKeys = isMac ? "⌘ Enter" : "Ctrl Enter";

export function useRunShortcut(run: () => void, enabled: boolean) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (enabled && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [run, enabled]);
}

export function Frame({ crumb, title, badges, params, figure, side, onLater, analysis, say }: {
  crumb: string; title: string; badges: ReactNode; params: ReactNode; figure: ReactNode; side: ReactNode; onLater: () => void;
  analysis?: Analysis | null; say?: (s: string) => void;
}) {
  const { t } = useT();
  const [repro, setRepro] = useState(false);
  const usable = !!analysis && !(analysis.result as { error?: string }).error;
  return (
    <div className="ws">
      <div className="ws-head">
        <div style={{ minWidth: 0 }}>
          <div className="crumb mono">{crumb}</div>
          <h1 className="page ws-title">{title}</h1>
          <div className="ws-badges">{badges}</div>
        </div>
        <div className="ws-actions">
          <button className="btn ghost" onClick={() => (usable ? setRepro(true) : say?.(t("repro.none")))} title={t("repro.tip")}>{t("ws.reproduce")}</button>
          <button className="btn" onClick={onLater} title={t("common.notYet")}>{t("ws.checkOther")}</button>
        </div>
      </div>
      <div className="ws-grid">
        <aside className="card ws-params">{params}</aside>
        <section className="card ws-fig">{figure}</section>
        <aside className="ws-side">{side}</aside>
      </div>
      {repro && analysis && <ReproduceDialog a={analysis} fileName={title} onClose={() => setRepro(false)} say={say ?? (() => {})} />}
    </div>
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
          <button className="btn primary sm" onClick={send}><NotebookPen size={15} />{t("fig.sendNotebook")}</button>
          <button className="tool" title={t("fig.board")} aria-label={t("fig.board")} onClick={toBoard}><LayoutPanelLeft size={16} /></button>
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
      <Loader2 size={26} className="spin" />
      <div className="state-title">{t("ws.running")}</div>
      <ul className="steps">{steps.map((s, k) => <li key={s} className={k < i ? "done" : k === i ? "now" : ""}>{k < i ? <Check size={13} /> : <span className="dotx" />}{s}</li>)}</ul>
      <p className="small muted">{t("ws.keepWorking")}</p>
    </div>
  );
}

export function ErrorState({ what, why, todo, code, actions }: { what: string; why: string; todo: string; code: string; actions: ReactNode }) {
  const { t } = useT();
  return (
    <div className="state left">
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

export function DownloadState({ project, state, onDownload }: { project: string; state?: { state: string; done?: number; total?: number; error?: string }; onDownload: () => void }) {
  const { t } = useT();
  const pct = state?.total ? Math.round(((state.done ?? 0) / state.total) * 100) : 0;
  return (
    <div className="state">
      <div className="state-icon"><CloudDownload size={22} /></div>
      <div className="state-title">{t("dl.title", { p: project })}</div>
      <p>{t("dl.body")}</p>
      {state?.state === "downloading" ? (
        <div style={{ width: 320 }}><div className="progress"><span style={{ width: `${pct}%` }} /></div><div className="small muted mono">{t("dl.progress", { pct, mb: Math.round((state.done ?? 0) / 1e6) })}</div></div>
      ) : (
        <>
          {state?.state === "failed" && <p className="warn-text">{t("dl.failed")}</p>}
          <button className="btn primary" onClick={onDownload}>{state?.state === "failed" ? <RotateCcw size={15} /> : <CloudDownload size={15} />}{state?.state === "failed" ? t("dl.retry") : t("dl.start")}</button>
        </>
      )}
    </div>
  );
}

export function OutOfDate({ onRun }: { onRun: () => void }) {
  const { t } = useT();
  return <div className="stale"><TriangleAlert size={15} /><span>{t("ws.stale")}</span><button className="btn sm" onClick={onRun}>{t("ws.runAgain")}</button></div>;
}
