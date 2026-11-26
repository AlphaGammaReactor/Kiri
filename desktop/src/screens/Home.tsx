import type React from "react";
import { Compass, Search, Folder, FileText, Activity, Table2, BookOpen, Play } from "lucide-react";
import { useT } from "../i18n";
import type { StringKey } from "../i18n/strings";

export function Home({ notYet }: { notYet: () => void }) {
  const { t } = useT();
  const qs: StringKey[] = ["home.show.q1", "home.show.q2", "home.show.q3", "home.show.q4", "home.show.q5", "home.show.q6"];
  const checks: StringKey[] = ["home.check.run", "home.check.save", "home.check.reliable", "home.check.word", "home.check.version", "home.check.glossary"];
  const tuts: [StringKey, number][] = [["home.tut.1", 8], ["home.tut.2", 6], ["home.tut.3", 7], ["home.tut.4", 9], ["home.tut.5", 10], ["home.tut.6", 8]];
  const tpls: [StringKey, StringKey, React.JSX.Element][] = [
    ["home.tpl.blank", "home.tpl.blank.sub", <FileText size={16} />],
    ["home.tpl.one", "home.tpl.one.sub", <Search size={16} />],
    ["home.tpl.two", "home.tpl.two.sub", <Activity size={16} />],
    ["home.tpl.table", "home.tpl.table.sub", <Table2 size={16} />],
    ["home.tpl.course", "home.tpl.course.sub", <BookOpen size={16} />],
  ];
  return (
    <div className="home">
      <div className="home-head">
        <div>
          <h1 className="page">{t("home.title")}</h1>
          <div className="sub">{t("home.subEmpty")}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={notYet}>{t("home.open")}</button>
          <button className="btn primary" onClick={notYet}>{t("home.new")}</button>
        </div>
      </div>
      <div className="home-grid">
        <div className="home-left">
          <section className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Compass size={18} color="var(--color-accent-text)" />
              <h2 className="card-title">{t("home.show.title")}</h2>
              <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={notYet}>{t("home.show.guide")}</button>
            </div>
            <label className="input" style={{ marginTop: 12 }}>
              <Search size={15} color="var(--color-text-muted)" />
              <input placeholder={t("home.show.placeholder")} onKeyDown={(e) => e.key === "Enter" && notYet()} />
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {qs.map((q) => <button key={q} className="chip" onClick={notYet}>{t(q)}</button>)}
            </div>
          </section>
          <section className="card recent">
            <div className="row-between">
              <span className="eyebrow">{t("home.recent")}</span>
              <span className="muted" style={{ fontSize: 11.5 }}>{t("home.dragHint")}</span>
            </div>
            <div className="empty">
              <Folder size={26} strokeWidth={1.5} color="var(--color-text-secondary)" />
              <div className="empty-title">{t("home.empty.title")}</div>
              <p>{t("home.empty.body")}</p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button className="btn primary" onClick={notYet}>{t("home.empty.sample")}</button>
                <button className="btn" onClick={notYet}>{t("home.empty.gene")}</button>
              </div>
            </div>
          </section>
          <div>
            <div className="eyebrow" style={{ margin: "4px 0 8px" }}>{t("home.templates")}</div>
            <div className="templates">
              {tpls.map(([a, b, icon]) => (
                <button key={a} className="tpl" onClick={notYet}>
                  <span style={{ color: "var(--color-accent-text)" }}>{icon}</span>
                  <b>{t(a)}</b>
                  <span className="muted">{t(b)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <aside className="home-right">
          <section className="card">
            <div className="row-between"><span className="eyebrow">{t("home.getting")}</span><span className="mono muted">0 / 6</span></div>
            <div className="progress"><span style={{ width: "2%" }} /></div>
            <ul className="checklist">
              {checks.map((c) => <li key={c}><span className="box" />{t(c)}</li>)}
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
