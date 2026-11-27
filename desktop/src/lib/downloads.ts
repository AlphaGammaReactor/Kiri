// Cohort downloads, followed for the whole app: a download carries on when the person leaves the
// screen, the panels read what is on disk (not the button press), and a toast says when it is in.
import { useSyncExternalStore } from "react";
import { analyses, type PackStatus } from "./analyses";

type Packs = Record<string, PackStatus>;
let packs: Packs = {};
const speed: Record<string, { at: number; done: number; bps: number }> = {};
const active = new Set<string>();
const listeners = new Set<() => void>();
let readyListener: ((projects: string[]) => void) | null = null;
let timer = 0;
const emit = () => { packs = { ...packs }; listeners.forEach((l) => l()); };

function note(p: string, s: PackStatus) {
  const prev = speed[p], now = Date.now();
  if (s.state === "downloading" && s.done != null) {
    if (prev && s.done >= prev.done && now > prev.at) {
      const bps = ((s.done - prev.done) * 1000) / (now - prev.at);
      speed[p] = { at: now, done: s.done, bps: prev.bps ? prev.bps * 0.7 + bps * 0.3 : bps };
    } else speed[p] = { at: now, done: s.done, bps: prev?.bps ?? 0 };
  }
  packs[p] = s;
}

async function tick() {
  if (!active.size) { clearInterval(timer); timer = 0; return; }
  const list = [...active];
  const c = await analyses.cohort(list).catch(() => null);
  if (!c) return;
  const finished: string[] = [];
  for (const p of list) {
    const s = c.packs[p];
    if (!s) continue;
    note(p, s);
    if (s.state !== "downloading") { active.delete(p); if (s.ready) finished.push(p); }
  }
  emit();
  if (finished.length && readyListener) readyListener(finished);
}

export const downloads = {
  /** Record what a cohort status call returned, and follow any download still running. */
  seen(ps: Packs) {
    for (const [p, s] of Object.entries(ps)) { note(p, s); if (s.state === "downloading") active.add(p); }
    emit();
    if (active.size && !timer) timer = window.setInterval(tick, 1000);
  },
  async start(projects: string[]) {
    for (const p of projects) { const s = await analyses.download(p); note(p, s); if (s.state !== "ready") active.add(p); }
    emit();
    if (!timer) timer = window.setInterval(tick, 1000);
    tick();
  },
  async cancel(projects: string[]) {
    await Promise.all(projects.map((p) => analyses.cancelDownload(p).catch(() => null)));
    setTimeout(tick, 400);
  },
  isReady(p: string) { return !!packs[p]?.ready; },
  /** Seconds left for this download at the recent speed, or null. */
  secondsLeft(p: string) {
    const s = packs[p], v = speed[p];
    if (!s?.total || !v?.bps) return null;
    return Math.max(0, Math.round((s.total - (s.done ?? 0)) / v.bps));
  },
  onReady(f: ((projects: string[]) => void) | null) { readyListener = f; },
};

const sub = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function usePacks() { return useSyncExternalStore(sub, () => packs); }
