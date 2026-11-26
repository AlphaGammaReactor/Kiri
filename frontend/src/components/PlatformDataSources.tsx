/**
 * Kiri — Platform Data Source Registry
 *
 * Comprehensive view of ALL external APIs, databases, and compute services
 * used across the platform. Grouped by type, shows connection status,
 * cache state, and which pages/modules consume each source.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useAppSelector } from "../store";
import type { RootState } from "../store";

/* ── Connection type for each data source ── */

type ConnectionType = "live" | "cached" | "bundled" | "local" | "compute";

interface PlatformSource {
  key: string;
  icon: string;
  name: string;
  description: string;
  connectionType: ConnectionType;
  pages: string[];
  /** The source_type key used in project data sources (if attachable) */
  projectSourceType?: string;
  url?: string;
}

interface SourceGroup {
  key: string;
  icon: string;
  label: string;
  sources: PlatformSource[];
}

/* ── Full platform data source registry ── */

const PLATFORM_REGISTRY: SourceGroup[] = [
  {
    key: "genomics",
    icon: "🧬",
    label: "Genomics & Expression",
    sources: [
      {
        key: "tcga",
        icon: "🧬",
        name: "TCGA / GDC",
        description: "The Cancer Genome Atlas — RNA-seq expression via Genomic Data Commons API",
        connectionType: "live",
        pages: ["Multi-Omics Atlas", "Mito Lab", "Clinical Suite", "Cross-Validation"],
        projectSourceType: "tcga",
        url: "https://api.gdc.cancer.gov",
      },
      {
        key: "geo",
        icon: "📊",
        name: "GEO / NCBI",
        description: "Gene Expression Omnibus — validation cohorts (microarray)",
        connectionType: "live",
        pages: ["Multi-Omics Atlas"],
        projectSourceType: "geo",
        url: "https://www.ncbi.nlm.nih.gov/geo",
      },
      {
        key: "cptac",
        icon: "🔬",
        name: "CPTAC",
        description: "Clinical Proteomic Tumor Analysis Consortium",
        connectionType: "live",
        pages: ["Multi-Omics Atlas"],
        projectSourceType: "cptac",
      },
      {
        key: "scrna",
        icon: "🔵",
        name: "Single-Cell Atlas",
        description: "Human Colon Cancer scRNA-seq Atlas",
        connectionType: "bundled",
        pages: ["Multi-Omics Atlas"],
        projectSourceType: "scrna",
      },
      {
        key: "custom",
        icon: "📁",
        name: "Custom Upload",
        description: "User-uploaded CSV/TSV expression data",
        connectionType: "local",
        pages: ["Multi-Omics Atlas"],
        projectSourceType: "custom",
      },
    ],
  },
  {
    key: "enrichment",
    icon: "🎯",
    label: "Enrichment & Pathways",
    sources: [
      {
        key: "enrichr",
        icon: "🎯",
        name: "Enrichr / gseapy",
        description: "GO, KEGG, Reactome, MSigDB Hallmark gene set libraries",
        connectionType: "live",
        pages: ["Multi-Omics Atlas", "Mito Lab"],
        url: "https://maayanlab.cloud/Enrichr",
      },
      {
        key: "mitocarta",
        icon: "🔋",
        name: "MitoCarta 3.0",
        description: "Curated mitochondrial gene set for ssGSEA scoring",
        connectionType: "bundled",
        pages: ["Mito Lab"],
      },
      {
        key: "cibersort",
        icon: "🧫",
        name: "CIBERSORT / LM22",
        description: "Immune cell type deconvolution signature matrix (22 cell types)",
        connectionType: "bundled",
        pages: ["Clinical Suite"],
      },
    ],
  },
  {
    key: "proteomics",
    icon: "📡",
    label: "Proteomics",
    sources: [
      {
        key: "massive",
        icon: "📡",
        name: "MassIVE",
        description: "Mass spectrometry proteomics repository (UCSD)",
        connectionType: "cached",
        pages: ["Interactomics"],
        projectSourceType: "massive",
      },
      {
        key: "proteomecentral",
        icon: "🧫",
        name: "ProteomeCentral",
        description: "Aggregated proteomics datasets (ProteomeXchange)",
        connectionType: "cached",
        pages: ["Interactomics"],
        projectSourceType: "proteomecentral",
      },
    ],
  },
  {
    key: "interaction",
    icon: "🔗",
    label: "Protein Interaction & Structure",
    sources: [
      {
        key: "string",
        icon: "🔗",
        name: "STRING-DB",
        description: "Protein-protein interaction network (EMBL/SIB, v12.0)",
        connectionType: "live",
        pages: ["Interaction Lab", "Interactomics"],
        projectSourceType: "string",
        url: "https://string-db.org",
      },
      {
        key: "biogrid",
        icon: "🧬",
        name: "BioGRID",
        description: "Biological General Repository for Interaction Datasets — physical & genetic interactions",
        connectionType: "live",
        pages: ["Interaction Lab", "Interactomics"],
        url: "https://thebiogrid.org",
      },
      {
        key: "intact",
        icon: "🔬",
        name: "IntAct",
        description: "EMBL-EBI molecular interaction database — curated binary interactions",
        connectionType: "live",
        pages: ["Interactomics"],
        url: "https://www.ebi.ac.uk/intact",
      },
      {
        key: "alphafold",
        icon: "🔮",
        name: "AlphaFold DB",
        description: "AI-predicted protein 3D structures (DeepMind/EMBL-EBI)",
        connectionType: "live",
        pages: ["Interaction Lab", "Protein Docking"],
        url: "https://alphafold.ebi.ac.uk",
      },
      {
        key: "uniprot",
        icon: "🏛️",
        name: "UniProt",
        description: "Universal protein knowledgebase — sequences, annotations, function",
        connectionType: "live",
        pages: ["Interaction Lab", "Protein Docking"],
        url: "https://www.uniprot.org",
      },
    ],
  },
  {
    key: "drug",
    icon: "💊",
    label: "Drug & Compound",
    sources: [
      {
        key: "drugbank",
        icon: "💊",
        name: "DrugBank",
        description: "FDA-approved drug-target interactions and pharmacology",
        connectionType: "cached",
        pages: ["Drug Discovery"],
        projectSourceType: "drugbank",
      },
      {
        key: "pubchem",
        icon: "🧪",
        name: "PubChem",
        description: "NIH compound database — structures, properties, bioactivity",
        connectionType: "cached",
        pages: ["Drug Discovery"],
        projectSourceType: "pubchem",
      },
      {
        key: "chembl",
        icon: "📐",
        name: "ChEMBL",
        description: "EMBL-EBI bioactivity — IC50, Ki, binding affinities",
        connectionType: "cached",
        pages: ["Drug Discovery"],
        projectSourceType: "chembl",
      },
    ],
  },
  {
    key: "literature",
    icon: "📚",
    label: "Literature & AI",
    sources: [
      {
        key: "pubmed",
        icon: "📚",
        name: "PubMed / NCBI",
        description: "Biomedical literature — citations, abstracts, anti-hallucination validation",
        connectionType: "live",
        pages: ["Interaction Lab", "Publication Engine", "AI Discovery"],
        url: "https://pubmed.ncbi.nlm.nih.gov",
      },
      {
        key: "kiri-compute",
        icon: "⚡",
        name: "Kiri Compute Engine",
        description: "On-server statistical analysis — DE, survival, clustering, enrichment",
        connectionType: "compute",
        pages: ["All analysis pages"],
      },
    ],
  },
];

/* ── Connection type badge config ── */

const CONNECTION_BADGES: Record<ConnectionType, { label: string; dotClass: string; badgeClass: string }> = {
  live: {
    label: "Live API",
    dotClass: "bg-emerald-400 animate-pulse",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  },
  cached: {
    label: "Cached",
    dotClass: "bg-amber-400",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  },
  bundled: {
    label: "Bundled",
    dotClass: "bg-slate-400",
    badgeClass: "bg-slate-500/15 text-slate-400 border-slate-500/25",
  },
  local: {
    label: "Local File",
    dotClass: "bg-blue-400",
    badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  },
  compute: {
    label: "Server",
    dotClass: "bg-violet-400 animate-pulse",
    badgeClass: "bg-violet-500/15 text-violet-400 border-violet-500/25",
  },
};


export default function PlatformDataSources() {
  const { t } = useTranslation();
  const activeProject = useAppSelector((s: RootState) => s.project.activeProject);
  const attachedTypes = useMemo(
    () => new Set(activeProject?.data_sources?.map((ds) => ds.source_type) ?? []),
    [activeProject?.data_sources]
  );

  // Count total sources
  const totalSources = PLATFORM_REGISTRY.reduce((sum, g) => sum + g.sources.length, 0);
  const attachedCount = PLATFORM_REGISTRY.reduce(
    (sum, g) => sum + g.sources.filter((s) => s.projectSourceType && attachedTypes.has(s.projectSourceType)).length,
    0
  );

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-kiri-text uppercase tracking-wider">
            {t("settings.platformRegistry", "Platform Data Source Registry")}
          </h2>
          <p className="text-[10px] text-kiri-text-dim mt-0.5">
            {t("settings.platformRegistryDesc", "All external APIs, databases, and compute services powering analysis modules")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-kiri-text-dim font-mono">
            {totalSources} sources
          </span>
          {attachedCount > 0 && (
            <span className="text-[10px] font-mono text-emerald-400">
              {attachedCount} attached
            </span>
          )}
        </div>
      </div>

      {/* Groups */}
      {PLATFORM_REGISTRY.map((group, gi) => (
        <motion.div
          key={group.key}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: gi * 0.04, duration: 0.25 }}
          className="bg-kiri-surface border border-kiri-border rounded-lg overflow-hidden"
        >
          {/* Group Header */}
          <div className="px-4 py-3 border-b border-kiri-border flex items-center gap-2">
            <span className="text-base">{group.icon}</span>
            <h3 className="text-xs font-semibold text-kiri-text uppercase tracking-wider flex-1">
              {group.label}
            </h3>
            <span className="text-[10px] text-kiri-text-dim font-mono">
              {group.sources.length} {group.sources.length === 1 ? "source" : "sources"}
            </span>
          </div>

          {/* Source Rows */}
          <div className="divide-y divide-kiri-border/50">
            {group.sources.map((source) => {
              const isAttached = source.projectSourceType
                ? attachedTypes.has(source.projectSourceType)
                : false;
              const badge = CONNECTION_BADGES[source.connectionType];

              return (
                <div
                  key={source.key}
                  className="px-4 py-3 flex items-start gap-3 hover:bg-kiri-bg/30 transition-colors"
                >
                  {/* Icon */}
                  <span className="text-lg mt-0.5 shrink-0">{source.icon}</span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-kiri-text">
                        {source.name}
                      </span>

                      {/* Connection type badge */}
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-px text-[9px] font-semibold rounded-full border leading-tight whitespace-nowrap ${badge.badgeClass}`}
                      >
                        <span className={`w-1 h-1 rounded-full ${badge.dotClass}`} />
                        {badge.label}
                      </span>

                      {/* Attached badge */}
                      {isAttached && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-px text-[9px] font-semibold rounded-full bg-kiri-accent/15 text-kiri-accent border border-kiri-accent/25 leading-tight whitespace-nowrap">
                          ✓ Attached
                        </span>
                      )}
                    </div>

                    <p className="text-[10px] text-kiri-text-dim mt-0.5 leading-snug">
                      {source.description}
                    </p>

                    {/* Pages */}
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                      <span className="text-[9px] text-kiri-text-dim uppercase tracking-widest mr-0.5">
                        Used by:
                      </span>
                      {source.pages.map((page) => (
                        <span
                          key={page}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-kiri-bg border border-kiri-border text-kiri-text-muted whitespace-nowrap"
                        >
                          {page}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* URL link */}
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] text-kiri-text-dim hover:text-kiri-accent transition shrink-0 mt-1"
                      title={source.url}
                    >
                      ↗
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      ))}

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap px-1 pt-1">
        {(Object.entries(CONNECTION_BADGES) as [ConnectionType, typeof CONNECTION_BADGES[ConnectionType]][]).map(
          ([type, badge]) => (
            <span key={type} className="inline-flex items-center gap-1.5 text-[9px] text-kiri-text-dim">
              <span className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`} />
              {badge.label}
            </span>
          )
        )}
      </div>
    </div>
  );
}
