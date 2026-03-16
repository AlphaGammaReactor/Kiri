import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useAppDispatch, useAppSelector, setProjectViewMode } from "../store";
import { fetchProjects, deleteProject } from "../store/projectSlice";
import type { Project } from "../store/projectSlice";
import { ConfirmModal } from "../components/ConfirmModal";
import { HotkeyHint } from "../components/HotkeyHint";
import { useHotkeys } from "../hooks/useHotkeys";

/**
 * Project Dashboard — lists all research projects.
 * Supports grid/list views, project preview panel, and keyboard navigation.
 * Entry point for users: /projects
 */
export default function ProjectDashboard() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { projects, isLoading, error } = useAppSelector((s) => s.project);
  const language = useAppSelector((s) => s.app.language);
  const viewMode = useAppSelector((s) => s.app.projectViewMode);

  // Selected project for preview
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    dispatch(fetchProjects());
  }, [dispatch]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId]
  );

  // Select first project if none selected and projects exist
  useEffect(() => {
    if (!selectedId && projects.length > 0) {
      setSelectedId(projects[0].id);
    }
  }, [projects, selectedId]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await dispatch(deleteProject(deleteTarget.id)).unwrap();
      if (selectedId === deleteTarget.id) setSelectedId(null);
      dispatch(fetchProjects());
    } catch {
      // Error is surfaced via Redux state
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const selectProject = (id: string) => {
    setSelectedId(id);
  };

  const openProject = (id: string) => {
    navigate(`/projects/${id}/atlas`);
  };

  // Keyboard navigation — find current index, move up/down
  const currentIndex = useMemo(
    () => projects.findIndex((p) => p.id === selectedId),
    [projects, selectedId]
  );

  useHotkeys(
    {
      n: () => navigate("/projects/new"),
      g: () => dispatch(setProjectViewMode("grid")),
      l: () => dispatch(setProjectViewMode("list")),
      escape: () => setSelectedId(null),
      enter: () => {
        if (selectedProject && !deleteTarget) openProject(selectedProject.id);
      },
      arrowup: () => {
        if (projects.length === 0) return;
        const next = currentIndex <= 0 ? projects.length - 1 : currentIndex - 1;
        setSelectedId(projects[next].id);
      },
      arrowdown: () => {
        if (projects.length === 0) return;
        const next = currentIndex >= projects.length - 1 ? 0 : currentIndex + 1;
        setSelectedId(projects[next].id);
      },
    },
    [projects, selectedId, currentIndex, deleteTarget]
  );

  const fmtDate = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString(language === "zh" ? "zh-CN" : "en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "—";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-8 max-w-[1400px] mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-kiri-text tracking-tight">
            {t("projects.title")}
          </h1>
          <p className="text-sm text-kiri-text-muted mt-1">
            {t("projects.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-kiri-border overflow-hidden">
            <button
              onClick={() => dispatch(setProjectViewMode("grid"))}
              className={`px-3 py-2 text-sm transition-colors ${
                viewMode === "grid"
                  ? "bg-kiri-accent/15 text-kiri-accent"
                  : "text-kiri-text-dim hover:text-kiri-text hover:bg-kiri-surface-hover"
              }`}
              title={`${t("projects.view_grid")} (G)`}
            >
              ⊞
            </button>
            <button
              onClick={() => dispatch(setProjectViewMode("list"))}
              className={`px-3 py-2 text-sm transition-colors border-l border-kiri-border ${
                viewMode === "list"
                  ? "bg-kiri-accent/15 text-kiri-accent"
                  : "text-kiri-text-dim hover:text-kiri-text hover:bg-kiri-surface-hover"
              }`}
              title={`${t("projects.view_list")} (L)`}
            >
              ☰
            </button>
          </div>

          {/* New project button */}
          <button
            onClick={() => navigate("/projects/new")}
            className="px-5 py-2.5 rounded-lg bg-kiri-accent text-kiri-bg font-medium text-sm hover:brightness-110 transition flex items-center gap-2"
          >
            <span>+</span>
            <span>{t("projects.create")}</span>
            <HotkeyHint keys="N" className="ml-1 opacity-60" />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-kiri-error/10 border border-kiri-error/30 text-kiri-error text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-20 text-kiri-text-muted">
          {t("common.loading")}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && projects.length === 0 && (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🔬</div>
          <h2 className="text-lg font-semibold text-kiri-text mb-2">
            {t("projects.empty_title")}
          </h2>
          <p className="text-sm text-kiri-text-muted mb-6 max-w-md mx-auto">
            {t("projects.empty_description")}
          </p>
          <button
            onClick={() => navigate("/projects/new")}
            className="px-5 py-2.5 rounded-lg bg-kiri-accent text-kiri-bg font-medium text-sm hover:brightness-110 transition"
          >
            {t("projects.create_first")}
          </button>
        </div>
      )}

      {/* Projects + Preview */}
      {!isLoading && projects.length > 0 && (
        <div className="flex gap-6">
          {/* Left: Project list/grid */}
          <div className={`flex-1 min-w-0 ${selectedProject ? "max-w-[calc(100%-380px)]" : ""}`}>
            {viewMode === "grid" ? (
              <ProjectGrid
                projects={projects}
                selectedId={selectedId}
                onSelect={selectProject}
                onDoubleClick={openProject}
                onDelete={(id, name) => setDeleteTarget({ id, name })}
                fmtDate={fmtDate}
                t={t}
                language={language}
              />
            ) : (
              <ProjectList
                projects={projects}
                selectedId={selectedId}
                onSelect={selectProject}
                onDoubleClick={openProject}
                onDelete={(id, name) => setDeleteTarget({ id, name })}
                fmtDate={fmtDate}
                t={t}
              />
            )}
          </div>

          {/* Right: Preview panel */}
          <AnimatePresence>
            {selectedProject && (
              <motion.aside
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.2 }}
                className="w-[360px] shrink-0 rounded-xl border border-kiri-border bg-kiri-surface p-6 sticky top-8 self-start max-h-[calc(100vh-6rem)] overflow-y-auto"
              >
                <PreviewPanel
                  project={selectedProject}
                  onOpen={() => openProject(selectedProject.id)}
                  onDelete={() =>
                    setDeleteTarget({
                      id: selectedProject.id,
                      name: selectedProject.name,
                    })
                  }
                  fmtDate={fmtDate}
                  t={t}
                />
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Hotkey hints bar */}
      {!isLoading && projects.length > 0 && (
        <div className="mt-6 flex items-center gap-4 text-xs text-kiri-text-dim">
          <span className="flex items-center gap-1.5">
            <HotkeyHint keys="↑↓" /> {t("projects.hotkey_navigate")}
          </span>
          <span className="flex items-center gap-1.5">
            <HotkeyHint keys="Enter" /> {t("projects.hotkey_open")}
          </span>
          <span className="flex items-center gap-1.5">
            <HotkeyHint keys="Esc" /> {t("projects.hotkey_deselect")}
          </span>
          <span className="flex items-center gap-1.5">
            <HotkeyHint keys="N" /> {t("projects.hotkey_new")}
          </span>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={deleteTarget !== null}
        title={t("projects.delete_title") || "Delete Project"}
        message={
          t("projects.delete_message", { name: deleteTarget?.name }) ||
          `Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`
        }
        confirmLabel={t("common.delete") || "Delete"}
        variant="danger"
        loading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </motion.div>
  );
}

/* ── Grid View ── */

interface ViewProps {
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDoubleClick: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  fmtDate: (d: string | null) => string;
  t: (key: string, opts?: Record<string, unknown>) => string;
  language?: string;
}

function ProjectGrid({
  projects,
  selectedId,
  onSelect,
  onDoubleClick,
  onDelete,
  fmtDate,
  t,
}: ViewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {projects.map((project, i) => (
        <motion.div
          key={project.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.25 }}
          onClick={() => onSelect(project.id)}
          onDoubleClick={() => onDoubleClick(project.id)}
          className={`group cursor-pointer rounded-xl border p-5 transition-all duration-200 ${
            selectedId === project.id
              ? "border-kiri-accent bg-kiri-accent/5 shadow-lg shadow-kiri-accent/10 ring-1 ring-kiri-accent/30"
              : "border-kiri-border bg-kiri-surface hover:border-kiri-accent/40 hover:shadow-lg hover:shadow-kiri-accent/5"
          }`}
        >
          {/* Project Name */}
          <h3 className={`text-base font-semibold transition-colors truncate ${
            selectedId === project.id ? "text-kiri-accent" : "text-kiri-text group-hover:text-kiri-accent"
          }`}>
            {project.name}
          </h3>

          {/* Cancer Type */}
          {project.cancer_type && (
            <span className="inline-block mt-1.5 text-xs px-2 py-0.5 rounded bg-kiri-accent-glow text-kiri-accent border border-kiri-accent-dim">
              {project.cancer_type}
            </span>
          )}

          {/* Description */}
          {project.description && (
            <p className="mt-2 text-xs text-kiri-text-muted line-clamp-2">
              {project.description}
            </p>
          )}

          {/* Stats */}
          <div className="mt-4 flex items-center gap-4 text-xs text-kiri-text-dim">
            <span>🧬 {project.protein_count} {t("projects.proteins")}</span>
            <span>📦 {project.source_count} {t("projects.sources")}</span>
          </div>

          {/* Proteins Preview */}
          {project.proteins.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {project.proteins.slice(0, 5).map((p) => (
                <span
                  key={p.id}
                  className="text-xs font-mono px-1.5 py-0.5 rounded bg-kiri-bg text-kiri-text-muted border border-kiri-border"
                >
                  {p.gene_symbol}
                </span>
              ))}
              {project.proteins.length > 5 && (
                <span className="text-xs text-kiri-text-dim">
                  +{project.proteins.length - 5}
                </span>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-kiri-border flex items-center justify-between">
            <span className="text-xs text-kiri-text-dim">
              {fmtDate(project.updated_at)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(project.id, project.name);
              }}
              className="text-xs text-kiri-text-dim hover:text-kiri-error transition-colors opacity-0 group-hover:opacity-100"
            >
              {t("common.delete") || "Delete"}
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ── List View ── */

function ProjectList({
  projects,
  selectedId,
  onSelect,
  onDoubleClick,
  onDelete,
  fmtDate,
  t,
}: Omit<ViewProps, "language">) {
  return (
    <div className="rounded-xl border border-kiri-border overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_120px_80px_80px_110px_40px] gap-4 px-5 py-3 bg-kiri-surface text-xs text-kiri-text-dim uppercase tracking-wider border-b border-kiri-border font-medium">
        <span>{t("projects.project_name")}</span>
        <span>{t("projects.cancer_type")}</span>
        <span>{t("projects.proteins")}</span>
        <span>{t("projects.sources")}</span>
        <span>{t("projects.updated_at")}</span>
        <span />
      </div>

      {/* Rows */}
      {projects.map((project, i) => (
        <motion.div
          key={project.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.02 }}
          onClick={() => onSelect(project.id)}
          onDoubleClick={() => onDoubleClick(project.id)}
          className={`group grid grid-cols-[1fr_120px_80px_80px_110px_40px] gap-4 px-5 py-3.5 cursor-pointer text-sm transition-all border-b border-kiri-border last:border-b-0 ${
            selectedId === project.id
              ? "bg-kiri-accent/5 border-l-2 border-l-kiri-accent"
              : "hover:bg-kiri-surface-hover"
          }`}
        >
          {/* Name */}
          <span className={`font-medium truncate ${
            selectedId === project.id ? "text-kiri-accent" : "text-kiri-text"
          }`}>
            {project.name}
          </span>

          {/* Cancer Type */}
          <span className="text-xs text-kiri-text-muted truncate">
            {project.cancer_type || "—"}
          </span>

          {/* Protein count */}
          <span className="text-xs text-kiri-text-muted">
            🧬 {project.protein_count}
          </span>

          {/* Source count */}
          <span className="text-xs text-kiri-text-muted">
            📦 {project.source_count}
          </span>

          {/* Updated */}
          <span className="text-xs text-kiri-text-dim">
            {fmtDate(project.updated_at)}
          </span>

          {/* Delete */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(project.id, project.name);
            }}
            className="text-xs text-kiri-text-dim hover:text-kiri-error transition-colors opacity-0 group-hover:opacity-100 text-right"
          >
            ✕
          </button>
        </motion.div>
      ))}
    </div>
  );
}

/* ── Preview Panel ── */

function PreviewPanel({
  project,
  onOpen,
  onDelete,
  fmtDate,
  t,
}: {
  project: Project;
  onOpen: () => void;
  onDelete: () => void;
  fmtDate: (d: string | null) => string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-kiri-text leading-tight">
          {project.name}
        </h2>
        {project.cancer_type && (
          <span className="inline-block mt-1.5 text-xs px-2 py-0.5 rounded bg-kiri-accent-glow text-kiri-accent border border-kiri-accent-dim">
            {project.cancer_type}
          </span>
        )}
      </div>

      {/* Description */}
      <div>
        <p className="text-xs text-kiri-text-dim uppercase tracking-wider mb-1">
          {t("projects.description")}
        </p>
        <p className="text-sm text-kiri-text-muted leading-relaxed">
          {project.description || t("projects.no_description")}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-kiri-bg p-3 border border-kiri-border text-center">
          <div className="text-lg font-bold text-kiri-accent">{project.protein_count}</div>
          <div className="text-xs text-kiri-text-dim">{t("projects.proteins")}</div>
        </div>
        <div className="rounded-lg bg-kiri-bg p-3 border border-kiri-border text-center">
          <div className="text-lg font-bold text-kiri-accent">{project.source_count}</div>
          <div className="text-xs text-kiri-text-dim">{t("projects.sources")}</div>
        </div>
      </div>

      {/* Proteins */}
      {project.proteins.length > 0 && (
        <div>
          <p className="text-xs text-kiri-text-dim uppercase tracking-wider mb-2">
            {t("projects.protein_targets")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {project.proteins.map((p) => (
              <span
                key={p.id}
                className="text-xs font-mono px-2 py-1 rounded-md bg-kiri-accent-glow text-kiri-accent border border-kiri-accent-dim"
                title={`${p.protein_name} (${p.uniprot_id})`}
              >
                {p.gene_symbol}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Data Sources */}
      {project.data_sources.length > 0 && (
        <div>
          <p className="text-xs text-kiri-text-dim uppercase tracking-wider mb-2">
            {t("projects.data_sources_label")}
          </p>
          <div className="space-y-1.5">
            {project.data_sources.map((ds) => (
              <div
                key={ds.id}
                className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-kiri-bg border border-kiri-border"
              >
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase bg-kiri-info/15 text-kiri-info border border-kiri-info/30">
                  {ds.source_type}
                </span>
                <span className="text-kiri-text-muted truncate">{ds.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dates */}
      <div className="text-xs text-kiri-text-dim space-y-1">
        <div className="flex justify-between">
          <span>{t("projects.created_at")}</span>
          <span>{fmtDate(project.created_at)}</span>
        </div>
        <div className="flex justify-between">
          <span>{t("projects.updated_at")}</span>
          <span>{fmtDate(project.updated_at)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="pt-2 space-y-2">
        <button
          onClick={onOpen}
          className="w-full px-5 py-2.5 rounded-lg bg-kiri-accent text-kiri-bg font-medium text-sm hover:brightness-110 transition flex items-center justify-center gap-2"
        >
          {t("projects.open_project")}
          <HotkeyHint keys="Enter" className="opacity-60" />
        </button>
        <button
          onClick={onDelete}
          className="w-full px-5 py-2 rounded-lg border border-kiri-error/30 text-kiri-error text-sm hover:bg-kiri-error/10 transition"
        >
          {t("common.delete")}
        </button>
      </div>
    </div>
  );
}
