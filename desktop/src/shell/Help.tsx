// Activity panel, help menu, keyboard shortcuts and "Report a problem" (design pages 18 and 19).
import { useEffect, useState } from "react";
import { BookOpen, Check, CircleAlert, CloudDownload, Info, Keyboard, LifeBuoy, LoaderCircle, RefreshCw } from "lucide-react";
import { useT } from "../i18n";
import { Dialog } from "./Dialog";
import { busy, useJobs } from "../lib/busy";
import { system, fmtBytes, type Storage } from "../lib/system";
import type { UpdateState } from "../lib/updater";
import { isMac } from "../screens/workspace/Frame";
import { pickExportPath } from "../lib/files";
import { analyses } from "../lib/analyses";
import { APP_VERSION } from "../lib/platform";

export function ActivityPanel({ onClose, update, onRestart, onRetryUpdate, engineReady }: { onClose: () => void; update: UpdateState; onRestart: () => void; onRetryUpdate?: () => void; engineReady: boolean }) {
  const { t, lang } = useT();
  const jobs = useJobs();
  const [store, setStore] = useState<Storage | null>(null);
  useEffect(() => {
    if (!engineReady) return;
    const load = () => system.storage().then(setStore).catch(() => {});
    load();
    const id = setInterval(load, 1500);
    return () => clearInterval(id);
  }, [engineReady]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const downloads = (store?.cohorts ?? []).filter((c) => c.state === "downloading" || c.state === "failed");
  const running = jobs.filter((j) => j.state === "running");
  const finished = jobs.filter((j) => j.state !== "running");
  const time = (ms?: number) => ms ? new Date(ms).toLocaleTimeString(lang === "en" ? "en-GB" : "zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
  const upd = update.kind === "downloading" || update.kind === "ready" || update.kind === "installing";
  return (
    <div className="act" role="dialog" aria-label={t("app.activity")}>
      <div className="row-between act-head"><h2 className="dialog-title" style={{ fontSize: 20 }}>{t("app.activity")}</h2>
        {finished.length > 0 && <button className="btn ghost sm" onClick={busy.clearFinished}>{t("act.clear")}</button>}</div>
      <div className="eyebrow">{t("act.running")}</div>
      {running.length + downloads.filter((d) => d.state === "downloading").length === 0 && !upd && <div className="act-empty small muted">{t("act.nothing")}</div>}
      {running.map((j) => (
        <div key={j.id} className="act-item"><span className="act-ic"><LoaderCircle size={16} className="spin" /></span><div className="grow"><b>{j.label}</b><div className="small muted">{t("act.since", { t: time(j.started) })}</div></div></div>
      ))}
      {downloads.map((d) => {
        const pct = d.total ? Math.round(((d.done ?? 0) / d.total) * 100) : 0;
        return d.state === "downloading" ? (
          <div key={d.project} className="act-item"><span className="act-ic"><CloudDownload size={16} /></span><div className="grow"><b>{t("act.downloading", { p: d.project })}</b>
            <div className="small muted">{fmtBytes(d.done ?? 0)}{d.total ? ` / ${fmtBytes(d.total)}` : ""}</div><div className="progress"><span style={{ width: `${pct}%` }} /></div></div></div>
        ) : (
          <div key={d.project} className="act-item"><span className="act-ic bad"><CircleAlert size={16} /></span><div className="grow"><b>{t("act.dlFailed", { p: d.project })}</b><div className="small muted">{t("act.dlFailed.sub")}</div></div>
            <button className="btn sm" onClick={() => analyses.download(d.project).catch(() => {})}>{t("dl.retry")}</button></div>
        );
      })}
      {upd && (
        <div className="act-item"><span className="act-ic"><RefreshCw size={16} /></span><div className="grow"><b>{update.kind === "downloading" ? t("update.downloading", { p: update.percent == null ? "" : `${update.percent}%` }) : t("update.available", { v: (update as { version: string }).version })}</b>
          <div className="small muted">{update.kind === "ready" ? t("act.update.sub") : ""}</div></div>
          {update.kind === "ready" && <button className="btn sm" onClick={onRestart}>{t("update.restart")}</button>}</div>
      )}
      {update.kind === "error" && update.reason !== "offline" && update.reason !== "other" && (
        <div className="act-item"><span className="act-ic bad"><CircleAlert size={16} /></span><div className="grow">
          <b>{update.reason === "signature" ? t("upd.sigShort") : t("upd.dl.failed")}</b>
          <div className="small muted">{update.reason === "signature" ? t("upd.sig.body", { v: APP_VERSION }) : t("upd.dl.failedSub")}</div></div>
          {update.reason === "download" && onRetryUpdate && <button className="btn sm" onClick={onRetryUpdate}>{t("upd.dl.retry")}</button>}</div>
      )}
      {finished.length > 0 && <div className="eyebrow" style={{ marginTop: 10 }}>{t("act.finished")}</div>}
      {finished.map((j) => (
        <div key={j.id} className="act-item"><span className={`act-ic ${j.state === "failed" ? "bad" : "ok"}`}>{j.state === "failed" ? <CircleAlert size={16} /> : <Check size={16} />}</span>
          <div className="grow"><b>{j.label}</b><div className="small muted">{j.state === "failed" ? t("act.failedAt", { t: time(j.ended), c: j.code ?? "" }) : t("act.doneAt", { t: time(j.ended), s: (((j.ended ?? 0) - j.started) / 1000).toFixed(1) })}</div></div></div>
      ))}
    </div>
  );
}

export function HelpMenu({ onClose, go }: { onClose: () => void; go: (k: "glossary" | "shortcuts" | "report" | "about") => void }) {
  const { t } = useT();
  const pick = (k: "glossary" | "shortcuts" | "report" | "about") => () => { onClose(); go(k); };
  return (
    <div className="menu help-menu" role="menu" onMouseLeave={onClose}>
      <button role="menuitem" onClick={pick("glossary")}>{t("gl.title")}<BookOpen size={14} /></button>
      <button role="menuitem" onClick={pick("shortcuts")}>{t("help.shortcuts")}<Keyboard size={14} /></button>
      <button role="menuitem" onClick={pick("report")}>{t("help.report")}<LifeBuoy size={14} /></button>
      <button role="menuitem" onClick={pick("about")}>{t("about.title")}<Info size={14} /></button>
    </div>
  );
}

const MOD = isMac ? "⌘" : "Ctrl";
const SHIFT = isMac ? "⇧" : "Shift";
export function Shortcuts({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const rows: [string, string[]][] = [
    ["sc.search", [MOD, "K"]], ["sc.run", [MOD, isMac ? "↩" : "Enter"]], ["sc.quick", [MOD, SHIFT, "N"]],
    ["sc.help", ["F1"]], ["sc.help", ["?"]], ["sc.close", ["Esc"]], ["sc.move", ["↑", "↓"]],
  ];
  return (
    <Dialog title={t("help.shortcuts")} onClose={onClose} width={520}>
      <table className="tbl sc">
        <tbody>{rows.map(([k, keys], i) => <tr key={i}><td>{t(k as never)}</td><td style={{ textAlign: "right" }}>{keys.map((x) => <kbd key={x} className="kbd" style={{ marginLeft: 4 }}>{x}</kbd>)}</td></tr>)}</tbody>
      </table>
      <p className="small">{t("sc.note")}</p>
    </Dialog>
  );
}

export function ReportProblem({ onClose, screen, level, say }: { onClose: () => void; screen: string; level: string; say: (s: string) => void }) {
  const { t, lang } = useT();
  const [text, setText] = useState("");
  const [diag, setDiag] = useState("");
  const info = { text, lang, level, screen, error: busy.lastError, app: APP_VERSION };
  useEffect(() => { system.reportPreview(info).then((r) => setDiag(r.diagnostics)).catch(() => setDiag("")); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const full = `${text.trim()}\n\n${diag}\n`;
  const open = async () => { await system.reportOpen(info).then(() => { say(t("rep.opened")); onClose(); }).catch(() => say(t("rep.failed"))); };
  const save = async () => {
    const path = await pickExportPath(t("rep.save"), "kiri-problem-report", "txt");
    if (!path) return;
    await analyses.exportFile(path, new TextEncoder().encode(full)).then(() => say(t("fig.saved", { p: path }))).catch(() => say(t("fig.saveFailed")));
  };
  return (
    <Dialog title={t("help.report")} onClose={onClose} width={760} footer={<>
      <button className="btn ghost" style={{ marginRight: "auto" }} onClick={() => { navigator.clipboard?.writeText(full); say(t("rep.copied")); }}>{t("rep.copy")}</button>
      <button className="btn ghost" onClick={save}>{t("rep.saveTxt")}</button>
      <button className="btn ghost" onClick={onClose}>{t("file.cancel")}</button>
      <button className="btn primary" onClick={open} disabled={!text.trim()}>{t("rep.open")}</button>
    </>}>
      <p>{t("rep.sub")}</p>
      <div className="rep-grid">
        <label className="field"><span>{t("rep.what")}</span>
          <textarea className="text area" autoFocus rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("rep.placeholder")} /></label>
        <div className="field"><span>{t("rep.sent")}</span>
          <pre className="rep-pre mono">{text.trim() ? `${text.trim()}\n\n` : ""}{diag || "…"}</pre>
          <span className="small">{t("rep.never")}</span></div>
      </div>
    </Dialog>
  );
}
