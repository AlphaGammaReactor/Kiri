/**
 * Kiri Atlas — Differential Expression Results Table
 *
 * Sortable data table for DE results with CSV download.
 * Shows: gene, log2FC, avg expression, p-value, FDR, significance stars.
 */

import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "./ui";
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
      setSortDir(key === "gene" ? "asc" : "asc");
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

  return (
    <Card
      title={`${t("atlas.deTable", "Differential Expression Results")} (${results.length} genes, ${sigCount} significant)`}
      className={className}
    >
      {/* Method info + download */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] text-kiri-text-dim space-x-3">
          <span>{method}</span>
          <span>|</span>
          <span>{correction}</span>
          <span>|</span>
          <span>{groupA} (n={nA}) vs {groupB} (n={nB})</span>
        </div>
        <button
          onClick={handleDownloadCsv}
          className="text-[10px] text-kiri-accent hover:text-white px-2 py-1 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors flex items-center gap-1"
        >
          📥 {t("atlas.downloadCsv", "Download CSV")}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto scrollbar-thin">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-kiri-surface z-10">
            <tr className="border-b border-kiri-border">
              {(
                [
                  ["gene", t("atlas.gene", "Gene")] as const,
                  ["log2_fold_change", "log₂FC"] as const,
                  ["avg_expression", t("atlas.avgExpr", "Avg Expr")] as const,
                  ["p_value", "p-value"] as const,
                  ["adjusted_p_value", "FDR"] as const,
                ] as const
              ).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  className="text-left px-2 py-2 text-kiri-text-dim uppercase tracking-wider cursor-pointer hover:text-kiri-accent transition-colors whitespace-nowrap select-none"
                >
                  {label}{sortArrow(key)}
                </th>
              ))}
              <th className="text-left px-2 py-2 text-kiri-text-dim uppercase tracking-wider whitespace-nowrap">
                {t("atlas.significance", "Sig.")}
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
                  className={`border-b border-kiri-border/30 hover:bg-kiri-surface-hover transition-colors ${
                    sig ? "bg-kiri-accent-glow/5" : ""
                  }`}
                >
                  <td className="px-2 py-1.5 font-mono font-medium text-kiri-text italic">{r.gene}</td>
                  <td className={`px-2 py-1.5 font-mono ${r.log2_fold_change > 0 ? "text-kiri-error" : "text-kiri-success"}`}>
                    {r.log2_fold_change > 0 ? "+" : ""}{r.log2_fold_change.toFixed(3)}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-kiri-text-muted">{r.avg_expression.toFixed(2)}</td>
                  <td className="px-2 py-1.5 font-mono text-kiri-text-muted">{r.p_value < 0.001 ? r.p_value.toExponential(2) : r.p_value.toFixed(4)}</td>
                  <td className={`px-2 py-1.5 font-mono ${sig ? "text-kiri-accent font-bold" : "text-kiri-text-muted"}`}>
                    {r.adjusted_p_value < 0.001 ? r.adjusted_p_value.toExponential(2) : r.adjusted_p_value.toFixed(4)}
                  </td>
                  <td className="px-2 py-1.5 text-amber-400 font-bold">{stars}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
