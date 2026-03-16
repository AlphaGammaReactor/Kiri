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
  removeDataSource,
  addProtein,
  removeProtein,
  fetchProject,
} from "../store/projectSlice";
import { hydrateSource } from "../store/dataSourceSlice";
import { apiClient } from "../services/api";
import { ProteinSelector } from "../components/ProteinSelector";
import { Card, InfoTooltip, DataSourceBadge } from "../components/ui";
import DataSourceStatus from "../components/DataSourceStatus";
import FileManager from "../components/FileManager";

/* ── Data Source Options (same catalog as wizard) ── */
const DATA_SOURCE_OPTIONS = [
  { type: "tcga",     icon: "🧬", label: "TCGA",        description: "The Cancer Genome Atlas RNA-seq data", category: "genomics" },
  { type: "geo",      icon: "📊", label: "GEO",         description: "Gene Expression Omnibus validation cohorts", category: "genomics" },
  { type: "cptac",    icon: "🔬", label: "CPTAC",       description: "Clinical Proteomic Tumor Analysis Consortium", category: "genomics" },
  { type: "scrna",    icon: "🔵", label: "Single-Cell",  description: "Human Colon Cancer scRNA-seq Atlas", category: "genomics" },
  { type: "string",   icon: "🔗", label: "STRING-DB",   description: "Protein-protein interaction network (EMBL/SIB)", category: "protein" },
  { type: "drugbank", icon: "💊", label: "DrugBank",    description: "FDA-approved drug-target interactions", category: "drug" },
  { type: "pubchem",  icon: "🧪", label: "PubChem",     description: "NIH compound database — structures & properties", category: "drug" },
  { type: "chembl",   icon: "📐", label: "ChEMBL",      description: "EMBL-EBI bioactivity — IC50, Ki, binding affinities", category: "drug" },
];

const SOURCE_CATEGORIES = [
  { key: "genomics", label: "Genomics & Expression" },
  { key: "protein",  label: "Protein Interaction & Structure" },
  { key: "drug",     label: "Drug & Compound" },
];

const CATEGORY_META: Record<string, { icon: string; description: string; emptyHint: string }> = {
  genomics: {
    icon: "🧬",
    description: "Powers Atlas heatmaps, enrichment analysis, and DNB detection",
    emptyHint: "Add TCGA, GEO, or upload custom data to power the Atlas module",
  },
  protein: {
    icon: "🔗",
    description: "Powers PPI networks, 3D structure views, and cleavage analysis",
    emptyHint: "Add STRING-DB or upload custom interaction data",
  },
  drug: {
    icon: "💊",
    description: "Powers drug interactions, target ranking, and compound exploration",
    emptyHint: "Add DrugBank, PubChem, ChEMBL, or connect a custom API",
  },
};

export default function ProjectSettings() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const activeProject = useAppSelector((s: RootState) => s.project.activeProject);
  const hydrationStatus = useAppSelector((s: RootState) => s.dataSource.hydrationStatus);

  const [editingInfo, setEditingInfo] = useState(false);
  const [name, setName] = useState(activeProject?.name ?? "");
  const [description, setDescription] = useState(activeProject?.description ?? "");
  const [cancerType, setCancerType] = useState(activeProject?.cancer_type ?? "");
  const [saving, setSaving] = useState(false);
  const [showAddSource, setShowAddSource] = useState<string | false>(false);
  const [customAction, setCustomAction] = useState<{ category: string; type: "upload" | "api" } | null>(null);
  const [customApiUrl, setCustomApiUrl] = useState("");
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

  // Add data source + trigger hydration
  const handleAddSource = useCallback(async (sourceType: string) => {
    if (!activeProject) return;
    const result = await dispatch(addDataSource({
      projectId: activeProject.id,
      source_type: sourceType,
    }));
    // Trigger hydration for drug-type sources
    if (addDataSource.fulfilled.match(result) && result.payload?.id) {
      const hydratableTypes = ["drugbank", "pubchem", "chembl"];
      if (hydratableTypes.includes(sourceType)) {
        dispatch(
          hydrateSource({
            projectId: activeProject.id,
            sourceId: result.payload.id,
          })
        );
      }
    }
  }, [activeProject, dispatch]);

  // Add custom API source
  const handleAddCustomApi = useCallback(async (category: string) => {
    if (!activeProject || !customApiUrl.trim()) return;
    await dispatch(addDataSource({
      projectId: activeProject.id,
      source_type: "custom_api",
      label: `Custom API (${category})`,
      config: { url: customApiUrl.trim(), category },
    }));
    setCustomApiUrl("");
    setCustomAction(null);
  }, [activeProject, dispatch, customApiUrl]);

  // Remove data source
  const handleRemoveSource = useCallback(async (sourceId: string) => {
    if (!activeProject) return;
    await dispatch(removeDataSource({
      projectId: activeProject.id,
      sourceId,
    }));
  }, [activeProject, dispatch]);

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

  const existingSourceTypes = new Set(activeProject.data_sources.map((ds) => ds.source_type));

  // Helper: get sources for a category (catalog + custom that were tagged with this category)
  const getSourcesForCategory = (catKey: string) => {
    return activeProject.data_sources.filter((ds) => {
      const meta = DATA_SOURCE_OPTIONS.find((o) => o.type === ds.source_type);
      if (meta) return meta.category === catKey;
      // Custom sources: check config.category or source_type prefix
      if (ds.source_type === "custom" || ds.source_type === "custom_api") {
        return ds.config?.category === catKey;
      }
      return false;
    });
  };


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
            Section 2: Data Sources
        ══════════════════════════════════════════ */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-kiri-text uppercase tracking-wider">
                {t("settings.dataSources", "Data Sources")} ({activeProject.data_sources.length})
              </h2>
              <p className="text-[10px] text-kiri-text-dim mt-0.5">
                {t("settings.dataSourcesDesc", "Configure which databases power each analysis module")}
              </p>
            </div>
          </div>

          {SOURCE_CATEGORIES.map((cat) => {
            const catMeta = CATEGORY_META[cat.key];
            const sourcesInCat = getSourcesForCategory(cat.key);
            const availableToAdd = DATA_SOURCE_OPTIONS.filter(
              (o) => o.category === cat.key && !existingSourceTypes.has(o.type)
            );
            const isUploadOpen = customAction?.category === cat.key && customAction.type === "upload";
            const isApiOpen = customAction?.category === cat.key && customAction.type === "api";

            return (
              <Card key={cat.key}>
                {/* Category Header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">{catMeta.icon}</span>
                  <div className="flex-1">
                    <h3 className="text-xs font-semibold text-kiri-text uppercase tracking-wider">
                      {String(t(`settings.cat_${cat.key}`, cat.label))}
                    </h3>
                    <p className="text-[10px] text-kiri-text-dim">
                      {String(t(`settings.cat_${cat.key}_desc`, catMeta.description))}
                    </p>
                  </div>
                </div>

                {/* Current Sources in this category */}
                {sourcesInCat.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {sourcesInCat.map((ds) => {
                      const meta = DATA_SOURCE_OPTIONS.find((o) => o.type === ds.source_type);
                      return (
                        <motion.div
                          key={ds.id}
                          layout
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-kiri-border bg-kiri-bg"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-base">{meta?.icon ?? "📄"}</span>
                            <div>
                              <p className="text-xs font-medium text-kiri-text flex items-center gap-1.5">
                                {ds.label || meta?.label || ds.source_type.toUpperCase()}
                                <DataSourceBadge sourceType={ds.source_type} addedAt={ds.added_at} />
                              </p>
                              <p className="text-[10px] text-kiri-text-dim">
                                {meta?.description || String(ds.config?.url || ds.source_type)}
                              </p>
                              <DataSourceStatus
                                status={hydrationStatus[ds.id] || ds.status}
                                onRetry={() => dispatch(
                                  hydrateSource({
                                    projectId: activeProject.id,
                                    sourceId: ds.id,
                                  })
                                )}
                                compact
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveSource(ds.id)}
                            className="text-[10px] px-2 py-1 rounded text-kiri-error hover:bg-kiri-error/10 transition"
                          >
                            {t("common.remove", "Remove")}
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {sourcesInCat.length === 0 && !(isUploadOpen || isApiOpen || showAddSource === cat.key) && (
                  <p className="text-[10px] text-kiri-text-dim text-center py-2 mb-2">
                    {String(t(`settings.cat_${cat.key}_empty`, catMeta.emptyHint))}
                  </p>
                )}

                {/* ── Action Buttons Row ── */}
                <div className="flex items-center gap-2 flex-wrap">
                  {availableToAdd.length > 0 && (
                    <button
                      onClick={() => { setShowAddSource(showAddSource === cat.key ? false : cat.key); setCustomAction(null); }}
                      className={`text-[10px] px-2.5 py-1.5 rounded-lg font-medium transition flex items-center gap-1 ${
                        showAddSource === cat.key
                          ? "bg-kiri-accent text-kiri-bg"
                          : "bg-kiri-surface border border-kiri-border text-kiri-text hover:border-kiri-accent"
                      }`}
                    >
                      <span>📋</span> {showAddSource === cat.key
                        ? t("common.close", "Close")
                        : t("settings.addFromCatalog", "Add from Catalog")}
                    </button>
                  )}
                  <button
                    onClick={() => { setCustomAction(isUploadOpen ? null : { category: cat.key, type: "upload" }); setShowAddSource(false); }}
                    className={`text-[10px] px-2.5 py-1.5 rounded-lg font-medium transition flex items-center gap-1 ${
                      isUploadOpen
                        ? "bg-kiri-accent text-kiri-bg"
                        : "bg-kiri-surface border border-kiri-border text-kiri-text hover:border-kiri-accent"
                    }`}
                  >
                    <span>📁</span> {t("settings.uploadFile", "Upload File")}
                  </button>
                  <button
                    onClick={() => { setCustomAction(isApiOpen ? null : { category: cat.key, type: "api" }); setShowAddSource(false); }}
                    className={`text-[10px] px-2.5 py-1.5 rounded-lg font-medium transition flex items-center gap-1 ${
                      isApiOpen
                        ? "bg-kiri-accent text-kiri-bg"
                        : "bg-kiri-surface border border-kiri-border text-kiri-text hover:border-kiri-accent"
                    }`}
                  >
                    <span>🔌</span> {t("settings.customApi", "Custom API")}
                  </button>
                </div>

                {/* ── Expandable Panels ── */}
                <AnimatePresence>
                  {/* Catalog Panel */}
                  {showAddSource === cat.key && availableToAdd.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 pt-3 border-t border-kiri-border"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {availableToAdd.map((source) => (
                          <button
                            key={source.type}
                            onClick={() => handleAddSource(source.type)}
                            className="text-left p-2.5 rounded-lg border border-kiri-border bg-kiri-surface hover:border-kiri-accent cursor-pointer transition-all"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{source.icon}</span>
                              <div className="flex-1">
                                <span className="text-xs font-medium text-kiri-text">
                                  {source.label}
                                </span>
                                <DataSourceBadge sourceType={source.type} />
                              </div>
                            </div>
                            <p className="text-[10px] text-kiri-text-dim mt-0.5 ml-6">
                              {source.description}
                            </p>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Upload Panel */}
                  {isUploadOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 pt-3 border-t border-kiri-border"
                    >
                      <FileManager
                        projectId={activeProject.id}
                        compact
                        onFileUploaded={(file) => {
                          if (file.file_type === "expression" && file.has_parsed_data) {
                            dispatch(addDataSource({
                              projectId: activeProject.id,
                              source_type: "custom",
                              label: file.original_name,
                              config: { file_id: file.id, original_name: file.original_name, category: cat.key },
                            }));
                          }
                        }}
                      />
                    </motion.div>
                  )}

                  {/* Custom API Panel */}
                  {isApiOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 pt-3 border-t border-kiri-border"
                    >
                      <label className="block text-[10px] text-kiri-text-dim mb-1">
                        {t("settings.apiUrlLabel", "Enter a REST API endpoint URL")}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={customApiUrl}
                          onChange={(e) => setCustomApiUrl(e.target.value)}
                          placeholder="https://api.example.com/v1/data"
                          className="flex-1 px-3 py-1.5 rounded-lg bg-kiri-bg border border-kiri-border text-kiri-text text-xs placeholder-kiri-text-dim focus:border-kiri-accent focus:outline-none"
                        />
                        <button
                          onClick={() => handleAddCustomApi(cat.key)}
                          disabled={!customApiUrl.trim()}
                          className="px-3 py-1.5 rounded-lg bg-kiri-accent text-kiri-bg text-xs font-medium disabled:opacity-40 hover:brightness-110 transition"
                        >
                          {t("settings.connectApi", "Connect")}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })}
        </div>

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
