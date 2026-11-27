import { createContext, useContext, useEffect, useState } from "react";
import { Globe, ShieldCheck, Search, FolderOpen, Eye } from "lucide-react";
import { system, fmtBytes, type Storage } from "../lib/system";
import { isTauri } from "../lib/platform";
import { useT, type Lang } from "../i18n";
import type { Settings as S } from "../lib/settings";
import type { UpdateState } from "../lib/updater";
import { APP_VERSION } from "../lib/platform";
import { en, zh, type StringKey } from "../i18n/strings";

type Group = "general" | "data" | "access" | "privacy";
// Every setting by its title key, so search can find it in either language, by its title or its help.
const ROWS: Record<Group, StringKey[]> = {
  general: ["settings.uiLang", "settings.figLang", "settings.level"],
  data: ["set.data.folder", "set.data.cohorts", "set.data.projects", "set.data.free"],
  access: ["set.access.text", "set.access.motion"],
  privacy: ["set.upd.auto", "set.upd.version", "set.upd.after", "set.upd.sends"],
};
const GROUP_KEY: Record<Group, StringKey> = { general: "settings.general", data: "set.data", access: "set.access", privacy: "settings.privacy" };
const norm = (x: string) => x.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const ALSO: Partial<Record<StringKey, StringKey[]>> = { "set.upd.version": ["update.checkNow", "update.upToDate", "set.upd.auto"] };
const textOf = (k: StringKey) => {
  const ks = [k, `${k}.help`, `${k}.body`, ...(ALSO[k] ?? [])] as StringKey[];
  return norm(ks.flatMap((x) => [en[x], zh[x]]).filter(Boolean).join(" "));
};
export const matchSetting = (k: StringKey, q: string) => {
  const words = norm(q).trim().split(/\s+/).filter(Boolean);
  const hay = textOf(k);
  return words.every((w) => hay.includes(w));
};
const Query = createContext("");

export function Settings({ s, update, engineReady, updater, onCheck, onWhatsNew }: {
  s: S; update: (p: Partial<S>) => void; engineReady: boolean; updater?: UpdateState; onCheck?: () => void; onWhatsNew?: () => void;
}) {
  const { t, lang } = useT();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<Group>(new URLSearchParams(location.search).get("settings") === "privacy" ? "privacy" : "general");
  const [store, setStore] = useState<Storage | null>(null);
  const hits = q.trim() ? (Object.keys(ROWS) as Group[]).filter((g) => ROWS[g].some((k) => matchSetting(k, q)) || matchSetting(GROUP_KEY[g], q)) : null;
  const shown: Group[] = hits ?? [group];
  useEffect(() => { if (engineReady && shown.includes("data")) system.storage().then(setStore).catch(() => {}); }, [engineReady, shown.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="split">
      <div className="split-nav">
        <h1 className="page" style={{ marginBottom: 12 }}>{t("settings.title")}</h1>
        <label className="input" style={{ marginBottom: 10 }}><Search size={15} color="var(--color-text-muted)" /><input placeholder={t("settings.search")} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }} aria-label={t("settings.search")} /></label>
        <button className="nav-item" aria-current={!hits && group === "general" ? "page" : undefined} data-hit={hits?.includes("general") ? "" : undefined} onClick={() => { setQ(""); setGroup("general"); }}><Globe size={16} />{t("settings.general")}</button>
        <button className="nav-item" aria-current={!hits && group === "data" ? "page" : undefined} data-hit={hits?.includes("data") ? "" : undefined} onClick={() => { setQ(""); setGroup("data"); }}><FolderOpen size={16} />{t("set.data")}</button>
        <button className="nav-item" aria-current={!hits && group === "access" ? "page" : undefined} data-hit={hits?.includes("access") ? "" : undefined} onClick={() => { setQ(""); setGroup("access"); }}><Eye size={16} />{t("set.access")}</button>
        <button className="nav-item" aria-current={!hits && group === "privacy" ? "page" : undefined} data-hit={hits?.includes("privacy") ? "" : undefined} onClick={() => { setQ(""); setGroup("privacy"); }}><ShieldCheck size={16} />{t("settings.privacy")}</button>
      </div>
      <Query.Provider value={hits ? q : ""}>
      <div className="set-groups">
      {hits && hits.length === 0 && <section className="card panel"><p className="muted">{t("set.search.none", { q: q.trim() })}</p></section>}
      {shown.map((g) => <section key={g} className="card panel">
        {g === "general" ? (
          <>
            <div className="row-between"><h2 className="panel-title">{t("settings.general")}</h2>
              <button className="btn ghost" style={{ color: "var(--color-text-primary)" }} onClick={() => update({ lang: null, figureLang: "en", level: "learn" })}>{t("settings.reset")}</button></div>
            <Row k="settings.uiLang" title={t("settings.uiLang")} help={t("settings.uiLang.help")}>
              <div className="segmented wide">
                {(["en", "zh", "bi"] as Lang[]).map((l) => <button key={l} aria-pressed={lang === l} onClick={() => update({ lang: l })}>{t(`lang.${l}`)}</button>)}
              </div>
            </Row>
            <Row k="settings.figLang" title={t("settings.figLang")} help={t("settings.figLang.help")}>
              <div className="segmented wide">
                <button aria-pressed={s.figureLang === "en"} onClick={() => update({ figureLang: "en" })}>English</button>
                <button aria-pressed={s.figureLang === "zh"} onClick={() => update({ figureLang: "zh" })}>中文</button>
              </div>
            </Row>
            <Row k="settings.level" title={t("settings.level")} help={t("settings.level.help")}>
              <div className="segmented wide">
                <button aria-pressed={s.level === "learn"} onClick={() => update({ level: "learn" })}>{t("app.learn")}</button>
                <button aria-pressed={s.level === "expert"} onClick={() => update({ level: "expert" })}>{t("app.expert")}</button>
              </div>
            </Row>
          </>
        ) : g === "data" ? (
          <>
            <h2 className="panel-title">{t("set.data")}</h2>
            <Row k="set.data.folder" title={t("set.data.folder")} help={t("set.data.folder.help")}>
              <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                <span className="mono small">{store?.data_dir ?? "…"}</span>
                {isTauri && <button className="btn sm" onClick={() => system.reveal().catch(() => {})}><FolderOpen size={14} />{t("set.data.reveal")}</button>}
              </div>
            </Row>
            <Row k="set.data.cohorts" title={t("set.data.cohorts")} help={t("set.data.cohorts.help")}><span className="mono">{store ? fmtBytes(store.cohort_bytes) : "…"}</span></Row>
            <Row k="set.data.projects" title={t("set.data.projects")} help={t("set.data.projects.help")}><span className="mono">{store ? fmtBytes(store.projects_bytes) : "…"}</span></Row>
            <Row k="set.data.free" title={t("set.data.free")} help=""><span className="mono">{store ? fmtBytes(store.free_bytes) : "…"}</span></Row>
          </>
        ) : g === "access" ? (
          <>
            <h2 className="panel-title">{t("set.access")}</h2>
            <Row k="set.access.text" title={t("set.access.text")} help={t("set.access.text.help")}>
              <div className="segmented wide">
                <button aria-pressed={s.textSize === "normal"} onClick={() => update({ textSize: "normal" })}>{t("set.access.normal")}</button>
                <button aria-pressed={s.textSize === "large"} onClick={() => update({ textSize: "large" })}>{t("set.access.large")}</button>
              </div>
            </Row>
            <Row k="set.access.motion" title={t("set.access.motion")} help={t("set.access.motion.help")}>
              <label className="switch"><input type="checkbox" checked={s.reduceMotion} onChange={(e) => update({ reduceMotion: e.target.checked })} /><span /></label>
            </Row>
          </>
        ) : (
          <>
            <div className="row-between"><h2 className="panel-title">{t("settings.privacy")}</h2>
              <button className="btn ghost" style={{ color: "var(--color-text-primary)" }} onClick={() => update({ autoUpdate: true, whatsNew: true })}>{t("settings.reset")}</button></div>
            <Row k="set.upd.auto" title={t("set.upd.auto")} help={t("set.upd.auto.help")}>
              <span className="switch-row"><label className="switch"><input type="checkbox" checked={s.autoUpdate} onChange={(e) => update({ autoUpdate: e.target.checked })} /><span /></label>
                <span className="small">{s.autoUpdate ? t("set.upd.on") : t("set.upd.off")}</span></span>
            </Row>
            <Row k="set.upd.version" title={t("set.upd.version")} help="">
              <VersionBox u={updater} onCheck={onCheck} onWhatsNew={onWhatsNew} />
            </Row>
            <Row k="set.upd.after" title={t("set.upd.after")} help={t("set.upd.after.help")}>
              <span className="switch-row"><label className="switch"><input type="checkbox" checked={s.whatsNew} onChange={(e) => update({ whatsNew: e.target.checked })} /><span /></label>
                <span className="small">{s.whatsNew ? t("set.upd.on") : t("set.upd.off")}</span></span>
            </Row>
            <Only k="set.upd.sends"><div className="set-note"><ShieldCheck size={16} /><div><b>{t("set.upd.sends")}</b><p className="small">{t("set.upd.sends.body")}</p></div></div></Only>
          </>
        )}
      </section>)}
      </div>
      </Query.Provider>
    </div>
  );
}

const Only = ({ k, children }: { k: StringKey; children: React.ReactNode }) => {
  const q = useContext(Query);
  return q && !matchSetting(k, q) ? null : <>{children}</>;
};

const Row = ({ k, title, help, children }: { k?: StringKey; title: string; help: string; children: React.ReactNode }) => {
  const q = useContext(Query);
  if (q && k && !matchSetting(k, q)) return null;
  return <div className="setting-row">
    <div><div className="setting-title">{title}</div><div className="setting-help">{help}</div></div>
    {children}
  </div>;
};

function VersionBox({ u, onCheck, onWhatsNew }: { u?: UpdateState; onCheck?: () => void; onWhatsNew?: () => void }) {
  const { t, lang } = useT();
  const time = (d?: Date) => d ? d.toLocaleTimeString(lang === "en" ? "en-GB" : "zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
  let badge: React.ReactNode, line = "";
  switch (u?.kind) {
    case "checking": badge = <span className="badge">{t("update.checking")}</span>; break;
    case "downloading": badge = <span className="badge">{t("update.downloading", { p: u.percent == null ? "" : `${u.percent}%` })}</span>; break;
    case "ready": case "installing": badge = <span className="badge warn">● {t("update.available", { v: u.version })}</span>; break;
    case "error":
      badge = <span className="badge warn" title={u.message}>● {u.reason === "signature" ? t("upd.sigShort") : u.reason === "download" ? t("upd.dl.failed") : t("upd.offline")}</span>;
      line = u.reason === "offline" || u.reason === "other" ? t("upd.offlineSub") : t("set.upd.checked", { t: time(u.checkedAt) });
      break;
    case "idle": badge = u.checkedAt ? <span className="badge ok">● {t("update.upToDate")}</span> : <span className="badge">{t("update.notChecked")}</span>;
      line = u.checkedAt ? t("set.upd.checked", { t: time(u.checkedAt) }) : ""; break;
    default: badge = <span className="badge">{t("update.devBuild")}</span>;
  }
  return (
    <div className="set-version">
      <div className="row-gap"><b>Kiri {APP_VERSION}</b>{badge}</div>
      {line && <div className="mono small muted">{line}</div>}
      <div className="row-gap">
        <button className="btn" disabled={!onCheck || u?.kind === "unsupported" || u?.kind === "checking" || u?.kind === "downloading"} onClick={onCheck}>{t("update.checkNow")}</button>
        {onWhatsNew && <button className="link" onClick={onWhatsNew}>{u?.kind === "ready" ? t("set.upd.whatsNewIn", { v: u.version }) : t("set.upd.whatsNewIn", { v: APP_VERSION })}</button>}
      </div>
    </div>
  );
}
