import type React from "react";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useT } from "../i18n";
import { APP_VERSION } from "../lib/platform";
import type { UpdateState } from "../lib/updater";
import type { EngineState } from "../lib/engine";

export function About({ update, onCheck, engine }: { update: UpdateState; onCheck: () => void; engine: EngineState }) {
  const { t, lang } = useT();
  const [tab, setTab] = useState<"about" | "licences">("about");
  const [copied, setCopied] = useState(false);
  const cite = t("about.citeText", { v: APP_VERSION });
  const fmt = (d?: Date) => d ? d.toLocaleTimeString(lang === "en" ? "en-GB" : "zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
  let badge: React.JSX.Element;
  switch (update.kind) {
    case "checking": badge = <span className="badge">{t("update.checking")}</span>; break;
    case "downloading": badge = <span className="badge">{t("update.downloading", { p: update.percent == null ? "" : update.percent + "%" })}</span>; break;
    case "ready": case "installing": badge = <span className="badge warn">● {t("update.available", { v: update.version })}</span>; break;
    case "error": badge = <span className="badge warn" title={update.message}>● {t("update.error")}</span>; break;
    case "unsupported": badge = <span className="badge">{t("update.devBuild")}</span>; break;
    default: badge = update.checkedAt ? <span className="badge ok">● {t("update.upToDate")}</span> : <span className="badge">{t("update.notChecked")}</span>;
  }
  const checkedAt = update.kind === "idle" ? update.checkedAt : update.kind === "error" ? update.checkedAt : undefined;
  return (
    <div className="split">
      <div className="split-nav" style={{ paddingTop: 0 }}>
        <button className="nav-item" aria-current={tab === "about" ? "page" : undefined} onClick={() => setTab("about")}>{t("about.nav.about")}</button>
        <button className="nav-item" aria-current={tab === "licences" ? "page" : undefined} onClick={() => setTab("licences")}>{t("about.nav.licences")}</button>
      </div>
      <section className="card panel">
        {tab === "about" ? (
          <>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div className="app-mark">K</div>
              <div style={{ flex: 1 }}>
                <div style={{ font: "400 26px var(--font-display)" }} data-testid="about-version">Kiri {APP_VERSION}</div>
                <div className="sub">{t("about.tagline")}</div>
              </div>
              <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
                {badge}
                <span className="mono muted" style={{ fontSize: 11.5 }}>
                  {checkedAt ? t("update.checkedAt", { t: fmt(checkedAt) }) : ""}
                  {update.kind !== "unsupported" && <button className="btn ghost" style={{ height: 22, fontSize: 12 }} onClick={onCheck}>{t("update.checkNow")}</button>}
                </span>
              </div>
            </div>
            <div className="eyebrow" style={{ marginTop: 22 }}>{t("about.cite")}</div>
            <div className="cite">
              <span className="mono">{cite}</span>
              <button className="icon-btn" aria-label={t("about.copy")} onClick={() => { navigator.clipboard?.writeText(cite); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
            <div className="eyebrow" style={{ marginTop: 22 }}>{t("about.engine")}</div>
            <div className="kv"><span>{engine.status === "ready" ? `Python engine ${engine.version} · 127.0.0.1:${engine.port}` : engine.status === "failed" ? `${t("engine.failed")} (${engine.message})` : t("engine.starting")}</span></div>
          </>
        ) : (
          <>
            <h2 className="panel-title">{t("about.nav.licences")}</h2>
            <p style={{ maxWidth: 640, color: "var(--color-text-secondary)" }}>{t("about.licences.body")}</p>
          </>
        )}
      </section>
    </div>
  );
}
