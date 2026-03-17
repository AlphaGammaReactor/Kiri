import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, AlertTriangle, ShieldCheck, Activity, Database, Beaker,
  FlaskConical, BarChart3, Settings, X, ExternalLink, Copy, Check
} from "lucide-react";
import { InfoTooltip } from "../components/ui";
import { useAppSelector, useAppDispatch } from "../store";
import type { RootState } from "../store";
import { hydrateSource } from "../store/dataSourceSlice";
import { fetchSourceCachedData, fetchCompoundDescription } from "../services/api";
import { useNavigate } from "react-router-dom";

// ─── Types ─────────────────────────────────────────────────────

type Interaction = {
  drug_name: string;
  drug_id: string;
  pharmacology: string;
  indication: string;
  evidence_level: "High" | "Medium" | "Low";
  source: string;
};

type Ranking = {
  gene: string;
  score: number;
  drug_count: number;
  high_evidence_drugs: number;
  ctd_associations: number;
  chembl_bioactivities: number;
  total_references: number;
  druggability_tier: string;
};

type PubChemCompound = {
  cid: number;
  name: string;
  iupac_name: string;
  molecular_formula: string;
  molecular_weight: number;
  xlogp: number | null;
  tpsa: number | null;
  hbond_donors: number;
  hbond_acceptors: number;
  canonical_smiles: string;
  inchi_key?: string;
  target_gene: string;
  source: string;
};

type ChEMBLActivity = {
  molecule_chembl_id: string;
  molecule_name: string;
  activity_type: string;
  value: number | null;
  units: string;
  relation: string;
  assay_type: string;
  assay_description?: string;
  pmid?: string;
  data_validity_comment?: string;
  pchembl_value: number | null;
  source: string;
};

type CompoundDescription = {
  title: string;
  description: string;
  source_name: string;
  url: string;
};

// ─── Dialog Backdrop ───────────────────────────────────────────

function DialogBackdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 350 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-kiri-surface border border-kiri-border rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl shadow-black/40 custom-scrollbar my-auto"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function DialogHeader({ title, subtitle, onClose, icon }: { title: string; subtitle?: string; onClose: () => void; icon?: React.ReactNode }) {
  return (
    <div className="sticky top-0 bg-kiri-surface border-b border-kiri-border p-6 flex items-start justify-between z-10">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {icon && <div className="mt-1 shrink-0">{icon}</div>}
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-kiri-text truncate">{title}</h2>
          {subtitle && <p className="text-sm text-kiri-text-muted mt-1 line-clamp-2">{subtitle}</p>}
        </div>
      </div>
      <button
        onClick={onClose}
        className="ml-4 p-2 rounded-lg text-kiri-text-dim hover:text-kiri-text hover:bg-kiri-surface-hover transition-colors shrink-0"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

function DetailRow({ label, value, mono, className }: { label: string; value: React.ReactNode; mono?: boolean; className?: string }) {
  if (!value && value !== 0) return null;
  return (
    <div className={`flex justify-between items-start gap-4 py-2.5 ${className || ""}`}>
      <span className="text-sm text-kiri-text-dim shrink-0">{label}</span>
      <span className={`text-sm text-kiri-text text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1 text-xs text-kiri-text-dim hover:text-kiri-accent transition-colors px-2 py-1 rounded border border-kiri-border hover:border-kiri-accent-dim"
    >
      {copied ? <Check className="w-3 h-3 text-kiri-success" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : t("common.copy")}
    </button>
  );
}

// ─── Compound Detail Dialog ────────────────────────────────────

function CompoundDetailDialog({ compound, onClose }: { compound: PubChemCompound; onClose: () => void }) {
  const { t } = useTranslation();
  const [descriptions, setDescriptions] = useState<CompoundDescription[]>([]);
  const [descLoading, setDescLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchCompoundDescription(compound.cid);
        if (!cancelled && res.data) {
          setDescriptions(res.data.descriptions || []);
        }
      } catch { /* ignore */ }
      if (!cancelled) setDescLoading(false);
    })();
    return () => { cancelled = true; };
  }, [compound.cid]);

  return (
    <DialogBackdrop onClose={onClose}>
      <DialogHeader
        title={`CID ${compound.cid}`}
        subtitle={compound.iupac_name || compound.name}
        onClose={onClose}
        icon={<FlaskConical className="w-6 h-6 text-kiri-success" />}
      />

      <div className="p-6 space-y-6">
        {/* Core Properties */}
        <div>
          <h3 className="text-xs font-bold text-kiri-text-dim uppercase tracking-wider mb-2">{t("drugs.detail_properties", "Molecular Properties")}</h3>
          <div className="bg-kiri-bg rounded-lg border border-kiri-border p-4 divide-y divide-kiri-border-dim">
            <DetailRow label={t("drugs.formula")} value={compound.molecular_formula} mono />
            <DetailRow label={t("drugs.detail_mw", "Molecular Weight")} value={compound.molecular_weight != null ? `${Number(compound.molecular_weight).toFixed(2)} Da` : null} />
            <DetailRow label="XLogP" value={compound.xlogp != null ? compound.xlogp : null} />
            <DetailRow label="TPSA" value={compound.tpsa != null ? `${compound.tpsa} Å²` : null} />
            <DetailRow label={t("drugs.hbond")} value={`${compound.hbond_donors} / ${compound.hbond_acceptors}`} />
            <DetailRow label={t("drugs.detail_target", "Target Gene")} value={compound.target_gene} />
          </div>
        </div>

        {/* SMILES */}
        {compound.canonical_smiles && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-kiri-text-dim uppercase tracking-wider">{t("drugs.detail_smiles", "Canonical SMILES")}</h3>
              <CopyButton text={compound.canonical_smiles} />
            </div>
            <div className="bg-kiri-bg rounded-lg border border-kiri-border p-4">
              <p className="text-xs text-kiri-text font-mono break-all leading-relaxed">{compound.canonical_smiles}</p>
            </div>
          </div>
        )}

        {/* InChI Key */}
        {compound.inchi_key && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-kiri-text-dim uppercase tracking-wider">{t("drugs.detail_inchi", "InChI Key")}</h3>
              <CopyButton text={compound.inchi_key} />
            </div>
            <div className="bg-kiri-bg rounded-lg border border-kiri-border p-4">
              <p className="text-xs text-kiri-text font-mono break-all">{compound.inchi_key}</p>
            </div>
          </div>
        )}

        {/* Pharmacological Descriptions */}
        <div>
          <h3 className="text-xs font-bold text-kiri-text-dim uppercase tracking-wider mb-2">{t("drugs.detail_descriptions", "Pharmacological Description")}</h3>
          {descLoading ? (
            <div className="flex items-center gap-2 p-4 text-kiri-text-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : descriptions.length === 0 ? (
            <p className="text-sm text-kiri-text-muted bg-kiri-bg rounded-lg border border-kiri-border p-4">{t("drugs.detail_no_desc", "No pharmacological description available for this compound.")}</p>
          ) : (
            <div className="space-y-3">
              {descriptions.map((d, i) => (
                <div key={i} className="bg-kiri-bg rounded-lg border border-kiri-border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-kiri-accent">{d.title || d.source_name}</span>
                    {d.url && (
                      <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-xs text-kiri-text-dim hover:text-kiri-accent transition-colors flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" />{t("drugs.detail_view_source", "Source")}
                      </a>
                    )}
                  </div>
                  <p className="text-sm text-kiri-text leading-relaxed">{d.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* External Links */}
        <div className="flex items-center gap-3 pt-2 border-t border-kiri-border">
          <a
            href={`https://pubchem.ncbi.nlm.nih.gov/compound/${compound.cid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-kiri-accent/10 text-kiri-accent rounded-lg text-sm font-medium hover:bg-kiri-accent/20 transition-colors border border-kiri-accent/20"
          >
            <ExternalLink className="w-4 h-4" />
            {t("drugs.detail_view_pubchem", "View on PubChem")}
          </a>
          <span className="text-xs text-kiri-text-dim">{compound.source}</span>
        </div>
      </div>
    </DialogBackdrop>
  );
}

// ─── Interaction Detail Dialog ─────────────────────────────────

function InteractionDetailDialog({ interaction, gene, onClose }: { interaction: Interaction; gene: string; onClose: () => void }) {
  const { t } = useTranslation();

  const evidenceColor = {
    High: "bg-kiri-success/10 text-kiri-success border-kiri-success/20",
    Medium: "bg-kiri-warning/10 text-kiri-warning border-kiri-warning/20",
    Low: "bg-kiri-error/10 text-kiri-error border-kiri-error/20",
  }[interaction.evidence_level] || "bg-kiri-surface-hover text-kiri-text-muted border-kiri-border";

  return (
    <DialogBackdrop onClose={onClose}>
      <DialogHeader
        title={interaction.drug_name}
        subtitle={`${t("drugs.detail_interaction_with", "Interaction with")} ${gene}`}
        onClose={onClose}
        icon={<Beaker className="w-6 h-6 text-kiri-accent" />}
      />

      <div className="p-6 space-y-6">
        {/* Key Info */}
        <div className="flex items-center gap-3">
          <span className={`text-sm px-3 py-1.5 rounded-lg border font-medium ${evidenceColor}`}>
            {interaction.evidence_level} {t("drugs.evidence_level")}
          </span>
          {interaction.drug_id && (
            <span className="text-sm font-mono text-kiri-text-muted bg-kiri-bg px-3 py-1.5 rounded-lg border border-kiri-border">
              {interaction.drug_id}
            </span>
          )}
        </div>

        {/* Pharmacology */}
        <div>
          <h3 className="text-xs font-bold text-kiri-text-dim uppercase tracking-wider mb-2">{t("drugs.pharmacology")}</h3>
          <div className="bg-kiri-bg rounded-lg border border-kiri-border p-4">
            <p className="text-sm text-kiri-text leading-relaxed whitespace-pre-wrap">{interaction.pharmacology || t("drugs.detail_no_pharm", "No pharmacology data available.")}</p>
          </div>
        </div>

        {/* Indication */}
        <div>
          <h3 className="text-xs font-bold text-kiri-text-dim uppercase tracking-wider mb-2">{t("drugs.indication")}</h3>
          <div className="bg-kiri-bg rounded-lg border border-kiri-border p-4">
            <p className="text-sm text-kiri-text leading-relaxed whitespace-pre-wrap">{interaction.indication || t("drugs.detail_no_indication", "No indication data available.")}</p>
          </div>
        </div>

        {/* Source & External Link */}
        <div className="flex items-center gap-3 pt-2 border-t border-kiri-border">
          {interaction.drug_id && interaction.drug_id.startsWith("DB") && (
            <a
              href={`https://go.drugbank.com/drugs/${interaction.drug_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-kiri-accent/10 text-kiri-accent rounded-lg text-sm font-medium hover:bg-kiri-accent/20 transition-colors border border-kiri-accent/20"
            >
              <ExternalLink className="w-4 h-4" />
              {t("drugs.detail_view_drugbank", "View on DrugBank")}
            </a>
          )}
          <span className="text-xs text-kiri-text-dim">{interaction.source}</span>
        </div>
      </div>
    </DialogBackdrop>
  );
}

// ─── Bioactivity Detail Dialog ─────────────────────────────────

function BioactivityDetailDialog({ activity, gene, onClose }: { activity: ChEMBLActivity; gene: string; onClose: () => void }) {
  const { t } = useTranslation();

  const typeColor = {
    IC50: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    Ki: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    Kd: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    EC50: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  }[activity.activity_type] || "bg-gray-500/10 text-gray-400 border-gray-500/20";

  const pchembl = activity.pchembl_value != null ? Number(activity.pchembl_value) : null;
  const potencyLabel = pchembl != null
    ? pchembl >= 8 ? t("drugs.detail_very_potent", "Very Potent")
    : pchembl >= 7 ? t("drugs.detail_potent", "Potent")
    : pchembl >= 6 ? t("drugs.detail_moderate", "Moderate")
    : t("drugs.detail_weak", "Weak")
    : null;

  const potencyColor = pchembl != null
    ? pchembl >= 8 ? "text-kiri-success font-bold"
    : pchembl >= 7 ? "text-kiri-success"
    : pchembl >= 6 ? "text-kiri-warning"
    : "text-kiri-text-muted"
    : "";

  return (
    <DialogBackdrop onClose={onClose}>
      <DialogHeader
        title={activity.molecule_name || activity.molecule_chembl_id}
        subtitle={`${t("drugs.bioactivity_tab")} — ${gene}`}
        onClose={onClose}
        icon={<BarChart3 className="w-6 h-6 text-blue-400" />}
      />

      <div className="p-6 space-y-6">
        {/* Badges */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-sm px-3 py-1.5 rounded-lg border font-medium ${typeColor}`}>
            {activity.activity_type}
          </span>
          <span className="text-sm font-mono text-kiri-text-muted bg-kiri-bg px-3 py-1.5 rounded-lg border border-kiri-border">
            {activity.molecule_chembl_id}
          </span>
        </div>

        {/* Measured Value */}
        <div>
          <h3 className="text-xs font-bold text-kiri-text-dim uppercase tracking-wider mb-2">{t("drugs.detail_measurement", "Measurement")}</h3>
          <div className="bg-kiri-bg rounded-lg border border-kiri-border p-4 divide-y divide-kiri-border-dim">
            <DetailRow
              label={activity.activity_type}
              value={activity.value ? `${activity.relation}${Number(activity.value).toFixed(2)} ${activity.units}` : "—"}
              mono
            />
            <DetailRow
              label="pChEMBL"
              value={pchembl != null ? (
                <span className="flex items-center gap-2">
                  <span className={`font-mono font-bold ${potencyColor}`}>{pchembl.toFixed(2)}</span>
                  {potencyLabel && <span className={`text-xs px-2 py-0.5 rounded border ${potencyColor} bg-kiri-surface`}>{potencyLabel}</span>}
                </span>
              ) : "—"}
            />
          </div>
        </div>

        {/* Assay Info */}
        <div>
          <h3 className="text-xs font-bold text-kiri-text-dim uppercase tracking-wider mb-2">{t("drugs.detail_assay_info", "Assay Information")}</h3>
          <div className="bg-kiri-bg rounded-lg border border-kiri-border p-4 divide-y divide-kiri-border-dim">
            <DetailRow
              label={t("drugs.assay_label")}
              value={activity.assay_type === "B" ? t("drugs.binding") : activity.assay_type === "F" ? t("drugs.functional") : activity.assay_type}
            />
            {activity.assay_description && (
              <div className="py-2.5">
                <span className="text-sm text-kiri-text-dim block mb-1">{t("drugs.detail_assay_desc", "Description")}</span>
                <p className="text-sm text-kiri-text leading-relaxed">{activity.assay_description}</p>
              </div>
            )}
            {activity.data_validity_comment && (
              <DetailRow label={t("drugs.detail_validity", "Data Validity")} value={activity.data_validity_comment} />
            )}
            {activity.pmid && (
              <DetailRow label={t("drugs.detail_reference", "Reference")} value={activity.pmid} mono />
            )}
          </div>
        </div>

        {/* External Link */}
        <div className="flex items-center gap-3 pt-2 border-t border-kiri-border">
          <a
            href={`https://www.ebi.ac.uk/chembl/compound_report_card/${activity.molecule_chembl_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-kiri-accent/10 text-kiri-accent rounded-lg text-sm font-medium hover:bg-kiri-accent/20 transition-colors border border-kiri-accent/20"
          >
            <ExternalLink className="w-4 h-4" />
            {t("drugs.detail_view_chembl", "View on ChEMBL")}
          </a>
          <span className="text-xs text-kiri-text-dim">{activity.source}</span>
        </div>
      </div>
    </DialogBackdrop>
  );
}

// ─── Ranking Detail Dialog ─────────────────────────────────────

function RankingDetailDialog({ ranking, onClose }: { ranking: Ranking; onClose: () => void }) {
  const { t } = useTranslation();

  const tierColor = ranking.druggability_tier.includes("Tier 1") ? "bg-kiri-success/10 text-kiri-success border-kiri-success/20"
    : ranking.druggability_tier.includes("Tier 2") ? "bg-kiri-info/10 text-kiri-info border-kiri-info/20"
    : ranking.druggability_tier.includes("Tier 3") ? "bg-kiri-warning/10 text-kiri-warning border-kiri-warning/20"
    : "bg-kiri-surface-hover text-kiri-text-muted border-kiri-border";

  return (
    <DialogBackdrop onClose={onClose}>
      <DialogHeader
        title={ranking.gene}
        subtitle={t("drugs.detail_target_profile", "Target Druggability Profile")}
        onClose={onClose}
        icon={<ShieldCheck className="w-6 h-6 text-kiri-accent" />}
      />

      <div className="p-6 space-y-6">
        {/* Tier + Score */}
        <div className="flex items-center gap-4">
          <span className={`text-sm px-3 py-1.5 rounded-lg border font-medium ${tierColor}`}>
            {ranking.druggability_tier}
          </span>
          <div className="text-right">
            <div className="text-2xl font-bold font-mono text-kiri-accent">{Number(ranking.score).toFixed(1)}</div>
            <div className="text-xs text-kiri-text-dim">{t("drugs.detail_composite_score", "Composite Score")}</div>
          </div>
        </div>

        {/* Score Breakdown */}
        <div>
          <h3 className="text-xs font-bold text-kiri-text-dim uppercase tracking-wider mb-2">{t("drugs.detail_evidence_breakdown", "Evidence Breakdown")}</h3>
          <div className="bg-kiri-bg rounded-lg border border-kiri-border p-4 space-y-4">
            {/* Drug Count */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-kiri-text">{t("drugs.drug_count")}</span>
                <span className="text-sm font-mono font-bold text-kiri-text">{ranking.drug_count}</span>
              </div>
              <div className="h-2 bg-kiri-surface rounded-full overflow-hidden">
                <div className="h-full bg-kiri-accent rounded-full transition-all" style={{ width: `${Math.min(100, ranking.drug_count * 5)}%` }} />
              </div>
            </div>

            {/* High Evidence */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-kiri-text flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-kiri-success" />{t("drugs.high_evidence")}</span>
                <span className="text-sm font-mono font-bold text-kiri-success">{ranking.high_evidence_drugs}</span>
              </div>
              <div className="h-2 bg-kiri-surface rounded-full overflow-hidden">
                <div className="h-full bg-kiri-success rounded-full transition-all" style={{ width: `${Math.min(100, ranking.high_evidence_drugs * 10)}%` }} />
              </div>
            </div>

            {/* CTD Associations */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-kiri-text">{t("drugs.detail_ctd", "CTD Associations")}</span>
                <span className="text-sm font-mono font-bold text-kiri-text">{ranking.ctd_associations}</span>
              </div>
              <div className="h-2 bg-kiri-surface rounded-full overflow-hidden">
                <div className="h-full bg-kiri-accent rounded-full transition-all" style={{ width: `${Math.min(100, ranking.ctd_associations * 5)}%` }} />
              </div>
            </div>

            {/* ChEMBL Bioactivities */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-kiri-text">{t("drugs.detail_chembl_bio", "ChEMBL Bioactivities")}</span>
                <span className="text-sm font-mono font-bold text-kiri-text">{ranking.chembl_bioactivities}</span>
              </div>
              <div className="h-2 bg-kiri-surface rounded-full overflow-hidden">
                <div className="h-full bg-kiri-info rounded-full transition-all" style={{ width: `${Math.min(100, ranking.chembl_bioactivities * 5)}%` }} />
              </div>
            </div>

            {/* Literature */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-kiri-text">{t("drugs.lit_references")}</span>
                <span className="text-sm font-mono font-bold text-kiri-text">{ranking.total_references}</span>
              </div>
              <div className="h-2 bg-kiri-surface rounded-full overflow-hidden">
                <div className="h-full bg-kiri-warning rounded-full transition-all" style={{ width: `${Math.min(100, ranking.total_references * 3)}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </DialogBackdrop>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Main Page Component
// ═══════════════════════════════════════════════════════════════

export default function DrugDiscovery() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const activeProject = useAppSelector((s: RootState) => s.project.activeProject);

  const [activeTab, setActiveTab] = useState<"interactions" | "ranking" | "compounds" | "bioactivity">("interactions");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [interactions, setInteractions] = useState<Record<string, Interaction[]> | null>(null);
  const [rankings, setRankings] = useState<Ranking[] | null>(null);
  const [compounds, setCompounds] = useState<Record<string, PubChemCompound[]> | null>(null);
  const [bioactivities, setBioactivities] = useState<Record<string, { activities: ChEMBLActivity[]; total_count: number; target: { pref_name?: string } | null }> | null>(null);

  // Detail dialog state
  const [selectedCompound, setSelectedCompound] = useState<PubChemCompound | null>(null);
  const [selectedInteraction, setSelectedInteraction] = useState<{ interaction: Interaction; gene: string } | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<{ activity: ChEMBLActivity; gene: string } | null>(null);
  const [selectedRanking, setSelectedRanking] = useState<Ranking | null>(null);

  const projectGenes = activeProject?.proteins?.map((p) => p.gene_symbol) ?? [];

  const hydrationStatus = useAppSelector((s: RootState) => s.dataSource.hydrationStatus);

  const isLoaded = (ds: { id: string, status: string }) => 
    ds.status === "loaded" || hydrationStatus[ds.id] === "loaded";

  // Find drug-type data sources that are loaded
  const drugbankSource = activeProject?.data_sources.find(
    (ds) => ds.source_type === "drugbank" && isLoaded(ds)
  );
  const pubchemSource = activeProject?.data_sources.find(
    (ds) => ds.source_type === "pubchem" && isLoaded(ds)
  );
  const chemblSource = activeProject?.data_sources.find(
    (ds) => ds.source_type === "chembl" && isLoaded(ds)
  );

  const hasDrugSources = !!(drugbankSource || pubchemSource || chemblSource);
  const hasAnyDrugConfig = activeProject?.data_sources.some(
    (ds) => ["drugbank", "pubchem", "chembl"].includes(ds.source_type)
  );

  // Auto-hydrate pending drug sources on first visit
  const hydratedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!activeProject) return;
    const pendingDrugSources = activeProject.data_sources.filter(
      (ds) => ["drugbank", "pubchem", "chembl"].includes(ds.source_type) &&
        ds.status === "pending" && !hydratedRef.current.has(ds.id)
    );
    for (const ds of pendingDrugSources) {
      hydratedRef.current.add(ds.id);
      dispatch(hydrateSource({ projectId: activeProject.id, sourceId: ds.id }));
    }
  }, [activeProject, dispatch]);

  // Load cached data from backend when available sources are present
  const loadCachedData = useCallback(async () => {
    if (!activeProject || !hasDrugSources) return;

    setLoading(true);
    setError(null);

    try {
      const promises: Promise<void>[] = [];

      if (drugbankSource) {
        promises.push(
          fetchSourceCachedData(activeProject.id, drugbankSource.id).then((res) => {
            const data = res.data?.cached_data as Record<string, unknown> | null;
            if (data) {
              setInteractions((data.interactions as Record<string, Interaction[]>) || null);
              setRankings((data.rankings as Ranking[]) || null);
            }
          })
        );
      }

      if (pubchemSource) {
        promises.push(
          fetchSourceCachedData(activeProject.id, pubchemSource.id).then((res) => {
            const data = res.data?.cached_data as Record<string, unknown> | null;
            if (data) {
              setCompounds((data.compounds as Record<string, PubChemCompound[]>) || null);
            }
          })
        );
      }

      if (chemblSource) {
        promises.push(
          fetchSourceCachedData(activeProject.id, chemblSource.id).then((res) => {
            const data = res.data?.cached_data as Record<string, unknown> | null;
            if (data) {
              setBioactivities((data.bioactivities as Record<string, { activities: ChEMBLActivity[]; total_count: number; target: { pref_name?: string } | null }>) || null);
            }
          })
        );
      }

      await Promise.all(promises);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || t("drugs.load_error"));
      } else {
        setError(t("drugs.load_error"));
      }
    } finally {
      setLoading(false);
    }
  }, [activeProject, drugbankSource, pubchemSource, chemblSource, hasDrugSources, t]);

  useEffect(() => {
    loadCachedData();
  }, [loadCachedData]);

  // ─── Tab Renderers ─────────────────────────────────────────

  const renderInteractions = () => {
    if (!interactions) return null;

    return (
      <div className="space-y-8">
        {projectGenes.map((gene) => {
          const geneInteractions = interactions[gene] || [];

          return (
            <div key={gene} className="bg-kiri-surface p-6 rounded-lg border border-kiri-border">
              <h3 className="text-xl font-bold text-kiri-accent mb-4 border-b border-kiri-border pb-2">
                {gene} <span className="text-sm font-normal text-kiri-text-muted ml-2">({geneInteractions.length} {t("drugs.interactions_tab").toLowerCase()})</span>
              </h3>
              
              {geneInteractions.length === 0 ? (
                <div className="text-center py-6 text-kiri-text-muted bg-kiri-surface-hover rounded border border-dashed border-kiri-border">
                  {t("drugs.no_interactions")}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {geneInteractions.map((interaction, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSelectedInteraction({ interaction, gene })}
                      className="bg-kiri-bg p-4 rounded border border-kiri-border hover:border-kiri-accent-dim transition-all cursor-pointer group hover:shadow-lg hover:shadow-kiri-accent/5"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <Beaker className="w-4 h-4 text-kiri-accent" />
                          <h4 className="font-bold text-kiri-text group-hover:text-kiri-accent transition-colors">{interaction.drug_name}</h4>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded badge badge-${interaction.evidence_level?.toLowerCase() || 'medium'}`}>
                          {interaction.evidence_level} {t("drugs.evidence_level")}
                        </span>
                      </div>
                      
                      <div className="space-y-2 text-sm mt-3">
                        <div>
                          <span className="text-kiri-text-dim block text-xs uppercase tracking-wider mb-1">{t("drugs.pharmacology")}</span>
                          <p className="text-kiri-text min-h-12 line-clamp-3">{interaction.pharmacology}</p>
                        </div>
                        <div className="pt-2 border-t border-kiri-border-dim">
                          <span className="text-kiri-text-dim block text-xs uppercase tracking-wider mb-1">{t("drugs.indication")}</span>
                          <p className="text-kiri-text-muted line-clamp-2">{interaction.indication}</p>
                        </div>
                        <div className="pt-2 flex items-center justify-between text-xs text-kiri-text-dim">
                          <span>{t("drugs.source")}: {interaction.source}</span>
                          {interaction.drug_id && <span className="font-mono">{interaction.drug_id}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderRanking = () => {
    if (!rankings) return null;

    return (
      <div className="bg-kiri-surface rounded-lg border border-kiri-border overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-kiri-surface-hover border-b border-kiri-border">
            <tr>
              <th className="p-4 font-semibold text-kiri-text">{t("drugs.target")}</th>
              <th className="p-4 font-semibold text-kiri-text">{t("drugs.druggability_tier")}</th>
              <th className="p-4 font-semibold text-kiri-text text-right">{t("drugs.score")}</th>
              <th className="p-4 font-semibold text-kiri-text text-right">{t("drugs.drug_count")}</th>
              <th className="p-4 font-semibold text-kiri-text text-right">{t("drugs.lit_references")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-kiri-border">
            {rankings.map((target, idx) => (
              <tr
                key={target.gene}
                onClick={() => setSelectedRanking(target)}
                className="hover:bg-kiri-surface-hover transition-colors cursor-pointer group"
              >
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-kiri-text-dim font-mono text-xs w-4">{idx + 1}</span>
                    <span className="font-bold text-kiri-accent group-hover:underline">{target.gene}</span>
                  </div>
                </td>
                <td className="p-4">
                  <span className={`text-xs px-2 py-1 rounded border ${
                    target.druggability_tier.includes("Tier 1") ? "bg-kiri-success/10 text-kiri-success border-kiri-success/20" :
                    target.druggability_tier.includes("Tier 2") ? "bg-kiri-info/10 text-kiri-info border-kiri-info/20" :
                    target.druggability_tier.includes("Tier 3") ? "bg-kiri-warning/10 text-kiri-warning border-kiri-warning/20" :
                    "bg-kiri-surface-hover text-kiri-text-muted border-kiri-border"
                  }`}>
                    {target.druggability_tier}
                  </span>
                </td>
                <td className="p-4 text-right font-mono font-medium text-kiri-text">
                  {Number(target.score).toFixed(1)}
                </td>
                <td className="p-4 text-right">
                  <div className="flex flex-col items-end">
                    <span>{target.drug_count}</span>
                    {target.high_evidence_drugs > 0 && (
                      <span className="text-xs text-kiri-success flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> {target.high_evidence_drugs} {t("drugs.high_evidence")}
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-4 text-right text-kiri-text-muted">
                  {target.total_references}
                </td>
              </tr>
            ))}
            {rankings.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-kiri-text-muted">
                  {t("drugs.no_ranking_data")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCompounds = () => {
    if (!compounds) return <div className="text-center py-12 text-kiri-text-muted">{t("drugs.no_pubchem")}</div>;

    return (
      <div className="space-y-8">
        {projectGenes.map((gene) => {
          const geneCompounds = compounds[gene] || [];
          return (
            <div key={gene} className="bg-kiri-surface p-6 rounded-lg border border-kiri-border">
              <h3 className="text-xl font-bold text-kiri-accent mb-4 border-b border-kiri-border pb-2">
                {gene} <span className="text-sm font-normal text-kiri-text-muted ml-2">({geneCompounds.length} {t("drugs.compounds_count")})</span>
              </h3>
              {geneCompounds.length === 0 ? (
                <div className="text-center py-6 text-kiri-text-muted bg-kiri-surface-hover rounded border border-dashed border-kiri-border">
                  {t("drugs.no_pubchem_gene")}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {geneCompounds.map((c) => (
                    <div
                      key={c.cid}
                      onClick={() => setSelectedCompound(c)}
                      className="bg-kiri-bg p-4 rounded border border-kiri-border hover:border-kiri-accent-dim transition-all cursor-pointer group hover:shadow-lg hover:shadow-kiri-accent/5"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <FlaskConical className="w-4 h-4 text-kiri-success" />
                        <h4 className="font-bold text-kiri-text text-sm truncate group-hover:text-kiri-accent transition-colors" title={c.iupac_name}>
                          CID {c.cid}
                        </h4>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-kiri-text-dim">{t("drugs.formula")}</span>
                          <span className="text-kiri-text font-mono">{c.molecular_formula}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-kiri-text-dim">MW</span>
                          <span className="text-kiri-text">{c.molecular_weight != null ? Number(c.molecular_weight).toFixed(2) : '—'} Da</span>
                        </div>
                        {c.xlogp !== null && (
                          <div className="flex justify-between">
                            <span className="text-kiri-text-dim">LogP</span>
                            <span className="text-kiri-text">{c.xlogp}</span>
                          </div>
                        )}
                        {c.tpsa !== null && (
                          <div className="flex justify-between">
                            <span className="text-kiri-text-dim">TPSA</span>
                            <span className="text-kiri-text">{c.tpsa} Å²</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-kiri-text-dim">{t("drugs.hbond")}</span>
                          <span className="text-kiri-text">{c.hbond_donors} / {c.hbond_acceptors}</span>
                        </div>
                      </div>
                      <div className="mt-3 pt-2 border-t border-kiri-border-dim">
                        <p className="text-[10px] text-kiri-text-dim font-mono truncate" title={c.canonical_smiles}>
                          {c.canonical_smiles}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderBioactivity = () => {
    if (!bioactivities) return <div className="text-center py-12 text-kiri-text-muted">{t("drugs.no_chembl")}</div>;

    return (
      <div className="space-y-8">
        {projectGenes.map((gene) => {
          const data = bioactivities[gene];
          if (!data) return null;
          const activities = data.activities || [];

          return (
            <div key={gene} className="bg-kiri-surface rounded-lg border border-kiri-border overflow-hidden">
              <div className="p-4 border-b border-kiri-border flex items-center justify-between">
                <h3 className="font-bold text-kiri-accent">{gene}</h3>
                <span className="text-xs text-kiri-text-muted">
                  {data.total_count} {t("drugs.total_assays")} · {data.target?.pref_name || ""}
                </span>
              </div>
              {activities.length === 0 ? (
                <div className="p-8 text-center text-kiri-text-muted">
                  {t("drugs.no_chembl_gene")}
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-kiri-surface-hover">
                    <tr>
                      <th className="p-3 text-xs font-semibold text-kiri-text">{t("drugs.compound_label")}</th>
                      <th className="p-3 text-xs font-semibold text-kiri-text">{t("drugs.type_label")}</th>
                      <th className="p-3 text-xs font-semibold text-kiri-text text-right">{t("drugs.value_label")}</th>
                      <th className="p-3 text-xs font-semibold text-kiri-text text-right">pChEMBL</th>
                      <th className="p-3 text-xs font-semibold text-kiri-text">{t("drugs.assay_label")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-kiri-border">
                    {activities.map((a, idx) => (
                      <tr
                        key={idx}
                        onClick={() => setSelectedActivity({ activity: a, gene })}
                        className="hover:bg-kiri-surface-hover transition-colors cursor-pointer group"
                      >
                        <td className="p-3">
                          <div className="font-medium text-kiri-text truncate max-w-[200px] group-hover:text-kiri-accent transition-colors" title={a.molecule_name}>
                            {a.molecule_name || a.molecule_chembl_id}
                          </div>
                          <div className="text-[10px] text-kiri-text-dim font-mono">{a.molecule_chembl_id}</div>
                        </td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded border ${
                            a.activity_type === "IC50" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                            a.activity_type === "Ki" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                            a.activity_type === "Kd" ? "bg-teal-500/10 text-teal-400 border-teal-500/20" :
                            "bg-gray-500/10 text-gray-400 border-gray-500/20"
                          }`}>
                            {a.activity_type}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-kiri-text">
                          {a.value ? `${a.relation}${Number(a.value).toFixed(1)} ${a.units}` : "—"}
                        </td>
                        <td className="p-3 text-right">
                          {a.pchembl_value ? (
                            <span className={`font-mono font-medium ${
                              Number(a.pchembl_value) >= 7 ? "text-kiri-success" :
                              Number(a.pchembl_value) >= 6 ? "text-kiri-warning" :
                              "text-kiri-text-muted"
                            }`}>
                              {Number(a.pchembl_value).toFixed(2)}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="p-3 text-xs text-kiri-text-muted">
                          {a.assay_type === "B" ? t("drugs.binding") : a.assay_type === "F" ? t("drugs.functional") : a.assay_type}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ─── Main Render ───────────────────────────────────────────

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-kiri-accent to-purple-400 mb-2 flex items-center gap-2">
            {t("drugs.title")}
            <InfoTooltip tooltipKey="tooltips.drugs" />
          </h1>
          <p className="text-kiri-text-muted">{t("drugs.subtitle")}</p>
        </div>
      </div>

      {/* Research Use Only Disclaimer Component */}
      <div className="bg-kiri-warning/10 border border-kiri-warning/30 rounded-lg p-4 flex gap-4 items-start">
        <AlertTriangle className="w-6 h-6 text-kiri-warning shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-kiri-warning mb-1">{t("drugs.research_only")}</h4>
          <p className="text-sm text-kiri-warning/80 leading-relaxed">
            {t("drugs.research_only_desc")}
          </p>
        </div>
      </div>

      {!projectGenes.length ? (
        <div className="bg-kiri-surface p-12 text-center rounded-lg border border-dashed border-kiri-border">
          <Database className="w-12 h-12 text-kiri-text-dim mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-kiri-text mb-2">{t("drugs.no_targets_title")}</h3>
          <p className="text-kiri-text-muted">{t("drugs.no_targets_desc")}</p>
        </div>
      ) : !hasDrugSources ? (
        /* No drug data sources attached */
        <div className="bg-kiri-surface p-12 text-center rounded-lg border border-dashed border-kiri-border">
          <Database className="w-12 h-12 text-kiri-text-dim mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-kiri-text mb-2">
            {t("dataSource.no_drug_sources", "No drug data sources attached")}
          </h3>
          <p className="text-kiri-text-muted mb-4">
            {hasAnyDrugConfig
              ? t("dataSource.sources_loading", "Drug data sources are still loading. Please wait or check Project Settings.")
              : t("dataSource.no_drug_sources_desc", "Add DrugBank, PubChem, or ChEMBL in Project Settings to explore drug discoveries.")}
          </p>
          <button
            onClick={() => navigate(`/projects/${activeProject?.id}/settings`)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-kiri-accent text-kiri-bg rounded-lg font-medium text-sm hover:brightness-110 transition"
          >
            <Settings className="w-4 h-4" />
            {t("dataSource.add_sources", "Add Data Sources")}
          </button>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-4 border-b border-kiri-border">
            <button
              onClick={() => setActiveTab("interactions")}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "interactions"
                  ? "border-kiri-accent text-kiri-accent"
                  : "border-transparent text-kiri-text-muted hover:text-kiri-text hover:border-kiri-border-focus"
              }`}
            >
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                {t("drugs.interactions_tab")}
              </div>
            </button>
            <button
              onClick={() => setActiveTab("ranking")}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "ranking"
                  ? "border-kiri-accent text-kiri-accent"
                  : "border-transparent text-kiri-text-muted hover:text-kiri-text hover:border-kiri-border-focus"
              }`}
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                {t("drugs.ranking_tab")}
              </div>
            </button>
            <button
              onClick={() => setActiveTab("compounds")}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "compounds"
                  ? "border-kiri-accent text-kiri-accent"
                  : "border-transparent text-kiri-text-muted hover:text-kiri-text hover:border-kiri-border-focus"
              }`}
            >
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4" />
                {t("drugs.compounds_tab")}
              </div>
            </button>
            <button
              onClick={() => setActiveTab("bioactivity")}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "bioactivity"
                  ? "border-kiri-accent text-kiri-accent"
                  : "border-transparent text-kiri-text-muted hover:text-kiri-text hover:border-kiri-border-focus"
              }`}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                {t("drugs.bioactivity_tab")}
              </div>
            </button>
          </div>

          {/* Content Area */}
          <div className="mt-6 border-zinc-800">
            {loading ? (
              <div className="flex items-center justify-center p-20 text-kiri-text-muted">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="ml-3 font-medium">{t("drugs.loading_data")}</span>
              </div>
            ) : error ? (
              <div className="p-6 text-red-400 bg-red-500/10 rounded-lg border border-red-500/20 text-center">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-80" />
                <p>{error}</p>
                <button 
                  onClick={loadCachedData}
                  className="mt-4 px-4 py-2 bg-kiri-surface-hover rounded border border-kiri-border hover:bg-kiri-border transition-colors text-sm"
                >
                  {t("common.retry")}
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: activeTab === "interactions" ? "block" : "none" }}>
                  {renderInteractions()}
                </div>
                <div style={{ display: activeTab === "ranking" ? "block" : "none" }}>
                  {renderRanking()}
                </div>
                <div style={{ display: activeTab === "compounds" ? "block" : "none" }}>
                  {renderCompounds()}
                </div>
                <div style={{ display: activeTab === "bioactivity" ? "block" : "none" }}>
                  {renderBioactivity()}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Detail Dialogs */}
      <AnimatePresence>
        {selectedCompound && (
          <CompoundDetailDialog compound={selectedCompound} onClose={() => setSelectedCompound(null)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedInteraction && (
          <InteractionDetailDialog
            interaction={selectedInteraction.interaction}
            gene={selectedInteraction.gene}
            onClose={() => setSelectedInteraction(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedActivity && (
          <BioactivityDetailDialog
            activity={selectedActivity.activity}
            gene={selectedActivity.gene}
            onClose={() => setSelectedActivity(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedRanking && (
          <RankingDetailDialog ranking={selectedRanking} onClose={() => setSelectedRanking(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
