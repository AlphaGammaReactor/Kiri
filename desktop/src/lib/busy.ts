// Tracks whether an analysis is running, so an update restart is never offered in the middle of one.
import { useSyncExternalStore } from "react";

let running = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const busy = {
  start() { running++; emit(); },
  end() { running = Math.max(0, running - 1); emit(); },
  get isBusy() { return running > 0; },
};
export function useBusy() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => running > 0,
  );
}
