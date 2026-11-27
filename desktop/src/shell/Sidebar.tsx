import type { ReactNode } from "react";
import { GraduationCap,
  Home, LayoutGrid, Compass, SlidersHorizontal, ChartSpline, ChartLine, ChartArea, Share2, Shield, FlaskConical,
  SquarePlus, NotebookPen, LayoutPanelLeft, Database, Layers, Crosshair, } from "lucide-react";
import { useT } from "../i18n";
import type { StringKey } from "../i18n/strings";
import type { EngineState } from "../lib/engine";
import { APP_VERSION } from "../lib/platform";

export type Screen = "firstrun" | "home" | "new" | "overview" | "settings" | "about" | "survival" | "expression" | "notebook" | "data" | "glossary" | "guide" | "correlation" | "import" | "de" | "signature" | "across" | "immune" | "interactions" | "bench" | "board" | "tutorials" | "dependency";

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
    ["nav.figureGuide", <Compass {...ic} />, "guide"],
    ["nav.expression", <SlidersHorizontal {...ic} />, "expression"],
    ["nav.survival", <ChartSpline {...ic} />, "survival"],
    ["nav.correlation", <ChartLine {...ic} />, "correlation"],
    ["nav.signature", <Layers {...ic} />, "signature"],
    ["nav.de", <ChartArea {...ic} />, "de"],
    ["nav.interactions", <Share2 {...ic} />, "interactions"],
    ["nav.immune", <Shield {...ic} />, "immune"],
    ["nav.dependency", <Crosshair {...ic} />, "dependency"],
    ["nav.bench", <FlaskConical {...ic} />, "bench"],
    ["nav.optional", <SquarePlus {...ic} />],
  ];
  const record: [StringKey, ReactNode, Screen?][] = [
    ["nav.notebook", <NotebookPen {...ic} />, "notebook"],
    ["nav.figureBoard", <LayoutPanelLeft {...ic} />, "board"],
    ["nav.data", <Database {...ic} />, "data"],
  ];
  return (
    <nav className="sidebar" aria-label="Kiri">
      <Item icon={<Home {...ic} />} label={t("nav.home")} active={screen === "home"} onClick={() => onNav("home")} />
      <div className="group">{t("nav.project")}</div>
      <Item icon={<LayoutGrid {...ic} />} label={t("nav.overview")} disabled={off} title={tip} active={screen === "overview"} onClick={() => onNav("overview")} />
      <div className="group">{t("nav.analyses")}</div>
      {analyses.map(([k, i, to]) => to
        ? <Item key={k} icon={i} label={t(k)} disabled={off && to !== "guide"} title={to === "guide" ? undefined : tip} active={screen === to || (to === "expression" && screen === "across")} onClick={() => onNav(to)} />
        : <Item key={k} icon={i} label={t(k)} disabled={off} title={off ? tip : t("common.notYet")} onClick={onLater} />)}
      <div className="group">{t("nav.record")}</div>
      {record.map(([k, i, to]) => to
        ? <Item key={k} icon={i} label={t(k)} disabled={off} title={tip} active={screen === to} onClick={() => onNav(to)} />
        : <Item key={k} icon={i} label={t(k)} disabled={off} title={off ? tip : t("common.notYet")} onClick={onLater} />)}
      <div style={{ flex: 1 }} />
      <Item icon={<GraduationCap {...ic} />} label={t("nav.learn")} active={screen === "tutorials" || screen === "glossary"} onClick={() => onNav("tutorials")} />
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
