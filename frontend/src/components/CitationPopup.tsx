/**
 * Kiri — Citation Popup
 *
 * Modal popup showing PubMed citations for a PPI edge.
 * All PMIDs validated via Trust Layer.
 */

import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { VerifiedBadge, QuarantineBadge } from "./ui";

interface Citation {
  pmid: string;
  title: string;
  authors?: string[];
  journal?: string;
  year?: string;
  doi?: string;
  validated: boolean;
}

interface CitationPopupProps {
  isOpen: boolean;
  onClose: () => void;
  geneA: string;
  geneB: string;
  citations: Citation[];
  loading: boolean;
}

export function CitationPopup({
  isOpen,
  onClose,
  geneA,
  geneB,
  citations,
  loading,
}: CitationPopupProps) {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[560px] max-h-[70vh] bg-kiri-surface border border-kiri-border rounded-lg shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-kiri-border">
              <div>
                <h3 className="text-sm font-medium text-kiri-text">
                  {t("modules.interaction.citations_for")}
                </h3>
                <p className="text-xs text-kiri-accent font-mono mt-0.5">
                  {geneA} ↔ {geneB}
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-kiri-text-muted hover:text-kiri-text text-lg transition-colors px-2"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[50vh] p-5">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin w-5 h-5 border-2 border-kiri-accent border-t-transparent rounded-full" />
                  <span className="ml-3 text-sm text-kiri-text-muted">
                    {t("common.loading")}
                  </span>
                </div>
              ) : citations.length === 0 ? (
                <p className="text-center text-kiri-text-muted text-sm py-8">
                  {t("modules.interaction.no_citations")}
                </p>
              ) : (
                <div className="space-y-3">
                  {citations.map((citation, i) => (
                    <motion.div
                      key={citation.pmid}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="p-3 rounded border border-kiri-border hover:border-kiri-border-focus transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-kiri-text leading-snug">
                            {citation.title || "Title unavailable"}
                          </p>
                          {citation.authors && citation.authors.length > 0 && (
                            <p className="text-xs text-kiri-text-muted mt-1">
                              {citation.authors.join(", ")}
                              {citation.authors.length >= 5 && " et al."}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-kiri-text-dim font-mono">
                            {citation.journal && <span>{citation.journal}</span>}
                            {citation.year && <span>({citation.year})</span>}
                            <a
                              href={`https://pubmed.ncbi.nlm.nih.gov/${citation.pmid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-kiri-accent hover:underline"
                            >
                              PMID: {citation.pmid}
                            </a>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {citation.validated ? (
                            <VerifiedBadge />
                          ) : (
                            <QuarantineBadge />
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-kiri-border flex items-center justify-between text-[10px] text-kiri-text-dim">
              <span>
                {citations.length} {t("modules.interaction.citations_count")} ·{" "}
                {citations.filter((c) => c.validated).length}{" "}
                {t("trust.verified").toLowerCase()}
              </span>
              <span>{t("trust.source")}: PubMed/NCBI</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
