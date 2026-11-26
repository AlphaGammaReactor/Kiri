import type React from "react";
import { useState } from "react";
import { BookOpen, Check, Compass, FileText, FlaskConical, Globe, Image, Info, Play, Search, Upload } from "lucide-react";
import { useT, type Lang } from "../i18n";
import type { Settings } from "../lib/settings";

type Door = "sample" | "gene" | "file" | "own" | "home";

export function FirstRun({ s, update, onDone, systemLang }: {
  s: Settings; update: (p: Partial<Settings>) => void; onDone: (door: Door) => void; systemLang: Lang;
}) {
  const { t } = useT();
  const [step, setStep] = useState(0);
  const lang: Lang = s.lang ?? systemLang;
  const finish = (door: Door) => { update({ firstRunDone: true, lang }); onDone(door); };
  const steps = [t("fr.step.lang"), t("fr.step.about"), t("fr.step.start")];
  const detected = (navigator.languages?.[0] || navigator.language || "en");

  return (
    <div className="fr">
      <ol className="stepper">
        {steps.map((label, i) => (
          <li key={i} className={i < step ? "done" : i === step ? "now" : ""}>
            <span className="n">{i < step ? <Check size={13} strokeWidth={3} /> : i + 1}</span>{label}
            {i < steps.length - 1 && <span className="line" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="fr-body">
          <h1 className="fr-title">{t("fr.lang.title")}</h1>
          <p className="fr-sub">{t("fr.lang.sub")}</p>
          <div className="fr-cards three">
            <LangCard on={lang === "zh"} onClick={() => update({ lang: "zh" })} title="中文" sub={t("fr.lang.zh.sub")} ex={<span className="zh-serif">风险比</span>} exLabel={t("fr.lang.example")} />
            <LangCard on={lang === "en"} onClick={() => update({ lang: "en" })} title="English" sub={t("fr.lang.en.sub")} ex={<span>Hazard ratio</span>} exLabel={t("fr.lang.example")} />
            <LangCard on={lang === "bi"} onClick={() => update({ lang: "bi" })} title="双语 Bilingual" sub={t("fr.lang.bi.sub")}
              ex={<span><span className="zh-serif">风险比</span> <span className="muted" style={{ fontSize: 15 }}>hazard ratio</span></span>} exLabel={t("fr.lang.example")}
              badge={t("fr.lang.biBadge")} />
          </div>
          <p className="fr-note"><Globe size={15} /> {t("fr.lang.detected", { l: detected })}</p>
          <p className="fr-note"><Image size={15} /> {t("fr.lang.figures")}</p>
        </div>
      )}

      {step === 1 && (
        <div className="fr-body">
          <h1 className="fr-title">{t("fr.about.title")}</h1>
          <p className="fr-sub">{t("fr.about.sub")}</p>
          <div className="fr-label">{t("fr.about.why")}</div>
          <div className="fr-cards three">
            {([["course", <BookOpen size={18} />, "fr.about.course"], ["research", <FlaskConical size={18} />, "fr.about.research"], ["explore", <Compass size={18} />, "fr.about.explore"]] as const).map(([k, icon, key]) => (
              <button key={k} className={`pick ${s.purpose === k ? "on" : ""}`} onClick={() => update({ purpose: k })}>
                <span className="pick-icon">{icon}</span>
                <span><b>{t(key)}</b><span className="muted">{t(`${key}.sub`)}</span></span>
              </button>
            ))}
          </div>
          <div className="fr-label">{t("fr.about.familiar")}</div>
          <div className="segmented full">
            {(["new", "class", "often"] as const).map((k) => (
              <button key={k} aria-pressed={s.familiarity === k} onClick={() => update({ familiarity: k, level: k === "often" ? "expert" : "learn" })}>{t(`fr.about.${k}`)}</button>
            ))}
          </div>
          <div className="note ok"><Info size={16} /> {s.level === "expert" ? t("fr.about.expertNote") : t("fr.about.learnNote")}</div>
          <div className="card row-between" style={{ marginTop: 16 }}>
            <div><div className="setting-title">{t("fr.about.updates")}</div><div className="setting-help">{t("fr.about.updates.sub")}</div></div>
            <label className="switch"><input type="checkbox" checked={s.autoUpdate} onChange={(e) => update({ autoUpdate: e.target.checked })} /><span /></label>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="fr-body">
          <h1 className="fr-title">{t("fr.start.title")}</h1>
          <p className="fr-sub">{t("fr.start.sub")}</p>
          <div className="fr-cards two">
            <Door icon={<Play size={20} />} strong title={t("fr.start.sample")} sub={t("fr.start.sample.sub")} badge={t("fr.start.recommended")} onClick={() => finish("sample")} />
            <Door icon={<Search size={20} />} title={t("fr.start.gene")} sub={t("fr.start.gene.sub")} onClick={() => finish("gene")} />
            <Door icon={<FileText size={20} />} title={t("fr.start.file")} sub={t("fr.start.file.sub")} onClick={() => finish("file")} />
            <Door icon={<Upload size={20} />} title={t("fr.start.own")} sub={t("fr.start.own.sub")} onClick={() => finish("own")} />
          </div>
        </div>
      )}

      <div className="fr-foot">
        {step === 0 ? <button className="btn ghost muted-link" onClick={() => finish("home")}>{t("fr.skipSetup")}</button>
          : <button className="btn ghost" onClick={() => setStep(step - 1)}>{t("fr.back")}</button>}
        <span style={{ flex: 1 }} />
        {step === 1 && <button className="btn ghost muted-link" onClick={() => setStep(2)}>{t("fr.skip")}</button>}
        {step < 2 ? <button className="btn primary" onClick={() => { if (step === 0) update({ lang }); setStep(step + 1); }}>{t("fr.continue")}</button>
          : <button className="btn ghost muted-link" onClick={() => finish("home")}>{t("fr.start.skipHome")}</button>}
      </div>
    </div>
  );
}

function LangCard({ on, onClick, title, sub, ex, exLabel, badge }: { on: boolean; onClick: () => void; title: string; sub: string; ex: React.ReactNode; exLabel: string; badge?: string }) {
  return (
    <button className={`lang-card ${on ? "on" : ""}`} onClick={onClick} role="radio" aria-checked={on}>
      <span className="row-between"><span className="lang-title">{title}</span><span className="radio" /></span>
      <span className="muted small">{sub}</span>
      <span className="example"><span className="eyebrow">{exLabel}</span><span className="ex">{ex}</span></span>
      {badge && <span className="badge ok" style={{ alignSelf: "flex-start" }}>● {badge}</span>}
    </button>
  );
}

function Door({ icon, title, sub, badge, strong, onClick }: { icon: React.ReactNode; title: string; sub: string; badge?: string; strong?: boolean; onClick: () => void }) {
  return (
    <button className={`door ${strong ? "on" : ""}`} onClick={onClick}>
      <span className={`door-icon ${strong ? "strong" : ""}`}>{icon}</span>
      <span style={{ display: "grid", gap: 4 }}>
        <span><b style={{ fontSize: 15 }}>{title}</b> {badge && <span className="badge ok" style={{ marginLeft: 6 }}>● {badge}</span>}</span>
        <span className="muted small">{sub}</span>
      </span>
    </button>
  );
}
