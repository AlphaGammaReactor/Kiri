/**
 * Kiri — Cross-Validation Page
 *
 * Evidence bridge between dry-lab (Atlas: TCGA/GEO) and wet-lab (PDM: assays, images, animals).
 * Shows concordance report, gene-level evidence map, and per-gene overlay details.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAppSelector } from "../store";
import { usePageState } from "../hooks/usePageState";
import { motion, AnimatePresence } from "framer-motion";
import { Card, StatusBadge, InfoTooltip, Stat } from "../components/ui";
import {
  fetchConcordance,
  fetchOverlay,
  fetchValidationGrid,
  type ConcordanceResult,
  type ConcordanceGene,
  type OverlayResult,
} from "../services/api";
import { useProjectDataSources } from "../hooks/useProjectDataSources";
import { ValidationGridPanel } from "../components/ValidationGridPanel";

const CONCORDANCE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  strong:   { bg: "bg-kiri-success/20", text: "text-kiri-success", label: "Strong" },
  partial:  { bg: "bg-kiri-warning/20",   text: "text-kiri-warning",  label: "Partial" },
  dry_only: { bg: "bg-kiri-info/20",     text: "text-kiri-info",    label: "Dry Only" },
  wet_only: { bg: "bg-kiri-accent/20",  text: "text-kiri-accent", label: "Wet Only" },
};

export default function CrossValidation() {
  const { t } = useTranslation();
  const activeProject = useAppSelector((s) => s.project.activeProject);
  const activeGenes = useAppSelector((s) => s.app.selectedGenes);
  const projectId = activeProject?.id;

  const [concordance, setConcordance] = useState<ConcordanceResult | null>(null);
  const [loading, setLoading] = useState(false);
  
  // ── Persisted UI State ──
  const [uiState, setUiState] = usePageState<{ selectedGene: string | null }>("crossval", { selectedGene: null });
  const { selectedGene } = uiState;
  const setSelectedGene = useCallback((val: string | null) => setUiState(s => ({ ...s, selectedGene: val })), [setUiState]);

  const [overlay, setOverlay] = useState<OverlayResult | null>(null);
  const [overlayLoading, setOverlayLoading] = useState(false);

  // ── Data Sources & Validation Grid ──
  const { expressionSources } = useProjectDataSources();
  const projectIds = expressionSources
    .filter((ds) => ds.type === "tcga")
    .map((ds) => ds.config?.project_id as string)
    .filter(Boolean);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [valGridData, setValGridData] = useState<any | null>(null);
  const [valGridLoading, setValGridLoading] = useState(false);
  const [valGridError, setValGridError] = useState<string | null>(null);

  const loadConcordance = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetchConcordance(projectId);
      if (res.status === "success" && res.data) setConcordance(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void loadConcordance();
  }, [loadConcordance]);

  // Fetch Validation Grid when sufficient data is available
  useEffect(() => {
    async function loadValGrid() {
      if (!concordance?.genes?.length || projectIds.length < 2) return;
      
      setValGridLoading(true);
      setValGridError(null);
      try {
        const genes = concordance.genes.map(g => g.gene_symbol);
        const res = await fetchValidationGrid(genes, null, "tumor", "normal", 0.05, 1.0, projectIds);
        if (res.status === "success" && res.data) {
          setValGridData(res.data);
        } else {
          setValGridError(res.errors?.join("; ") || "Failed to load validation grid");
        }
      } catch (err: unknown) {
        setValGridError(err instanceof Error ? err.message : "An error occurred fetching validation grid");
      } finally {
        setValGridLoading(false);
      }
    }
    
    // Only attempt if we haven't already fetched or failed
    if (concordance && projectIds.length >= 2 && !valGridData && !valGridLoading && valGridError === null) {
      void loadValGrid();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concordance, projectIds.join(","), valGridData, valGridLoading, valGridError]);

  const handleGeneClick = async (gene: string) => {
    if (!projectId) return;
    setSelectedGene(gene);
    setOverlayLoading(true);
    try {
      const res = await fetchOverlay(projectId, gene);
      if (res.status === "success" && res.data) setOverlay(res.data);
    } catch { /* ignore */ }
    setOverlayLoading(false);
  };

  const overall = concordance?.overall ?? { strong: 0, partial: 0, dry_only: 0, wet_only: 0 };
  const totalGenes = (concordance?.genes?.length ?? 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-8 max-w-[1400px] mx-auto"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-kiri-text tracking-tight flex items-center gap-2">
            {t("crossval.title")}
            <InfoTooltip tooltipKey="tooltips.crossval" />
          </h1>
          <p className="text-sm text-kiri-text-muted mt-1">
            {t("crossval.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {activeGenes.length > 0 && (
            <Stat label="Target Genes" value={activeGenes.join(", ")} />
          )}
          <Stat label="Cohorts" value={`${projectIds.length}`} />
          {/* Data Source Selector */}
          <div className="bg-kiri-bg/50 border border-kiri-border rounded px-3 py-2 min-w-[140px]">
            <p className="text-[10px] text-kiri-text-dim uppercase tracking-wider">Dataset</p>
            <select
              value={expressionSources.find(s => s.type === "tcga")?.type || "tcga"}
              className="w-full text-sm font-mono mt-0.5 bg-transparent text-kiri-text border-none outline-none cursor-pointer appearance-none"
              onChange={() => {}}
            >
              {expressionSources
                .filter((src) => ["tcga", "geo", "cptac", "scrna", "custom"].includes(src.type))
                .map((src) => (
                  <option key={src.type} value={src.type} className="bg-kiri-surface text-kiri-text">
                    {src.icon} {src.label}{src.detail ? ` — ${src.detail}` : ""}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard
          label={t("crossval.strong")}
          count={overall.strong}
          color="emerald"
          icon="✅"
        />
        <SummaryCard
          label={t("crossval.partial")}
          count={overall.partial}
          color="amber"
          icon="🔶"
        />
        <SummaryCard
          label={t("crossval.dry_only")}
          count={overall.dry_only}
          color="sky"
          icon="💻"
        />
        <SummaryCard
          label={t("crossval.wet_only")}
          count={overall.wet_only}
          color="purple"
          icon="🧪"
        />
      </div>

      {/* Main Content — Gene Grid + Overlay Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Gene Concordance Table */}
        <div className="lg:col-span-2">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-kiri-text">
                {t("crossval.gene_map")}
              </h2>
              <span className="text-[10px] text-kiri-text-dim">
                {totalGenes} {t("crossval.genes_tracked")}
              </span>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="w-6 h-6 rounded-full border-2 border-kiri-accent border-r-transparent animate-spin mx-auto mb-2" />
                <p className="text-xs text-kiri-text-muted">{t("common.loading")}</p>
              </div>
            ) : totalGenes === 0 ? (
              <div className="text-center py-12 text-kiri-text-muted">
                <p className="text-4xl mb-3">🔗</p>
                <p className="text-sm">{t("crossval.empty")}</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
                {concordance?.genes.map((gene) => (
                  <GeneRow
                    key={gene.gene_symbol}
                    gene={gene}
                    selected={selectedGene === gene.gene_symbol}
                    onClick={() => handleGeneClick(gene.gene_symbol)}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right: Gene Overlay Detail */}
        <div>
          <AnimatePresence mode="wait">
            {selectedGene && (
              <motion.div
                key={selectedGene}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <OverlayPanel
                  gene={selectedGene}
                  overlay={overlay}
                  loading={overlayLoading}
                />
              </motion.div>
            )}
            {!selectedGene && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card>
                  <div className="text-center py-16 text-kiri-text-muted">
                    <p className="text-3xl mb-2">👈</p>
                    <p className="text-xs">{t("crossval.select_gene")}</p>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* NEW SECTION: Validation Grid */}
      <div className="mt-8">
        <h2 className="text-xl font-bold text-kiri-text tracking-tight mb-4 flex items-center gap-2">
          {t("crossval.multi_cohort", "Multi-Cohort Validation Grid")}
          <span className="text-xs font-normal text-kiri-text-dim px-2 py-0.5 rounded-full border border-kiri-border">
            {projectIds.length} Cohorts
          </span>
        </h2>
        
        {projectIds.length < 2 ? (
          <div className="bg-kiri-surface border border-kiri-border rounded-lg p-12 text-center border-dashed">
            <span className="text-4xl mb-4 block">🌐</span>
            <p className="text-sm text-kiri-text-muted">
              {t("crossval.needs_cohorts", "Validation grid requires at least 2 TCGA/GDC data sources. Add more sources in Project Settings.")}
            </p>
          </div>
        ) : valGridLoading ? (
          <div className="bg-kiri-surface border border-kiri-border rounded-lg p-12 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-kiri-accent border-r-transparent animate-spin mx-auto mb-4" />
            <p className="text-sm text-kiri-text-muted">{t("crossval.computing_grid", "Computing multi-cohort statistics...")}</p>
          </div>
        ) : valGridError ? (
          <div className="p-4 bg-kiri-error/10 border border-kiri-error/20 text-kiri-error rounded-lg">
            {valGridError}
          </div>
        ) : valGridData ? (
          <div className="bg-kiri-surface border border-kiri-border rounded-lg p-6">
            <ValidationGridPanel
              cohorts={valGridData.cohorts || projectIds}
              genes={valGridData.genes || []}
              grid={valGridData.grid || {}}
              intersectGenes={valGridData.intersect_genes || []}
              concordance={valGridData.concordance || {}}
            />
          </div>
        ) : null}
      </div>

    </motion.div>
  );
}


// ══════════════════════════════
//  Sub-components
// ══════════════════════════════

function SummaryCard({ label, count, color, icon }: { label: string; count: number; color: string; icon: string }) {
  const colorMap: Record<string, string> = {
    emerald: "border-kiri-success/30 bg-kiri-success/5",
    amber: "border-kiri-warning/30 bg-kiri-warning/5",
    sky: "border-kiri-info/30 bg-kiri-info/5",
    purple: "border-kiri-accent/30 bg-kiri-accent/5",
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color] || ""} transition-all`}>
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <div>
          <p className="text-2xl font-bold text-kiri-text">{count}</p>
          <p className="text-[10px] text-kiri-text-muted uppercase tracking-wide">{label}</p>
        </div>
      </div>
    </div>
  );
}

function GeneRow({
  gene,
  selected,
  onClick,
}: {
  gene: ConcordanceGene;
  selected: boolean;
  onClick: () => void;
}) {
  const cc = CONCORDANCE_COLORS[gene.concordance_level] ?? CONCORDANCE_COLORS.dry_only;
  const wet = gene.wet_lab_evidence;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all ${
        selected
          ? "bg-kiri-accent/10 border border-kiri-accent/30"
          : "hover:bg-kiri-surface-hover border border-transparent"
      }`}
    >
      <span className="text-xs font-mono font-bold text-kiri-text min-w-[60px]">
        {gene.gene_symbol}
      </span>
      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${cc.bg} ${cc.text}`}>
        {cc.label}
      </span>
      <div className="flex-1 flex items-center gap-2 text-[10px] text-kiri-text-dim">
        {gene.dry_lab && <span>💻 Dry</span>}
        {wet.assays > 0 && <span>🧪 {wet.assays}</span>}
        {wet.images > 0 && <span>🔬 {wet.images}</span>}
        {wet.animal_models > 0 && <span>🐁 {wet.animal_models}</span>}
      </div>
    </button>
  );
}

function OverlayPanel({
  gene,
  overlay,
  loading,
}: {
  gene: string;
  overlay: OverlayResult | null;
  loading: boolean;
}) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <Card>
        <div className="text-center py-12">
          <div className="w-6 h-6 rounded-full border-2 border-kiri-accent border-r-transparent animate-spin mx-auto mb-2" />
          <p className="text-xs text-kiri-text-muted">{t("common.loading")}</p>
        </div>
      </Card>
    );
  }

  if (!overlay) return null;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-mono font-bold px-2 py-1 rounded bg-kiri-accent-glow text-kiri-accent">
          {gene}
        </span>
        <span className="text-[10px] text-kiri-text-dim">
          {overlay.evidence_count} {t("crossval.evidence_items")}
        </span>
      </div>

      {/* Assays */}
      {overlay.assays.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-kiri-text-muted mb-2">🧪 {t("pdm.tab_assays")}</h4>
          <div className="space-y-1.5">
            {overlay.assays.map((a) => (
              <div key={a.id} className="px-2 py-1.5 rounded bg-kiri-bg text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-kiri-text font-medium">{a.title || t("pdm.untitled")}</span>
                  <StatusBadge label={a.assay_type.replace("_", " ").toUpperCase()} variant="info" />
                </div>
                {(a.conditions as Record<string, string>)?.cell_line && (
                  <p className="text-[10px] text-kiri-text-dim mt-0.5">
                    🧫 {(a.conditions as Record<string, string>).cell_line}
                    {(a.conditions as Record<string, string>)?.treatment && ` • 💉 ${(a.conditions as Record<string, string>).treatment}`}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Images */}
      {overlay.images.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-kiri-text-muted mb-2">🔬 {t("pdm.tab_imaging")}</h4>
          <div className="space-y-1.5">
            {overlay.images.map((img) => (
              <div key={img.id} className="px-2 py-1.5 rounded bg-kiri-bg text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-kiri-text font-medium">{img.title || t("pdm.untitled")}</span>
                  <StatusBadge label={img.image_type.replace("_", " ").toUpperCase()} variant="info" />
                </div>
                {img.tags?.length > 0 && (
                  <div className="flex gap-1 mt-0.5">
                    {img.tags.map((tag) => (
                      <span key={tag} className="text-[9px] px-1 py-0.5 rounded bg-kiri-surface-hover text-kiri-text-dim">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Animal Models */}
      {overlay.animal_models.length > 0 && (
        <div className="mb-2">
          <h4 className="text-xs font-semibold text-kiri-text-muted mb-2">🐁 {t("pdm.tab_animals")}</h4>
          <div className="space-y-1.5">
            {overlay.animal_models.map((exp) => (
              <div key={exp.id} className="px-2 py-1.5 rounded bg-kiri-bg text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-kiri-text font-medium">{exp.title || t("pdm.untitled")}</span>
                  <StatusBadge label={exp.model_type.toUpperCase()} variant="info" />
                </div>
                <p className="text-[10px] text-kiri-text-dim mt-0.5">
                  {(exp.groups as Record<string, Record<string, number>>)?.control &&
                    `🔵 Control: n=${(exp.groups as Record<string, Record<string, number>>).control?.n ?? "?"}`}
                  {(exp.groups as Record<string, Record<string, number>>)?.treatment &&
                    ` • 🔴 Treatment: n=${(exp.groups as Record<string, Record<string, number>>).treatment?.n ?? "?"}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {overlay.evidence_count === 0 && (
        <p className="text-xs text-kiri-text-dim text-center py-6">
          {t("crossval.no_wet_evidence")}
        </p>
      )}
    </Card>
  );
}
