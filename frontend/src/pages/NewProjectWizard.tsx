import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useAppDispatch, useAppSelector } from "../store";
import type { RootState } from "../store";
import {
  createProject,
  addProtein,
  addDataSource,
  fetchSuggestions,
  removeProtein,
} from "../store/projectSlice";
import { hydrateSource } from "../store/dataSourceSlice";
import { ProteinCard } from "../components/ProteinCard";
import { ProteinSelector } from "../components/ProteinSelector";
import { DataSourceBadge } from "../components/ui";
import FileManager from "../components/FileManager";
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

/* ── Data Source Options (grouped by category) ── */
const DATA_SOURCE_OPTIONS = [
  // ── Genomics & Expression ──
  {
    type: "tcga",
    icon: "🧬",
    label: "TCGA",
    description: "The Cancer Genome Atlas RNA-seq data",
    category: "genomics",
    projects: ["TCGA-COAD", "TCGA-READ", "TCGA-BRCA", "TCGA-LUAD"],
  },
  {
    type: "geo",
    icon: "📊",
    label: "GEO",
    description: "Gene Expression Omnibus validation cohorts",
    category: "genomics",
    accessions: ["GSE39582", "GSE33113", "GSE17536"],
  },
  {
    type: "cptac",
    icon: "🔬",
    label: "CPTAC",
    description: "Clinical Proteomic Tumor Analysis Consortium",
    category: "genomics",
  },
  {
    type: "scrna",
    icon: "🔵",
    label: "Single-Cell",
    description: "Human Colon Cancer scRNA-seq Atlas",
    category: "genomics",
  },
  {
    type: "custom",
    icon: "📁",
    label: "Custom Upload",
    description: "Upload CSV/TSV with expression data",
    category: "genomics",
  },
  // ── Protein Interaction & Structure ──
  {
    type: "string",
    icon: "🔗",
    label: "STRING-DB",
    description: "Protein-protein interaction network (EMBL/SIB)",
    category: "protein",
  },
  // ── Drug & Compound ──
  {
    type: "drugbank",
    icon: "💊",
    label: "DrugBank",
    description: "FDA-approved drug-target interactions (Univ. Alberta)",
    category: "drug",
  },
  {
    type: "pubchem",
    icon: "🧪",
    label: "PubChem",
    description: "NIH compound database — structures & properties",
    category: "drug",
  },
  {
    type: "chembl",
    icon: "📐",
    label: "ChEMBL",
    description: "EMBL-EBI bioactivity — IC50, Ki, binding affinities",
    category: "drug",
  },
];

/* ── Per-cancer-type recommended data sources ── */
const CANCER_RECOMMENDATIONS: Record<string, string[]> = {
  COAD: ["tcga", "geo", "string", "drugbank", "pubchem", "chembl"],
  READ: ["tcga", "geo", "string", "drugbank", "pubchem", "chembl"],
  BRCA: ["tcga", "geo", "cptac", "string", "drugbank", "pubchem", "chembl"],
  LUAD: ["tcga", "geo", "cptac", "string", "drugbank", "pubchem", "chembl"],
  LUSC: ["tcga", "geo", "string", "drugbank", "pubchem"],
  PRAD: ["tcga", "geo", "string", "drugbank", "pubchem", "chembl"],
  LIHC: ["tcga", "geo", "string", "drugbank", "pubchem", "chembl"],
  STAD: ["tcga", "geo", "string", "drugbank", "pubchem"],
  OV:   ["tcga", "geo", "cptac", "string", "drugbank", "pubchem", "chembl"],
  GBM:  ["tcga", "geo", "scrna", "string", "drugbank", "pubchem", "chembl"],
  OTHER: ["string", "drugbank", "pubchem", "chembl"],
};

const SOURCE_CATEGORIES = [
  { key: "genomics", label: "Genomics & Expression" },
  { key: "protein", label: "Protein Interaction & Structure" },
  { key: "drug", label: "Drug & Compound" },
];

const STEPS = ["basics", "proteins", "sources", "review"] as const;
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
  const [selectedSources, setSelectedSources] = useState<
    { type: string; label: string; config: Record<string, unknown> }[]
  >([]);
  const [geoAccession, setGeoAccession] = useState("");
  const [isAddingProtein, setIsAddingProtein] = useState(false);

  const stepIndex = STEPS.indexOf(currentStep);

  const handleNext = useCallback(async () => {
    if (currentStep === "basics") {
      // Create the project in the backend
      const result = await dispatch(
        createProject({ name, description, cancer_type: cancerType })
      );
      if (createProject.fulfilled.match(result)) {
        setCurrentStep("proteins");
      }
    } else if (currentStep === "proteins") {
      // Fetch suggestions when moving to review or if user wants to see them
      if (activeProject) {
        dispatch(fetchSuggestions(activeProject.id));
      }
      setCurrentStep("sources");
    } else if (currentStep === "sources") {
      // Add selected data sources to the project and trigger hydration
      if (activeProject) {
        for (const source of selectedSources) {
          // Build TCGA config with project_id derived from cancer type
          let sourceConfig = { ...source.config };
          if (source.type === "tcga" && !sourceConfig.project_id) {
            const tcgaMapping: Record<string, string> = {
              COAD: "TCGA-COAD,TCGA-READ", READ: "TCGA-COAD,TCGA-READ", CRC: "TCGA-COAD,TCGA-READ",
              BRCA: "TCGA-BRCA", LUAD: "TCGA-LUAD", LUSC: "TCGA-LUSC",
              PRAD: "TCGA-PRAD", LIHC: "TCGA-LIHC", STAD: "TCGA-STAD",
              OV: "TCGA-OV", GBM: "TCGA-GBM",
            };
            sourceConfig = { ...sourceConfig, project_id: tcgaMapping[cancerType] || cancerType };
          }
          const result = await dispatch(
            addDataSource({
              projectId: activeProject.id,
              source_type: source.type,
              label: source.label,
              config: sourceConfig,
            })
          );
          // Trigger hydration for drug-type sources
          if (addDataSource.fulfilled.match(result) && result.payload?.id) {
            const hydratableTypes = ["drugbank", "pubchem", "chembl"];
            if (hydratableTypes.includes(source.type)) {
              dispatch(
                hydrateSource({
                  projectId: activeProject.id,
                  sourceId: result.payload.id,
                })
              );
            }
          }
        }
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
    selectedSources,
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

  const toggleSource = (type: string, config: Record<string, unknown> = {}) => {
    setSelectedSources((prev) => {
      const exists = prev.find((s) => s.type === type);
      if (exists) return prev.filter((s) => s.type !== type);
      // Get the label from DATA_SOURCE_OPTIONS
      const meta = DATA_SOURCE_OPTIONS.find((o) => o.type === type);
      const label = meta?.label || type.toUpperCase();
      return [...prev, { type, label, config }];
    });
  };

  const addGeoAccession = () => {
    if (!geoAccession.match(/^GSE\d+$/)) return;
    toggleSource("geo", { accession: geoAccession });
    setGeoAccession("");
  };

  const canProceed = () => {
    switch (currentStep) {
      case "basics":
        return name.trim().length > 0;
      case "proteins":
        return (activeProject?.proteins?.length ?? 0) > 0;
      case "sources":
        return true; // Sources are optional
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
                  placeholder={t("projects.name_placeholder") || "e.g., PARL-MAVS CRC Study"}
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

          {/* Step 3: Data Sources */}
          {currentStep === "sources" && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-kiri-text mb-2">
                  {t("projects.select_sources")}
                </label>
                <p className="text-xs text-kiri-text-muted mb-4">
                  {t("projects.sources_help")}
                </p>
              </div>

              <div className="space-y-5">
                {SOURCE_CATEGORIES.map((cat) => {
                  const sourcesInCat = DATA_SOURCE_OPTIONS.filter(
                    (s) => s.category === cat.key
                  );
                  if (sourcesInCat.length === 0) return null;

                  const recommended =
                    CANCER_RECOMMENDATIONS[cancerType] ||
                    CANCER_RECOMMENDATIONS.OTHER;

                  return (
                    <div key={cat.key}>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-kiri-text-muted mb-2">
                        {cat.label}
                      </h4>
                      <div className="space-y-2">
                        {sourcesInCat.map((source) => {
                          const isSelected = selectedSources.some(
                            (s) => s.type === source.type
                          );
                          const isRecommended = recommended.includes(source.type);
                          return (
                            <button
                              key={source.type}
                              onClick={() => toggleSource(source.type)}
                              className={`w-full text-left p-4 rounded-xl border transition-all ${
                                isSelected
                                  ? "border-kiri-accent bg-kiri-accent-glow"
                                  : "border-kiri-border bg-kiri-surface hover:border-kiri-border-focus"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-xl">{source.icon}</span>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-kiri-text">
                                      {source.label}
                                    </span>
                                    <DataSourceBadge sourceType={source.type} />
                                    {isRecommended && (
                                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-kiri-warning/20 text-kiri-warning border border-kiri-warning/30">
                                        ★ Recommended
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-kiri-text-muted">
                                    {source.description}
                                  </div>
                                </div>
                                <div
                                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                                    isSelected
                                      ? "border-kiri-accent bg-kiri-accent text-kiri-bg"
                                      : "border-kiri-border"
                                  }`}
                                >
                                  {isSelected && "✓"}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* GEO Accession Input */}
              {selectedSources.some((s) => s.type === "geo") && (
                <div className="pl-10">
                  <label className="block text-xs text-kiri-text-muted mb-1">
                    {t("projects.geo_accession")}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={geoAccession}
                      onChange={(e) => setGeoAccession(e.target.value.toUpperCase())}
                      placeholder="GSE39582"
                      className="flex-1 px-3 py-1.5 rounded-lg bg-kiri-bg border border-kiri-border text-kiri-text text-sm placeholder-kiri-text-dim focus:border-kiri-accent focus:outline-none"
                    />
                    <button
                      onClick={addGeoAccession}
                      disabled={!geoAccession.match(/^GSE\d+$/)}
                      className="px-3 py-1.5 rounded-lg bg-kiri-accent text-kiri-bg text-sm font-medium disabled:opacity-40 hover:brightness-110 transition"
                    >
                      {t("common.add") || "Add"}
                    </button>
                  </div>
                </div>
              )}

              {/* Custom Upload Zone (shown when custom is selected) */}
              {selectedSources.some((s) => s.type === "custom") && activeProject && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="pl-10"
                >
                  <label className="block text-xs text-kiri-text-muted mb-1">
                    {t("projects.custom_upload_help", "Upload CSV/TSV expression files to use as a data source")}
                  </label>
                  <FileManager
                    projectId={activeProject.id}
                    filterType="expression"
                    compact
                    onFileUploaded={(file) => {
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
                </motion.div>
              )}
            </div>
          )}

          {/* Step 4: Review */}
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

                <div>
                  <div className="text-xs text-kiri-text-dim uppercase tracking-wider mb-2">
                    {t("projects.data_sources_label")} ({selectedSources.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedSources.map((s) => {
                      const info = DATA_SOURCE_OPTIONS.find(
                        (o) => o.type === s.type
                      );
                      // Find the source ID from activeProject
                      const dsRecord = activeProject.data_sources.find(
                        (ds) => ds.source_type === s.type
                      );
                      const sourceStatus = dsRecord ? hydrationStatus[dsRecord.id] : undefined;
                      return (
                        <div
                          key={s.type}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-kiri-bg border border-kiri-border text-kiri-text-muted flex items-center gap-2"
                        >
                          <span>{info?.icon} {info?.label}</span>
                          <DataSourceBadge sourceType={s.type} />
                          {sourceStatus && (
                            <DataSourceStatus status={sourceStatus} compact />
                          )}
                        </div>
                      );
                    })}
                    {selectedSources.length === 0 && (
                      <span className="text-xs text-kiri-text-dim">
                        {t("projects.no_sources")}
                      </span>
                    )}
                  </div>
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
