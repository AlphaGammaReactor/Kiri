import { useEffect, useState } from "react";
import { Globe, ShieldCheck, Search, FolderOpen, Eye } from "lucide-react";
import { system, fmtBytes, type Storage } from "../lib/system";
import { isTauri } from "../lib/platform";
import { useT, type Lang } from "../i18n";
import type { Settings as S } from "../lib/settings";

export function Settings({ s, update, engineReady }: { s: S; update: (p: Partial<S>) => void; engineReady: boolean }) {
  const { t, lang } = useT();
  const [group, setGroup] = useState<"general" | "data" | "access" | "privacy">("general");
  const [store, setStore] = useState<Storage | null>(null);
  useEffect(() => { if (engineReady && group === "data") system.storage().then(setStore).catch(() => {}); }, [engineReady, group]);
  return (
    <div className="split">
      <div className="split-nav">
        <h1 className="page" style={{ marginBottom: 12 }}>{t("settings.title")}</h1>
        <label className="input" style={{ marginBottom: 10 }}><Search size={15} color="var(--color-text-muted)" /><input placeholder={t("settings.search")} /></label>
        <button className="nav-item" aria-current={group === "general" ? "page" : undefined} onClick={() => setGroup("general")}><Globe size={16} />{t("settings.general")}</button>
        <button className="nav-item" aria-current={group === "data" ? "page" : undefined} onClick={() => setGroup("data")}><FolderOpen size={16} />{t("set.data")}</button>
        <button className="nav-item" aria-current={group === "access" ? "page" : undefined} onClick={() => setGroup("access")}><Eye size={16} />{t("set.access")}</button>
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
        ) : group === "data" ? (
          <>
            <h2 className="panel-title">{t("set.data")}</h2>
            <Row title={t("set.data.folder")} help={t("set.data.folder.help")}>
              <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                <span className="mono small">{store?.data_dir ?? "…"}</span>
                {isTauri && <button className="btn sm" onClick={() => system.reveal().catch(() => {})}><FolderOpen size={14} />{t("set.data.reveal")}</button>}
              </div>
            </Row>
            <Row title={t("set.data.cohorts")} help={t("set.data.cohorts.help")}><span className="mono">{store ? fmtBytes(store.cohort_bytes) : "…"}</span></Row>
            <Row title={t("set.data.projects")} help={t("set.data.projects.help")}><span className="mono">{store ? fmtBytes(store.projects_bytes) : "…"}</span></Row>
            <Row title={t("set.data.free")} help=""><span className="mono">{store ? fmtBytes(store.free_bytes) : "…"}</span></Row>
          </>
        ) : group === "access" ? (
          <>
            <h2 className="panel-title">{t("set.access")}</h2>
            <Row title={t("set.access.text")} help={t("set.access.text.help")}>
              <div className="segmented wide">
                <button aria-pressed={s.textSize === "normal"} onClick={() => update({ textSize: "normal" })}>{t("set.access.normal")}</button>
                <button aria-pressed={s.textSize === "large"} onClick={() => update({ textSize: "large" })}>{t("set.access.large")}</button>
              </div>
            </Row>
            <Row title={t("set.access.motion")} help={t("set.access.motion.help")}>
              <label className="switch"><input type="checkbox" checked={s.reduceMotion} onChange={(e) => update({ reduceMotion: e.target.checked })} /><span /></label>
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
