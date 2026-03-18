/**
 * Kiri — Project Settings Page
 *
 * Manage project metadata, protein targets, and data sources mid-project.
 * Allows users to add/remove data sources and proteins without recreating the project.
 */

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useAppDispatch, useAppSelector } from "../store";
import type { RootState } from "../store";
import {
  addDataSource,
  addProtein,
  removeProtein,
  fetchProject,
} from "../store/projectSlice";
import { apiClient } from "../services/api";
import { ProteinSelector } from "../components/ProteinSelector";
import { Card, InfoTooltip } from "../components/ui";
import PlatformDataSources from "../components/PlatformDataSources";
import FileManager from "../components/FileManager";



export default function ProjectSettings() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const activeProject = useAppSelector((s: RootState) => s.project.activeProject);

  const [editingInfo, setEditingInfo] = useState(false);
  const [name, setName] = useState(activeProject?.name ?? "");
  const [description, setDescription] = useState(activeProject?.description ?? "");
  const [cancerType, setCancerType] = useState(activeProject?.cancer_type ?? "");
  const [saving, setSaving] = useState(false);
  const [showAddProtein, setShowAddProtein] = useState(false);
  const [isAddingProtein, setIsAddingProtein] = useState(false);

  // Save project info
  const handleSaveInfo = useCallback(async () => {
    if (!activeProject) return;
    setSaving(true);
    try {
      await apiClient.patch(`/v1/projects/${activeProject.id}`, {
        name,
        description,
        cancer_type: cancerType,
      });
      // Sync Redux store so sidebar + other components see updates immediately
      dispatch(fetchProject(activeProject.id));
      setEditingInfo(false);
    } catch (err) {
      console.error("Failed to update project:", err);
    } finally {
      setSaving(false);
    }
  }, [activeProject, name, description, cancerType, dispatch]);

  // Add protein
  const handleAddProtein = useCallback(async (symbol: string) => {
    if (!activeProject) return;
    setIsAddingProtein(true);
    await dispatch(addProtein({ projectId: activeProject.id, gene_symbol: symbol }));
    setIsAddingProtein(false);
  }, [activeProject, dispatch]);

  // Remove protein
  const handleRemoveProtein = useCallback((symbol: string) => {
    if (!activeProject) return;
    const protein = activeProject.proteins.find(
      (p) => p.gene_symbol.toUpperCase() === symbol.toUpperCase()
    );
    if (protein) {
      dispatch(removeProtein({ projectId: activeProject.id, proteinId: protein.id }));
    }
  }, [activeProject, dispatch]);

  if (!activeProject) {
    return (
      <div className="p-8 text-center text-kiri-text-muted">
        <p>{t("settings.noProject", "No active project")}</p>
      </div>
    );
  }


  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6 max-w-4xl"
    >
      {/* ── Page Header ── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-kiri-text tracking-tight flex items-center gap-2">
          {t("settings.title", "Project Settings")}
          <InfoTooltip tooltipKey="tooltips.settings" />
        </h1>
        <p className="text-sm text-kiri-text-muted mt-1">
          {t("settings.subtitle", "Manage your project configuration, data sources, and protein targets")}
        </p>
      </div>

      <div className="space-y-6">
        {/* ══════════════════════════════════════════
            Section 1: Project Info
        ══════════════════════════════════════════ */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-kiri-text uppercase tracking-wider">
              {t("settings.projectInfo", "Project Information")}
            </h2>
            {!editingInfo && (
              <button
                onClick={() => setEditingInfo(true)}
                className="text-xs text-kiri-accent hover:brightness-125 transition"
              >
                {t("common.edit", "Edit")}
              </button>
            )}
          </div>

          {editingInfo ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-kiri-text-dim mb-1 block">{t("projects.project_name")}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-kiri-bg border border-kiri-border text-kiri-text text-sm focus:border-kiri-accent outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-kiri-text-dim mb-1 block">{t("projects.description")}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-kiri-bg border border-kiri-border text-kiri-text text-sm focus:border-kiri-accent outline-none resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-kiri-text-dim mb-1 block">{t("projects.cancer_type")}</label>
                <input
                  type="text"
                  value={cancerType}
                  onChange={(e) => setCancerType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-kiri-bg border border-kiri-border text-kiri-text text-sm focus:border-kiri-accent outline-none"
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleSaveInfo}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg bg-kiri-accent text-kiri-bg text-sm font-medium hover:brightness-110 transition disabled:opacity-40"
                >
                  {saving ? t("common.saving") : t("common.save", "Save")}
                </button>
                <button
                  onClick={() => setEditingInfo(false)}
                  className="px-4 py-1.5 text-sm text-kiri-text-muted hover:text-kiri-text transition"
                >
                  {t("common.cancel", "Cancel")}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <span className="text-xs text-kiri-text-dim">{t("projects.project_name")}</span>
                <p className="text-sm text-kiri-text font-medium">{activeProject.name}</p>
              </div>
              {activeProject.description && (
                <div>
                  <span className="text-xs text-kiri-text-dim">{t("projects.description")}</span>
                  <p className="text-sm text-kiri-text-muted">{activeProject.description}</p>
                </div>
              )}
              <div>
                <span className="text-xs text-kiri-text-dim">{t("projects.cancer_type")}</span>
                <p>
                  <span className="text-sm px-2 py-0.5 rounded bg-kiri-accent-glow text-kiri-accent border border-kiri-accent-dim">
                    {activeProject.cancer_type || "—"}
                  </span>
                </p>
              </div>
            </div>
          )}
        </Card>

        {/* ══════════════════════════════════════════
            Section 2: Platform Data Source Registry
        ══════════════════════════════════════════ */}
        <PlatformDataSources />

        {/* ══════════════════════════════════════════
            Section 3: Protein Targets
        ══════════════════════════════════════════ */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-kiri-text uppercase tracking-wider">
              {t("settings.proteinTargets", "Protein Targets")} ({activeProject.proteins.length})
            </h2>
            <button
              onClick={() => setShowAddProtein(!showAddProtein)}
              className="text-xs px-3 py-1 rounded-lg bg-kiri-accent text-kiri-bg font-medium hover:brightness-110 transition"
            >
              {showAddProtein ? t("common.close", "Close") : `+ ${t("settings.addProtein", "Add Protein")}`}
            </button>
          </div>

          {/* Current Proteins */}
          <div className="space-y-2 mb-4">
            {activeProject.proteins.length === 0 ? (
              <p className="text-xs text-kiri-text-dim py-4 text-center">
                {t("settings.noProteins", "No protein targets configured")}
              </p>
            ) : (
              activeProject.proteins.map((p) => (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-between p-3 rounded-lg border border-kiri-border bg-kiri-bg"
                >
                  <div>
                    <span className="text-sm font-mono font-bold text-kiri-accent">{p.gene_symbol}</span>
                    {p.protein_name && (
                      <span className="text-xs text-kiri-text-muted ml-2">{p.protein_name}</span>
                    )}
                    {p.uniprot_id && (
                      <span className="text-[10px] text-kiri-text-dim ml-2">[{p.uniprot_id}]</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveProtein(p.gene_symbol)}
                    className="text-xs px-2 py-1 rounded text-kiri-error hover:bg-kiri-error/10 transition"
                  >
                    {t("common.remove", "Remove")}
                  </button>
                </motion.div>
              ))
            )}
          </div>

          {/* Add Protein Panel */}
          <AnimatePresence>
            {showAddProtein && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="border-t border-kiri-border pt-4"
              >
                <ProteinSelector
                  selectedSymbols={activeProject.proteins.map((p) => p.gene_symbol)}
                  onSelect={handleAddProtein}
                  onDeselect={handleRemoveProtein}
                  isAdding={isAddingProtein}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* ══════════════════════════════════════════
            Section 4: Files & Uploads
        ══════════════════════════════════════════ */}
        <Card>
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-kiri-text uppercase tracking-wider">
              {t("settings.filesUploads", "Files & Uploads")}
            </h2>
            <p className="text-[10px] text-kiri-text-dim mt-1">
              {t("settings.filesHelp", "Upload CSV/TSV expression data, images, or documents. Uploaded expression files can be used as custom data sources in Atlas.")}
            </p>
          </div>
          <FileManager
            projectId={activeProject.id}
            onFileUploaded={(file) => {
              // Auto-attach expression files as "custom" data sources
              if (file.file_type === "expression" && file.has_parsed_data) {
                dispatch(addDataSource({
                  projectId: activeProject.id,
                  source_type: "custom",
                  label: file.original_name,
                  config: { file_id: file.id, original_name: file.original_name },
                }));
              }
            }}
          />
        </Card>
      </div>
    </motion.div>
  );
}
