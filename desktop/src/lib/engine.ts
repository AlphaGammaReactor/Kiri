// The bundled Python analysis engine. The app shell starts it on 127.0.0.1 with a per-launch token.
import { useEffect, useState } from "react";
import { isTauri } from "./platform";

export type EngineState =
  | { status: "starting" }
  | { status: "ready"; port: number; version: string }
  | { status: "failed"; message: string };

type Info = { port: number; token: string; status: "starting" | "ready" | "failed"; message?: string | null };
let info: Info | null = null;

// Browser preview only (screenshot tests): VITE_KIRI_ENGINE="port:token" points at an engine started by hand.
const previewEngine = import.meta.env.VITE_KIRI_ENGINE as string | undefined;

async function getInfo(): Promise<Info> {
  if (!isTauri && previewEngine) {
    const [port, token] = previewEngine.split(":");
    return { port: Number(port), token, status: "ready" };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Info>("engine_info");
}

export async function engineFetch(path: string, init: RequestInit = {}) {
  if (!info) info = await getInfo();
  const headers = new Headers(init.headers);
  headers.set("X-Kiri-Token", info.token);
  return fetch(`http://127.0.0.1:${info.port}${path}`, { ...init, headers });
}

export function useEngine(): EngineState {
  const [state, setState] = useState<EngineState>({ status: "starting" });
  useEffect(() => {
    if (!isTauri && !previewEngine) {
      setState({ status: "failed", message: "browser preview: no engine" });
      return;
    }
    let stop = false;
    (async () => {
      for (let i = 0; i < 240 && !stop; i++) {
        try {
          info = await getInfo();
          if (info.status === "failed") { setState({ status: "failed", message: info.message ?? "" }); return; }
          if (info.status === "ready") {
            const r = await engineFetch("/api/v1/meta");
            if (r.ok) {
              const meta = await r.json();
              setState({ status: "ready", port: info.port, version: meta.version });
              return;
            }
          }
        } catch { /* still starting */ }
        await new Promise((res) => setTimeout(res, 500));
      }
      if (!stop) setState({ status: "failed", message: "timed out" });
    })();
    return () => { stop = true; };
  }, []);
  return state;
}
