import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useAppDispatch, useAppSelector } from "../store";
import type { RootState } from "../store";
import {
  createProject,
  addProtein,
  fetchSuggestions,
  removeProtein,
} from "../store/projectSlice";
import { ProteinCard } from "../components/ProteinCard";
import { ProteinSelector } from "../components/ProteinSelector";
import { DataSourceBadge } from "../components/ui";
import DataSourceStatus from "../components/DataSourceStatus";

/* ── Cancer Type Options ── */
const CANCER_TYPES = [
  { value: "COAD", label: "Colorectal — Colon (COAD)" },
  { value: "READ", label: "Colorectal — Rectal (READ)" },
  { value: "BRCA", label: "Breast (BRCA)" },
  { value: "LUAD", label: "Lung Adenocarcinoma (LUAD)" },
  { value: "LUSC", label: "Lung Squamous Cell (LUSC)" },
  { value: "PRAD", label: "Prostate (PRAD)" },
  { value: "LIHC", label: "Liver (LIHC)" },
  { value: "STAD", label: "Stomach (STAD)" },
  { value: "OV", label: "Ovarian (OV)" },
  { value: "GBM", label: "Glioblastoma (GBM)" },
  { value: "OTHER", label: "Other" },
];

/* ── Data Source metadata for display on Review step ── */
const SOURCE_META: Record<string, { icon: string; label: string; description: string }> = {
  tcga:             { icon: "🧬", label: "TCGA",            description: "The Cancer Genome Atlas RNA-seq data" },
  geo:              { icon: "📊", label: "GEO",             description: "Gene Expression Omnibus validation cohorts" },
  cptac:            { icon: "🔬", label: "CPTAC",           description: "Clinical Proteomic Tumor Analysis Consortium" },
  scrna:            { icon: "🔵", label: "Single-Cell",     description: "Human Colon Cancer scRNA-seq Atlas" },
  custom:           { icon: "📁", label: "Custom Upload",   description: "Upload CSV/TSV with expression data" },
  string:           { icon: "🔗", label: "STRING-DB",       description: "Protein-protein interaction network (EMBL/SIB)" },
  drugbank:         { icon: "💊", label: "DrugBank",        description: "FDA-approved drug-target interactions (Univ. Alberta)" },
  pubchem:          { icon: "🧪", label: "PubChem",         description: "NIH compound database — structures & properties" },
  chembl:           { icon: "📐", label: "ChEMBL",          description: "EMBL-EBI bioactivity — IC50, Ki, binding affinities" },
  massive:          { icon: "📡", label: "MassIVE",         description: "Mass spectrometry proteomics repository (UCSD)" },
  proteomecentral:  { icon: "🧫", label: "ProteomeCentral", description: "Aggregated proteomics datasets (ProteomeXchange)" },
};

const STEPS = ["basics", "proteins", "review"] as const;
type Step = (typeof STEPS)[number];

export default function NewProjectWizard() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { activeProject, isCreating } = useAppSelector(
    (s: RootState) => s.project
  );
  const hydrationStatus = useAppSelector((s: RootState) => s.dataSource.hydrationStatus);

  const [currentStep, setCurrentStep] = useState<Step>("basics");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cancerType, setCancerType] = useState("COAD");
  const [isAddingProtein, setIsAddingProtein] = useState(false);

  const stepIndex = STEPS.indexOf(currentStep);

  const handleNext = useCallback(async () => {
    if (currentStep === "basics") {
      // Create the project — backend auto-registers recommended data sources
      const result = await dispatch(
        createProject({ name, description, cancer_type: cancerType })
      );
      if (createProject.fulfilled.match(result)) {
        setCurrentStep("proteins");
      }
    } else if (currentStep === "proteins") {
      // Fetch suggestions when moving to review
      if (activeProject) {
        dispatch(fetchSuggestions(activeProject.id));
      }
      setCurrentStep("review");
    } else if (currentStep === "review") {
      // Navigate to the project
      if (activeProject) {
        navigate(`/projects/${activeProject.id}/atlas`);
      }
    }
  }, [
    currentStep,
    name,
    description,
    cancerType,
    activeProject,
    dispatch,
    navigate,
  ]);

  const handleBack = () => {
    const idx = STEPS.indexOf(currentStep);
    if (idx > 0) setCurrentStep(STEPS[idx - 1]);
  };

  const handleAddProtein = async (symbol: string) => {
    if (!activeProject) return;
    setIsAddingProtein(true);
    await dispatch(addProtein({ projectId: activeProject.id, gene_symbol: symbol }));
    setIsAddingProtein(false);
  };

  const handleRemoveProteinBySymbol = (symbol: string) => {
    if (!activeProject) return;
    const protein = activeProject.proteins.find(
      (p) => p.gene_symbol.toUpperCase() === symbol.toUpperCase()
    );
    if (protein) {
      dispatch(removeProtein({ projectId: activeProject.id, proteinId: protein.id }));
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case "basics":
        return name.trim().length > 0;
      case "proteins":
        return (activeProject?.proteins?.length ?? 0) > 0;
      case "review":
        return true;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-8 max-w-3xl mx-auto"
    >
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate("/projects")}
          className="text-sm text-kiri-text-muted hover:text-kiri-text transition-colors mb-4 inline-flex items-center gap-1"
        >
          ← {t("projects.back_to_projects")}
        </button>
        <h1 className="text-2xl font-bold text-kiri-text tracking-tight">
          {t("projects.new_project")}
        </h1>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-1 mb-8">
        {STEPS.map((step, i) => (
          <div key={step} className="flex items-center gap-1 flex-1">
            <div
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= stepIndex
                  ? "bg-kiri-accent"
                  : "bg-kiri-border"
              }`}
            />
          </div>
        ))}
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {/* Step 1: Basics */}
          {currentStep === "basics" && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-kiri-text mb-2">
                  {t("projects.project_name")} *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("projects.name_placeholder") || "e.g., BRCA1 Breast Cancer Study"}
                  className="w-full px-4 py-2.5 rounded-lg bg-kiri-bg border border-kiri-border text-kiri-text placeholder-kiri-text-dim focus:border-kiri-accent focus:outline-none transition-colors"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-kiri-text mb-2">
                  {t("projects.description")}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("projects.desc_placeholder") || "Brief description of your research goals..."}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg bg-kiri-bg border border-kiri-border text-kiri-text placeholder-kiri-text-dim focus:border-kiri-accent focus:outline-none transition-colors resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-kiri-text mb-2">
                  {t("projects.cancer_type")}
                </label>
                <select
                  value={cancerType}
                  onChange={(e) => setCancerType(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-kiri-bg border border-kiri-border text-kiri-text focus:border-kiri-accent focus:outline-none transition-colors"
                >
                  {CANCER_TYPES.map((ct) => (
                    <option key={ct.value} value={ct.value}>
                      {ct.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 2: Protein Targets */}
          {currentStep === "proteins" && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-kiri-text mb-2">
                  {t("projects.add_proteins")}
                </label>
                <p className="text-xs text-kiri-text-muted mb-3">
                  {t("projects.catalog_help") || "Select proteins from the catalog below, or search to filter. You can also add custom proteins by gene symbol."}
                </p>
                <ProteinSelector
                  selectedSymbols={activeProject?.proteins.map((p) => p.gene_symbol) ?? []}
                  onSelect={handleAddProtein}
                  onDeselect={handleRemoveProteinBySymbol}
                  isAdding={isAddingProtein}
                />
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {currentStep === "review" && activeProject && (
            <div className="space-y-6">
              <div className="rounded-xl border border-kiri-border bg-kiri-surface p-6 space-y-4">
                <div>
                  <div className="text-xs text-kiri-text-dim uppercase tracking-wider mb-1">
                    {t("projects.project_name")}
                  </div>
                  <div className="text-lg font-semibold text-kiri-text">
                    {activeProject.name}
                  </div>
                </div>

                {activeProject.description && (
                  <div>
                    <div className="text-xs text-kiri-text-dim uppercase tracking-wider mb-1">
                      {t("projects.description")}
                    </div>
                    <div className="text-sm text-kiri-text-muted">
                      {activeProject.description}
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-xs text-kiri-text-dim uppercase tracking-wider mb-1">
                    {t("projects.cancer_type")}
                  </div>
                  <span className="text-sm px-2 py-0.5 rounded bg-kiri-accent-glow text-kiri-accent border border-kiri-accent-dim">
                    {activeProject.cancer_type}
                  </span>
                </div>

                <div>
                  <div className="text-xs text-kiri-text-dim uppercase tracking-wider mb-2">
                    {t("projects.protein_targets")} ({activeProject.proteins.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeProject.proteins.map((p) => (
                      <ProteinCard key={p.id} protein={p} compact />
                    ))}
                  </div>
                </div>

                {/* Auto-loaded Data Sources */}
                <div>
                  <div className="text-xs text-kiri-text-dim uppercase tracking-wider mb-2">
                    {t("projects.data_sources_label")} ({activeProject.data_sources.length})
                    <span className="ml-1.5 text-kiri-text-dim font-normal normal-case">
                      — {t("projects.auto_connected", "auto-connected for your cancer type")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeProject.data_sources.map((ds) => {
                      const meta = SOURCE_META[ds.source_type];
                      const sourceStatus = (hydrationStatus[ds.id] || ds.status || "") as string;
                      return (
                        <div
                          key={ds.id}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-kiri-bg border border-kiri-border text-kiri-text-muted flex items-center gap-2"
                        >
                          <span>{meta?.icon ?? "📄"} {meta?.label ?? ds.source_type.toUpperCase()}</span>
                          <DataSourceBadge sourceType={ds.source_type} />
                          {sourceStatus && sourceStatus !== "idle" && sourceStatus !== "pending" && (
                            <DataSourceStatus status={sourceStatus} compact />
                          )}
                        </div>
                      );
                    })}
                    {activeProject.data_sources.length === 0 && (
                      <span className="text-xs text-kiri-text-dim">
                        {t("projects.no_sources")}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-kiri-text-dim mt-2">
                    {t("projects.sources_manage_hint", "You can add, remove, or configure data sources later in Project Settings.")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-kiri-border">
        <button
          onClick={handleBack}
          disabled={stepIndex === 0}
          className="px-4 py-2 text-sm text-kiri-text-muted hover:text-kiri-text transition-colors disabled:opacity-30"
        >
          ← {t("common.back") || "Back"}
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-kiri-text-dim">
            {stepIndex + 1} / {STEPS.length}
          </span>
          <button
            onClick={handleNext}
            disabled={!canProceed() || isCreating}
            className="px-6 py-2.5 rounded-lg bg-kiri-accent text-kiri-bg font-medium text-sm hover:brightness-110 transition disabled:opacity-40 flex items-center gap-2"
          >
            {isCreating && (
              <div className="w-4 h-4 border-2 border-kiri-bg border-t-transparent rounded-full animate-spin" />
            )}
            {currentStep === "review"
              ? t("projects.open_project") || "Open Project →"
              : t("common.next") || "Next →"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
