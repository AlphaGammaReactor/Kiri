// The open project, and the actions that open, create and close .kiri files.
import { useCallback, useState } from "react";
import { api, ApiError, type ProjectSummary } from "./api";

export type FileProblem =
  | { kind: "damaged"; path: string; autosave: { saved_at: string } | null }
  | { kind: "message"; code: string };

export function useProject() {
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [problem, setProblem] = useState<FileProblem | null>(null);

  const handle = (path: string, e: unknown) => {
    if (e instanceof ApiError) {
      if (e.code === "damaged") setProblem({ kind: "damaged", path, autosave: (e.extra.autosave as { saved_at: string } | null) ?? null });
      else setProblem({ kind: "message", code: e.code });
    } else setProblem({ kind: "message", code: "engine" });
  };

  const open = useCallback(async (path: string) => {
    try { const s = await api.open(path); setProject(s); return s; } catch (e) { handle(path, e); return null; }
  }, []);
  const sample = useCallback(async (language: string, id?: string) => {
    try { const s = await api.sample(language, id); setProject(s); return s; } catch (e) { handle("", e); return null; }
  }, []);
  const create = useCallback(async (body: Parameters<typeof api.create>[0]) => {
    try { const s = await api.create(body); setProject(s); return s; } catch (e) { handle(body.path, e); return null; }
  }, []);
  const restore = useCallback(async (path: string) => {
    try { const s = await api.restoreAutosave(path); setProject(s); setProblem(null); return s; } catch (e) { handle(path, e); return null; }
  }, []);
  const close = useCallback(async () => { await api.close().catch(() => {}); setProject(null); }, []);
  const refresh = useCallback(async () => { try { setProject(await api.current()); } catch { /* none open */ } }, []);
  return { project, setProject, open, sample, create, restore, close, refresh, problem, setProblem };
}
