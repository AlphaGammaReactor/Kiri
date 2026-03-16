/**
 * Kiri — Substrate Prediction Table Component
 *
 * Displays ranked candidate substrates with:
 * - TM domain annotations
 * - Cleavage motif details
 * - Known substrate badges
 * - Sortable columns
 */

import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, StatusBadge } from "./ui";
import { useAppDispatch } from "../store";
import { addPanel } from "../store/publicationSlice";
import { addToast } from "../store/errorSlice";

interface SubstrateCandidate {
  gene: string;
  uniprot_id: string;
  protein_name: string;
  sequence_length: number;
  tm_regions: Array<{ start: number; end: number }>;
  tm_hit_count: number;
  total_hit_count: number;
  score: number;
  coexpression_r: number | null;
  is_known_substrate: boolean;
  tm_hits?: Array<{
    position: number;
    motif_match: string;
    flanking_sequence: string;
  }>;
}

interface SubstrateTableProps {
  candidates: SubstrateCandidate[];
  motifPattern?: string;
  loading?: boolean;
  error?: string;
}

type SortField = "score" | "gene" | "tm_hit_count" | "total_hit_count" | "coexpression_r";
type SortDir = "asc" | "desc";

export function SubstrateTable({
  candidates,
  motifPattern,
  loading,
  error,
}: SubstrateTableProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const copy = [...candidates];
    copy.sort((a, b) => {
      let va: number, vb: number;
      switch (sortField) {
        case "gene":
          return sortDir === "asc"
            ? a.gene.localeCompare(b.gene)
            : b.gene.localeCompare(a.gene);
        case "score":
          va = a.score;
          vb = b.score;
          break;
        case "tm_hit_count":
          va = a.tm_hit_count;
          vb = b.tm_hit_count;
          break;
        case "total_hit_count":
          va = a.total_hit_count;
          vb = b.total_hit_count;
          break;
        case "coexpression_r":
          va = a.coexpression_r ?? 0;
          vb = b.coexpression_r ?? 0;
          break;
        default:
          va = a.score;
          vb = b.score;
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return copy;
  }, [candidates, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  };

  if (loading) {
    return (
      <Card title={t("interactomics.substrates", "Substrate Predictions")}>
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-8 bg-kiri-bg-card rounded" />
          ))}
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title={t("interactomics.substrates", "Substrate Predictions")}>
        <div className="text-sm text-kiri-error flex items-center gap-2">
          <StatusBadge label="Error" variant="error" />
          <span>{error}</span>
        </div>
      </Card>
    );
  }

  return (
    <Card title={t("interactomics.substrates", "Substrate Predictions")}>
      {motifPattern && (
        <div className="text-xs text-kiri-text-dim mb-3">
          Motif pattern: <code className="text-kiri-accent">{motifPattern}</code>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-kiri-border text-kiri-text-dim">
              <th
                className="text-left py-2 px-2 cursor-pointer hover:text-kiri-text"
                onClick={() => toggleSort("gene")}
              >
                Gene {sortIcon("gene")}
              </th>
              <th className="text-left py-2 px-2">Protein</th>
              <th
                className="text-center py-2 px-2 cursor-pointer hover:text-kiri-text"
                onClick={() => toggleSort("tm_hit_count")}
              >
                TM Hits {sortIcon("tm_hit_count")}
              </th>
              <th
                className="text-center py-2 px-2 cursor-pointer hover:text-kiri-text"
                onClick={() => toggleSort("total_hit_count")}
              >
                Total Hits {sortIcon("total_hit_count")}
              </th>
              <th
                className="text-center py-2 px-2 cursor-pointer hover:text-kiri-text"
                onClick={() => toggleSort("coexpression_r")}
              >
                Co-expr r {sortIcon("coexpression_r")}
              </th>
              <th
                className="text-center py-2 px-2 cursor-pointer hover:text-kiri-text"
                onClick={() => toggleSort("score")}
              >
                Score {sortIcon("score")}
              </th>
              <th className="text-center py-2 px-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <>
                <tr
                  key={c.gene}
                  className="border-b border-kiri-border/50 hover:bg-kiri-bg-surface/50 cursor-pointer transition-colors"
                  onClick={() =>
                    setExpandedRow(expandedRow === c.gene ? null : c.gene)
                  }
                >
                  <td className="py-2 px-2 font-medium text-kiri-text">
                    {c.gene}
                  </td>
                  <td className="py-2 px-2 text-kiri-text-dim truncate max-w-[200px]">
                    {c.protein_name}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span
                      className={
                        c.tm_hit_count > 0
                          ? "text-kiri-accent font-semibold"
                          : "text-kiri-text-dim"
                      }
                    >
                      {c.tm_hit_count}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center text-kiri-text-dim">
                    {c.total_hit_count}
                  </td>
                  <td className="py-2 px-2 text-center">
                    {c.coexpression_r !== null
                      ? c.coexpression_r.toFixed(3)
                      : "—"}
                  </td>
                  <td className="py-2 px-2 text-center font-semibold text-kiri-text">
                    {c.score.toFixed(1)}
                  </td>
                  <td className="py-2 px-2 text-center">
                    {c.is_known_substrate ? (
                      <StatusBadge label="Known" variant="success" />
                    ) : c.tm_hit_count > 0 ? (
                      <StatusBadge label="Candidate" variant="warning" />
                    ) : (
                      <StatusBadge label="Low" variant="info" />
                    )}
                  </td>
                </tr>
                {expandedRow === c.gene && c.tm_hits && c.tm_hits.length > 0 && (
                  <tr key={`${c.gene}-detail`}>
                    <td colSpan={7} className="py-2 px-4 bg-kiri-bg-surface/30">
                      <div className="text-xs space-y-1">
                        <div className="text-kiri-text-dim mb-1">
                          TM Regions:{" "}
                          {c.tm_regions.map((r) => `${r.start}–${r.end}`).join(", ")} |
                          Length: {c.sequence_length} aa |
                          UniProt: {c.uniprot_id}
                        </div>
                        {c.tm_hits.slice(0, 5).map((hit, i) => (
                          <div
                            key={i}
                            className="font-mono text-[10px] text-kiri-text-dim"
                          >
                            Pos {hit.position}:{" "}
                            <span className="text-kiri-accent">
                              {hit.motif_match}
                            </span>{" "}
                            in ...{hit.flanking_sequence}...
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {candidates.length === 0 && (
        <div className="text-center text-kiri-text-dim text-sm py-8">
          {t("interactomics.no_substrates", "No substrate candidates found. Try broadening the motif pattern.")}
        </div>
      )}

      {/* Add to Publication button */}
      {candidates.length > 0 && (
        <div className="flex justify-end mt-3">
          <button
            onClick={() => {
              dispatch(
                addPanel({
                  sourceModule: "interaction",
                  type: "png",
                  data: JSON.stringify(sorted.slice(0, 20)),
                  title: "Substrate Prediction Results",
                  legend: `Motif: ${motifPattern || "PARL consensus"} | ${candidates.length} candidates`,
                  dataSource: "MitoCarta3.0 + UniProt",
                })
              );
              dispatch(
                addToast({
                  type: "success",
                  title: t("export.figure_added"),
                  message: "Substrate table added",
                  duration: 3000,
                })
              );
            }}
            className="text-[10px] text-kiri-accent hover:text-white px-2 py-0.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors flex items-center gap-1"
          >
            ＋ Table
          </button>
        </div>
      )}
    </Card>
  );
}
