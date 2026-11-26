import type { ReactNode } from "react";
import {
  Home, LayoutGrid, Compass, SlidersHorizontal, ChartSpline, ChartLine, ChartArea, Share2, Shield, FlaskConical,
  SquarePlus, NotebookPen, LayoutPanelLeft, Database,
} from "lucide-react";
import { useT } from "../i18n";
import type { StringKey } from "../i18n/strings";
import type { EngineState } from "../lib/engine";
import { APP_VERSION } from "../lib/platform";

export type Screen = "firstrun" | "home" | "new" | "overview" | "settings" | "about" | "survival" | "expression";

const Item = ({ icon, label, active, disabled, onClick, title }: { icon: ReactNode; label: string; active?: boolean; disabled?: boolean; onClick?: () => void; title?: string }) => (
  <button className="nav-item" aria-current={active ? "page" : undefined} disabled={disabled} onClick={onClick} title={title}>
    {icon}<span>{label}</span>
  </button>
);

export function Sidebar({ screen, onNav, engine, projectOpen, onLater }: { screen: Screen; onNav: (s: Screen) => void; engine: EngineState; projectOpen: boolean; onLater: () => void }) {
  const { t } = useT();
  const off = !projectOpen;
  const tip = off ? t("nav.noProject") : undefined;
  const ic = { size: 16, strokeWidth: 1.75 };
  const analyses: [StringKey, ReactNode, Screen?][] = [
    ["nav.figureGuide", <Compass {...ic} />],
    ["nav.expression", <SlidersHorizontal {...ic} />, "expression"],
    ["nav.survival", <ChartSpline {...ic} />, "survival"],
    ["nav.correlation", <ChartLine {...ic} />],
    ["nav.de", <ChartArea {...ic} />],
    ["nav.interactions", <Share2 {...ic} />],
    ["nav.immune", <Shield {...ic} />],
    ["nav.bench", <FlaskConical {...ic} />],
    ["nav.optional", <SquarePlus {...ic} />],
  ];
  const record: [StringKey, ReactNode][] = [
    ["nav.notebook", <NotebookPen {...ic} />],
    ["nav.figureBoard", <LayoutPanelLeft {...ic} />],
    ["nav.data", <Database {...ic} />],
  ];
  return (
    <nav className="sidebar" aria-label="Kiri">
      <Item icon={<Home {...ic} />} label={t("nav.home")} active={screen === "home"} onClick={() => onNav("home")} />
      <div className="group">{t("nav.project")}</div>
      <Item icon={<LayoutGrid {...ic} />} label={t("nav.overview")} disabled={off} title={tip} active={screen === "overview"} onClick={() => onNav("overview")} />
      <div className="group">{t("nav.analyses")}</div>
      {analyses.map(([k, i, to]) => to
        ? <Item key={k} icon={i} label={t(k)} disabled={off} title={tip} active={screen === to} onClick={() => onNav(to)} />
        : <Item key={k} icon={i} label={t(k)} disabled={off} title={off ? tip : t("common.notYet")} onClick={onLater} />)}
      <div className="group">{t("nav.record")}</div>
      {record.map(([k, i]) => <Item key={k} icon={i} label={t(k)} disabled={off} title={off ? tip : t("common.notYet")} onClick={onLater} />)}
      <div className="foot">
        <span>
          <span className={`status-dot ${engine.status === "ready" ? "" : engine.status === "failed" ? "bad" : "warn"}`} />
          {engine.status === "ready" ? t("engine.ready") : engine.status === "failed" ? t("engine.failed") : t("engine.starting")}
        </span>
        <button className="mono" style={{ border: 0, background: "none", padding: 0, textAlign: "left", color: "inherit" }} onClick={() => onNav("about")}>
          Kiri {APP_VERSION} · {t("build.label")}
        </button>
      </div>
    </nav>
  );
}
