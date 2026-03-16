/**
 * Kiri — Interaction Lab Page
 *
 * Module 2: Mechanistic Biology
 * Integrates PPI network, 3D protein viewer, cleavage analysis,
 * interaction context, pathway banner, and citations.
 *
 * Per-protein toggle chips control which proteins are visible across all panels.
 * Proteins start hidden (opt-in model).
 *
 * Cross-panel linking:
 *   - Click PPI node → updates structure viewer + cleavage
 *   - Click PPI edge → loads interaction context + citations for pair
 *   - Click pathway gene → selects that gene in PPI + structure
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useAppSelector } from "../store";
import type { RootState } from "../store";
import { usePageState } from "../hooks/usePageState";
import { PPINetwork } from "../components/PPINetwork";
import { ProteinViewer } from "../components/ProteinViewer";
import type { StructureData } from "../components/ProteinViewer";
import { CleavagePanel } from "../components/CleavagePanel";
import { CitationPopup } from "../components/CitationPopup";
import { PathwayBanner } from "../components/PathwayBanner";
import { InteractionDetail } from "../components/InteractionDetail";
import type { InteractionContextData } from "../components/InteractionDetail";
import { InfoTooltip } from "../components/ui";
import {
  fetchPPINetwork,
  fetchProteinStructure,
  analyzeCleavage,
  fetchInteractionCitations,
  fetchInteractionContext,
} from "../services/api";
import type { Provenance } from "../services/api";

interface PPINetworkData {
  nodes: Array<{ id: string; label: string; is_query: boolean; sources: string[] }>;
  edges: Array<{
    source: string; target: string; string_score: number;
    evidence: string[]; pubmed_ids: string[]; sources: string[];
  }>;
  meta: { total_nodes: number; total_edges: number; sources_used: string[]; query_genes: string[] };
}

interface StructureDataPage {
  found: boolean; uniprot_id: string; entry_id: string; gene: string;
  model_url: string; cif_url: string; pae_image_url: string;
  sequence_length: number; confidence_version: number;
  plddt_thresholds: { very_high: number; confident: number; low: number; very_low: number };
  error?: string;
}

interface CleavageDataPage {
  uniprot_id: string; protein_name: string; motif_pattern: string;
  total_hits: number;
  cleavage_sites: Array<{ position: number; motif_match: string; flanking_sequence: string; flanking_start: number; flanking_end: number; in_tm_region: boolean; p_score: number }>;
  sequence_length: number; tm_region: { start: number; end: number } | null;
}

interface CitationItem {
  pmid: string; title: string; authors?: string[]; journal?: string;
  year?: string; doi?: string; validated: boolean;
}

export default function InteractionLab() {
  const { t } = useTranslation();
  const activeProject = useAppSelector((s: RootState) => s.project.activeProject);

  // Build dynamic gene→UniProt map from the active project's proteins
  const projectProteins = useMemo(
    () => activeProject?.proteins ?? [],
    [activeProject?.proteins]
  );
  const geneUniprotMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projectProteins) {
      if (p.gene_symbol && p.uniprot_id) {
        map[p.gene_symbol] = p.uniprot_id;
      }
    }
    return map;
  }, [projectProteins]);
  const projectGenes = useMemo(
    () => projectProteins.map((p) => p.gene_symbol),
    [projectProteins]
  );

  // ── Persisted UI State ──
  const [uiState, setUiState] = usePageState<{
    visibleGenes: string[];
    confidence: number;
    activeStructureGene: string;
  }>("interaction", {
    visibleGenes: [],
    confidence: 0.4,
    activeStructureGene: "",
  });

  const { confidence, activeStructureGene } = uiState;
  const visibleGenes = useMemo(() => new Set(uiState.visibleGenes), [uiState.visibleGenes]);

  const setConfidence = useCallback((val: number) => setUiState(s => ({ ...s, confidence: val })), [setUiState]);
  const setActiveStructureGene = useCallback((val: string) => setUiState(s => ({ ...s, activeStructureGene: val })), [setUiState]);
  const setVisibleGenes = useCallback((nextArg: Set<string> | ((prev: Set<string>) => Set<string>)) => {
     setUiState(s => {
       const prevSet = new Set(s.visibleGenes);
       const nextSet = typeof nextArg === 'function' ? nextArg(prevSet) : nextArg;
       return { ...s, visibleGenes: Array.from(nextSet) };
     });
  }, [setUiState]);

  const toggleGene = useCallback((gene: string) => {
    setVisibleGenes((prev) => {
      const next = new Set(prev);
      if (next.has(gene)) {
        next.delete(gene);
      } else {
        next.add(gene);
      }
      return next;
    });
  }, [setVisibleGenes]);

  const selectAllGenes = useCallback(() => {
    setVisibleGenes(new Set(projectGenes));
  }, [projectGenes, setVisibleGenes]);

  const clearAllGenes = useCallback(() => {
    setVisibleGenes(new Set());
  }, [setVisibleGenes]);

  // Derived: visible gene list (preserves project order)
  const activeGenes = useMemo(
    () => projectGenes.filter((g) => visibleGenes.has(g)),
    [projectGenes, visibleGenes]
  );

  // PPI state
  const [ppiData, setPpiData] = useState<PPINetworkData | null>(null);
  const [ppiProvenance, setPpiProvenance] = useState<Provenance | null>(null);
  const [ppiLoading, setPpiLoading] = useState(false);

  // Structure state
  const [structureData, setStructureData] = useState<StructureDataPage | null>(null);
  const [structureProvenance, setStructureProvenance] =
    useState<Provenance | null>(null);
  const [structureLoading, setStructureLoading] = useState(false);

  // All structures for compare mode (gene → StructureData)
  const [allStructures, setAllStructures] = useState<Map<string, StructureData>>(new Map());

  // Cleavage state
  const [cleavageData, setCleavageData] = useState<CleavageDataPage | null>(null);
  const [cleavageProvenance, setCleavageProvenance] =
    useState<Provenance | null>(null);
  const [cleavageLoading, setCleavageLoading] = useState(false);

  // Interaction context state
  const [contextData, setContextData] = useState<InteractionContextData | null>(null);
  const [contextProvenance, setContextProvenance] = useState<Provenance | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [selectedPair, setSelectedPair] = useState<{
    geneA: string;
    geneB: string;
  } | null>(null);

  // Citations state
  const [citationPopup, setCitationPopup] = useState<{
    open: boolean;
    geneA: string;
    geneB: string;
    citations: CitationItem[];
    loading: boolean;
  }>({ open: false, geneA: "", geneB: "", citations: [], loading: false });

  // Controls

  // Fetch PPI network — driven by activeGenes (visible proteins only)
  const loadPPI = useCallback(async () => {
    if (activeGenes.length === 0) {
      setPpiData(null);
      return;
    }
    setPpiLoading(true);
    try {
      const resp = await fetchPPINetwork(activeGenes, confidence);
      setPpiData(resp.data);
      setPpiProvenance(resp.provenance);
    } catch (err) {
      console.error("PPI fetch error:", err);
    } finally {
      setPpiLoading(false);
    }
  }, [activeGenes, confidence]);

  // Fetch protein structure (single gene)
  const loadStructure = useCallback(async (gene: string) => {
    const uniprot = geneUniprotMap[gene] || gene;
    setStructureLoading(true);
    try {
      const resp = await fetchProteinStructure(uniprot);
      setStructureData(resp.data);
      setStructureProvenance(resp.provenance);
      // Also update allStructures cache
      if (resp.data) {
        setAllStructures(prev => {
          const next = new Map(prev);
          next.set(gene, resp.data as StructureData);
          return next;
        });
      }
    } catch (err) {
      console.error("Structure fetch error:", err);
    } finally {
      setStructureLoading(false);
    }
  }, [geneUniprotMap]);

  // Fetch structures for ALL visible genes (for compare mode)
  useEffect(() => {
    const genesNeedingFetch = activeGenes.filter(g => !allStructures.has(g));
    if (genesNeedingFetch.length === 0) return;

    let cancelled = false;
    const fetchAll = async () => {
      const results = await Promise.allSettled(
        genesNeedingFetch.map(async (gene) => {
          const uniprot = geneUniprotMap[gene] || gene;
          const resp = await fetchProteinStructure(uniprot);
          return { gene, data: resp.data as StructureData };
        })
      );
      if (cancelled) return;
      setAllStructures(prev => {
        const next = new Map(prev);
        for (const result of results) {
          if (result.status === "fulfilled" && result.value.data) {
            next.set(result.value.gene, result.value.data);
          }
        }
        return next;
      });
    };
    fetchAll();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGenes.join(",")]);

  // Fetch cleavage analysis
  const loadCleavage = useCallback(async (gene: string) => {
    const uniprot = geneUniprotMap[gene];
    if (!uniprot) return;
    setCleavageLoading(true);
    try {
      const resp = await analyzeCleavage(uniprot);
      setCleavageData(resp.data);
      setCleavageProvenance(resp.provenance);
    } catch (err) {
      console.error("Cleavage analysis error:", err);
    } finally {
      setCleavageLoading(false);
    }
  }, [geneUniprotMap]);

  // Fetch interaction context for a pair
  const loadContext = useCallback(async (geneA: string, geneB: string) => {
    setContextLoading(true);
    setSelectedPair({ geneA, geneB });
    try {
      const resp = await fetchInteractionContext(geneA, geneB);
      setContextData(resp.data);
      setContextProvenance(resp.provenance);
    } catch (err) {
      console.error("Context fetch error:", err);
    } finally {
      setContextLoading(false);
    }
  }, []);

  // When visible genes change, ensure activeStructureGene is valid
  useEffect(() => {
    if (activeGenes.length > 0 && !activeGenes.includes(activeStructureGene)) {
      setActiveStructureGene(activeGenes[0]);
    } else if (activeGenes.length === 0) {
      setActiveStructureGene("");
      setStructureData(null);
      setCleavageData(null);
    }
  }, [activeGenes, activeStructureGene, setActiveStructureGene]);

  // Load PPI network when active genes or confidence changes
  useEffect(() => {
    loadPPI();
  }, [loadPPI]);

  // Load structure + cleavage when the active gene changes
  useEffect(() => {
    if (activeStructureGene) {
      loadStructure(activeStructureGene);
      loadCleavage(activeStructureGene);
    }
  }, [activeStructureGene, loadStructure, loadCleavage]);

  // Auto-load context when at least 2 genes are visible
  useEffect(() => {
    if (activeGenes.length >= 2) {
      // If the current pair is no longer valid (a gene was hidden), reset
      if (selectedPair &&
        (!visibleGenes.has(selectedPair.geneA) || !visibleGenes.has(selectedPair.geneB))) {
        loadContext(activeGenes[0], activeGenes[1]);
      } else if (!selectedPair) {
        loadContext(activeGenes[0], activeGenes[1]);
      }
    } else if (activeGenes.length < 2) {
      setContextData(null);
      setSelectedPair(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGenes.join(",")]);

  // ── Cross-panel event handlers ──

  // Node click → updates structure + cleavage + selects pair with active gene
  const handleNodeClick = useCallback(
    (node: { id: string; label: string; is_query: boolean; sources: string[] }) => {
      const gene = node.id;
      setActiveStructureGene(gene);
      loadStructure(gene);
      loadCleavage(gene);

      // If we have a selected pair, update it to include the clicked gene
      if (selectedPair) {
        const otherGene = selectedPair.geneA === gene ? selectedPair.geneB : selectedPair.geneA;
        if (otherGene !== gene) {
          loadContext(gene, otherGene);
        }
      } else if (activeGenes.length >= 1) {
        // Pick the first different gene
        const other = activeGenes.find((g) => g !== gene) || activeGenes[0];
        loadContext(gene, other);
      }
    },
    [loadStructure, loadCleavage, loadContext, selectedPair, activeGenes, setActiveStructureGene]
  );

  // Edge click → loads interaction context + citations for the pair
  const handleEdgeClick = useCallback(
    async (edge: { source: string; target: string }) => {
      // Load interaction context
      loadContext(edge.source, edge.target);

      // Also switch structure viewer to source gene
      setActiveStructureGene(edge.source);
      loadStructure(edge.source);
      loadCleavage(edge.source);

      // Open citation popup
      setCitationPopup({
        open: true,
        geneA: edge.source,
        geneB: edge.target,
        citations: [],
        loading: true,
      });

      try {
        const resp = await fetchInteractionCitations(
          edge.source,
          edge.target
        );
        setCitationPopup((prev) => ({
          ...prev,
          citations: resp.data?.citations || [],
          loading: false,
        }));
      } catch {
        setCitationPopup((prev) => ({ ...prev, loading: false }));
      }
    },
    [loadContext, loadStructure, loadCleavage, setActiveStructureGene]
  );

  // Pathway banner gene click → selects gene + updates all panels
  const handlePathwayGeneClick = useCallback(
    (gene: string) => {
      setActiveStructureGene(gene);
      loadStructure(gene);
      loadCleavage(gene);

      // Load context with the other gene in the current pair
      if (selectedPair) {
        const other = selectedPair.geneA === gene ? selectedPair.geneB : selectedPair.geneA;
        if (other !== gene) {
          loadContext(gene, other);
        }
      }
    },
    [loadStructure, loadCleavage, loadContext, selectedPair, setActiveStructureGene]
  );

  // Cleavage positions for highlighting in 3D viewer
  const cleavagePositions = (cleavageData?.cleavage_sites || []).map(
    (s: { position: number }) => s.position
  );

  // Extract pathway axis from context data
  const pathwayAxis = contextData?.pathway_axis ?? null;

  const hasVisibleGenes = activeGenes.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-kiri-text tracking-tight flex items-center gap-2">
            {t("nav.interaction")}
            <InfoTooltip tooltipKey="tooltips.interaction" />
          </h1>
          <p className="text-sm text-kiri-text-muted mt-1">
            {t("modules.interaction.subtitle")}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          {/* Confidence slider */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-kiri-text-muted">
              {t("modules.interaction.confidence")}
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              className="w-32 accent-kiri-accent"
            />
            <span className="text-xs font-mono text-kiri-accent w-8">
              {confidence.toFixed(2)}
            </span>
          </div>

          {/* Structure gene selector — only shows visible genes */}
          {activeGenes.length > 0 && (
            <select
              value={activeStructureGene}
              onChange={(e) => {
                const gene = e.target.value;
                setActiveStructureGene(gene);
                loadStructure(gene);
                loadCleavage(gene);
              }}
              className="text-xs px-3 py-1.5 rounded border border-kiri-border bg-kiri-surface text-kiri-text"
            >
              {activeGenes.map((gene) => (
                <option key={gene} value={gene}>
                  {gene}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── Protein Toggle Chip Bar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-kiri-text-dim uppercase tracking-wider mr-1">
          Proteins:
        </span>
        {projectGenes.map((gene) => {
          const isActive = visibleGenes.has(gene);
          return (
            <button
              key={gene}
              onClick={() => toggleGene(gene)}
              className={`
                text-xs px-3 py-1.5 rounded-full font-medium
                transition-all duration-200 border
                ${isActive
                  ? "bg-kiri-accent/20 border-kiri-accent text-kiri-accent shadow-[0_0_8px_rgba(0,255,136,0.15)]"
                  : "bg-kiri-surface/50 border-kiri-border text-kiri-text-dim hover:border-kiri-text-muted hover:text-kiri-text-muted"
                }
              `}
            >
              {isActive ? "●" : "○"} {gene}
            </button>
          );
        })}
        {/* Quick actions */}
        <div className="flex items-center gap-1 ml-2 border-l border-kiri-border pl-2">
          <button
            onClick={selectAllGenes}
            className="text-[10px] px-2 py-1 rounded text-kiri-text-dim hover:text-kiri-accent transition-colors"
          >
            All
          </button>
          <button
            onClick={clearAllGenes}
            className="text-[10px] px-2 py-1 rounded text-kiri-text-dim hover:text-kiri-error transition-colors"
          >
            None
          </button>
        </div>
        {activeGenes.length > 0 && (
          <span className="text-[10px] text-kiri-text-dim ml-auto">
            {activeGenes.length}/{projectGenes.length} active
          </span>
        )}
      </div>

      {/* ── Empty state when no proteins selected ── */}
      <AnimatePresence mode="wait">
        {!hasVisibleGenes ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="text-5xl mb-4 opacity-40">🧬</div>
            <h3 className="text-lg font-semibold text-kiri-text-muted mb-2">
              Select proteins to explore
            </h3>
            <p className="text-sm text-kiri-text-dim max-w-md mb-4">
              Toggle one or more proteins above to load their interaction network,
              3D structures, cleavage motifs, and pathway context.
            </p>
            <button
              onClick={selectAllGenes}
              className="text-xs px-4 py-2 rounded-lg bg-kiri-accent/10 border border-kiri-accent/30 text-kiri-accent hover:bg-kiri-accent/20 transition-colors"
            >
              Select all {projectGenes.length} proteins
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {/* Pathway Banner */}
            <PathwayBanner
              axis={pathwayAxis}
              selectedPair={selectedPair}
              onGeneClick={handlePathwayGeneClick}
            />

            {/* Top row: PPI + 3D Viewer */}
            <div className="grid grid-cols-5 gap-4" style={{ minHeight: "480px" }}>
              <div className="col-span-3">
                <PPINetwork
                  data={ppiData}
                  provenance={ppiProvenance}
                  loading={ppiLoading}
                  confidence={confidence}
                  onEdgeClick={handleEdgeClick}
                  onNodeClick={handleNodeClick}
                />
              </div>
              <div className="col-span-2">
                <ProteinViewer
                  data={structureData}
                  provenance={structureProvenance}
                  loading={structureLoading}
                  cleavageSites={cleavagePositions}
                  geneName={activeStructureGene}
                  allStructures={allStructures}
                  visibleGenes={activeGenes}
                />
              </div>
            </div>

            {/* Bottom row: Cleavage + Interaction Context */}
            <div className="grid grid-cols-3 gap-4" style={{ minHeight: "320px" }}>
              <div className="col-span-1">
                <CleavagePanel
                  data={cleavageData}
                  provenance={cleavageProvenance}
                  loading={cleavageLoading}
                />
              </div>
              <div className="col-span-2">
                <InteractionDetail
                  data={contextData}
                  provenance={contextProvenance}
                  loading={contextLoading}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Citation popup */}
      <CitationPopup
        isOpen={citationPopup.open}
        onClose={() => setCitationPopup((p) => ({ ...p, open: false }))}
        geneA={citationPopup.geneA}
        geneB={citationPopup.geneB}
        citations={citationPopup.citations}
        loading={citationPopup.loading}
      />
    </motion.div>
  );
}
