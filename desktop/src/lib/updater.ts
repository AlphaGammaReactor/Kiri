// Auto-update: the Tauri updater reads a signed latest.json from GitHub Releases.
// The update downloads in the background; Kiri then shows "Update ready. Restart to update."
// Installing and restarting happen only when the person clicks, and never while an analysis runs.
import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "./platform";
import { busy } from "./busy";

export type UpdateState =
  | { kind: "idle"; checkedAt?: Date }
  | { kind: "checking" }
  | { kind: "downloading"; version: string; percent: number | null }
  | { kind: "ready"; version: string; notes?: string }
  | { kind: "installing"; version: string }
  | { kind: "error"; message: string; checkedAt: Date }
  | { kind: "unsupported" };

const RECHECK_MS = 6 * 60 * 60 * 1000;

type UpdateHandle = { version: string; body?: string; download: (cb: (e: any) => void) => Promise<void>; install: () => Promise<void> };

export function useUpdater(enabled: boolean) {
  const [state, setState] = useState<UpdateState>(isTauri && !import.meta.env.DEV ? { kind: "idle" } : { kind: "unsupported" });
  const pending = useRef<UpdateHandle | null>(null);
  const running = useRef(false);

  const check = useCallback(async () => {
    if (!isTauri || import.meta.env.DEV || running.current || pending.current) return;
    running.current = true;
    setState({ kind: "checking" });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = (await check()) as unknown as UpdateHandle | null;
      if (!update) { setState({ kind: "idle", checkedAt: new Date() }); return; }
      let total = 0, got = 0;
      setState({ kind: "downloading", version: update.version, percent: null });
      await update.download((e: any) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        if (e.event === "Progress") {
          got += e.data.chunkLength;
          setState({ kind: "downloading", version: update.version, percent: total ? Math.round((got / total) * 100) : null });
        }
      });
      pending.current = update;
      setState({ kind: "ready", version: update.version, notes: update.body });
    } catch (err) {
      setState({ kind: "error", message: String(err), checkedAt: new Date() });
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const first = setTimeout(check, 3000);
    const every = setInterval(check, RECHECK_MS);
    return () => { clearTimeout(first); clearInterval(every); };
  }, [enabled, check]);

  /** Install and restart. Refuses while an analysis is running. */
  const restart = useCallback(async (): Promise<"busy" | "ok"> => {
    const u = pending.current;
    if (!u) return "ok";
    if (busy.isBusy) return "busy";
    setState({ kind: "installing", version: u.version });
    await u.install();
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
    return "ok";
  }, []);

  return { state, check, restart };
}
