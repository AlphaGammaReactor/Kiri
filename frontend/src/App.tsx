import { BrowserRouter, Routes, Route, NavLink, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector, setSelectedGenes, rehydrateAppFromProject } from "./store";
import { rehydrateInteractomics } from "./store/interactomicsSlice";
import { motion } from "framer-motion";
import { Suspense, lazy, useEffect } from "react";

import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastContainer } from "./components/Toast";
import { SettingsFloatingButton } from "./components/SettingsFloatingButton";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { refreshToken } from "./store/authSlice";
import { usePageTitle } from "./hooks/usePageTitle";
import { fetchProject } from "./store/projectSlice";
import { loadPublicationState, rehydratePublication } from "./store/publicationSlice";
import { getProjectRehydration } from "./store/persistence";

import type { RootState } from "./store";

/* ── Lazy-loaded module pages ── */
const AtlasPage = lazy(() => import("./pages/AtlasPage"));
const InteractionLab = lazy(() => import("./pages/InteractionLab"));
const ProteinDocking = lazy(() => import("./pages/ProteinDocking"));
const ProjectDashboard = lazy(() => import("./pages/ProjectDashboard"));
const NewProjectWizard = lazy(() => import("./pages/NewProjectWizard"));
const PublicationEngine = lazy(() => import("./pages/PublicationEngine"));
const DrugDiscovery = lazy(() => import("./pages/DrugDiscovery"));
const ClinicalSuite = lazy(() => import("./pages/ClinicalSuite"));
const DiscoveryPage = lazy(() => import("./pages/DiscoveryPage"));
const ProjectSettings = lazy(() => import("./pages/ProjectSettings"));
const PDMVault = lazy(() => import("./pages/PDMVault"));
const CrossValidation = lazy(() => import("./pages/CrossValidation"));
const ProjectHistory = lazy(() => import("./pages/ProjectHistory"));
const MitoAnalysisPage = lazy(() => import("./pages/MitoAnalysisPage"));
const InteractomicsPage = lazy(() => import("./pages/InteractomicsPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));

/* ── Page placeholder components ── */
const PageShell = ({
  title,
}: {
  title: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    className="p-8"
  >
    <h1 className="text-2xl font-bold text-kiri-text mb-4 tracking-tight">
      {title}
    </h1>
  </motion.div>
);

/* ── Project Layout ── */
const navItems = [
  { path: "atlas", key: "atlas", icon: "🧬" },
  { path: "mito", key: "mito", icon: "⚡" },
  { path: "interaction", key: "interaction", icon: "🔗" },
  { path: "interactomics", key: "interactomics", icon: "🕸️" },
  { path: "docking", key: "docking", icon: "🧩" },
  { path: "clinical", key: "clinical", icon: "📊" },
  { path: "pdm", key: "pdm", icon: "🧪" },
  { path: "crossval", key: "crossval", icon: "⚖️" },
  { path: "discovery", key: "discovery", icon: "🤖" },
  { path: "export", key: "export", icon: "📄" },
  { path: "drugs", key: "drugs", icon: "💊" },
  { path: "history", key: "history", icon: "📜" },
];

function ProjectLayout() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { projectId } = useParams<{ projectId: string }>();
  const activeProject = useAppSelector((s: RootState) => s.project.activeProject);



  useEffect(() => {
    if (projectId && (!activeProject || activeProject.id !== projectId)) {
      dispatch(fetchProject(projectId));
    }
  }, [projectId, activeProject, dispatch]);

  // ── Rehydrate project-scoped state from localStorage on mount ──
  useEffect(() => {
    if (!projectId) return;
    const persisted = getProjectRehydration(projectId);
    if (!persisted) return;

    // Rehydrate app-level project state (activeModule, heatmapOptions)
    dispatch(rehydrateAppFromProject({
      activeModule: persisted.activeModule,
      heatmapOptions: persisted.heatmapOptions,
    }));

    // Rehydrate publication state from localStorage (fast pre-load)
    if (persisted.publication) {
      dispatch(rehydratePublication(persisted.publication));
    }

    // Rehydrate interactomics state from localStorage
    if (persisted.interactomics) {
      dispatch(rehydrateInteractomics(persisted.interactomics as Record<string, unknown>));
    }

    // Also load from backend (authoritative source, may override localStorage)
    dispatch(loadPublicationState(projectId));
  }, [projectId, dispatch]);

  const projectGenes = activeProject?.proteins?.map((p) => p.gene_symbol) ?? [];

  // Sync app.selectedGenes from the active project's protein list
  useEffect(() => {
    if (projectGenes.length > 0) {
      dispatch(setSelectedGenes(projectGenes));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id, activeProject?.proteins?.length, dispatch]);

  return (
    <div className="min-h-screen flex bg-kiri-bg">
      {/* ── Sidebar — static, no scroll ── */}
      <aside className="w-64 bg-kiri-surface border-r border-kiri-border flex flex-col h-screen sticky top-0 overflow-hidden shrink-0">
        {/* Project Header */}
        <div className="p-6 border-b border-kiri-border">
          <NavLink
            to="/projects"
            className="text-xs text-kiri-text-dim hover:text-kiri-text transition-colors"
          >
            ← {t("projects.all_projects")}
          </NavLink>
          <h1 className="text-lg font-bold text-kiri-accent tracking-wide font-mono mt-2 truncate">
            {activeProject?.name || t("app.title")}
          </h1>
          {activeProject?.cancer_type && (
            <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-kiri-accent-glow text-kiri-accent border border-kiri-accent-dim">
              {activeProject.cancer_type}
            </span>
          )}
        </div>

        {/* Nav Links */}
        <nav className="flex-1 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.key}
              to={`/projects/${projectId}/${item.path}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                  isActive
                    ? "text-kiri-accent bg-kiri-accent-glow border-r-2 border-kiri-accent"
                    : "text-kiri-text-muted hover:text-kiri-text hover:bg-kiri-surface-hover"
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{t(`nav.${item.key}`)}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer controls */}
        <div className="p-4 border-t border-kiri-border space-y-3">
          {/* Protein targets from project */}
          <div>
            <p className="text-xs text-kiri-text-dim uppercase tracking-wider mb-2">
              {t("projects.protein_targets")}
            </p>
            <div className="flex flex-wrap gap-1">
              {projectGenes.map((gene) => (
                <span
                  key={gene}
                  className="text-xs font-mono px-2 py-0.5 rounded bg-kiri-accent-glow text-kiri-accent border border-kiri-accent-dim"
                >
                  {gene}
                </span>
              ))}
              {projectGenes.length === 0 && (
                <span className="text-xs text-kiri-text-dim">
                  {t("projects.no_proteins")}
                </span>
              )}
            </div>
          </div>

          {/* Settings — pinned at bottom */}
          <NavLink
            to={`/projects/${projectId}/settings`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-2 py-2 text-sm rounded-lg transition-colors ${
                isActive
                  ? "text-kiri-accent bg-kiri-accent-glow"
                  : "text-kiri-text-muted hover:text-kiri-text hover:bg-kiri-surface-hover"
              }`
            }
          >
            <span>⚙️</span>
            <span>{t("nav.settings")}</span>
          </NavLink>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto">

        {/* Module Routes */}
        <Suspense fallback={<PageShell title={t("common.loading")} />}>
          <Routes>
            <Route path="atlas" element={<ErrorBoundary moduleName="Atlas"><AtlasPage /></ErrorBoundary>} />
            <Route path="mito" element={<ErrorBoundary moduleName="Mito Lab"><MitoAnalysisPage /></ErrorBoundary>} />
            <Route path="interaction" element={<ErrorBoundary moduleName="Interaction Lab"><InteractionLab /></ErrorBoundary>} />
            <Route path="interactomics" element={<ErrorBoundary moduleName="Interactomics"><InteractomicsPage /></ErrorBoundary>} />
            <Route path="docking" element={<ErrorBoundary moduleName="Protein Docking"><ProteinDocking /></ErrorBoundary>} />
            <Route path="clinical" element={<ErrorBoundary moduleName="Clinical Suite"><ClinicalSuite /></ErrorBoundary>} />
            <Route path="discovery" element={<ErrorBoundary moduleName="AI Discovery"><DiscoveryPage /></ErrorBoundary>} />
            <Route path="export" element={<ErrorBoundary moduleName="Publication Engine"><PublicationEngine /></ErrorBoundary>} />
            <Route path="drugs" element={<ErrorBoundary moduleName="Drug Discovery"><DrugDiscovery /></ErrorBoundary>} />
            <Route path="pdm" element={<ErrorBoundary moduleName="PDM Vault"><PDMVault /></ErrorBoundary>} />
            <Route path="crossval" element={<ErrorBoundary moduleName="Cross-Validation"><CrossValidation /></ErrorBoundary>} />
            <Route path="settings" element={<ErrorBoundary moduleName="Settings"><ProjectSettings /></ErrorBoundary>} />
            <Route path="history" element={<ErrorBoundary moduleName="History"><ProjectHistory /></ErrorBoundary>} />
            <Route path="" element={<Navigate to="atlas" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

/* ── Auth Initializer — attempts refresh on mount ── */
function AuthInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const initialized = useAppSelector((s: RootState) => s.auth.initialized);

  useEffect(() => {
    if (!initialized) {
      dispatch(refreshToken());
    }
  }, [dispatch, initialized]);

  return <>{children}</>;
}

/* ── Dynamic page title (must live inside BrowserRouter) ── */
function PageTitleUpdater() {
  usePageTitle();
  return null;
}

/* ── App Root ── */
function App() {
  const theme = useAppSelector((s: RootState) => s.app.theme);

  // Sync theme to document root
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <ErrorBoundary moduleName="App">
      <BrowserRouter>
        <PageTitleUpdater />
        <AuthInitializer>
          <ToastContainer />
          <SettingsFloatingButton />
          <Suspense fallback={<div className="min-h-screen bg-kiri-bg flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-kiri-accent border-r-transparent animate-spin" /></div>}>
            <Routes>
              {/* Public route */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected routes */}
              <Route path="/projects" element={<ProtectedRoute><ProjectDashboard /></ProtectedRoute>} />
              <Route path="/projects/new" element={<ProtectedRoute><NewProjectWizard /></ProtectedRoute>} />
              <Route path="/projects/:projectId/*" element={<ProtectedRoute><ProjectLayout /></ProtectedRoute>} />

              {/* Root redirect */}
              <Route path="/" element={<Navigate to="/projects" replace />} />
              <Route path="*" element={<Navigate to="/projects" replace />} />
            </Routes>
          </Suspense>
        </AuthInitializer>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
