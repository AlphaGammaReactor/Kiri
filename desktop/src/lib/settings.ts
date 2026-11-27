// App settings live in the app's own settings file (Tauri store), never in browser storage.
// In a plain browser (design previews) they fall back to memory.
import { useEffect, useState, useCallback } from "react";
import { isTauri } from "./platform";
import type { Lang } from "../i18n";

export type Settings = {
  lang: Lang | null; // null until chosen (first run follows the system language)
  figureLang: "en" | "zh";
  level: "learn" | "expert";
  autoUpdate: boolean;
  firstRunDone: boolean;
  purpose: "course" | "research" | "explore" | null;
  familiarity: "new" | "class" | "often" | null;
  textSize: "normal" | "large";
  reduceMotion: boolean;
  progress: string[]; // getting-started steps done (lib/progress.ts)
  whatsNew: boolean; // show a short note after Kiri updates itself
  lastVersion: string | null; // the version that last ran, to notice an update
  resume: Resume | null; // where to go back to after restarting to update
  sigWarned: string | null; // the version whose signature failure was already shown (shown once)
};
export type Resume = { path: string | null; screen: string; from: string; notes?: string };
const DEFAULTS: Settings = { lang: null, figureLang: "en", level: "learn", autoUpdate: true, firstRunDone: false, purpose: null, familiarity: null, textSize: "normal", reduceMotion: false, progress: [], whatsNew: true, lastVersion: null, resume: null, sigWarned: null };

type StoreLike = { get<T>(k: string): Promise<T | undefined>; set(k: string, v: unknown): Promise<void>; save(): Promise<void> };
let storePromise: Promise<StoreLike | null> | null = null;
function store() {
  if (!storePromise) {
    storePromise = isTauri
      ? import("@tauri-apps/plugin-store").then((m) => m.load("settings.json", { autoSave: true, defaults: {} }) as Promise<StoreLike>)
      : Promise.resolve(null);
  }
  return storePromise;
}

export function useSettings() {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    (async () => {
      const st = await store();
      const saved = st ? await st.get<Partial<Settings>>("settings") : undefined;
      setS({ ...DEFAULTS, ...(saved ?? {}) });
      setLoaded(true);
    })();
  }, []);
  const update = useCallback((patch: Partial<Settings>) => {
    setS((prev) => {
      const next = { ...prev, ...patch };
      store().then((st) => st?.set("settings", next));
      return next;
    });
  }, []);
  return { settings: s, update, loaded };
}

/** Write settings to disk now (before a restart), not on the store's autosave timer. */
export async function persistNow(patch: Partial<Settings>) {
  const st = await store();
  if (!st) return;
  const cur = (await st.get<Partial<Settings>>("settings")) ?? {};
  await st.set("settings", { ...DEFAULTS, ...cur, ...patch });
  await st.save();
}
