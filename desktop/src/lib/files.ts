// File dialogs and file-open events (double-click a .kiri in Finder, drag onto the window).
import { isTauri } from "./platform";

export async function pickKiriToOpen(title: string): Promise<string | null> {
  if (!isTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ title, multiple: false, directory: false, filters: [{ name: "Kiri project", extensions: ["kiri"] }] });
  return typeof r === "string" ? r : null;
}

const previewDir = import.meta.env.VITE_KIRI_TEST_DIR as string | undefined;

export async function pickKiriToSave(title: string, defaultName: string): Promise<string | null> {
  if (!isTauri) return previewDir ? `${previewDir}/${defaultName}.kiri` : null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { documentDir, join } = await import("@tauri-apps/api/path");
  const dir = await documentDir().catch(() => "");
  const safe = defaultName.replace(/[\\/:*?"<>|]/g, "-").trim() || "Untitled";
  const r = await save({ title, defaultPath: dir ? await join(dir, `${safe}.kiri`) : `${safe}.kiri`, filters: [{ name: "Kiri project", extensions: ["kiri"] }] });
  return r ?? null;
}

export async function pickExportPath(title: string, defaultName: string, ext: "png" | "svg" | "pdf" | "csv" | "html"): Promise<string | null> {
  if (!isTauri) return previewDir ? `${previewDir}/${defaultName}.${ext}` : null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { documentDir, join } = await import("@tauri-apps/api/path");
  const dir = await documentDir().catch(() => "");
  const safe = defaultName.replace(/[\\/:*?"<>|]/g, "-").trim() || "figure";
  const r = await save({ title, defaultPath: dir ? await join(dir, `${safe}.${ext}`) : `${safe}.${ext}`, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  return r ?? null;
}

/** Calls `onOpen` for .kiri files opened from Finder (including the one that launched Kiri) and dropped on the window. */
export async function listenForFiles(onOpen: (path: string) => void, onDragging: (over: boolean) => void) {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const { invoke } = await import("@tauri-apps/api/core");
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  const un1 = await listen<string>("kiri://open-file", (e) => onOpen(e.payload));
  const pending = await invoke<string[]>("take_opened_files");
  pending.forEach(onOpen);
  const un2 = await getCurrentWebview().onDragDropEvent((e) => {
    const p = e.payload;
    if (p.type === "enter" || p.type === "over") onDragging(true);
    else if (p.type === "leave") onDragging(false);
    else if (p.type === "drop") {
      onDragging(false);
      const k = p.paths.find((x) => x.toLowerCase().endsWith(".kiri"));
      if (k) onOpen(k);
    }
  });
  return () => { un1(); un2(); };
}
