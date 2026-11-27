// Auto-update: the Tauri updater reads a signed latest.json from GitHub Releases.
// Quiet until it is ready, never restarts on its own, never during an analysis, and never installs
// anything whose signature does not match the Kiri key built into the app (design page 23).
import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "./platform";
import { busy } from "./busy";

/** Why an update failed: no connection while checking, the download broke, the signature did not match, or anything else. */
export type UpdateFailure = "offline" | "download" | "signature" | "other";
export type UpdateState =
  | { kind: "idle"; checkedAt?: Date }
  | { kind: "checking" }
  | { kind: "downloading"; version: string; percent: number | null }
  | { kind: "ready"; version: string; notes?: string; bytes?: number }
  | { kind: "installing"; version: string; step: "saved" | "checked" | "installing" }
  | { kind: "error"; reason: UpdateFailure; message: string; checkedAt: Date; version?: string }
  | { kind: "unsupported" };

const RECHECK_MS = 6 * 60 * 60 * 1000;

type UpdateHandle = { version: string; body?: string; download: (cb: (e: any) => void) => Promise<void>; install: () => Promise<void> };

export function classify(err: unknown, phase: "check" | "download"): UpdateFailure {
  const m = String(err).toLowerCase();
  if (/signature|minisign|public key|verify/.test(m)) return "signature";
  if (phase === "download") return "download";
  if (/network|dns|connect|timed? ?out|offline|request|resolve|unreachable|tls|certificate/.test(m)) return "offline";
  return "other";
}

/** Release notes from latest.json as short lines: "- item" bullets, or one line per sentence-like line. */
export function noteLines(body?: string): string[] {
  if (!body) return [];
  return body.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+\.)\s*/, "").replace(/^#+\s*/, "").trim()).filter((l) => l && !/^what'?s new|^更新内容/i.test(l)).slice(0, 8);
}

// Browser previews (design screenshots) can show every state with ?update=downloading|ready|busy|offline|download|signature.
const preview = !isTauri && import.meta.env.DEV ? new URLSearchParams(location.search).get("update") : null;
export const PREVIEW_NOTES = "- Correlation: do two genes rise and fall together across patients\n- One-page summary on a single A4 page\n- Figures save as PDF, with the data table and an R or Python script\n- Fixed: Chinese axis labels cut off in some figures";
function previewState(p: string): UpdateState {
  const now = new Date();
  if (p === "downloading") return { kind: "downloading", version: "0.2.0", percent: 42 };
  if (p === "ready" || p === "busy") return { kind: "ready", version: "0.2.0", notes: PREVIEW_NOTES, bytes: 61_865_984 };
  if (p === "offline" || p === "download" || p === "signature") return { kind: "error", reason: p, message: p, checkedAt: now, version: "0.2.0" };
  return { kind: "idle", checkedAt: now };
}

export function useUpdater(enabled: boolean) {
  const [state, setState] = useState<UpdateState>(preview ? previewState(preview) : isTauri && !import.meta.env.DEV ? { kind: "idle" } : { kind: "unsupported" });
  const pending = useRef<UpdateHandle | null>(null);
  const running = useRef(false);

  const check = useCallback(async () => {
    if (preview) { setState({ kind: "checking" }); setTimeout(() => setState(previewState(preview === "offline" ? "offline" : "idle")), 900); return; }
    if (!isTauri || import.meta.env.DEV || running.current || pending.current) return;
    running.current = true;
    setState({ kind: "checking" });
    let phase: "check" | "download" = "check";
    let version: string | undefined;
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = (await check()) as unknown as UpdateHandle | null;
      if (!update) { setState({ kind: "idle", checkedAt: new Date() }); return; }
      phase = "download";
      version = update.version;
      let total = 0, got = 0;
      setState({ kind: "downloading", version: update.version, percent: null });
      // download() also checks the signature; a mismatch throws and nothing is kept or installed.
      await update.download((e: any) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        if (e.event === "Progress") {
          got += e.data.chunkLength;
          setState({ kind: "downloading", version: update.version, percent: total ? Math.round((got / total) * 100) : null });
        }
      });
      pending.current = update;
      setState({ kind: "ready", version: update.version, notes: update.body, bytes: total || got || undefined });
    } catch (err) {
      setState({ kind: "error", reason: classify(err, phase), message: String(err), checkedAt: new Date(), version });
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled || preview) return;
    const first = setTimeout(check, 3000);
    const every = setInterval(check, RECHECK_MS);
    return () => { clearTimeout(first); clearInterval(every); };
  }, [enabled, check]);

  /** Save, install and restart. Refuses while an analysis is running. `beforeRestart` saves the project and where the person was. */
  const restart = useCallback(async (beforeRestart?: () => Promise<void>): Promise<"busy" | "ok"> => {
    const cur = state;
    if (busy.isBusy) return "busy";
    if (preview) {
      if (cur.kind !== "ready") return "ok";
      setState({ kind: "installing", version: cur.version, step: "saved" });
      await beforeRestart?.();
      setTimeout(() => setState({ kind: "installing", version: cur.version, step: "checked" }), 700);
      setTimeout(() => setState({ kind: "installing", version: cur.version, step: "installing" }), 1400);
      return "ok";
    }
    const u = pending.current;
    if (!u) return "ok";
    setState({ kind: "installing", version: u.version, step: "saved" });
    await beforeRestart?.();
    setState({ kind: "installing", version: u.version, step: "installing" });
    try {
      await u.install();
    } catch (err) {
      pending.current = null;
      setState({ kind: "error", reason: classify(err, "download"), message: String(err), checkedAt: new Date(), version: u.version });
      return "ok";
    }
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
    return "ok";
  }, [state]);

  return { state, check, restart };
}
