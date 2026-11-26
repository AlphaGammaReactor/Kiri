import { useState } from "react";
import { LangProvider, systemLang, type Lang } from "./i18n";
import { TitleBar } from "./shell/TitleBar";
import { Sidebar, type Screen } from "./shell/Sidebar";
import { UpdateBanner } from "./shell/UpdateBanner";
import { Home } from "./screens/Home";
import { Settings } from "./screens/Settings";
import { About } from "./screens/About";
import { useSettings } from "./lib/settings";
import { useEngine } from "./lib/engine";
import { useUpdater } from "./lib/updater";
import { useT } from "./i18n";

export default function App() {
  const { settings, update, loaded } = useSettings();
  const lang: Lang = settings.lang ?? systemLang();
  const updater = useUpdater(loaded && settings.autoUpdate);
  const engine = useEngine();
  const [screen, setScreen] = useState<Screen>(() => (new URLSearchParams(location.search).get("screen") as Screen) || "home");
  const [toast, setToast] = useState<string | null>(null);

  const ctx = { settings, update, lang, updater, engine, screen, setScreen, toast, setToast };
  return (
    <LangProvider lang={lang}>
      <Shell {...ctx} />
    </LangProvider>
  );
}

type ShellProps = {
  settings: ReturnType<typeof useSettings>["settings"]; update: ReturnType<typeof useSettings>["update"]; lang: Lang;
  updater: ReturnType<typeof useUpdater>; engine: ReturnType<typeof useEngine>;
  screen: Screen; setScreen: (s: Screen) => void; toast: string | null; setToast: (s: string | null) => void;
};

function Shell({ settings, update, lang, updater, engine, screen, setScreen, toast, setToast }: ShellProps) {
    const { t } = useT();
    const notYet = () => { setToast(t("common.notYet")); setTimeout(() => setToast(null), 2600); };
    const docName = screen === "home" ? t("home.title") : screen === "settings" ? t("settings.title") : t("about.title");
    return (
      <div className="app">
        <TitleBar
          docName={docName} lang={lang} level={settings.level}
          onLang={(l) => update({ lang: l })} onLevel={(l) => update({ level: l })}
          onSettings={() => setScreen("settings")} onHelp={() => setScreen("about")} onActivity={notYet} onSearch={notYet}
          activityDot={updater.state.kind === "ready"}
        />
        <UpdateBanner state={updater.state} onRestart={updater.restart} />
        <div className="body">
          <Sidebar screen={screen} onNav={setScreen} engine={engine} projectOpen={false} />
          <main className="main">
            {screen === "home" && <Home notYet={notYet} />}
            {screen === "settings" && <Settings s={settings} update={update} />}
            {screen === "about" && <About update={updater.state} onCheck={updater.check} engine={engine} />}
          </main>
        </div>
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    );
  }
