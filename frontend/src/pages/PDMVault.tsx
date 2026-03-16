/**
 * Kiri — PDM Vault Page
 *
 * Publication & Data Management vault for storing wet-lab evidence.
 * Three tabs: Assay Manager, Imaging Vault, Animal Model Tracker.
 * Manual data entry with project-scoped persistence.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { usePageState } from "../hooks/usePageState";
import { useAppSelector } from "../store";
import { Card, StatusBadge, InfoTooltip } from "../components/ui";
import {
  fetchAssays,
  createAssay,
  deleteAssay,
  fetchLabImages,
  createLabImage,
  deleteLabImage,
  fetchAnimalExperiments,
  createAnimalExperiment,
  deleteAnimalExperiment,
  type AssayRecord,
  type LabImageRecord,
  type AnimalExperimentRecord,
} from "../services/api";

type PDMTab = "assays" | "imaging" | "animals";

const ASSAY_TYPES = [
  { value: "cck8", label: "CCK-8 Proliferation" },
  { value: "wound_healing", label: "Wound Healing" },
  { value: "colony_formation", label: "Colony Formation" },
];

const IMAGE_TYPES = [
  { value: "western_blot", label: "Western Blot" },
  { value: "immunofluorescence", label: "Immunofluorescence (IF)" },
  { value: "ihc", label: "Immunohistochemistry (IHC)" },
];

const MODEL_TYPES = [
  { value: "xenograft", label: "Xenograft" },
  { value: "pdx", label: "PDX" },
  { value: "syngeneic", label: "Syngeneic" },
  { value: "transgenic", label: "Transgenic" },
];

export default function PDMVault() {
  const { t } = useTranslation();
  const activeProject = useAppSelector((s) => s.project.activeProject);
  const projectId = activeProject?.id;
  // ── Persisted UI State ──
  const [uiState, setUiState] = usePageState<{ activeTab: PDMTab }>("pdm", { activeTab: "assays" });
  const { activeTab } = uiState;
  const setActiveTab = useCallback((val: PDMTab) => setUiState(s => ({ ...s, activeTab: val })), [setUiState]);
  const [showForm, setShowForm] = useState(false);

  // ── Assay State ──
  const [assays, setAssays] = useState<AssayRecord[]>([]);
  const [assayLoading, setAssayLoading] = useState(false);

  // ── Image State ──
  const [images, setImages] = useState<LabImageRecord[]>([]);
  const [imageLoading, setImageLoading] = useState(false);

  // ── Animal State ──
  const [experiments, setExperiments] = useState<AnimalExperimentRecord[]>([]);
  const [animalLoading, setAnimalLoading] = useState(false);

  // ── Load data ──
  const loadAssays = useCallback(async () => {
    if (!projectId) return;
    setAssayLoading(true);
    try {
      const res = await fetchAssays(projectId);
      if (res.status === "success" && res.data) setAssays(res.data);
    } catch { /* ignore */ }
    setAssayLoading(false);
  }, [projectId]);

  const loadImages = useCallback(async () => {
    if (!projectId) return;
    setImageLoading(true);
    try {
      const res = await fetchLabImages(projectId);
      if (res.status === "success" && res.data) setImages(res.data);
    } catch { /* ignore */ }
    setImageLoading(false);
  }, [projectId]);

  const loadExperiments = useCallback(async () => {
    if (!projectId) return;
    setAnimalLoading(true);
    try {
      const res = await fetchAnimalExperiments(projectId);
      if (res.status === "success" && res.data) setExperiments(res.data);
    } catch { /* ignore */ }
    setAnimalLoading(false);
  }, [projectId]);

  useEffect(() => {
    void loadAssays();
    void loadImages();
    void loadExperiments();
  }, [loadAssays, loadImages, loadExperiments]);

  // ── Create handlers ──
  const handleCreateAssay = async (data: {
    assay_type: string;
    title: string;
    gene_symbol: string;
    conditions: Record<string, unknown>;
    results: Record<string, unknown>;
    notes: string;
  }) => {
    if (!projectId) return;
    await createAssay({ ...data, project_id: projectId });
    setShowForm(false);
    loadAssays();
  };

  const handleCreateImage = async (data: {
    image_type: string;
    title: string;
    gene_symbol: string;
    tags: string[];
    metadata_json: Record<string, unknown>;
    notes: string;
  }) => {
    if (!projectId) return;
    await createLabImage({ ...data, project_id: projectId });
    setShowForm(false);
    loadImages();
  };

  const handleCreateExperiment = async (data: {
    model_type: string;
    title: string;
    gene_symbol: string;
    groups: Record<string, unknown>;
    measurements: Record<string, unknown>;
    notes: string;
  }) => {
    if (!projectId) return;
    await createAnimalExperiment({ ...data, project_id: projectId });
    setShowForm(false);
    loadExperiments();
  };

  const handleDeleteAssay = async (id: string) => {
    await deleteAssay(id);
    loadAssays();
  };

  const handleDeleteImage = async (id: string) => {
    await deleteLabImage(id);
    loadImages();
  };

  const handleDeleteExperiment = async (id: string) => {
    await deleteAnimalExperiment(id);
    loadExperiments();
  };

  const proteins = activeProject?.proteins?.map((p: any) => p.gene_symbol) ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-kiri-text tracking-tight flex items-center gap-2">
            {t("pdm.title")}
            <InfoTooltip tooltipKey="tooltips.pdm" />
          </h1>
          <p className="text-sm text-kiri-text-muted mt-1">
            {t("pdm.subtitle")}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs px-4 py-2 rounded-lg bg-kiri-accent text-kiri-bg font-semibold hover:brightness-110 transition-all"
        >
          {showForm ? t("common.cancel") : `+ ${t("pdm.add_record")}`}
        </button>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 border-b border-kiri-border mb-6">
        {([
          { key: "assays" as PDMTab, icon: "🧪", count: assays.length },
          { key: "imaging" as PDMTab, icon: "🔬", count: images.length },
          { key: "animals" as PDMTab, icon: "🐁", count: experiments.length },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setShowForm(false); }}
            className={`text-sm px-4 py-2.5 border-b-2 transition-colors font-medium ${
              activeTab === tab.key
                ? "border-kiri-accent text-kiri-accent"
                : "border-transparent text-kiri-text-muted hover:text-kiri-text"
            }`}
          >
            {tab.icon} {t(`pdm.tab_${tab.key}`)}
            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-kiri-surface-hover">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === "assays" && (
          <motion.div key="assays" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {showForm && (
              <AssayForm proteins={proteins} onSubmit={handleCreateAssay} onCancel={() => setShowForm(false)} />
            )}
            <AssayList assays={assays} loading={assayLoading} onDelete={handleDeleteAssay} />
          </motion.div>
        )}
        {activeTab === "imaging" && (
          <motion.div key="imaging" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {showForm && (
              <ImageForm proteins={proteins} onSubmit={handleCreateImage} onCancel={() => setShowForm(false)} />
            )}
            <ImageList images={images} loading={imageLoading} onDelete={handleDeleteImage} />
          </motion.div>
        )}
        {activeTab === "animals" && (
          <motion.div key="animals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {showForm && (
              <AnimalForm proteins={proteins} onSubmit={handleCreateExperiment} onCancel={() => setShowForm(false)} />
            )}
            <AnimalList experiments={experiments} loading={animalLoading} onDelete={handleDeleteExperiment} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}


// ══════════════════════════════
//  Assay Form & List
// ══════════════════════════════

function AssayForm({
  proteins,
  onSubmit,
  onCancel,
}: {
  proteins: string[];
  onSubmit: (data: { assay_type: string; title: string; gene_symbol: string; conditions: Record<string, unknown>; results: Record<string, unknown>; notes: string }) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [assayType, setAssayType] = useState("cck8");
  const [title, setTitle] = useState("");
  const [gene, setGene] = useState(proteins[0] || "");
  const [cellLine, setCellLine] = useState("");
  const [treatment, setTreatment] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <Card className="mb-4 border-kiri-accent/30">
      <h3 className="text-sm font-semibold text-kiri-text mb-3">{t("pdm.new_assay")}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-kiri-text-muted block mb-1">{t("pdm.assay_type")}</label>
          <select value={assayType} onChange={(e) => setAssayType(e.target.value)} className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none">
            {ASSAY_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-kiri-text-muted block mb-1">{t("pdm.field_title")}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("pdm.title_placeholder")} className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none" />
        </div>
        <div>
          <label className="text-xs text-kiri-text-muted block mb-1">{t("pdm.gene_target")}</label>
          <select value={gene} onChange={(e) => setGene(e.target.value)} className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none">
            {proteins.map((g) => <option key={g} value={g}>{g}</option>)}
            {proteins.length === 0 && <option value="">—</option>}
          </select>
        </div>
        <div>
          <label className="text-xs text-kiri-text-muted block mb-1">{t("pdm.cell_line")}</label>
          <input value={cellLine} onChange={(e) => setCellLine(e.target.value)} placeholder="HCT116" className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none" />
        </div>
        <div>
          <label className="text-xs text-kiri-text-muted block mb-1">{t("pdm.treatment")}</label>
          <input value={treatment} onChange={(e) => setTreatment(e.target.value)} placeholder="siPARL" className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none" />
        </div>
        <div>
          <label className="text-xs text-kiri-text-muted block mb-1">{t("pdm.notes")}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded text-kiri-text-muted hover:text-kiri-text transition-colors">{t("common.cancel")}</button>
        <button
          onClick={() => onSubmit({ assay_type: assayType, title, gene_symbol: gene, conditions: { cell_line: cellLine, treatment }, results: {}, notes })}
          className="text-xs px-4 py-1.5 rounded-lg bg-kiri-accent text-kiri-bg font-semibold hover:brightness-110 transition-all"
        >
          {t("common.save")}
        </button>
      </div>
    </Card>
  );
}

function AssayList({ assays, loading, onDelete }: { assays: AssayRecord[]; loading: boolean; onDelete: (id: string) => void }) {
  const { t } = useTranslation();

  if (loading) return <Card><p className="text-xs text-kiri-text-muted text-center py-8">{t("common.loading")}</p></Card>;

  if (assays.length === 0) {
    return (
      <Card>
        <div className="text-center py-12 text-kiri-text-muted">
          <p className="text-4xl mb-3">🧪</p>
          <p className="text-sm">{t("pdm.empty_assays")}</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {assays.map((assay) => (
        <Card key={assay.id}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-kiri-text">{assay.title || t("pdm.untitled")}</h3>
                <StatusBadge label={assay.assay_type.replace("_", " ").toUpperCase()} variant="info" />
                {assay.gene_symbol && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-kiri-accent-glow text-kiri-accent">{assay.gene_symbol}</span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-kiri-text-muted">
                {(assay.conditions as Record<string, string>)?.cell_line && <span>🧫 {(assay.conditions as Record<string, string>).cell_line}</span>}
                {(assay.conditions as Record<string, string>)?.treatment && <span>💉 {(assay.conditions as Record<string, string>).treatment}</span>}
                <span>📅 {new Date(assay.created_at).toLocaleDateString()}</span>
              </div>
              {assay.notes && <p className="text-xs text-kiri-text-dim mt-1">{assay.notes}</p>}
            </div>
            <button onClick={() => onDelete(assay.id)} className="text-xs text-kiri-text-dim hover:text-red-400 transition-colors px-2">✕</button>
          </div>
        </Card>
      ))}
    </div>
  );
}


// ══════════════════════════════
//  Image Form & List
// ══════════════════════════════

function ImageForm({
  proteins,
  onSubmit,
  onCancel,
}: {
  proteins: string[];
  onSubmit: (data: { image_type: string; title: string; gene_symbol: string; tags: string[]; metadata_json: Record<string, unknown>; notes: string }) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [imageType, setImageType] = useState("western_blot");
  const [title, setTitle] = useState("");
  const [gene, setGene] = useState(proteins[0] || "");
  const [antibody, setAntibody] = useState("");
  const [exposure, setExposure] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <Card className="mb-4 border-kiri-accent/30">
      <h3 className="text-sm font-semibold text-kiri-text mb-3">{t("pdm.new_image")}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-kiri-text-muted block mb-1">{t("pdm.image_type")}</label>
          <select value={imageType} onChange={(e) => setImageType(e.target.value)} className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none">
            {IMAGE_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-kiri-text-muted block mb-1">{t("pdm.field_title")}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("pdm.title_placeholder")} className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none" />
        </div>
        <div>
          <label className="text-xs text-kiri-text-muted block mb-1">{t("pdm.gene_target")}</label>
          <select value={gene} onChange={(e) => setGene(e.target.value)} className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none">
            {proteins.map((g) => <option key={g} value={g}>{g}</option>)}
            {proteins.length === 0 && <option value="">—</option>}
          </select>
        </div>
        <div>
          <label className="text-xs text-kiri-text-muted block mb-1">{t("pdm.antibody")}</label>
          <input value={antibody} onChange={(e) => setAntibody(e.target.value)} placeholder="anti-PARL" className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none" />
        </div>
        <div>
          <label className="text-xs text-kiri-text-muted block mb-1">{t("pdm.exposure")}</label>
          <input value={exposure} onChange={(e) => setExposure(e.target.value)} placeholder="30s" className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none" />
        </div>
        <div>
          <label className="text-xs text-kiri-text-muted block mb-1">{t("pdm.notes")}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded text-kiri-text-muted hover:text-kiri-text transition-colors">{t("common.cancel")}</button>
        <button
          onClick={() => onSubmit({ image_type: imageType, title, gene_symbol: gene, tags: [gene, antibody].filter(Boolean), metadata_json: { antibody, exposure }, notes })}
          className="text-xs px-4 py-1.5 rounded-lg bg-kiri-accent text-kiri-bg font-semibold hover:brightness-110 transition-all"
        >
          {t("common.save")}
        </button>
      </div>
    </Card>
  );
}

function ImageList({ images, loading, onDelete }: { images: LabImageRecord[]; loading: boolean; onDelete: (id: string) => void }) {
  const { t } = useTranslation();

  if (loading) return <Card><p className="text-xs text-kiri-text-muted text-center py-8">{t("common.loading")}</p></Card>;

  if (images.length === 0) {
    return (
      <Card>
        <div className="text-center py-12 text-kiri-text-muted">
          <p className="text-4xl mb-3">🔬</p>
          <p className="text-sm">{t("pdm.empty_images")}</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {images.map((img) => (
        <Card key={img.id}>
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold text-kiri-text">{img.title || t("pdm.untitled")}</h3>
              <StatusBadge label={img.image_type.replace("_", " ").toUpperCase()} variant="info" />
            </div>
            <button onClick={() => onDelete(img.id)} className="text-xs text-kiri-text-dim hover:text-red-400 transition-colors">✕</button>
          </div>
          <div className="space-y-1">
            {img.gene_symbol && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-kiri-accent-glow text-kiri-accent">{img.gene_symbol}</span>
            )}
            <div className="flex flex-wrap gap-1 mt-1">
              {img.tags?.map((tag) => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-kiri-surface-hover text-kiri-text-muted">{tag}</span>
              ))}
            </div>
            {(img.metadata_json as Record<string, string>)?.antibody && (
              <p className="text-xs text-kiri-text-muted">🧬 {(img.metadata_json as Record<string, string>).antibody}</p>
            )}
            <p className="text-[10px] text-kiri-text-dim">📅 {new Date(img.created_at).toLocaleDateString()}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}


// ══════════════════════════════
//  Animal Experiment Form & List
// ══════════════════════════════

function AnimalForm({
  proteins,
  onSubmit,
  onCancel,
}: {
  proteins: string[];
  onSubmit: (data: { model_type: string; title: string; gene_symbol: string; groups: Record<string, unknown>; measurements: Record<string, unknown>; notes: string }) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [modelType, setModelType] = useState("xenograft");
  const [title, setTitle] = useState("");
  const [gene, setGene] = useState(proteins[0] || "");
  const [controlN, setControlN] = useState("6");
  const [treatmentN, setTreatmentN] = useState("6");
  const [notes, setNotes] = useState("");

  return (
    <Card className="mb-4 border-kiri-accent/30">
      <h3 className="text-sm font-semibold text-kiri-text mb-3">{t("pdm.new_experiment")}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-kiri-text-muted block mb-1">{t("pdm.model_type")}</label>
          <select value={modelType} onChange={(e) => setModelType(e.target.value)} className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none">
            {MODEL_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-kiri-text-muted block mb-1">{t("pdm.field_title")}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("pdm.title_placeholder")} className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none" />
        </div>
        <div>
          <label className="text-xs text-kiri-text-muted block mb-1">{t("pdm.gene_target")}</label>
          <select value={gene} onChange={(e) => setGene(e.target.value)} className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none">
            {proteins.map((g) => <option key={g} value={g}>{g}</option>)}
            {proteins.length === 0 && <option value="">—</option>}
          </select>
        </div>
        <div>
          <label className="text-xs text-kiri-text-muted block mb-1">{t("pdm.control_n")}</label>
          <input value={controlN} onChange={(e) => setControlN(e.target.value)} type="number" className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none" />
        </div>
        <div>
          <label className="text-xs text-kiri-text-muted block mb-1">{t("pdm.treatment_n")}</label>
          <input value={treatmentN} onChange={(e) => setTreatmentN(e.target.value)} type="number" className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none" />
        </div>
        <div>
          <label className="text-xs text-kiri-text-muted block mb-1">{t("pdm.notes")}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full text-xs bg-kiri-bg border border-kiri-border rounded px-2 py-1.5 text-kiri-text focus:border-kiri-accent outline-none" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded text-kiri-text-muted hover:text-kiri-text transition-colors">{t("common.cancel")}</button>
        <button
          onClick={() => onSubmit({
            model_type: modelType,
            title,
            gene_symbol: gene,
            groups: { control: { n: parseInt(controlN) || 6 }, treatment: { n: parseInt(treatmentN) || 6 } },
            measurements: {},
            notes,
          })}
          className="text-xs px-4 py-1.5 rounded-lg bg-kiri-accent text-kiri-bg font-semibold hover:brightness-110 transition-all"
        >
          {t("common.save")}
        </button>
      </div>
    </Card>
  );
}

function AnimalList({ experiments, loading, onDelete }: { experiments: AnimalExperimentRecord[]; loading: boolean; onDelete: (id: string) => void }) {
  const { t } = useTranslation();

  if (loading) return <Card><p className="text-xs text-kiri-text-muted text-center py-8">{t("common.loading")}</p></Card>;

  if (experiments.length === 0) {
    return (
      <Card>
        <div className="text-center py-12 text-kiri-text-muted">
          <p className="text-4xl mb-3">🐁</p>
          <p className="text-sm">{t("pdm.empty_animals")}</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {experiments.map((exp) => (
        <Card key={exp.id}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-kiri-text">{exp.title || t("pdm.untitled")}</h3>
                <StatusBadge label={exp.model_type.toUpperCase()} variant="info" />
                {exp.gene_symbol && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-kiri-accent-glow text-kiri-accent">{exp.gene_symbol}</span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-kiri-text-muted">
                {(exp.groups as Record<string, Record<string, number>>)?.control && <span>🔵 Control: n={(exp.groups as Record<string, Record<string, number>>).control?.n ?? "?"}</span>}
                {(exp.groups as Record<string, Record<string, number>>)?.treatment && <span>🔴 Treatment: n={(exp.groups as Record<string, Record<string, number>>).treatment?.n ?? "?"}</span>}
                <span>📅 {new Date(exp.created_at).toLocaleDateString()}</span>
              </div>
              {exp.notes && <p className="text-xs text-kiri-text-dim mt-1">{exp.notes}</p>}
            </div>
            <button onClick={() => onDelete(exp.id)} className="text-xs text-kiri-text-dim hover:text-red-400 transition-colors px-2">✕</button>
          </div>
        </Card>
      ))}
    </div>
  );
}
