import { useCallback, useEffect, useState } from "react";
import { LangProvider, systemLang, useT, type Lang } from "./i18n";
import { TitleBar } from "./shell/TitleBar";
import { Sidebar, type Screen } from "./shell/Sidebar";
import { UpdateBanner } from "./shell/UpdateBanner";
import { Dialog } from "./shell/Dialog";
import { Home } from "./screens/Home";
import { Settings } from "./screens/Settings";
import { About } from "./screens/About";
import { FirstRun } from "./screens/FirstRun";
import { NewProject, type NewProjectData } from "./screens/NewProject";
import { Overview } from "./screens/Overview";
import { useSettings } from "./lib/settings";
import { useEngine } from "./lib/engine";
import { useUpdater } from "./lib/updater";
import { useProject } from "./lib/project";
import { api, type RecentItem, type TemplateId } from "./lib/api";
import { listenForFiles, pickKiriToOpen, pickKiriToSave } from "./lib/files";
import type { StringKey } from "./i18n/strings";

export default function App() {
  const { settings, update, loaded } = useSettings();
  const lang: Lang = settings.lang ?? systemLang();
  return (
    <LangProvider lang={lang}>
      {loaded ? <Shell settings={settings} update={update} lang={lang} /> : null}
    </LangProvider>
  );
}

function Shell({ settings, update, lang }: { settings: ReturnType<typeof useSettings>["settings"]; update: ReturnType<typeof useSettings>["update"]; lang: Lang }) {
  const { t } = useT();
  const updater = useUpdater(settings.autoUpdate);
  const engine = useEngine();
  const proj = useProject();
  const forced = new URLSearchParams(location.search).get("screen") as Screen | null;
  const [screen, setScreen] = useState<Screen>(forced || (settings.firstRunDone ? "home" : "firstrun"));
  const [newTpl, setNewTpl] = useState<TemplateId>("blank");
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [versionDialog, setVersionDialog] = useState(false);
  const [pendingDoor, setPendingDoor] = useState<string | null>(null);

  const say = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); }, []);
  const notYet = () => say(t("common.notYet"));
  const ready = engine.status === "ready";

  const loadRecent = useCallback(() => { if (ready) api.recent().then(setRecent).catch(() => {}); }, [ready]);
  useEffect(loadRecent, [loadRecent]);

  const opened = (ok: unknown) => { if (ok) { setScreen("overview"); loadRecent(); } };
  const openPath = useCallback(async (path: string) => {
    if (engine.status !== "ready") { setPendingDoor(`file:${path}`); return; }
    opened(await proj.open(path));
  }, [engine.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Files from Finder and drag-and-drop
  useEffect(() => {
    let off = () => {};
    listenForFiles((p) => openPath(p), setDragging).then((u) => (off = u));
    return () => off();
  }, [openPath]);

  // A first-run door or a file that arrived before the engine was ready
  useEffect(() => {
    if (!ready || !pendingDoor) return;
    const d = pendingDoor;
    setPendingDoor(null);
    if (d === "sample") proj.sample(lang).then(opened);
    else if (d.startsWith("file:")) proj.open(d.slice(5)).then(opened);
  }, [ready, pendingDoor]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDialog = async () => { const p = await pickKiriToOpen(t("file.openTitle")); if (p) openPath(p); };
  const openSample = () => (ready ? proj.sample(lang).then(opened) : setPendingDoor("sample"));
  const startNew = (tpl: TemplateId = "blank") => { setNewTpl(tpl); setScreen("new"); };
  const create = async (d: NewProjectData) => {
    const path = await pickKiriToSave(t("np.saveTitle"), d.name);
    if (!path) return;
    opened(await proj.create({ ...d, path, language: lang }));
  };
  const saveCopy = async () => {
    if (!proj.project) return;
    const path = await pickKiriToSave(t("file.copy.title"), `${proj.project.project.name} copy`);
    if (path) { const r = await api.saveCopy(path).catch(() => null); if (r) say(t("file.copy.saved", { p: r.path })); }
  };
  const closeProject = async () => { await proj.close(); setScreen("home"); loadRecent(); };

  if (screen === "firstrun") {
    return (
      <div className="app bare">
        <TitleBar bare docName="" lang={lang} level={settings.level} onLang={() => {}} onLevel={() => {}} onSettings={() => {}} onHelp={() => {}} onActivity={() => {}} onSearch={() => {}} />
        <div />
        <FirstRun s={settings} update={update} systemLang={systemLang()} onDone={(door) => {
          setScreen("home");
          if (door === "sample") openSample();
          else if (door === "gene") startNew("one_gene");
          else if (door === "file") openDialog();
          else if (door === "own") notYet();
        }} />
      </div>
    );
  }

  const docName = proj.project && (screen === "overview") ? proj.project.file_name
    : screen === "home" ? t("home.title") : screen === "new" ? t("home.new") : screen === "settings" ? t("settings.title") : screen === "about" ? t("about.title") : "Kiri";

  return (
    <div className="app">
      <TitleBar
        docName={docName} lang={lang} level={settings.level}
        fileMenu={proj.project && screen === "overview" && !proj.project.read_only ? { onVersion: () => setVersionDialog(true), onCopy: saveCopy, onClose: closeProject } : proj.project && screen === "overview" ? { onVersion: notYet, onCopy: saveCopy, onClose: closeProject } : null}
        onLang={(l) => update({ lang: l })} onLevel={(l) => update({ level: l })}
        onSettings={() => setScreen("settings")} onHelp={() => setScreen("about")} onActivity={notYet} onSearch={notYet}
        activityDot={updater.state.kind === "ready"}
      />
      <div><UpdateBanner state={updater.state} onRestart={updater.restart} /></div>
      <div className="body">
        <Sidebar screen={screen} onNav={setScreen} engine={engine} projectOpen={!!proj.project} onLater={notYet} />
        <main className="main">
          {screen === "home" && (
            <Home recent={recent} a={{
              notYet, onOpenFile: openDialog, onNew: startNew, onSample: openSample, onOpenRecent: openPath,
              onLocate: async (item) => { const p = await pickKiriToOpen(t("file.openTitle")); if (p) { await api.forget(item.path); openPath(p); } },
              onForget: async (path) => { await api.forget(path); loadRecent(); },
            }} />
          )}
          {screen === "new" && <NewProject key={newTpl} initialTemplate={newTpl} onCancel={() => setScreen("home")} onCreate={create} notYet={notYet} />}
          {screen === "overview" && proj.project && <Overview p={proj.project} notYet={notYet} />}
          {screen === "settings" && <Settings s={settings} update={update} />}
          {screen === "about" && <About update={updater.state} onCheck={updater.check} engine={engine} />}
        </main>
      </div>
      {dragging && <div className="drop-overlay">{t("home.dropHere")}</div>}
      {versionDialog && proj.project && <SaveVersion onClose={() => setVersionDialog(false)} onSaved={(n) => { setVersionDialog(false); say(t("file.version.saved", { n })); proj.refresh(); }} versions={proj.project.versions} />}
      {proj.problem && <ProblemDialog problem={proj.problem} onClose={() => proj.setProblem(null)} onRestore={(p) => proj.restore(p).then(opened)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function SaveVersion({ onClose, onSaved, versions }: { onClose: () => void; onSaved: (name: string) => void; versions: { id: string; name: string; created_at: string }[] }) {
  const { t, lang } = useT();
  const [name, setName] = useState("");
  const save = async () => { const v = await api.saveVersion(name || t("file.version.placeholder")).catch(() => null); if (v) onSaved(v.name); };
  return (
    <Dialog title={t("file.version.title")} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>{t("file.cancel")}</button><button className="btn primary" onClick={save}>{t("file.save")}</button></>}>
      <p>{t("file.version.body")}</p>
      <label className="field"><span>{t("file.version.name")}</span>
        <input className="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("file.version.placeholder")} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && save()} /></label>
      {versions.length > 0 && (
        <div><div className="eyebrow" style={{ marginBottom: 6 }}>{t("file.version.list")}</div>
          {versions.map((v) => <div key={v.id} className="kv row-between"><span>{v.name}</span><span className="mono muted">{new Date(v.created_at).toLocaleString(lang === "en" ? "en-GB" : "zh-CN")}</span></div>)}
        </div>
      )}
    </Dialog>
  );
}

function ProblemDialog({ problem, onClose, onRestore }: { problem: NonNullable<ReturnType<typeof useProject>["problem"]>; onClose: () => void; onRestore: (path: string) => void }) {
  const { t, lang } = useT();
  if (problem.kind === "damaged") {
    const when = problem.autosave ? new Date(problem.autosave.saved_at).toLocaleString(lang === "en" ? "en-GB" : "zh-CN") : "";
    return (
      <Dialog title={t("err.damaged.title")} onClose={onClose}
        footer={problem.autosave ? <button className="btn primary" onClick={() => onRestore(problem.path)}>{t("err.restore")}</button> : <button className="btn" onClick={onClose}>{t("err.close")}</button>}>
        <p>{t("err.damaged.body")}</p>
        {problem.autosave ? (<>
          <div className="option on"><span className="radio" style={{ border: "5px solid var(--color-accent-default)" }} />{t("err.damaged.restore", { t: when })}</div>
          <p>{t("err.damaged.kept")}</p></>) : <p>{t("err.damaged.noAutosave")}</p>}
      </Dialog>
    );
  }
  const known = ["not_found", "not_kiri", "unreadable", "folder_missing", "engine"];
  const msg = known.includes(problem.code) ? t(`err.${problem.code}` as StringKey) : t("err.generic", { c: problem.code });
  return <Dialog title="Kiri" onClose={onClose} footer={<button className="btn primary" onClick={onClose}>{t("err.close")}</button>}><p>{msg}</p></Dialog>;
}
