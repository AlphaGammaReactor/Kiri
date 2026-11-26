import { useState } from "react";
import { Activity, ChevronDown, CircleHelp, Globe, Search, Settings2, FileText, Check } from "lucide-react";
import { useT, type Lang } from "../i18n";

type Props = {
  docName: string;
  fileMenu?: { onVersion: () => void; onCopy: () => void; onClose: () => void } | null;
  bare?: boolean;
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
  const [fileMenu, setFileMenu] = useState(false);
  if (p.bare) return <header className="titlebar" data-tauri-drag-region><span className="brand" data-tauri-drag-region>Kiri</span></header>;
  return (
    <header className="titlebar" data-tauri-drag-region>
      <span className="brand" data-tauri-drag-region>Kiri</span>
      <span className="sep" />
      <span style={{ position: "relative" }}>
        <button className="doc" onClick={() => p.fileMenu && setFileMenu((m) => !m)} aria-haspopup={p.fileMenu ? "menu" : undefined}
          style={{ border: 0, background: "transparent", padding: "4px 6px", borderRadius: 6, cursor: p.fileMenu ? "pointer" : "default" }}>
          <FileText size={15} strokeWidth={1.75} /> {p.docName} {p.fileMenu && <ChevronDown size={13} />}
        </button>
        {fileMenu && p.fileMenu && (
          <div className="menu" role="menu" style={{ left: 0, right: "auto", minWidth: 200 }} onMouseLeave={() => setFileMenu(false)}>
            <button role="menuitem" onClick={() => { setFileMenu(false); p.fileMenu!.onVersion(); }}>{t("file.saveVersion")}</button>
            <button role="menuitem" onClick={() => { setFileMenu(false); p.fileMenu!.onCopy(); }}>{t("file.saveCopy")}</button>
            <button role="menuitem" onClick={() => { setFileMenu(false); p.fileMenu!.onClose(); }}>{t("file.close")}</button>
          </div>
        )}
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
