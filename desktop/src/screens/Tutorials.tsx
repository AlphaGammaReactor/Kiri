// Tutorials (page 18 of the design): six short walks through the real app, each in a copy of the
// PARL–MAVS sample project. Progress is kept, and any tutorial can start again.
import { BookOpen, ChartSpline, Compass, Keyboard, LayoutPanelLeft, ShieldCheck, SlidersHorizontal, Upload, Waypoints } from "lucide-react";
import { useT } from "../i18n";
import type { StringKey } from "../i18n/strings";
import { TUTORIALS, type TutId, type TutProgress } from "../lib/tutorials";

const ICON = { survival: ChartSpline, tn: SlidersHorizontal, check: ShieldCheck, enrich: Waypoints, figure: LayoutPanelLeft, own: Upload };

export function Tutorials({ progress, onStart, onGlossary, onShortcuts }: {
  progress: TutProgress; onStart: (id: TutId, fresh: boolean) => void; onGlossary: () => void; onShortcuts: () => void;
}) {
  const { t } = useT();
  return (
    <div className="tutp">
      <div className="ws-head"><div>
        <div className="crumb mono">{t("tut.crumb")}</div>
        <h1 className="page ws-title">{t("tut.title")}</h1>
        <div className="sub" style={{ marginTop: 0 }}>{t("tut.sub")}</div>
      </div></div>
      <div className="tut-grid">
        {TUTORIALS.map((x) => {
          const pr = progress[x.id];
          const Icon = ICON[x.icon];
          const started = pr && !pr.done && pr.step > 0;
          const pct = pr?.done ? 100 : pr ? (pr.step / x.steps.length) * 100 : 0;
          return (
            <section key={x.id} className="card tut-card">
              <div className="row-between">
                <span className="tut-ic"><Icon size={20} /></span>
                <span className="row-gap">
                  {pr?.done && <span className="badge ok sm">● {t("tut.done")}</span>}
                  <span className="mono muted small">{x.minutes} {t("common.min")}</span>
                </span>
              </div>
              <h2 className="card-title">{t(`tut.${x.id}.name` as StringKey)}</h2>
              <p className="small">{t(`tut.${x.id}.desc` as StringKey)}</p>
              <div className="progress"><span style={{ width: `${Math.max(1.5, pct)}%` }} /></div>
              <div className="row-gap">
                {started ? <>
                  <button className="btn primary" onClick={() => onStart(x.id, false)}>{t("tut.continue")}</button>
                  <button className="link small" onClick={() => onStart(x.id, true)}>{t("tut.restart")}</button>
                </> : <button className={`btn ${pr?.done ? "" : "primary"}`} onClick={() => onStart(x.id, true)}>{pr?.done ? t("tut.again") : t("tut.start")}</button>}
              </div>
            </section>
          );
        })}
      </div>
      <div className="tut-more">
        <Compass size={18} />
        <span>{t("tut.more")}</span>
        <span className="row-gap">
          <button className="link" onClick={onGlossary}><BookOpen size={14} />{t("tut.glossary")}</button>
          <button className="link" onClick={onShortcuts}><Keyboard size={14} />{t("help.shortcuts")}</button>
        </span>
      </div>
    </div>
  );
}
