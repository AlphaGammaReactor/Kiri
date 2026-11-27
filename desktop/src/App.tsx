import { useCallback, useEffect, useRef, useState } from "react";
import { LangProvider, systemLang, useT, type Lang } from "./i18n";
import { TitleBar } from "./shell/TitleBar";
import { Sidebar, type Screen } from "./shell/Sidebar";
import { UpdateBanner } from "./shell/UpdateBanner";
import { WhatsNewDialog, UpdatingScreen, SignatureBanner, UpdatedToast, WEBSITE } from "./shell/UpdateFlow";
import { Dialog } from "./shell/Dialog";
import { Home } from "./screens/Home";
import { Settings } from "./screens/Settings";
import { About } from "./screens/About";
import { FirstRun } from "./screens/FirstRun";
import { NewProject, type NewProjectData } from "./screens/NewProject";
import { Overview } from "./screens/Overview";
import { Survival } from "./screens/workspace/Survival";
import { Expression } from "./screens/workspace/Expression";
import { Correlation } from "./screens/workspace/Correlation";
import { Signature } from "./screens/workspace/Signature";
import { Notebook } from "./screens/Notebook";
import { Data } from "./screens/Data";
import { Glossary } from "./screens/Glossary";
import { Guide, type GuideAction } from "./screens/Guide";
import type { Recipe } from "./i18n/guide";
import { progress } from "./lib/progress";
import { Palette } from "./shell/Palette";
import { SamplePicker } from "./shell/SamplePicker";
import { ActivityPanel, HelpMenu, ReportProblem, Shortcuts } from "./shell/Help";
import { useSettings } from "./lib/settings";
import { useEngine } from "./lib/engine";
import { useUpdater, PREVIEW_NOTES } from "./lib/updater";
import { useBusy } from "./lib/busy";
import { persistNow } from "./lib/settings";
import { APP_VERSION as KIRI_VERSION } from "./lib/platform";
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
  const [picking, setPicking] = useState(false);
  const [guideAt, setGuideAt] = useState<{ q?: string; id?: Recipe["id"]; n: number }>({ n: 0 });
  const openGuide = (q?: string, id?: Recipe["id"]) => { setGuideAt((g) => ({ q, id, n: g.n + 1 })); setScreen("guide"); };
  const guideAction = (a: GuideAction) => {
    const g = proj.project?.project.targets[0] ?? "";
    if (a === "survival") openGene("survival", g);
    else if (a === "correlation") setScreen("correlation");
    else openGene("expression", g);
  };
  // Getting-started checklist: remember each first step in the settings file.
  const progressRef = useRef(settings.progress);
  progressRef.current = settings.progress;
  useEffect(() => progress.on((step) => { if (!progressRef.current.includes(step)) update({ progress: [...progressRef.current, step] }); }), [update]);
  const [survGene, setSurvGene] = useState<string>("");
  const [expGene, setExpGene] = useState<string>("");
  const [term, setTerm] = useState<string | undefined>(undefined);
  const [overlay, setOverlay] = useState<null | "palette" | "activity" | "help" | "shortcuts" | "report">(null);
  const closeOverlay = useCallback(() => setOverlay(null), []);

  // Text size and motion follow Settings → Accessibility.
  useEffect(() => {
    document.documentElement.dataset.text = settings.textSize;
    document.documentElement.dataset.motion = settings.reduceMotion ? "reduce" : "";
  }, [settings.textSize, settings.reduceMotion]);
  // ⌘K search, F1 or ? for shortcuts.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOverlay((o) => (o === "palette" ? null : "palette")); }
      else if (e.key === "F1" || (e.key === "?" && !typing)) { e.preventDefault(); setOverlay("shortcuts"); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const say = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); }, []);
  const notYet = () => say(t("common.notYet"));
  const ready = engine.status === "ready";

  // ── Updates (design page 23) ──
  const [whatsNew, setWhatsNew] = useState<null | "before" | "after">(null);
  const [updated, setUpdated] = useState<null | { version: string; reopened: boolean; notes?: string }>(null);
  const [updFile, setUpdFile] = useState<string | null>(null);
  const updFileRef = useRef(false);
  const busyNow = useBusy();
  const restartToUpdate = () => updater.restart(async () => {
    setUpdFile(proj.project?.file_name ?? null);
    updFileRef.current = !!proj.project;
    // Remember where the person was and the notes, write it to disk, then close the project so it is saved.
    const notes = updater.state.kind === "ready" ? updater.state.notes : undefined;
    await persistNow({ resume: { path: proj.project?.path ?? null, screen, from: KIRI_VERSION, notes } });
    // The engine closes the file (saved and released) while the screen stays as it was behind the steps.
    if (proj.project) await api.close().catch(() => {});
  }).then((r) => {
    if (r === "busy") say(t("update.busy"));
    // If installing failed, Kiri keeps running: open the project again.
    else if (updFileRef.current && proj.project) proj.open(proj.project.path);
  });
  // A refused signature shows the red banner once per version.
  const sigVersion = updater.state.kind === "error" && updater.state.reason === "signature" ? (updater.state.version ?? "?") : null;
  const [sigHidden, setSigHidden] = useState(false);
  const showSig = !!sigVersion && !sigHidden && settings.sigWarned !== sigVersion;
  const hideSig = () => { setSigHidden(true); if (sigVersion) update({ sigWarned: sigVersion }); };
  const copyWebsite = () => { navigator.clipboard?.writeText(WEBSITE).catch(() => {}); say(t("upd.sig.copied", { u: WEBSITE })); };
  // After a restart into a new version: reopen the project and screen, and say so.
  const backDone = useRef(false);
  useEffect(() => {
    if (backDone.current || !ready) return;
    backDone.current = true;
    if (import.meta.env.DEV && new URLSearchParams(location.search).get("update") === "updated") { setUpdated({ version: KIRI_VERSION, reopened: true, notes: PREVIEW_NOTES }); return; }
    const r = settings.resume;
    if (settings.lastVersion !== KIRI_VERSION) update({ lastVersion: KIRI_VERSION, resume: null });
    else if (r) update({ resume: null });
    if (!settings.lastVersion || settings.lastVersion === KIRI_VERSION) return;
    (async () => {
      let reopened = false;
      if (r?.path) { const ok = await proj.open(r.path); if (ok) { reopened = true; loadRecent(); setScreen((r.screen as Screen) || "overview"); } }
      if (settings.whatsNew) setUpdated({ version: KIRI_VERSION, reopened, notes: r?.notes });
    })();
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (d.startsWith("sample:")) proj.sample(lang, d.slice(7)).then(opened);
    else if (d.startsWith("file:")) proj.open(d.slice(5)).then(opened);
  }, [ready, pendingDoor]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDialog = async () => { const p = await pickKiriToOpen(t("file.openTitle")); if (p) openPath(p); };
  const openSample = () => setPicking(true);
  const pickSample = (id: string) => { setPicking(false); if (ready) proj.sample(lang, id).then(opened); else setPendingDoor(`sample:${id}`); };
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

  const inProject = screen === "overview" || screen === "survival" || screen === "expression" || screen === "notebook" || screen === "data" || screen === "correlation" || screen === "signature";
  const openGene = (k: "survival" | "expression", g: string) => { if (k === "survival") setSurvGene(g); else setExpGene(g); setScreen(k); };
  const docName = proj.project && inProject ? proj.project.file_name
    : screen === "guide" ? t("nav.figureGuide") : screen === "home" ? t("home.title") : screen === "new" ? t("home.new") : screen === "settings" ? t("settings.title") : screen === "about" ? t("about.title") : screen === "glossary" ? t("gl.title") : "Kiri";

  return (
    <div className="app">
      <TitleBar
        docName={docName} lang={lang} level={settings.level}
        fileMenu={proj.project && inProject && !proj.project.read_only ? { onVersion: () => setVersionDialog(true), onCopy: saveCopy, onClose: closeProject } : proj.project && inProject ? { onVersion: notYet, onCopy: saveCopy, onClose: closeProject } : null}
        onLang={(l) => update({ lang: l })} onLevel={(l) => update({ level: l })}
        onSettings={() => setScreen("settings")} onHelp={() => setOverlay((o) => (o === "help" ? null : "help"))} onActivity={() => setOverlay((o) => (o === "activity" ? null : "activity"))} onSearch={() => setOverlay("palette")}
        activityDot={updater.state.kind === "ready" || updater.state.kind === "downloading" || (updater.state.kind === "error" && updater.state.reason === "download")}
      />
      <div>
        {showSig && <SignatureBanner onReport={() => setOverlay("report")} onWebsite={copyWebsite} onClose={hideSig} />}
        <UpdateBanner state={updater.state} onRestart={restartToUpdate} onWhatsNew={() => setWhatsNew("before")} />
      </div>
      <div className="body">
        <Sidebar screen={screen} onNav={setScreen} engine={engine} projectOpen={!!proj.project} onLater={notYet} />
        <main className="main">
          {screen === "home" && (
            <Home recent={recent} a={{
              notYet, onOpenFile: openDialog, onNew: startNew, onSample: openSample, onOpenRecent: openPath,
              onLocate: async (item) => { const p = await pickKiriToOpen(t("file.openTitle")); if (p) { await api.forget(item.path); openPath(p); } },
              onForget: async (path) => { await api.forget(path); loadRecent(); },
              onGuide: openGuide, progress: settings.progress,
            }} />
          )}
          {screen === "new" && <NewProject key={newTpl} initialTemplate={newTpl} onCancel={() => setScreen("home")} onCreate={create} notYet={notYet} />}
          {screen === "overview" && proj.project && <Overview key={`o-${proj.project.path}`} p={proj.project} say={say} figLang={settings.figureLang}
            onOpen={(o) => { if (o.kind === "survival") openGene("survival", o.gene ?? ""); else if (o.kind === "correlation") setScreen("correlation"); else if (o.kind === "signature") setScreen("signature"); else openGene("expression", o.gene ?? ""); }}
            onNotebook={() => setScreen("notebook")} onGuide={(q) => openGuide(q)} onRefresh={proj.refresh} />}
          {screen === "survival" && proj.project && <Survival key={`s-${proj.project.path}-${survGene}`} p={proj.project} figLang={settings.figureLang} onFigLang={(l) => update({ figureLang: l })} say={say} onLater={notYet} onGuide={() => openGuide(undefined, "survival")} initialGene={survGene} />}
          {screen === "expression" && proj.project && <Expression key={`e-${proj.project.path}-${expGene}`} initialGene={expGene} p={proj.project} figLang={settings.figureLang} onFigLang={(l) => update({ figureLang: l })} say={say} onLater={notYet} onGuide={() => openGuide(undefined, "tn")} onSurvival={(g) => { setSurvGene(g); setScreen("survival"); }} />}
          {screen === "correlation" && proj.project && <Correlation key={`c-${proj.project.path}`} p={proj.project} figLang={settings.figureLang} onFigLang={(l) => update({ figureLang: l })} say={say} onLater={notYet} onGuide={() => openGuide(undefined, "correlation")} />}
          {screen === "signature" && proj.project && <Signature key={`s-${proj.project.path}`} p={proj.project} figLang={settings.figureLang} onFigLang={(l) => update({ figureLang: l })} say={say} onLater={notYet} onGuide={() => openGuide()} />}
          {screen === "notebook" && proj.project && <Notebook key={`n-${proj.project.path}`} p={proj.project} say={say} onLater={notYet} onOpenAnalysis={(k, g) => { if (k === "survival") setSurvGene(g ?? ""); setScreen(k === "survival" ? "survival" : k === "correlation" ? "correlation" : (k as string) === "signature" ? "signature" : "expression"); }} />}
          {screen === "data" && proj.project && <Data key={`d-${proj.project.path}`} p={proj.project} say={say} onLater={notYet} />}
          {screen === "glossary" && <Glossary key={term} initial={term} />}
          {screen === "guide" && <Guide key={guideAt.n} initialQuery={guideAt.q} initialId={guideAt.id} projectOpen={!!proj.project} onAction={guideAction} onSample={openSample} />}
          {screen === "settings" && <Settings s={settings} update={update} engineReady={ready} updater={updater.state} onCheck={updater.check} onWhatsNew={() => setWhatsNew(updater.state.kind === "ready" ? "before" : "after")} />}
          {screen === "about" && <About update={updater.state} onCheck={updater.check} engine={engine} project={proj.project} />}
        </main>
      </div>
      {dragging && <div className="drop-overlay">{t("home.dropHere")}</div>}
      {versionDialog && proj.project && <SaveVersion onClose={() => setVersionDialog(false)} onSaved={(n) => { setVersionDialog(false); progress.mark("version"); say(t("file.version.saved", { n })); proj.refresh(); }} versions={proj.project.versions} />}
      {proj.problem && <ProblemDialog problem={proj.problem} onClose={() => proj.setProblem(null)} onRestore={(p) => proj.restore(p).then(opened)} />}
      {overlay === "palette" && <Palette onClose={closeOverlay} a={{
        projectOpen: !!proj.project, go: setScreen, openGene, glossary: (id) => { setTerm(id); setScreen("glossary"); },
        lang: (l) => update({ lang: l }), shortcuts: () => setOverlay("shortcuts"), report: () => setOverlay("report"),
      }} />}
      {overlay === "activity" && <ActivityPanel onClose={closeOverlay} update={updater.state} onRestart={restartToUpdate} onRetryUpdate={updater.check} engineReady={ready} />}
      {overlay === "help" && <HelpMenu onClose={closeOverlay} go={(k) => { if (k === "glossary") { setTerm(undefined); setScreen("glossary"); } else if (k === "about") setScreen("about"); else setOverlay(k); }} />}
      {overlay === "shortcuts" && <Shortcuts onClose={closeOverlay} />}
      {overlay === "report" && <ReportProblem onClose={closeOverlay} screen={screen} level={settings.level} say={say} />}
      {picking && <SamplePicker ready={ready} onPick={pickSample} onClose={() => setPicking(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
      {updated && !toast && <UpdatedToast version={updated.version} reopened={updated.reopened} onWhatsNew={() => setWhatsNew("after")} onClose={() => setUpdated(null)} />}
      {whatsNew === "before" && updater.state.kind === "ready" && <WhatsNewDialog version={updater.state.version} notes={updater.state.notes} bytes={updater.state.bytes}
        fileName={proj.project?.file_name} busy={busyNow} onRestart={() => { setWhatsNew(null); restartToUpdate(); }} onClose={() => setWhatsNew(null)} />}
      {whatsNew === "after" && <WhatsNewDialog version={KIRI_VERSION} notes={updated?.notes} onClose={() => { setWhatsNew(null); setUpdated(null); }} />}
      {updater.state.kind === "installing" && <UpdatingScreen state={updater.state} fileName={proj.project?.file_name ?? updFile} />}
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
