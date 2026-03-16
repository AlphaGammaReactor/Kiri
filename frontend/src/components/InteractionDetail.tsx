/**
 * Kiri — Interaction Detail Panel
 *
 * Displays the rich interaction context for a selected protein pair:
 * mechanism of action, cellular effect, shared GO terms, shared pathways,
 * subcellular location, and interaction type.
 */

import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Card, LoadingSkeleton, StatusBadge, Stat } from "./ui";
import type { Provenance } from "../services/api";

export interface InteractionContextData {
  gene_a: string;
  gene_b: string;
  interaction_type: string;
  mechanism: string;
  effect_on_target: string;
  cellular_effect: string;
  subcellular_location: string;
  directionality: string;
  shared_go_terms: Array<{ id: string; name: string }>;
  shared_pathways: Array<{ id: string; name: string }>;
  go_a: { gene: string; terms: Array<{ id: string; name: string; aspect: string }> };
  go_b: { gene: string; terms: Array<{ id: string; name: string; aspect: string }> };
  pathways_a: Array<{ id: string; name: string }>;
  pathways_b: Array<{ id: string; name: string }>;
  pathway_axis: {
    id: string;
    name: string;
    steps: Array<{ gene: string; role: string; label: string }>;
    modulator: { gene: string; role: string; target: string; effect: string };
  } | null;
  is_curated: boolean;
}

interface InteractionDetailProps {
  data: InteractionContextData | null;
  provenance?: Provenance | null;
  loading: boolean;
}

const TYPE_BADGES: Record<string, { label: string; variant: "info" | "warning" | "error" | "success" }> = {
  enzymatic_cleavage: { label: "Enzymatic Cleavage", variant: "error" },
  signal_transduction: { label: "Signal Transduction", variant: "info" },
  transcriptional_regulation: { label: "Transcriptional Regulation", variant: "success" },
  physical_binding: { label: "Physical Binding", variant: "info" },
  physical_association: { label: "Physical Association", variant: "info" },
  complex_member: { label: "Complex Member", variant: "warning" },
};

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[10px] uppercase tracking-wider text-kiri-text-dim font-medium mb-1.5">
      {children}
    </h4>
  );
}

export function InteractionDetail({
  data,
  loading,
}: InteractionDetailProps) {
  const { t } = useTranslation();

  return (
    <Card title={t("modules.interaction.context_title")} className="h-full flex flex-col">
      {loading ? (
        <LoadingSkeleton lines={6} />
      ) : !data ? (
        <div className="flex items-center justify-center h-full text-kiri-text-muted text-sm py-6 text-center">
          <div>
            <p className="text-lg mb-1">🔬</p>
            <p>{t("modules.interaction.select_pair")}</p>
          </div>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={`${data.gene_a}-${data.gene_b}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4 overflow-y-auto pr-1 flex-1"
          >
            {/* Header: pair + type badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-bold text-kiri-accent">
                  {data.gene_a}
                </span>
                <span className="text-kiri-text-dim text-xs">↔</span>
                <span className="text-sm font-mono font-bold text-kiri-accent">
                  {data.gene_b}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {data.is_curated && (
                  <StatusBadge label={t("modules.interaction.curated")} variant="success" />
                )}
                <StatusBadge
                  label={TYPE_BADGES[data.interaction_type]?.label || data.interaction_type}
                  variant={TYPE_BADGES[data.interaction_type]?.variant || "info"}
                />
              </div>
            </div>

            {/* Directionality */}
            <div className="text-xs text-kiri-text-muted font-mono bg-kiri-bg/50 rounded px-2 py-1">
              {data.directionality}
            </div>

            {/* Mechanism */}
            <div>
              <SectionHeader>{t("modules.interaction.mechanism")}</SectionHeader>
              <p className="text-sm text-kiri-text leading-relaxed">
                {data.mechanism}
              </p>
            </div>

            {/* Effect on Target */}
            <div>
              <SectionHeader>{t("modules.interaction.effect_on_target")}</SectionHeader>
              <p className="text-sm text-kiri-text leading-relaxed">
                {data.effect_on_target}
              </p>
            </div>

            {/* Cellular Effect */}
            <div>
              <SectionHeader>{t("modules.interaction.cellular_effect")}</SectionHeader>
              <p className="text-sm text-kiri-text leading-relaxed">
                {data.cellular_effect}
              </p>
            </div>

            {/* Subcellular Location */}
            <div>
              <SectionHeader>{t("modules.interaction.location")}</SectionHeader>
              <div className="flex items-center gap-2">
                <span className="text-lg">🔬</span>
                <span className="text-sm text-kiri-text">{data.subcellular_location}</span>
              </div>
            </div>

            {/* Shared GO Terms */}
            {data.shared_go_terms.length > 0 && (
              <div>
                <SectionHeader>
                  {t("modules.interaction.shared_go")} ({data.shared_go_terms.length})
                </SectionHeader>
                <div className="flex flex-wrap gap-1.5">
                  {data.shared_go_terms.slice(0, 8).map((term) => (
                    <span
                      key={term.id}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-kiri-accent/10 text-kiri-accent border border-kiri-accent/20 font-mono"
                      title={term.id}
                    >
                      {term.name || term.id}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Shared Pathways */}
            {data.shared_pathways.length > 0 && (
              <div>
                <SectionHeader>
                  {t("modules.interaction.shared_pathways")} ({data.shared_pathways.length})
                </SectionHeader>
                <div className="space-y-1">
                  {data.shared_pathways.slice(0, 5).map((pw) => (
                    <div
                      key={pw.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="text-kiri-text-dim font-mono shrink-0">
                        {pw.id}
                      </span>
                      <span className="text-kiri-text truncate">{pw.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-kiri-border">
              <Stat
                label={t("modules.interaction.go_terms_a")}
                value={data.go_a?.terms?.length || 0}
              />
              <Stat
                label={t("modules.interaction.go_terms_b")}
                value={data.go_b?.terms?.length || 0}
              />
              <Stat
                label={t("modules.interaction.pathways_a")}
                value={data.pathways_a?.length || 0}
              />
              <Stat
                label={t("modules.interaction.pathways_b")}
                value={data.pathways_b?.length || 0}
              />
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </Card>
  );
}
