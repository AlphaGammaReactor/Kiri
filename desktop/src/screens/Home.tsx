import type React from "react";
import { Check, Compass, Search, Folder, FileText, Activity, Table2, BookOpen, Play, TriangleAlert, MoreHorizontal } from "lucide-react";
import type { RecentItem, TemplateId } from "../lib/api";
import { useT } from "../i18n";
import type { StringKey } from "../i18n/strings";

export type HomeActions = {
  notYet: () => void; onOpenFile: () => void; onNew: (tpl?: TemplateId) => void; onSample: () => void;
  onOpenRecent: (path: string) => void; onLocate: (item: RecentItem) => void; onForget: (path: string) => void;
  onGuide: (query?: string, id?: GuideId) => void; progress: string[];
};
type GuideId = "tn" | "stage" | "survival" | "correlation" | "across" | "pathways" | "bench";
const CHIP_GUIDE: GuideId[] = ["tn", "survival", "correlation", "across", "pathways", "bench"];
const CHECK_KEY = ["run", "save", "reliable", "word", "version", "glossary"];

export function Home({ recent, a }: { recent: RecentItem[]; a: HomeActions }) {
  const { t, lang } = useT();
  const notYet = a.notYet;
  const when = (iso: string) => {
    const d = new Date(iso), now = new Date();
    const loc = lang === "en" ? "en-GB" : "zh-CN";
    if (d.toDateString() === now.toDateString()) return t("home.today", { t: d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }) });
    if (new Date(now.getTime() - 864e5).toDateString() === d.toDateString()) return t("home.yesterday");
    return d.toLocaleDateString(loc, { day: "numeric", month: "short" });
  };
  const done = CHECK_KEY.filter((k) => a.progress.includes(k)).length;
  const qs: StringKey[] = ["home.show.q1", "home.show.q2", "home.show.q3", "home.show.q4", "home.show.q5", "home.show.q6"];
  const checks: StringKey[] = ["home.check.run", "home.check.save", "home.check.reliable", "home.check.word", "home.check.version", "home.check.glossary"];
  const tuts: [StringKey, number][] = [["home.tut.1", 8], ["home.tut.2", 6], ["home.tut.3", 7], ["home.tut.4", 9], ["home.tut.5", 10], ["home.tut.6", 8]];
  const tpls: [StringKey, StringKey, React.JSX.Element, TemplateId][] = [
    ["home.tpl.blank", "home.tpl.blank.sub", <FileText size={16} />, "blank"],
    ["home.tpl.one", "home.tpl.one.sub", <Search size={16} />, "one_gene"],
    ["home.tpl.two", "home.tpl.two.sub", <Activity size={16} />, "two_gene"],
    ["home.tpl.table", "home.tpl.table.sub", <Table2 size={16} />, "own_table"],
    ["home.tpl.course", "home.tpl.course.sub", <BookOpen size={16} />, "course"],
  ];
  return (
    <div className="home">
      <div className="home-head">
        <div>
          <h1 className="page">{t("home.title")}</h1>
          <div className="sub">{recent.length ? t("home.subReturning") : t("home.subEmpty")}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn ghost" onClick={a.onSample}>{t("home.samples")}</button>
          <button className="btn" onClick={a.onOpenFile}>{t("home.open")}</button>
          <button className="btn primary" onClick={() => a.onNew()}>{t("home.new")}</button>
        </div>
      </div>
      <div className="home-grid">
        <div className="home-left">
          <section className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Compass size={18} color="var(--color-accent-text)" />
              <h2 className="card-title">{t("home.show.title")}</h2>
              <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => a.onGuide()}>{t("home.show.guide")}</button>
            </div>
            <label className="input" style={{ marginTop: 12 }}>
              <Search size={15} color="var(--color-text-muted)" />
              <input placeholder={t("guide.homePlaceholder")} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) a.onGuide((e.target as HTMLInputElement).value); }} />
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {qs.map((q, i) => <button key={q} className="chip" onClick={() => a.onGuide(undefined, CHIP_GUIDE[i])}>{t(q)}</button>)}
            </div>
          </section>
          <section className="card recent">
            <div className="row-between">
              <span className="eyebrow">{t("home.recent")}</span>
              <span className="muted" style={{ fontSize: 11.5 }}>{t("home.dragHint")}</span>
            </div>
            {recent.length === 0 ? (
            <div className="empty">
              <Folder size={26} strokeWidth={1.5} color="var(--color-text-secondary)" />
              <div className="empty-title">{t("home.empty.title")}</div>
              <p>{t("home.empty.body")}</p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button className="btn primary" onClick={a.onSample}>{t("home.empty.sample")}</button>
                <button className="btn" onClick={() => a.onNew("one_gene")}>{t("home.empty.gene")}</button>
              </div>
            </div>
            ) : (
              <ul className="recent-list">
                {recent.map((r) => r.exists ? (
                  <li key={r.path}>
                    <button className="recent-row" onClick={() => a.onOpenRecent(r.path)}>
                      <span className="file-icon"><FileText size={17} /></span>
                      <span className="recent-text"><b>{r.name}.kiri</b><span className="mono path">{r.path}</span></span>
                      {r.review ? <span className="badge">● {t("home.badge.review")}</span> : r.template === "course" ? <span className="badge ok">● {t("home.badge.course")}</span> : null}
                      <span className="mono muted when">{when(r.opened_at)}</span>
                      <span className="icon-btn" role="button" aria-label={t("home.remove")} title={t("home.remove")} onClick={(e) => { e.stopPropagation(); a.onForget(r.path); }}><MoreHorizontal size={16} /></span>
                    </button>
                  </li>
                ) : (
                  <li key={r.path} className="recent-missing">
                    <span className="file-icon warn"><TriangleAlert size={17} /></span>
                    <span className="recent-text"><b>{r.name}.kiri</b><span className="warn-text">{t("home.missing", { p: r.path })}</span></span>
                    <button className="btn" onClick={() => a.onLocate(r)}>{t("home.locate")}</button>
                    <button className="btn ghost muted-link" onClick={() => a.onForget(r.path)}>{t("home.remove")}</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div>
            <div className="eyebrow" style={{ margin: "4px 0 8px" }}>{t("home.templates")}</div>
            <div className="templates">
              {tpls.map(([k, sub, icon, id]) => (
                <button key={k} className="tpl" onClick={() => a.onNew(id)}>
                  <span style={{ color: "var(--color-accent-text)" }}>{icon}</span>
                  <b>{t(k)}</b>
                  <span className="muted">{t(sub)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <aside className="home-right">
          <section className="card">
            <div className="row-between"><span className="eyebrow">{t("home.getting")}</span><span className="mono muted">{done} / 6</span></div>
            <div className="progress"><span style={{ width: `${Math.max(2, (done / 6) * 100)}%` }} /></div>
            <ul className="checklist">
              {checks.map((c, i) => <li key={c} className={a.progress.includes(CHECK_KEY[i]) ? "done" : ""}><span className="box">{a.progress.includes(CHECK_KEY[i]) && <Check size={11} strokeWidth={3} />}</span>{t(c)}</li>)}
            </ul>
          </section>
          <section className="card" style={{ flex: 1 }}>
            <span className="eyebrow">{t("home.tutorials")}</span>
            <ul className="tuts">
              {tuts.map(([k, m]) => (
                <li key={k}><button onClick={notYet}><Play size={13} fill="currentColor" color="var(--color-accent-text)" /> <span>{t(k)}</span> <span className="mono muted">{m} {t("common.min")}</span></button></li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
