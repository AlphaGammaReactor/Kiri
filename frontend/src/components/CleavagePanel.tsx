/**
 * Kiri — Cleavage Analysis Panel
 *
 * Displays PARL cleavage motif analysis results with
 * sequence context and transmembrane region annotations.
 */

import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Card, ProvenanceFooter, LoadingSkeleton, StatusBadge, Stat } from "./ui";
import type { Provenance } from "../services/api";

interface CleavageSite {
  position: number;
  motif_match: string;
  flanking_sequence: string;
  flanking_start: number;
  flanking_end: number;
  in_tm_region: boolean;
  p_score: number;
}

interface CleavageData {
  uniprot_id: string;
  protein_name: string;
  motif_pattern: string;
  total_hits: number;
  cleavage_sites: CleavageSite[];
  sequence_length: number;
  tm_region: { start: number; end: number } | null;
}

interface CleavagePanelProps {
  data: CleavageData | null;
  provenance: Provenance | null;
  loading: boolean;
}

function SequenceDisplay({
  sequence,
  motif,
  start,
}: {
  sequence: string;
  motif: string;
  start: number;
}) {
  // Highlight the motif match within the flanking sequence
  const motifIndex = sequence.indexOf(motif);
  if (motifIndex === -1) {
    return <span className="font-mono text-xs text-kiri-text-muted">{sequence}</span>;
  }

  const before = sequence.slice(0, motifIndex);
  const match = sequence.slice(motifIndex, motifIndex + motif.length);
  const after = sequence.slice(motifIndex + motif.length);

  return (
    <span className="font-mono text-xs">
      <span className="text-kiri-text-dim">{start}</span>
      <span className="text-kiri-text-muted ml-2">{before}</span>
      <span className="text-kiri-error font-bold bg-kiri-error/10 px-0.5 rounded">
        {match}
      </span>
      <span className="text-kiri-text-muted">{after}</span>
    </span>
  );
}

export function CleavagePanel({
  data,
  provenance,
  loading,
}: CleavagePanelProps) {
  const { t } = useTranslation();

  return (
    <Card title={t("modules.interaction.cleavage_title")}>
      {loading ? (
        <LoadingSkeleton lines={4} />
      ) : !data ? (
        <div className="text-center text-kiri-text-muted text-sm py-6">
          {t("modules.interaction.no_cleavage")}
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Stat
              label={t("modules.interaction.total_sites")}
              value={data.total_hits}
            />
            <Stat
              label={t("modules.interaction.sequence_length")}
              value={data.sequence_length}
              unit="aa"
            />
            <Stat
              label={t("modules.interaction.motif_label")}
              value={data.motif_pattern}
            />
          </div>

          {/* TM region info */}
          {data.tm_region && (
            <div className="flex items-center gap-2 mb-3 text-xs text-kiri-text-muted">
              <StatusBadge
                label={`TM: ${data.tm_region.start}-${data.tm_region.end}`}
                variant="warning"
              />
              <span>{t("modules.interaction.tm_region_label")}</span>
            </div>
          )}

          {/* Cleavage site list */}
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {data.cleavage_sites.map((site, i) => (
              <motion.div
                key={`${site.position}-${i}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`
                  flex items-center gap-3 px-3 py-2 rounded border text-sm
                  ${
                    site.in_tm_region
                      ? "border-kiri-error/40 bg-kiri-error/5"
                      : "border-kiri-border bg-kiri-bg/30"
                  }
                `}
              >
                <span className="font-mono text-kiri-accent text-xs w-12 shrink-0">
                  @{site.position}
                </span>
                <SequenceDisplay
                  sequence={site.flanking_sequence}
                  motif={site.motif_match}
                  start={site.flanking_start}
                />
                <div className="flex items-center gap-1 ml-auto shrink-0">
                  {site.in_tm_region && (
                    <StatusBadge label="TM" variant="error" />
                  )}
                  <span className="text-[10px] text-kiri-text-dim font-mono">
                    p={site.p_score}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          {data.cleavage_sites.length === 0 && (
            <p className="text-center text-kiri-text-muted text-sm py-4">
              {t("modules.interaction.no_motifs_found")}
            </p>
          )}

          <ProvenanceFooter provenance={provenance} compact />
        </>
      )}
    </Card>
  );
}
