/**
 * Kiri Atlas — Differential Expression Results Table
 *
 * Publication-grade sortable data table for DE results with CSV download.
 * White-background, journal-standard styling (Nature Comm / Theranostics).
 * Shows: gene, log₂FC, avg expression, p-value, FDR (BH), significance stars.
 */

import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { DEResult } from "../services/api";
import { pValueToAsterisks } from "../utils/heatmapUtils";

interface DEResultsTableProps {
  results: DEResult[];
  groupA: string;
  groupB: string;
  nA: number;
  nB: number;
  method: string;
  correction: string;
  className?: string;
}

type SortKey = "gene" | "log2_fold_change" | "avg_expression" | "p_value" | "adjusted_p_value";
type SortDir = "asc" | "desc";

/** Proper English pluralization for "gene"/"genes" */
function pluralize(n: number, singular: string, plural: string): string {
  return n === 1 ? `${n} ${singular}` : `${n} ${plural}`;
}

export function DEResultsTable({
  results,
  groupA,
  groupB,
  nA,
  nB,
  method,
  correction,
  className = "",
}: DEResultsTableProps) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<SortKey>("adjusted_p_value");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    const copy = [...results];
    copy.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const na = Number(va);
      const nb = Number(vb);
      return sortDir === "asc" ? na - nb : nb - na;
    });
    return copy;
  }, [results, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleDownloadCsv = useCallback(() => {
    const headers = ["Gene", "log2FC", "Avg Expression", "p-value", "FDR (adj. p-value)", `Mean ${groupA}`, `Mean ${groupB}`];
    const rows = sorted.map(r => [
      r.gene,
      r.log2_fold_change.toFixed(4),
      r.avg_expression.toFixed(4),
      r.p_value.toExponential(3),
      r.adjusted_p_value.toExponential(3),
      r.mean_a.toFixed(4),
      r.mean_b.toFixed(4),
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "kiri_differential_expression.csv";
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, [sorted, groupA, groupB]);

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  const sigCount = results.filter(r => r.adjusted_p_value < 0.05).length;

  // Column definitions — journal-standard headers
  const columns: { key: SortKey; label: string }[] = [
    { key: "gene", label: t("atlas.gene", "Gene") },
    { key: "log2_fold_change", label: "log\u2082FC" },
    { key: "avg_expression", label: t("atlas.avgExpr", "Avg Expr") },
    { key: "p_value", label: "P-Value" },
    { key: "adjusted_p_value", label: "FDR (BH)" },
  ];

  return (
    <div
      className={`de-results-pub ${className}`}
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 6,
        padding: "16px 20px",
        fontFamily: "'Arial', 'Helvetica', sans-serif",
      }}
    >
      {/* Title */}
      <h3
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#1e293b",
          margin: "0 0 6px 0",
          letterSpacing: "0.01em",
        }}
      >
        {t("atlas.deTable", "Differential Expression Results")}{" "}
        ({pluralize(results.length, "gene", "genes")}, {pluralize(sigCount, "significant", "significant")})
      </h3>

      {/* Method info + download */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 10, color: "#94a3b8", display: "flex", gap: 8 }}>
          <span>{method}</span>
          <span style={{ color: "#cbd5e1" }}>|</span>
          <span>{correction}</span>
          <span style={{ color: "#cbd5e1" }}>|</span>
          <span>{groupA} (n={nA}) vs {groupB} (n={nB})</span>
        </div>
        <button
          onClick={handleDownloadCsv}
          style={{
            fontSize: 10,
            color: "#64748b",
            padding: "3px 10px",
            borderRadius: 4,
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontFamily: "'Arial', 'Helvetica', sans-serif",
          }}
        >
          📥 {t("atlas.downloadCsv", "Download CSV")}
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
        <table
          style={{
            width: "100%",
            fontSize: 11,
            borderCollapse: "collapse",
            fontFamily: "'Arial', 'Helvetica', sans-serif",
          }}
        >
          <thead>
            <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
              {columns.map(({ key, label }) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  style={{
                    textAlign: "left",
                    padding: "6px 10px",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    background: "#f8fafc",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    userSelect: "none",
                    borderBottom: "2px solid #e2e8f0",
                  }}
                >
                  {label}{sortArrow(key)}
                </th>
              ))}
              <th
                style={{
                  textAlign: "left",
                  padding: "6px 10px",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  background: "#f8fafc",
                  whiteSpace: "nowrap",
                  borderBottom: "2px solid #e2e8f0",
                }}
              >
                {t("atlas.significance", "Significance")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const sig = r.adjusted_p_value < 0.05;
              const stars = pValueToAsterisks(r.adjusted_p_value);
              return (
                <tr
                  key={r.gene}
                  style={{
                    borderBottom: "1px solid #f1f5f9",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <td
                    style={{
                      padding: "5px 10px",
                      fontFamily: "'Arial', 'Helvetica', sans-serif",
                      fontWeight: 600,
                      fontStyle: "italic",
                      color: "#1e293b",
                    }}
                  >
                    {r.gene}
                  </td>
                  <td
                    style={{
                      padding: "5px 10px",
                      fontFamily: "monospace",
                      color: r.log2_fold_change > 0 ? "#dc2626" : "#16a34a",
                    }}
                  >
                    {r.log2_fold_change > 0 ? "+" : ""}{r.log2_fold_change.toFixed(3)}
                  </td>
                  <td style={{ padding: "5px 10px", fontFamily: "monospace", color: "#64748b" }}>
                    {r.avg_expression.toFixed(2)}
                  </td>
                  <td style={{ padding: "5px 10px", fontFamily: "monospace", color: "#64748b" }}>
                    {r.p_value < 0.001 ? r.p_value.toExponential(2) : r.p_value.toFixed(4)}
                  </td>
                  <td
                    style={{
                      padding: "5px 10px",
                      fontFamily: "monospace",
                      color: sig ? "#0284c7" : "#64748b",
                      fontWeight: sig ? 700 : 400,
                    }}
                  >
                    {r.adjusted_p_value < 0.001 ? r.adjusted_p_value.toExponential(2) : r.adjusted_p_value.toFixed(4)}
                  </td>
                  <td
                    style={{
                      padding: "5px 10px",
                      fontWeight: 700,
                      fontSize: 13,
                      color: "#ea580c",
                    }}
                  >
                    {stars}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
