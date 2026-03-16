import { useTranslation } from "react-i18next";
import type { ProjectProtein } from "../store/projectSlice";

interface ProteinCardProps {
  protein: ProjectProtein;
  onRemove?: (id: string) => void;
  compact?: boolean;
}

/**
 * Displays validated protein metadata from UniProt.
 * Used in the project wizard and project detail views.
 */
export function ProteinCard({ protein, onRemove, compact }: ProteinCardProps) {
  const { t } = useTranslation();

  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-kiri-surface border border-kiri-border group">
        <span className="font-mono text-sm font-bold text-kiri-accent">
          {protein.gene_symbol}
        </span>
        {protein.protein_name && (
          <span className="text-xs text-kiri-text-muted truncate max-w-40">
            {protein.protein_name}
          </span>
        )}
        {onRemove && (
          <button
            onClick={() => onRemove(protein.id)}
            className="ml-auto text-kiri-text-dim hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
            title={t("common.remove") || "Remove"}
          >
            ×
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-kiri-border bg-kiri-surface p-4 hover:border-kiri-border-focus transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-kiri-accent">
              {protein.gene_symbol}
            </span>
            {protein.uniprot_id && (
              <a
                href={`https://www.uniprot.org/uniprot/${protein.uniprot_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-2 py-0.5 rounded bg-kiri-accent-glow text-kiri-accent border border-kiri-accent-dim hover:brightness-110 transition"
              >
                {protein.uniprot_id}
              </a>
            )}
          </div>
          {protein.protein_name && (
            <p className="text-sm text-kiri-text mt-0.5">{protein.protein_name}</p>
          )}
        </div>
        {onRemove && (
          <button
            onClick={() => onRemove(protein.id)}
            className="text-kiri-text-dim hover:text-red-400 transition-colors text-lg leading-none"
            title={t("common.remove") || "Remove"}
          >
            ×
          </button>
        )}
      </div>

      {/* Details */}
      <div className="mt-3 space-y-1.5">
        {protein.function_summary && (
          <p className="text-xs text-kiri-text-muted leading-relaxed line-clamp-3">
            {protein.function_summary}
          </p>
        )}
        <div className="flex items-center gap-4 text-xs text-kiri-text-dim">
          {protein.organism && <span>🧬 {protein.organism}</span>}
          {protein.sequence_length > 0 && (
            <span>{protein.sequence_length} aa</span>
          )}
        </div>
      </div>
    </div>
  );
}
