import { Compass, Lock, Search } from "lucide-react";
import { useT } from "../i18n";
import type { StringKey } from "../i18n/strings";
import type { ProjectSummary } from "../lib/api";

const TPL: Record<string, StringKey> = {
  blank: "home.tpl.blank", one_gene: "np.tpl.one", two_gene: "home.tpl.two", own_table: "np.tpl.table", course: "home.tpl.course",
};

export function Overview({ p, notYet }: { p: ProjectSummary; notYet: () => void }) {
  const { t, lang } = useT();
  const pr = p.project;
  const created = new Date(p.manifest.created).toLocaleDateString(lang === "en" ? "en-GB" : "zh-CN", { day: "numeric", month: "long", year: "numeric" });
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
          <button className="btn" onClick={notYet}>{t("ov.summary")}</button>
          <button className="btn primary" onClick={notYet}>{t("ov.panel")}</button>
        </div>
      </div>

      <section className="left-off">
        <div className="row-between"><h2 className="card-title">{t("ov.left")}</h2></div>
        <div className="left-off-grid">
          <div><div className="eyebrow">{t("ov.lastResults")}</div><p>{t("ov.noResults")}</p></div>
          <div><div className="eyebrow">{t("ov.changed")}</div><p>{t("ov.created", { d: created })}</p></div>
          <div><div className="eyebrow">{t("ov.next")}</div><p>{t("ov.nextFirst")}</p></div>
        </div>
      </section>

      <div className="home-grid" style={{ gridTemplateColumns: "1fr 330px" }}>
        <section className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="row-between"><span className="eyebrow">{t("ov.analyses")}</span>
            <button className="btn ghost" style={{ height: 24, fontSize: 12.5 }} onClick={notYet}>{t("ov.newAnalysis")}</button></div>
          <div className="empty"><p>{t("ov.analyses.empty")}</p></div>
        </section>
        <div className="home-right">
          <section className="card">
            <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 500 }}><Compass size={16} color="var(--color-accent-text)" />{t("home.show.title")}</div>
            <label className="input" style={{ marginTop: 10 }}><Search size={15} color="var(--color-text-muted)" />
              <input placeholder={t("ov.askAbout", { g: pr.targets.join(lang === "en" ? " or " : "或") || "…" })} onKeyDown={(e) => e.key === "Enter" && notYet()} /></label>
          </section>
          <section className="card" style={{ flex: 1 }}>
            <span className="eyebrow">{t("ov.notebook")}</span>
            <p className="muted" style={{ fontSize: 13 }}>{t("ov.notebook.empty")}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
