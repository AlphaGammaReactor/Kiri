/**
 * Kiri — Substrate Prediction Table Component
 *
 * Displays ranked candidate substrates with:
 * - TM domain annotations
 * - Cleavage motif details
 * - Known substrate badges with hover tooltips
 * - Sortable columns with standardized names
 * - Score ≥ 9.0 highlighting
 * - Algorithm traceability annotation
 * - Publication-ready SVG/PNG export (white bg, Arial font)
 */

import { useState, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, StatusBadge } from "./ui";
import { useAppDispatch } from "../store";
import { addPanel } from "../store/publicationSlice";
import { addToast } from "../store/errorSlice";
import html2canvas from "html2canvas";

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

/* ── Status tooltip descriptions ── */
const STATUS_TOOLTIPS: Record<string, string> = {
  Known:
    "Experimentally validated substrate — literature-reported cleavage by mitochondrial rhomboid protease (e.g. PINK1, PGAM5, STARD7).",
  Candidate:
    "Predicted candidate — cleavage motif match found within an annotated transmembrane domain region.",
  Low:
    "Motif match detected in protein sequence, but no transmembrane domain overlap was found.",
};

/* ── Export helpers ── */

/** Build a clean HTML table string for white-bg export. */
function buildExportHTML(
  sorted: SubstrateCandidate[],
  motifPattern?: string,
): string {
  const headerStyle =
    'style="padding:6px 10px;text-align:left;font-weight:600;border-bottom:2px solid #333;font-size:11px;font-family:Arial,Helvetica,sans-serif;color:#111"';
  const cellStyle =
    'style="padding:5px 10px;border-bottom:1px solid #ddd;font-size:11px;font-family:Arial,Helvetica,sans-serif;color:#222"';
  const cellCenterStyle =
    'style="padding:5px 10px;border-bottom:1px solid #ddd;font-size:11px;font-family:Arial,Helvetica,sans-serif;color:#222;text-align:center"';
  const highScoreRowStyle =
    'style="background:#FFFDE7"';

  let html = `<div style="background:#fff;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#111">`;

  // Algorithm description
  html += `<div style="margin-bottom:14px;font-size:10px;color:#555;line-height:1.5">`;
  html += `<strong>Method:</strong> TM-domain rhomboid cleavage motif scan &nbsp;|&nbsp; `;
  html += `<strong>Motif model:</strong> Position Weight Matrix (PWM) — consensus <code style="font-family:monospace;background:#f0f0f0;padding:1px 4px;border-radius:2px">${motifPattern || "[AGS][AGST][VILM][AGST]"}</code> &nbsp;|&nbsp; `;
  html += `<strong>Sources:</strong> MitoCarta3.0 + UniProt`;
  html += `</div>`;

  html += `<table style="width:100%;border-collapse:collapse">`;
  html += `<thead><tr>`;
  html += `<th ${headerStyle}>Gene</th>`;
  html += `<th ${headerStyle}>Protein</th>`;
  html += `<th ${headerStyle} style="text-align:center">Transmembrane Hits</th>`;
  html += `<th ${headerStyle} style="text-align:center">Total Hits</th>`;
  html += `<th ${headerStyle} style="text-align:center">Co-expression (r)</th>`;
  html += `<th ${headerStyle} style="text-align:center">Prediction Score</th>`;
  html += `<th ${headerStyle} style="text-align:center">Status</th>`;
  html += `</tr></thead><tbody>`;

  for (const c of sorted) {
    const isHighScore = c.score >= 9.0;
    const rowAttr = isHighScore ? highScoreRowStyle : "";
    const status = c.is_known_substrate
      ? "Known"
      : c.tm_hit_count > 0
      ? "Candidate"
      : "Low";

    html += `<tr ${rowAttr}>`;
    html += `<td ${cellStyle}><strong>${c.gene}</strong></td>`;
    html += `<td ${cellStyle}>${c.protein_name}</td>`;
    html += `<td ${cellCenterStyle}>${c.tm_hit_count}</td>`;
    html += `<td ${cellCenterStyle}>${c.total_hit_count}</td>`;
    html += `<td ${cellCenterStyle}>${c.coexpression_r !== null ? c.coexpression_r.toFixed(3) : "—"}</td>`;
    html += `<td ${cellCenterStyle}><strong>${c.score.toFixed(1)}</strong></td>`;
    html += `<td ${cellCenterStyle}>${status}</td>`;
    html += `</tr>`;
  }

  html += `</tbody></table>`;
  html += `<div style="margin-top:10px;font-size:9px;color:#888">Motif pattern: ${motifPattern || "[AGS][AGST][VILM][AGST]"} &nbsp;|&nbsp; Scoring: TM hits × 2 + total hits × 0.5 + co-expression boost</div>`;
  html += `</div>`;
  return html;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
  const [exporting, setExporting] = useState(false);
  const exportContainerRef = useRef<HTMLDivElement>(null);

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

  /* ── Export Handlers ── */

  const handleExportSVG = useCallback(() => {
    setExporting(true);
    try {
      const htmlContent = buildExportHTML(sorted, motifPattern);
      const width = 900;
      const height = 60 + sorted.length * 28 + 80; // estimate
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml">
      ${htmlContent}
    </div>
  </foreignObject>
</svg>`;
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      downloadBlob(blob, "substrate_predictions.svg");
      dispatch(
        addToast({
          type: "success",
          title: "SVG Exported",
          message: "Publication-ready SVG downloaded (white background, Arial font).",
          duration: 3000,
        })
      );
    } finally {
      setExporting(false);
    }
  }, [sorted, motifPattern, dispatch]);

  const handleExportPNG = useCallback(async () => {
    setExporting(true);
    try {
      // Create a temporary container
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.left = "-9999px";
      container.style.top = "0";
      container.style.width = "900px";
      container.style.background = "#ffffff";
      container.innerHTML = buildExportHTML(sorted, motifPattern);
      document.body.appendChild(container);

      const canvas = await html2canvas(container, {
        backgroundColor: "#ffffff",
        scale: 2, // retina quality
        useCORS: true,
      });

      document.body.removeChild(container);

      canvas.toBlob((blob) => {
        if (blob) {
          downloadBlob(blob, "substrate_predictions.png");
          dispatch(
            addToast({
              type: "success",
              title: "PNG Exported",
              message: "Publication-ready PNG downloaded (white background, 2× resolution).",
              duration: 3000,
            })
          );
        }
      }, "image/png");
    } catch (err) {
      console.error("PNG export failed:", err);
      dispatch(
        addToast({
          type: "error",
          title: "Export Failed",
          message: "PNG export encountered an error.",
          duration: 4000,
        })
      );
    } finally {
      setExporting(false);
    }
  }, [sorted, motifPattern, dispatch]);

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
      {/* Algorithm Traceability Box */}
      <div className="mb-4 p-3 rounded-lg border border-kiri-border/60 bg-kiri-bg-surface/40 text-[11px] text-kiri-text-dim leading-relaxed">
        <span className="font-semibold text-kiri-text-muted">Method:</span>{" "}
        TM-domain rhomboid cleavage motif scan &nbsp;·&nbsp;{" "}
        <span className="font-semibold text-kiri-text-muted">Motif model:</span>{" "}
        Position Weight Matrix (PWM) &nbsp;·&nbsp;{" "}
        <span className="font-semibold text-kiri-text-muted">Sources:</span>{" "}
        MitoCarta3.0 (TM annotations) + UniProt (protein sequences) &nbsp;·&nbsp;{" "}
        <span className="font-semibold text-kiri-text-muted">Scoring:</span>{" "}
        TM hits × 2 + total hits × 0.5 + co-expression boost
      </div>

      {/* Motif pattern — larger and no-wrap */}
      {motifPattern && (
        <div className="text-sm text-kiri-text-dim mb-3">
          Motif pattern:{" "}
          <code className="text-kiri-accent font-mono whitespace-nowrap text-sm">
            {motifPattern}
          </code>
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
                Transmembrane Hits {sortIcon("tm_hit_count")}
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
                Co-expression (r) {sortIcon("coexpression_r")}
              </th>
              <th
                className="text-center py-2 px-2 cursor-pointer hover:text-kiri-text"
                onClick={() => toggleSort("score")}
              >
                Prediction Score {sortIcon("score")}
              </th>
              <th className="text-center py-2 px-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const isHighScore = c.score >= 9.0;
              const statusLabel = c.is_known_substrate
                ? "Known"
                : c.tm_hit_count > 0
                ? "Candidate"
                : "Low";
              const statusVariant = c.is_known_substrate
                ? "success"
                : c.tm_hit_count > 0
                ? "warning"
                : "info";

              return (
                <>
                  <tr
                    key={c.gene}
                    className={`border-b cursor-pointer transition-colors ${
                      isHighScore
                        ? "border-l-2 border-l-amber-400 bg-amber-500/5 border-b-kiri-border/50 hover:bg-amber-500/10"
                        : "border-kiri-border/50 hover:bg-kiri-bg-surface/50"
                    }`}
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
                    <td className={`py-2 px-2 text-center font-semibold ${isHighScore ? "text-amber-400" : "text-kiri-text"}`}>
                      {c.score.toFixed(1)}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <div className="relative group inline-block">
                        <StatusBadge
                          label={statusLabel}
                          variant={statusVariant as "success" | "warning" | "info"}
                        />
                        {/* Hover tooltip */}
                        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-kiri-surface border border-kiri-border shadow-xl text-[10px] text-kiri-text-muted leading-snug w-60 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200">
                          {STATUS_TOOLTIPS[statusLabel]}
                        </div>
                      </div>
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
                            {c.coexpression_r !== null && (
                              <> | Co-expression <em>r</em> = <strong className="text-kiri-accent">{c.coexpression_r.toFixed(3)}</strong></>
                            )}
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
              );
            })}
          </tbody>
        </table>
      </div>

      {candidates.length === 0 && (
        <div className="text-center text-kiri-text-dim text-sm py-8">
          {t("interactomics.no_substrates", "No substrate candidates found. Try broadening the motif pattern.")}
        </div>
      )}

      {/* Export & Publication buttons */}
      {candidates.length > 0 && (
        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={handleExportSVG}
            disabled={exporting}
            className="text-[10px] text-kiri-accent hover:text-white px-2 py-0.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            📥 SVG
          </button>
          <button
            onClick={handleExportPNG}
            disabled={exporting}
            className="text-[10px] text-kiri-accent hover:text-white px-2 py-0.5 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            📥 PNG
          </button>
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

      {/* Hidden export container ref (used by PNG export) */}
      <div ref={exportContainerRef} style={{ position: "absolute", left: -9999 }} />
    </Card>
  );
}
