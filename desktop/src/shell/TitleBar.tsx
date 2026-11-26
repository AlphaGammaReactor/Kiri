import { useState } from "react";
import { Activity, ChevronDown, CircleHelp, Globe, Search, Settings2, FileText, Check } from "lucide-react";
import { useT, type Lang } from "../i18n";

type Props = {
  docName: string;
  lang: Lang;
  level: "learn" | "expert";
  onLang: (l: Lang) => void;
  onLevel: (l: "learn" | "expert") => void;
  onSettings: () => void;
  onHelp: () => void;
  onActivity: () => void;
  onSearch: () => void;
  activityDot?: boolean;
};

export function TitleBar(p: Props) {
  const { t } = useT();
  const [menu, setMenu] = useState(false);
  return (
    <header className="titlebar" data-tauri-drag-region>
      <span className="brand" data-tauri-drag-region>Kiri</span>
      <span className="sep" />
      <span className="doc" data-tauri-drag-region>
        <FileText size={15} strokeWidth={1.75} /> {p.docName}
      </span>
      <span className="saved"><Check size={14} color="var(--color-status-success)" /> {t("app.autosaved")}</span>
      <button className="search" onClick={p.onSearch} aria-label={t("app.search")}>
        <Search size={15} /> <span style={{ textAlign: "left" }}>{t("app.search")}</span> <kbd className="kbd">⌘ K</kbd>
      </button>
      <div className="segmented" role="group">
        <button aria-pressed={p.level === "learn"} onClick={() => p.onLevel("learn")}>{t("app.learn")}</button>
        <button aria-pressed={p.level === "expert"} onClick={() => p.onLevel("expert")}>{t("app.expert")}</button>
      </div>
      <div style={{ position: "relative" }}>
        <button className="select" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}>
          <Globe size={15} /> {t(`lang.short.${p.lang}`)} <ChevronDown size={14} />
        </button>
        {menu && (
          <div className="menu" role="menu" onMouseLeave={() => setMenu(false)}>
            {(["en", "zh", "bi"] as Lang[]).map((l) => (
              <button key={l} role="menuitemradio" aria-checked={p.lang === l} onClick={() => { p.onLang(l); setMenu(false); }}>
                {t(`lang.${l}`)} {p.lang === l && <Check size={14} />}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="icon-btn" aria-label={t("app.activity")} onClick={p.onActivity}>
        <Activity size={17} />{p.activityDot && <span className="dot" />}
      </button>
      <button className="icon-btn" aria-label={t("app.help")} onClick={p.onHelp}><CircleHelp size={17} /></button>
      <button className="icon-btn" aria-label={t("app.settings")} onClick={p.onSettings}><Settings2 size={17} /></button>
    </header>
  );
}
