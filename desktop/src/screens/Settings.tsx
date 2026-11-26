import { useState } from "react";
import { Globe, ShieldCheck, Search } from "lucide-react";
import { useT, type Lang } from "../i18n";
import type { Settings as S } from "../lib/settings";

export function Settings({ s, update }: { s: S; update: (p: Partial<S>) => void }) {
  const { t, lang } = useT();
  const [group, setGroup] = useState<"general" | "privacy">("general");
  return (
    <div className="split">
      <div className="split-nav">
        <h1 className="page" style={{ marginBottom: 12 }}>{t("settings.title")}</h1>
        <label className="input" style={{ marginBottom: 10 }}><Search size={15} color="var(--color-text-muted)" /><input placeholder={t("settings.search")} /></label>
        <button className="nav-item" aria-current={group === "general" ? "page" : undefined} onClick={() => setGroup("general")}><Globe size={16} />{t("settings.general")}</button>
        <button className="nav-item" aria-current={group === "privacy" ? "page" : undefined} onClick={() => setGroup("privacy")}><ShieldCheck size={16} />{t("settings.privacy")}</button>
      </div>
      <section className="card panel">
        {group === "general" ? (
          <>
            <div className="row-between"><h2 className="panel-title">{t("settings.general")}</h2>
              <button className="btn ghost" style={{ color: "var(--color-text-primary)" }} onClick={() => update({ lang: null, figureLang: "en", level: "learn" })}>{t("settings.reset")}</button></div>
            <Row title={t("settings.uiLang")} help={t("settings.uiLang.help")}>
              <div className="segmented wide">
                {(["en", "zh", "bi"] as Lang[]).map((l) => <button key={l} aria-pressed={lang === l} onClick={() => update({ lang: l })}>{t(`lang.${l}`)}</button>)}
              </div>
            </Row>
            <Row title={t("settings.figLang")} help={t("settings.figLang.help")}>
              <div className="segmented wide">
                <button aria-pressed={s.figureLang === "en"} onClick={() => update({ figureLang: "en" })}>English</button>
                <button aria-pressed={s.figureLang === "zh"} onClick={() => update({ figureLang: "zh" })}>中文</button>
              </div>
            </Row>
            <Row title={t("settings.level")} help={t("settings.level.help")}>
              <div className="segmented wide">
                <button aria-pressed={s.level === "learn"} onClick={() => update({ level: "learn" })}>{t("app.learn")}</button>
                <button aria-pressed={s.level === "expert"} onClick={() => update({ level: "expert" })}>{t("app.expert")}</button>
              </div>
            </Row>
          </>
        ) : (
          <>
            <h2 className="panel-title">{t("settings.privacy")}</h2>
            <Row title={t("settings.autoUpdate")} help={t("settings.autoUpdate.help")}>
              <label className="switch"><input type="checkbox" checked={s.autoUpdate} onChange={(e) => update({ autoUpdate: e.target.checked })} /><span /></label>
            </Row>
            <Row title={t("settings.telemetry")} help={t("settings.telemetry.help")}><span /></Row>
          </>
        )}
      </section>
    </div>
  );
}

const Row = ({ title, help, children }: { title: string; help: string; children: React.ReactNode }) => (
  <div className="setting-row">
    <div><div className="setting-title">{title}</div><div className="setting-help">{help}</div></div>
    {children}
  </div>
);
