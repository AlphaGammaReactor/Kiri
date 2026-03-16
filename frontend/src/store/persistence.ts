/**
 * Kiri — Real-Time State Persistence
 *
 * Debounced localStorage subscriber that writes Redux state on every change.
 * State is scoped per-project to avoid cross-project contamination.
 *
 * Persisted state survives page refreshes — nothing is lost.
 */

/* ── Keys ── */
const GLOBAL_KEY = "kiri-global";
const PROJECT_KEY_PREFIX = "kiri-project-";

/* ── Types ── */
interface PersistedGlobalState {
  language: "en" | "zh";
  lastProjectId: string | null;
  projectViewMode: "grid" | "list";
}

interface PersistedProjectState {
  activeModule: string;
  heatmapOptions: Record<string, unknown>;
  publication: {
    panels: unknown[];
    options: Record<string, unknown>;
  };
}

/* ── Write helpers ── */

function writeJSON(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — silently degrade
    console.warn(`[Kiri Persist] Failed to write key "${key}"`);
  }
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/* ── Public: Load persisted state into preloadedState ── */

export function loadPersistedGlobal(): Partial<PersistedGlobalState> {
  return readJSON<PersistedGlobalState>(GLOBAL_KEY) ?? {};
}

export function loadPersistedProject(projectId: string): Partial<PersistedProjectState> | null {
  if (!projectId) return null;
  return readJSON<PersistedProjectState>(`${PROJECT_KEY_PREFIX}${projectId}`);
}

/**
 * Build the preloadedState for configureStore.
 * Only injects values that exist in localStorage.
 */
export function buildPreloadedState(): Record<string, unknown> {
  const global = loadPersistedGlobal();

  const preloaded: Record<string, unknown> = {};

  // App slice overrides
  const appOverrides: Record<string, unknown> = {};
  if (global.language) appOverrides.language = global.language;
  if (global.projectViewMode) appOverrides.projectViewMode = global.projectViewMode;

  if (Object.keys(appOverrides).length > 0) {
    preloaded.app = appOverrides;
  }

  return { _globalPersist: global, ...preloaded };
}

/* ── Public: Create a debounced store subscriber ── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPersistenceSubscriber(store: { getState: () => any }): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastGlobalSnapshot = "";
  let lastProjectSnapshot = "";

  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const state = store.getState();

      // ── Global state ──
      const globalData: PersistedGlobalState = {
        language: state.app?.language ?? "en",
        lastProjectId: state.project?.activeProject?.id ?? null,
        projectViewMode: state.app?.projectViewMode ?? "grid",
      };
      const globalStr = JSON.stringify(globalData);
      if (globalStr !== lastGlobalSnapshot) {
        lastGlobalSnapshot = globalStr;
        writeJSON(GLOBAL_KEY, globalData);
      }

      // ── Project-scoped state ──
      const projectId = state.project?.activeProject?.id;
      if (projectId) {
        const projectData: PersistedProjectState = {
          activeModule: state.app?.activeModule ?? "atlas",
          heatmapOptions: state.app?.heatmapOptions ?? {},
          publication: {
            panels: state.publication?.panels ?? [],
            options: state.publication?.options ?? {},
          },
        };
        const projectStr = JSON.stringify(projectData);
        if (projectStr !== lastProjectSnapshot) {
          lastProjectSnapshot = projectStr;
          writeJSON(`${PROJECT_KEY_PREFIX}${projectId}`, projectData);
        }
      }
    }, 300); // 300ms debounce — fast enough to feel instant, slow enough to batch
  };
}

/**
 * Rehydrate project-scoped state into the store.
 * Called when a project is loaded/switched.
 */
export function getProjectRehydration(projectId: string): {
  activeModule?: string;
  heatmapOptions?: Record<string, unknown>;
  publication?: { panels: unknown[]; options: Record<string, unknown> };
} | null {
  return loadPersistedProject(projectId);
}
