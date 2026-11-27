// Text inside figures follows the figure language (English or Chinese), separate from the interface language.
export type FigLang = "en" | "zh";
export const figText = {
  en: {
    osProb: "Overall survival probability", pfiProb: "Progression-free probability", dssProb: "Disease-specific survival probability", months: "Months since diagnosis", atRisk: "Number at risk",
    high: "high", low: "low", highShort: "High", lowShort: "Low", tumour: "Tumour", normal: "Normal",
    expr: "expression, log2(TPM + 1)", stage: "Stage",
    hrLine: "HR {hr} (95% CI {lo}–{hi}) · log-rank p = {p}", hrLineAdj: "HR {hr} (95% CI {lo}–{hi}) · adjusted p = {p}", aHR: "Adjusted HR {hr} (95% CI {lo}–{hi}) · log-rank p = {p}",
    rankSum: "Wilcoxon rank-sum p = {p}", signedRank: "Wilcoxon signed-rank p = {p}, {n} pairs", kw: "Kruskal–Wallis p = {p}",
  },
  zh: {
    osProb: "总生存概率", pfiProb: "无进展概率", dssProb: "疾病特异性生存概率", months: "确诊后月数", atRisk: "风险人数",
    high: "高表达", low: "低表达", highShort: "高", lowShort: "低", tumour: "肿瘤", normal: "正常",
    expr: "表达量，log2(TPM + 1)", stage: "分期",
    hrLine: "HR {hr}（95% CI {lo}–{hi}）· log-rank p = {p}", hrLineAdj: "HR {hr}（95% CI {lo}–{hi}）· 校正 p = {p}", aHR: "校正 HR {hr}（95% CI {lo}–{hi}）· log-rank p = {p}",
    rankSum: "Wilcoxon 秩和检验 p = {p}", signedRank: "Wilcoxon 符号秩检验 p = {p}，{n} 对", kw: "Kruskal–Wallis 检验 p = {p}",
  },
} as const;
/** The y-axis title of a Kaplan–Meier plot for its endpoint. */
export const probTitle = (F: (typeof figText)[FigLang], endpoint?: string) => endpoint === "PFI" ? F.pfiProb : endpoint === "DSS" ? F.dssProb : F.osProb;
export const fillFig = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? "")).replace(/= </g, "<");
export const stars = (p: number | null | undefined) => p == null ? "" : p < 0.0001 ? "****" : p < 0.001 ? "***" : p < 0.01 ? "**" : p < 0.05 ? "*" : "ns";
