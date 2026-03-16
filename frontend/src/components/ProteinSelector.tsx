/**
 * Kiri — Protein Selector Component
 *
 * Pre-loaded catalog grid with filter-by-typing and multi-select.
 * Replaces the old GeneSearch component in the project wizard.
 *
 * - Loads the full protein catalog from the backend on mount
 * - Client-side filtering as the user types (instant, no API call)
 * - Click to select/deselect proteins
 * - Core PARL-MAVS axis proteins highlighted with badge
 * - Expandable "Add Custom Protein" section for genes not in catalog
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, validateGene, getErrorMessage } from "../services/api";
import { StatusBadge } from "./ui";

export interface CatalogProtein {
  gene_symbol: string;
  uniprot_id: string;
  protein_name: string;
  organism: string;
  function_summary: string;
  sequence_length: number;
  hgnc_id?: string;
  category?: string;
  keywords?: string[];
}

interface ProteinSelectorProps {
  selectedSymbols: string[];
  onSelect: (symbol: string) => void;
  onDeselect?: (symbol: string) => void;
  isAdding?: boolean;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  core: { label: "Core Target", color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30" },
  immune: { label: "Immune", color: "text-blue-400 bg-blue-500/15 border-blue-500/30" },
  mitochondrial: { label: "Mito", color: "text-purple-400 bg-purple-500/15 border-purple-500/30" },
  oncology: { label: "Oncology", color: "text-amber-400 bg-amber-500/15 border-amber-500/30" },
};

export function ProteinSelector({
  selectedSymbols,
  onSelect,
  onDeselect,
  isAdding,
}: ProteinSelectorProps) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<CatalogProtein[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [customValidating, setCustomValidating] = useState(false);
  const [customResult, setCustomResult] = useState<{
    symbol: string;
    name: string | null;
    valid: boolean;
    error?: string;
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load catalog on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await apiGet<CatalogProtein[]>("/v1/proteins/catalog");
        if (!cancelled && resp.data) {
          setCatalog(resp.data);
        }
      } catch {
        // Catalog load failed — user can still use custom entry
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Client-side filter
  const filtered = useMemo(() => {
    if (!filter.trim()) return catalog;
    const q = filter.trim().toLowerCase();
    return catalog.filter(
      (p) =>
        p.gene_symbol.toLowerCase().includes(q) ||
        p.protein_name.toLowerCase().includes(q) ||
        (p.keywords?.some((kw) => kw.toLowerCase().includes(q)) ?? false) ||
        (p.category?.toLowerCase().includes(q) ?? false)
    );
  }, [catalog, filter]);

  const isSelected = useCallback(
    (symbol: string) => selectedSymbols.includes(symbol),
    [selectedSymbols]
  );

  const handleToggle = useCallback(
    (symbol: string) => {
      if (isSelected(symbol)) {
        onDeselect?.(symbol);
      } else {
        onSelect(symbol);
      }
    },
    [isSelected, onSelect, onDeselect]
  );

  // Custom protein input with HGNC validation
  const handleCustomChange = useCallback((value: string) => {
    setCustomInput(value.toUpperCase());
    setCustomResult(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const cleaned = value.trim().toUpperCase();
    if (cleaned.length < 2) return;

    debounceRef.current = setTimeout(async () => {
      setCustomValidating(true);
      try {
        const resp = await validateGene(cleaned);
        if (resp.status === "success" && resp.data) {
          setCustomResult({
            symbol: resp.data.symbol,
            name: resp.data.name,
            valid: resp.data.valid,
          });
        }
      } catch (err) {
        setCustomResult({
          symbol: cleaned,
          name: null,
          valid: false,
          error: getErrorMessage(err),
        });
      }
      setCustomValidating(false);
    }, 500);
  }, []);

  const handleCustomAdd = useCallback(() => {
    if (customResult?.valid && !isSelected(customResult.symbol)) {
      onSelect(customResult.symbol);
      setCustomInput("");
      setCustomResult(null);
    }
  }, [customResult, isSelected, onSelect]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, CatalogProtein[]> = {};
    for (const p of filtered) {
      const cat = p.category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    }
    return groups;
  }, [filtered]);

  const categoryOrder = ["core", "immune", "mitochondrial", "oncology", "other"];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-kiri-accent border-t-transparent rounded-full animate-spin" />
        <span className="ml-3 text-sm text-kiri-text-muted">Loading protein catalog…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="relative">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("projects.filter_proteins") || "Filter proteins…"}
          className="
            w-full bg-kiri-bg border border-kiri-border rounded-lg px-4 py-2.5
            text-sm text-kiri-text font-mono
            placeholder:text-kiri-text-dim
            focus:outline-none focus:border-kiri-accent
            transition-colors
          "
          autoFocus
        />
        {filter && (
          <button
            onClick={() => setFilter("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-kiri-text-dim hover:text-kiri-text transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-kiri-text-dim">
          {filtered.length} protein{filtered.length !== 1 ? "s" : ""} available
          {selectedSymbols.length > 0 && (
            <span className="text-kiri-accent ml-2">
              · {selectedSymbols.length} selected
            </span>
          )}
        </span>
        {isAdding && (
          <div className="flex items-center gap-2 text-xs text-kiri-accent">
            <div className="w-3 h-3 border-2 border-kiri-accent border-t-transparent rounded-full animate-spin" />
            Adding…
          </div>
        )}
      </div>

      {/* Catalog Grid */}
      <div className="space-y-5 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin">
        {categoryOrder.map((cat) => {
          const proteins = grouped[cat];
          if (!proteins || proteins.length === 0) return null;
          const catMeta = CATEGORY_LABELS[cat] || { label: cat, color: "text-kiri-text-dim bg-kiri-surface border-kiri-border" };

          return (
            <div key={cat}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-kiri-text-muted mb-2 flex items-center gap-2">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${catMeta.color}`}>
                  {catMeta.label}
                </span>
                <span className="text-kiri-text-dim">({proteins.length})</span>
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {proteins.map((protein) => {
                  const selected = isSelected(protein.gene_symbol);
                  return (
                    <button
                      key={protein.gene_symbol}
                      onClick={() => handleToggle(protein.gene_symbol)}
                      className={`
                        w-full text-left p-3 rounded-xl border transition-all
                        ${selected
                          ? "border-kiri-accent bg-kiri-accent/8 ring-1 ring-kiri-accent/20"
                          : "border-kiri-border bg-kiri-surface hover:border-kiri-border-focus hover:bg-kiri-surface-hover"
                        }
                      `}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <div
                          className={`
                            mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors
                            ${selected
                              ? "border-kiri-accent bg-kiri-accent text-kiri-bg"
                              : "border-kiri-border"
                            }
                          `}
                        >
                          {selected && "✓"}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-bold text-kiri-accent">
                              {protein.gene_symbol}
                            </span>
                            {protein.uniprot_id && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-kiri-accent-glow text-kiri-accent border border-kiri-accent-dim">
                                {protein.uniprot_id}
                              </span>
                            )}
                          </div>
                          {protein.protein_name && (
                            <p className="text-xs text-kiri-text mt-0.5 truncate">
                              {protein.protein_name}
                            </p>
                          )}
                          {protein.function_summary && (
                            <p className="text-xs text-kiri-text-muted mt-1 line-clamp-2 leading-relaxed">
                              {protein.function_summary}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-kiri-text-dim">
                            {protein.organism && <span>🧬 {protein.organism}</span>}
                            {protein.sequence_length > 0 && (
                              <span>{protein.sequence_length} aa</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-kiri-text-dim">
            No proteins match &quot;{filter}&quot;
          </div>
        )}
      </div>

      {/* Custom Protein Entry */}
      <div className="border-t border-kiri-border pt-4 mt-4">
        <button
          onClick={() => setShowCustom(!showCustom)}
          className="text-xs text-kiri-text-muted hover:text-kiri-accent transition-colors flex items-center gap-1"
        >
          <span className="text-base leading-none">{showCustom ? "−" : "+"}</span>
          {t("projects.add_custom") || "Add Custom Protein"}
        </button>

        {showCustom && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => handleCustomChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCustomAdd();
                  }}
                  placeholder={t("projects.search_protein") || "Type gene symbol…"}
                  className="
                    w-full bg-kiri-bg border border-kiri-border rounded-lg px-3 py-2
                    text-sm text-kiri-text font-mono
                    placeholder:text-kiri-text-dim
                    focus:outline-none focus:border-kiri-accent
                    transition-colors
                  "
                />
                {customValidating && (
                  <div className="absolute right-3 top-2.5">
                    <span className="text-kiri-text-dim text-xs animate-pulse">
                      validating…
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={handleCustomAdd}
                disabled={!customResult?.valid || isSelected(customResult?.symbol || "")}
                className="px-4 py-2 rounded-lg bg-kiri-accent text-kiri-bg text-sm font-medium disabled:opacity-30 hover:brightness-110 transition shrink-0"
              >
                {t("common.add") || "Add"}
              </button>
            </div>

            {/* Validation result */}
            {customResult && (
              <div
                className={`
                  flex items-center justify-between px-3 py-2 rounded-lg text-sm
                  ${customResult.valid
                    ? "bg-kiri-surface border border-kiri-border"
                    : "bg-red-500/5 border border-red-500/20"
                  }
                `}
              >
                <div>
                  <span className="font-mono text-kiri-text">{customResult.symbol}</span>
                  {customResult.name && (
                    <span className="text-kiri-text-muted ml-2 text-xs">{customResult.name}</span>
                  )}
                </div>
                {customResult.valid ? (
                  <StatusBadge label="HGNC ✓" variant="success" />
                ) : (
                  <StatusBadge label={customResult.error || "Not found"} variant="error" />
                )}
              </div>
            )}

            <p className="text-[10px] text-kiri-text-dim">
              Custom proteins are validated via HGNC and enriched with UniProt metadata.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
