// Tracks running analyses, so an update restart is never offered in the middle of one,
// and keeps this session's jobs for the Activity panel and problem reports.
import { useSyncExternalStore } from "react";

export type Job = { id: number; label: string; state: "running" | "done" | "failed"; started: number; ended?: number; code?: string };
let running = 0;
let seq = 0;
let jobs: Job[] = [];
let lastError = "";
const listeners = new Set<() => void>();
const emit = () => { jobs = [...jobs]; listeners.forEach((l) => l()); };
const sub = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const busy = {
  start(label = "") { running++; const id = ++seq; jobs.unshift({ id, label, state: "running", started: Date.now() }); jobs = jobs.slice(0, 20); emit(); return id; },
  end(id?: number, code?: string) {
    running = Math.max(0, running - 1);
    const j = jobs.find((x) => x.id === id);
    if (j) { j.state = code ? "failed" : "done"; j.ended = Date.now(); j.code = code; }
    if (code) lastError = code;
    emit();
  },
  clearFinished() { jobs = jobs.filter((j) => j.state === "running"); emit(); },
  get isBusy() { return running > 0; },
  get lastError() { return lastError; },
};
export function useBusy() { return useSyncExternalStore(sub, () => running > 0); }
export function useJobs() { return useSyncExternalStore(sub, () => jobs); }
