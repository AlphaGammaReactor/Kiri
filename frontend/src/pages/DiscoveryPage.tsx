import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useAppSelector } from "../store";
import type { RootState } from "../store";
import { useCallback } from "react";
import { usePageState } from "../hooks/usePageState";
import { Card, AiBadge, InfoTooltip, Stat } from "../components/ui";
import { CitationCard } from "../components/discovery/CitationCard";
import { ConfidenceScoreBar } from "../components/discovery/ConfidenceScoreBar";
import { getLiteratureInsights, getErrorMessage } from "../services/api";
import { Send, FileText, Zap, Check, X } from "lucide-react";

export default function DiscoveryPage() {
  const { t } = useTranslation();
  const activeProject = useAppSelector((s: RootState) => s.project.activeProject);
  
  // ── Persisted UI State ──
  const [uiState, setUiState] = usePageState<{ query: string }>("discovery", { query: "" });
  const { query } = uiState;
  const setQuery = useCallback((val: string) => setUiState(s => ({ ...s, query: val })), [setUiState]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  type DiscoveryResult = {
    summary: string;
    novelty_score: number;
    validation_stats: { valid: number; quarantined: number };
    claims: { text: string; confidence: number; sourceId?: string; type?: string; verified_pmids: string[]; is_quarantined: boolean }[];
    keywords?: string[];
    rationale?: string;
  };
  
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  // Claim feedback state: claim index → "accepted" | "dismissed"
  const [claimFeedback, setClaimFeedback] = useState<Record<number, "accepted" | "dismissed">>({});

  const handleMine = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    setError(null);
    setResult(null);
    setClaimFeedback({});

    try {
      const context = activeProject 
        ? `Project context: studying proteins ${activeProject.proteins.map((p: { gene_symbol: string }) => p.gene_symbol).join(', ')} in the context of ${activeProject.cancer_type || 'cancer'}.`
        : "";

      const resp = await getLiteratureInsights(query, context);
      
      if (resp.status === "success" && resp.data) {
        setResult(resp.data);
      } else {
        setError(resp.errors?.join(", ") || t("common.error"));
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = (idx: number, action: "accepted" | "dismissed") => {
    setClaimFeedback((prev) => {
      const next = { ...prev };
      if (next[idx] === action) {
        delete next[idx]; // Toggle off
      } else {
        next[idx] = action;
      }
      return next;
    });
  };

  const acceptedCount = Object.values(claimFeedback).filter((v) => v === "accepted").length;
  const dismissedCount = Object.values(claimFeedback).filter((v) => v === "dismissed").length;

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-kiri-text tracking-tight flex items-center gap-2">
            {t("discovery.title")}
            <AiBadge />
            <InfoTooltip tooltipKey="tooltips.discovery" />
          </h1>
          <p className="text-sm text-kiri-text-muted mt-1">{t("discovery.subtitle")}</p>
        </div>
        <div className="flex items-center gap-4">
          {activeProject?.proteins && activeProject.proteins.length > 0 && (
            <Stat label="Target Genes" value={activeProject.proteins.map((p: { gene_symbol: string }) => p.gene_symbol).join(", ")} />
          )}
        </div>
      </header>

      {/* Query Input */}
      <Card className="p-6 border-kiri-border bg-kiri-surface shadow-lg">
        <div className="flex gap-4">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("discovery.placeholder")}
            className="w-full h-24 bg-kiri-bg border border-kiri-border rounded-lg p-4 text-kiri-text placeholder-kiri-text-dim px-4 focus:border-kiri-border-focus focus:outline-none focus:ring-1 focus:ring-kiri-border-focus transition-all resize-none shadow-inner"
            disabled={loading}
          />
        </div>
        <div className="flex justify-between items-center mt-4">
          <div className="text-xs text-kiri-text-muted flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-kiri-warning" />
            {t("discovery.powered_by")}
          </div>
          <button
            onClick={handleMine}
            disabled={loading || !query.trim()}
            className="flex items-center gap-2 px-6 py-2.5 bg-kiri-accent text-kiri-bg rounded-lg font-medium hover:brightness-110 active:brightness-90 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-kiri-accent/20"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-kiri-bg/30 border-t-kiri-bg rounded-full animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {t("discovery.mine_button")}
              </>
            )}
          </button>
        </div>
      </Card>

      {/* Error State */}
      {error && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-4 border-kiri-error/20 bg-kiri-error/5 text-kiri-error">
            {error}
          </Card>
        </motion.div>
      )}

      {/* Results */}
      {result && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="space-y-6"
        >
          {/* Summary & Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 md:col-span-2 border-kiri-border bg-kiri-surface">
              <h3 className="text-sm uppercase tracking-wider text-kiri-text-dim mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {t("discovery.summary")}
              </h3>
              <p className="text-gray-200 leading-relaxed text-sm">
                {result.summary}
              </p>
            </Card>

            <Card className="p-6 border-kiri-border bg-kiri-surface outline-kiri-accent/20">
              <h3 className="text-sm uppercase tracking-wider text-kiri-text-dim mb-3">
                {t("discovery.novelty")}
              </h3>
              <div className="flex items-end gap-2 mb-2">
                <span className="text-4xl font-light text-kiri-accent">
                  {(result.novelty_score * 10).toFixed(1)}
                </span>
                <span className="text-kiri-text-muted mb-1">/ 10</span>
              </div>
              <ConfidenceScoreBar 
                score={result.novelty_score} 
                label={t("discovery.uniqueness")} 
              />
               <div className="mt-4 pt-4 border-t border-kiri-border/50 space-y-2">
                 <div className="text-xs text-kiri-text-muted flex justify-between">
                   <span>{t("discovery.validated_pmids")}:</span>
                   <span className="text-kiri-success">{result.validation_stats.valid}</span>
                 </div>
                 {result.validation_stats.quarantined > 0 && (
                   <div className="text-xs text-kiri-text-muted flex justify-between">
                     <span>{t("discovery.quarantined_claims")}:</span>
                     <span className="text-kiri-error">{result.validation_stats.quarantined}</span>
                   </div>
                 )}
               </div>
            </Card>
          </div>

          {/* Feedback Summary Bar */}
          {(acceptedCount > 0 || dismissedCount > 0) && (
            <div className="flex items-center gap-4 px-4 py-2.5 rounded-lg bg-kiri-surface border border-kiri-border">
              <span className="text-xs text-kiri-text-muted">{t("discovery.feedback_summary")}:</span>
              {acceptedCount > 0 && (
                <span className="text-xs text-kiri-success flex items-center gap-1">
                  <Check className="w-3 h-3" /> {acceptedCount} {t("discovery.accepted")}
                </span>
              )}
              {dismissedCount > 0 && (
                <span className="text-xs text-kiri-error flex items-center gap-1">
                  <X className="w-3 h-3" /> {dismissedCount} {t("discovery.dismissed")}
                </span>
              )}
            </div>
          )}

          {/* Claims List */}
          <div>
            <h3 className="text-sm uppercase tracking-wider text-kiri-text-dim mb-4">
              {t("discovery.claims")}
            </h3>
            <div className="space-y-4">
              {result.claims.map((claim: DiscoveryResult['claims'][number], idx: number) => {
                const feedback = claimFeedback[idx];
                return (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className={`relative ${feedback === "dismissed" ? "opacity-40" : ""}`}
                  >
                    <CitationCard
                      text={claim.text}
                      verifiedPmids={claim.verified_pmids}
                      isQuarantined={claim.is_quarantined}
                      confidence={claim.confidence}
                    />
                    {/* Feedback Buttons */}
                    <div className="absolute top-3 right-3 flex gap-1">
                      <button
                        onClick={() => handleFeedback(idx, "accepted")}
                        title={t("discovery.accept_claim")}
                        className={`p-1.5 rounded-md transition-all ${
                          feedback === "accepted"
                            ? "bg-kiri-success/20 text-kiri-success"
                            : "bg-kiri-surface-hover text-kiri-text-dim hover:text-kiri-success hover:bg-kiri-success/10"
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleFeedback(idx, "dismissed")}
                        title={t("discovery.dismiss_claim")}
                        className={`p-1.5 rounded-md transition-all ${
                          feedback === "dismissed"
                            ? "bg-kiri-error/20 text-kiri-error"
                            : "bg-kiri-surface-hover text-kiri-text-dim hover:text-kiri-error hover:bg-kiri-error/10"
                        }`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

