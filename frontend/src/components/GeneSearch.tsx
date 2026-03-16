/**
 * Kiri — Gene Search Component
 *
 * Auto-validates gene symbols against HGNC as the user types.
 * Trust Layer gate: invalid genes are flagged before they reach any analysis.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "../store";
import { addGene, removeGene } from "../store";
import { validateGene, getErrorMessage } from "../services/api";
import { StatusBadge } from "./ui";

interface GeneSearchProps {
  onSelect?: (symbol: string) => void;
  placeholder?: string;
}

interface GeneResult {
  symbol: string;
  name: string | null;
  valid: boolean;
  loading: boolean;
  error?: string;
}

export function GeneSearch({ onSelect, placeholder }: GeneSearchProps = {}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const selectedGenes = useAppSelector((s) => s.app.selectedGenes);
  const [input, setInput] = useState("");
  const [suggestion, setSuggestion] = useState<GeneResult | null>(null);
  const [validating, setValidating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value.toUpperCase());
      setSuggestion(null);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      const cleaned = value.trim().toUpperCase();
      if (cleaned.length < 2) return;

      debounceRef.current = setTimeout(async () => {
        setValidating(true);
        try {
          const resp = await validateGene(cleaned);
          if (resp.status === "success" && resp.data) {
            setSuggestion({
              symbol: resp.data.symbol,
              name: resp.data.name,
              valid: resp.data.valid,
              loading: false,
            });
          }
        } catch (err) {
          setSuggestion({
            symbol: cleaned,
            name: null,
            valid: false,
            loading: false,
            error: getErrorMessage(err),
          });
        }
        setValidating(false);
      }, 500);
    },
    []
  );

  const handleAdd = useCallback(
    (symbol: string) => {
      if (onSelect) {
        onSelect(symbol);
      } else {
        dispatch(addGene(symbol));
      }
      setInput("");
      setSuggestion(null);
    },
    [dispatch, onSelect]
  );

  const handleRemove = useCallback(
    (symbol: string) => {
      dispatch(removeGene(symbol));
    },
    [dispatch]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && suggestion?.valid) {
        handleAdd(suggestion.symbol);
      }
    },
    [suggestion, handleAdd]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="relative">
      {/* Search input */}
      <input
        type="text"
        value={input}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || t("common.search")}
        className="
          w-full bg-kiri-bg border border-kiri-border rounded px-3 py-2
          text-sm text-kiri-text font-mono
          placeholder:text-kiri-text-dim
          focus:outline-none focus:border-kiri-accent
          transition-colors
        "
      />

      {/* Validation indicator */}
      {validating && (
        <div className="absolute right-3 top-2.5">
          <span className="text-kiri-text-dim text-xs animate-pulse">
            validating…
          </span>
        </div>
      )}

      {/* Suggestion dropdown */}
      {suggestion && (
        <div className="absolute z-10 w-full mt-1 bg-kiri-surface border border-kiri-border rounded shadow-xl">
          <button
            onClick={() =>
              suggestion.valid ? handleAdd(suggestion.symbol) : null
            }
            disabled={!suggestion.valid}
            className={`
              w-full text-left px-3 py-2 text-sm flex items-center justify-between
              ${
                suggestion.valid
                  ? "hover:bg-kiri-surface-hover cursor-pointer"
                  : "opacity-60 cursor-not-allowed"
              }
            `}
          >
            <div>
              <span className="font-mono text-kiri-text">
                {suggestion.symbol}
              </span>
              {suggestion.name && (
                <span className="text-kiri-text-muted ml-2 text-xs">
                  {suggestion.name}
                </span>
              )}
            </div>
            {suggestion.valid ? (
              <StatusBadge label="HGNC ✓" variant="success" />
            ) : (
              <StatusBadge
                label={suggestion.error || "Not found"}
                variant="error"
              />
            )}
          </button>
        </div>
      )}

      {/* Selected genes */}
      {selectedGenes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selectedGenes.map((gene) => (
            <span
              key={gene}
              className="inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded bg-kiri-accent-glow text-kiri-accent border border-kiri-accent-dim"
            >
              {gene}
              <button
                onClick={() => handleRemove(gene)}
                className="ml-0.5 hover:text-kiri-error transition-colors"
                aria-label={`Remove ${gene}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
