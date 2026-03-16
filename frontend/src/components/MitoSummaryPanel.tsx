/**
 * Kiri — Mitochondrial Analysis Summary Panel
 *
 * Integrated view showing the A→B→C narrative:
 *   A (PARL) → B (MAVS) → C (Mitochondrial Function)
 *
 * Displays key statistics from each analysis step with
 * a visual arrow diagram and evidence strength indicators.
 */

import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Card, StatusBadge } from "./ui";
import type { MitoCorrelation, MitoScoreComparison, GSEATerm } from "../services/api";

interface MitoSummaryPanelProps {
  correlations: MitoCorrelation[];
  comparisons: Record<string, MitoScoreComparison>;
  gseaTerms: Record<string, GSEATerm[]>;
  targetGenes: string[];
}

function formatP(p: number): string {
  if (p < 0.0001) return p.toExponential(2);
  return p.toFixed(4);
}

function EvidenceArrow({ label, value, pValue, significant }: {
  label: string; value: string; pValue: number; significant: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-1"
    >
      <div className={`text-xs font-mono px-3 py-1.5 rounded-lg border ${
        significant
          ? "border-kiri-accent/50 bg-kiri-accent/10 text-kiri-accent"
          : "border-kiri-border bg-kiri-surface text-kiri-text-muted"
      }`}>
        {label}
      </div>
      <div className="text-[10px] text-kiri-text-dim">
        {value} · p = {formatP(pValue)}
      </div>
      {significant && (
        <StatusBadge label="✓ Significant" variant="success" />
      )}
    </motion.div>
  );
}

export function MitoSummaryPanel({
  correlations,
  comparisons,
  gseaTerms,
  targetGenes,
}: MitoSummaryPanelProps) {
  const { t } = useTranslation();

  // Find PARL-MAVS correlation from the scatter data
  const parlMavs = correlations.find(
    c => (c.target_gene === "PARL" && c.mito_gene === "MAVS") ||
         (c.target_gene === "MAVS" && c.mito_gene === "PARL")
  );

  // Get best mito correlations per gene
  const bestMitoCorr: Record<string, MitoCorrelation | null> = {};
  targetGenes.forEach(gene => {
    const geneCorrs = correlations.filter(c => c.target_gene === gene);
    geneCorrs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    bestMitoCorr[gene] = geneCorrs[0] || null;
  });

  // Get OXPHOS pathway result per gene
  const oxphosResults: Record<string, GSEATerm | null> = {};
  targetGenes.forEach(gene => {
    const terms = gseaTerms[gene] || [];
    const oxphos = terms.find(t =>
      t.term.toUpperCase().includes("OXIDATIVE_PHOSPHORYLATION") ||
      t.term.toUpperCase().includes("OXIDATIVE PHOSPHORYLATION")
    );
    oxphosResults[gene] = oxphos || null;
  });

  return (
    <Card className="overflow-hidden">
      <div className="space-y-6 p-2">
        {/* Title */}
        <div className="text-center">
          <h3 className="text-lg font-bold text-kiri-text">
            {t("mito.summary_title", "Indirect Evidence: PARL → MAVS → Mitochondrial Function")}
          </h3>
          <p className="text-xs text-kiri-text-muted mt-1">
            {t("mito.summary_subtitle", "If A→B is correlated and B→C is established, then A may indirectly regulate C")}
          </p>
        </div>

        {/* Arrow Diagram */}
        <div className="flex items-center justify-center gap-4 py-4">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col items-center"
          >
            <div className="w-24 h-24 rounded-xl bg-linear-to-br from-red-500/20 to-orange-500/20 border border-red-500/30 flex flex-col items-center justify-center">
              <span className="text-2xl">🔬</span>
              <span className="text-sm font-bold text-red-400 mt-1">PARL</span>
              <span className="text-[9px] text-kiri-text-dim">Protease (A)</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center"
          >
            <div className="text-kiri-accent text-xl">→</div>
            <div className="text-[9px] text-kiri-text-dim text-center">
              {parlMavs ? `r = ${parlMavs.r.toFixed(3)}` : "Cleavage"}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col items-center"
          >
            <div className="w-24 h-24 rounded-xl bg-linear-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 flex flex-col items-center justify-center">
              <span className="text-2xl">🛡️</span>
              <span className="text-sm font-bold text-blue-400 mt-1">MAVS</span>
              <span className="text-[9px] text-kiri-text-dim">Substrate (B)</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col items-center"
          >
            <div className="text-kiri-accent text-xl">→</div>
            <div className="text-[9px] text-kiri-text-dim text-center">
              {comparisons["MAVS"]
                ? `p = ${formatP(comparisons["MAVS"].p_value)}`
                : "Regulation"}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col items-center"
          >
            <div className="w-24 h-24 rounded-xl bg-linear-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 flex flex-col items-center justify-center">
              <span className="text-2xl">⚡</span>
              <span className="text-xs font-bold text-green-400 mt-1">Mito Function</span>
              <span className="text-[9px] text-kiri-text-dim">Output (C)</span>
            </div>
          </motion.div>
        </div>

        {/* Evidence Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Step 1: Co-expression */}
          <Card className="bg-kiri-bg!">
            <h4 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider mb-2">
              {t("mito.step1", "Step 1: Co-Expression")}
            </h4>
            <div className="space-y-2">
              {targetGenes.map(gene => {
                const best = bestMitoCorr[gene];
                return (
                  <div key={gene} className="flex items-center justify-between text-xs">
                    <span className="text-kiri-text-muted">{gene} × {best?.mito_gene_display || "—"}</span>
                    <span className="font-mono text-kiri-text">
                      {best ? `r = ${best.r.toFixed(3)}` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Step 2: GSEA Pathways */}
          <Card className="bg-kiri-bg!">
            <h4 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider mb-2">
              {t("mito.step2", "Step 2: GSEA Pathways")}
            </h4>
            <div className="space-y-2">
              {targetGenes.map(gene => {
                const oxphos = oxphosResults[gene];
                return (
                  <div key={gene}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-kiri-text-muted">{gene} — OXPHOS</span>
                      {oxphos ? (
                        <EvidenceArrow
                          label={`NES ${oxphos.nes.toFixed(2)}`}
                          value={`FDR ${oxphos.fdr.toFixed(3)}`}
                          pValue={oxphos.p_value}
                          significant={oxphos.significant}
                        />
                      ) : (
                        <span className="text-kiri-text-dim text-[10px]">Not tested</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Step 3: Mito Function Score */}
          <Card className="bg-kiri-bg!">
            <h4 className="text-xs font-semibold text-kiri-text-dim uppercase tracking-wider mb-2">
              {t("mito.step3", "Step 3: Mito Function Score")}
            </h4>
            <div className="space-y-2">
              {targetGenes.map(gene => {
                const comp = comparisons[gene];
                if (!comp || comp.error) {
                  return (
                    <div key={gene} className="text-xs text-kiri-text-dim">
                      {gene}: No data
                    </div>
                  );
                }
                return (
                  <div key={gene} className="flex items-center justify-between text-xs">
                    <span className="text-kiri-text-muted">
                      {gene} High vs Low
                    </span>
                    <div className="flex items-center gap-1">
                      <span className={`font-mono ${comp.significant ? "text-kiri-accent" : "text-kiri-text-dim"}`}>
                        p = {formatP(comp.p_value)}
                      </span>
                      {comp.significant && <StatusBadge label="★" variant="success" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Conclusion */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-linear-to-r from-kiri-accent/5 to-transparent border border-kiri-accent/20 rounded-lg p-4"
        >
          <h4 className="text-sm font-semibold text-kiri-accent mb-1">
            {t("mito.conclusion_title", "Evidence Summary")}
          </h4>
          <p className="text-xs text-kiri-text-muted leading-relaxed">
            {t("mito.conclusion_text",
              "The co-expression analysis suggests that PARL and MAVS expression patterns are correlated with mitochondrial functional genes in TCGA-COAD. " +
              "GSEA enrichment on co-expressed gene sets identifies mitochondrial-related pathways (OXPHOS, ROS metabolism). " +
              "ssGSEA mitochondrial function scores differ between high/low expression groups, supporting the indirect regulatory axis: " +
              "PARL → MAVS → Mitochondrial Function in colorectal cancer."
            )}
          </p>
        </motion.div>
      </div>
    </Card>
  );
}
