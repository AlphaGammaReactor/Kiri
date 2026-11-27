// Notebook: the project's lab record. Kiri adds figures here; the person adds notes (page 17 of the design).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Image as ImageIcon, FileText, Pin, MoreHorizontal, ShieldCheck, TriangleAlert, NotebookPen, Trash2 } from "lucide-react";
import { useT } from "../i18n";
import type { StringKey } from "../i18n/strings";
import type { ProjectSummary } from "../lib/api";
import { analyses, type Note } from "../lib/analyses";
import { pickExportPath } from "../lib/files";
import { progress } from "../lib/progress";
import { Dialog } from "../shell/Dialog";
import { svgDataUrl } from "../charts/figure";
import { CHECK_TITLE, fmtVars, isMac } from "./workspace/Frame";

const tagsOf = (s: string) => [...new Set((s.match(/#[\p{L}\p{N}_-]+/gu) ?? []).map((x) => x.toLowerCase()))];
const dayKey = (ts: string) => ts.slice(0, 10);

export function Notebook({ p, say, onOpenAnalysis }: { p: ProjectSummary; say: (s: string) => void; onOpenAnalysis: (kind: string, gene?: string) => void; onLater: () => void }) {
  const { t, lang } = useT();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [q, setQ] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [kinds, setKinds] = useState<Record<string, boolean>>({ survival: true, expression: true, note: true });
  const [quick, setQuick] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const locale = lang === "en" ? "en-GB" : "zh-CN";

  const load = useCallback(() => analyses.notes().then(setNotes).catch(() => setNotes([])), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "n") { e.preventDefault(); setQuick(true); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);

  const kindOf = (n: Note) => n.kind === "text" ? "note" : n.body.kind === "survival" ? "survival" : "expression";
  const textOf = (n: Note) => [n.body.title, n.body.summary, n.body.caption, n.body.text, n.body.gene].filter(Boolean).join(" ");
  const all = notes ?? [];
  const days = useMemo(() => {
    const m = new Map<string, number>();
    all.forEach((n) => m.set(dayKey(n.created_at), (m.get(dayKey(n.created_at)) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [all]);
  const tags = useMemo(() => [...new Set(all.flatMap((n) => tagsOf(textOf(n))))], [all]);
  const counts = { survival: all.filter((n) => kindOf(n) === "survival").length, expression: all.filter((n) => kindOf(n) === "expression").length, note: all.filter((n) => kindOf(n) === "note").length };
  const shown = all.filter((n) => kinds[kindOf(n)] && (!day || dayKey(n.created_at) === day) && (!tag || tagsOf(textOf(n)).includes(tag))
    && (!q.trim() || textOf(n).toLowerCase().includes(q.trim().toLowerCase()))).slice().reverse();
  const groups = new Map<string, Note[]>();
  shown.forEach((n) => groups.set(dayKey(n.created_at), [...(groups.get(dayKey(n.created_at)) ?? []), n]));
  const pinned = all.filter((n) => n.pinned).length;
  const figNo = new Map(all.filter((n) => n.kind !== "text").map((n, i) => [n.id, i + 1]));
  const fmtDay = (d: string) => {
    const date = new Date(`${d}T12:00:00`);
    const today = new Date().toISOString().slice(0, 10) === d;
    const s = date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
    return today ? `${t("nb.today")} · ${s}` : s;
  };
  const fmtTime = (ts: string) => new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  const pin = async (n: Note) => { setMenu(null); await analyses.patchNote(n.id, { pinned: !n.pinned }).catch(() => say(t("fig.readOnly"))); load(); };
  const remove = async (n: Note) => { setMenu(null); await analyses.deleteNote(n.id).catch(() => say(t("fig.readOnly"))); load(); };

  return (
    <div className="nb">
      <div className="ws-head">
        <div>
          <div className="crumb mono">{p.project.name}</div>
          <h1 className="page ws-title">{t("nav.notebook")}</h1>
          <div className="sub" style={{ marginTop: 0 }}>{t("nb.sub")}</div>
        </div>
        <div className="ws-actions">
          <button className="btn ghost" onClick={() => setQuick(true)} disabled={p.read_only}>{t("nb.quick")} <span className="mono small">{isMac ? "⌘⇧N" : "Ctrl Shift N"}</span></button>
          <button className="btn primary" onClick={() => setExporting(true)} disabled={!all.length}>{t("nb.export")}</button>
        </div>
      </div>
      <div className="nb-grid">
        <aside className="card nb-filter">
          <div className="input"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("nb.search")} /></div>
          {days.length > 0 && <><div className="eyebrow">{t("nb.days")}</div>
            {days.map(([d, c]) => <button key={d} className={`nb-day ${day === d ? "on" : ""}`} onClick={() => setDay(day === d ? null : d)}><span>{fmtDay(d).split(" · ").pop()}</span><span className="mono muted">{c}</span></button>)}</>}
          {tags.length > 0 && <><div className="eyebrow">{t("nb.tags")}</div>
            <div className="row-gap">{tags.map((g) => <button key={g} className={`chip ${tag === g ? "on" : ""}`} onClick={() => setTag(tag === g ? null : g)}>{g}</button>)}</div></>}
          <div className="eyebrow">{t("nb.kinds")}</div>
          {(["survival", "expression", "note"] as const).map((k) => (
            <label key={k} className="nb-kind">
              <span className={`box ${kinds[k] ? "on" : ""}`}>{kinds[k] ? "✓" : ""}</span>
              <input type="checkbox" hidden checked={kinds[k]} onChange={() => setKinds((x) => ({ ...x, [k]: !x[k] }))} />
              <span style={{ flex: 1 }}>{t(`nb.kind.${k}` as StringKey)}</span><span className="mono muted">{counts[k]}</span>
            </label>
          ))}
          <div className="nb-pinned"><Pin size={13} />{t("nb.pinned", { n: pinned })}</div>
        </aside>
        <section className="nb-list">
          {notes && !all.length && (
            <div className="card state-card"><div className="state">
              <div className="state-icon"><NotebookPen size={22} /></div>
              <div className="state-title">{t("nb.empty.title")}</div>
              <p>{t("nb.empty.body")}</p>
              <div className="row-gap"><button className="btn primary" onClick={() => onOpenAnalysis("survival")}>{t("nb.empty.run")}</button><button className="btn" onClick={() => setQuick(true)} disabled={p.read_only}>{t("nb.quick")}</button></div>
            </div></div>
          )}
          {all.length > 0 && !shown.length && <div className="side-empty">{t("nb.noMatch")}</div>}
          {[...groups.entries()].map(([d, list]) => (
            <div key={d}>
              <div className="nb-dayhead"><span>{fmtDay(d)}</span><i /></div>
              {list.map((n) => (
                <article key={n.id} className="card nb-entry">
                  <header>
                    {n.kind === "text" ? <FileText size={16} /> : <ImageIcon size={16} />}
                    <b>{n.kind === "text" ? t("nb.note") : `${t("fig.label", { n: figNo.get(n.id) ?? 0 })} · ${n.body.title ?? ""}`}</b>
                    {n.kind !== "text" && <span className="badge ok sm">● {t(n.body.kind === "survival" ? "nav.survival" : "nav.expression")}</span>}
                    {n.changed_since && <span className="badge warn sm">● {t("nb.changed")}</span>}
                    <span className="grow" />
                    <span className="mono small muted">{fmtTime(n.created_at)}</span>
                    {n.pinned && <Pin size={14} className="accent" />}
                    <div style={{ position: "relative" }}>
                      <button className="icon-btn" aria-label={t("nb.more")} onClick={() => setMenu(menu === n.id ? null : n.id)}><MoreHorizontal size={16} /></button>
                      {menu === n.id && <div className="menu">
                        <button onClick={() => pin(n)}>{n.pinned ? t("nb.unpin") : t("nb.pin")}<Pin size={14} /></button>
                        <button onClick={() => remove(n)}>{t("nb.delete")}<Trash2 size={14} /></button>
                      </div>}
                    </div>
                  </header>
                  {n.changed_since && (
                    <div className="stale"><TriangleAlert size={15} /><span>{t("nb.changedBody")}</span>
                      <button className="btn sm" onClick={() => onOpenAnalysis(n.body.kind === "survival" || n.body.kind === "correlation" || n.body.kind === "de" || n.body.kind === "across" || n.body.kind === "immune" ? n.body.kind : "expression", n.body.gene)}>{t("nb.open")}</button></div>
                  )}
                  {n.kind === "text" ? <p className="nb-text">{n.body.text}</p> : (
                    <>
                      <div className="nb-fig">
                        {n.body.svg && <div className="nb-thumb"><img alt="" src={svgDataUrl(n.body.svg)} /></div>}
                        <div className="nb-body">
                          <p>{n.body.summary}</p>
                          {n.body.meta && <p className="mono small muted">{n.body.meta}</p>}
                          {tagsOf(textOf(n)).length > 0 && <div className="row-gap">{tagsOf(textOf(n)).map((g) => <span key={g} className="chip on">{g}</span>)}</div>}
                        </div>
                      </div>
                      {n.body.checks && <RelSummary checks={n.body.checks} />}
                    </>
                  )}
                </article>
              ))}
            </div>
          ))}
        </section>
      </div>
      {quick && <QuickNote onClose={() => setQuick(false)} onSaved={() => { setQuick(false); load(); }} />}
      {exporting && <ExportDialog title={p.project.name} count={all.length} onClose={() => setExporting(false)} say={say} />}
    </div>
  );
}

function RelSummary({ checks }: { checks: NonNullable<Note["body"]["checks"]> }) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  const n = (s: string) => checks.filter((c) => c.status === s).length;
  const shown = checks.filter((c) => c.status !== "info").slice(0, 4);
  return (
    <div className="nb-rel">
      <div className="row-between">
        <span className="nb-rel-head"><ShieldCheck size={15} />{t("nb.rel", { p: n("pass"), c: n("caution"), x: n("problem") })}</span>
        <button className="link" onClick={() => setOpen((v) => !v)}>{open ? t("nb.hide") : t("nb.show")}</button>
      </div>
      {open && <ul>{shown.map((c) => (
        <li key={c.check}><span className={`rel-dot ${c.status}`} /><b>{t(CHECK_TITLE[c.check] ?? "rel.t.data")}:</b> {t(`rel.${c.code}` as StringKey, fmtVars(c.vars))}</li>
      ))}</ul>}
    </div>
  );
}

function QuickNote({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const [text, setText] = useState("");
  const save = async () => { if (!text.trim()) return; await analyses.note("text", { text: text.trim() }).catch(() => {}); onSaved(); };
  return (
    <Dialog title={t("nb.quick")} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>{t("file.cancel")}</button><button className="btn primary" onClick={save} disabled={!text.trim()}>{t("file.save")}</button></>}>
      <textarea className="text area" autoFocus rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("nb.quick.placeholder")}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(); }} />
      <p className="help">{t("nb.quick.help")}</p>
    </Dialog>
  );
}

function ExportDialog({ title, count, onClose, say }: { title: string; count: number; onClose: () => void; say: (s: string) => void }) {
  const { t } = useT();
  const [format, setFormat] = useState<"pdf" | "html" | "docx">("docx");
  const [name, setName] = useState(title);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const path = await pickExportPath(t("nb.export.save"), name, format);
    if (!path) return;
    setBusy(true);
    try {
      const r = await analyses.exportReport({ path, format, title: name, labels: {
        question: t("nb.l.question"), reliability: t("ws.reliability"), note: t("nb.note"), generated: t("nb.l.generated"),
        pass: t("nb.l.pass"), caution: t("nb.l.caution"), problem: t("nb.l.problem"),
      } });
      say(t("nb.export.done", { p: r.path, n: r.entries }));
      if (format === "docx") progress.mark("word");
      onClose();
    } catch { say(t("fig.saveFailed")); } finally { setBusy(false); }
  };
  return (
    <Dialog title={t("nb.export.title")} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>{t("file.cancel")}</button><button className="btn primary" onClick={go} disabled={busy}>{t("nb.export.go")}</button></>}>
      <p>{t("nb.export.body", { n: count })}</p>
      <div className="fr-cards three">
        {([["docx", "nb.f.word", "nb.f.word.ready"], ["pdf", "nb.f.pdf", "nb.f.pdf.sub"], ["html", "nb.f.html", "nb.f.html.sub"]] as const).map(([v, l, s]) => (
          <button key={v} className={`option ${format === v ? "on" : ""}`} style={{ flexDirection: "column", alignItems: "flex-start" }} onClick={() => setFormat(v)}><b>{t(l)}</b><span className="small muted">{t(s)}</span></button>
        ))}
      </div>
      <label className="field"><span>{t("nb.export.name")}</span><input className="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
    </Dialog>
  );
}
