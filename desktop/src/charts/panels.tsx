// Figures for the one-page summary, drawn from saved results with the same charts and figure text as the workspaces,
// so a panel exists even for an analysis that was never opened or sent to the notebook.
import { renderToStaticMarkup } from "react-dom/server";
import type { StringKey } from "../i18n/strings";
import { fmt, fmtP, type Analysis, type Check, type CorrelationResult, type DEResult, type ExpressionResult, type Group, type SurvivalResult } from "../lib/analyses";
import { BoxPoints } from "./BoxPoints";
import { KM } from "./KM";
import { Scatter } from "./Scatter";
import { Volcano } from "./Volcano";
import { FIG } from "./figure";
import { figText, fillFig, stars, type FigLang } from "./figStrings";
import { plainSurvival } from "../screens/workspace/Survival";
import { GROUP_COLORS, plainExpression, STAGE_COLORS } from "../screens/workspace/Expression";

type T = (k: StringKey, v?: Record<string, string | number>) => string;
export type Panel = { svg: string; summary: string; checks: Check[] };

const CORR = {
  en: { expr: "{g} expression, log2(TPM + 1)", stat: "Spearman ρ = {rho} (95% CI {lo} to {hi}) · p = {p}", n: "n = {n} patients · Pearson r = {r}" },
  zh: { expr: "{g} 表达量，log2(TPM + 1)", stat: "Spearman ρ = {rho}（95% CI {lo} 至 {hi}）· p = {p}", n: "n = {n} 位患者 · Pearson r = {r}" },
};

export function plainCorrelation(r: CorrelationResult, t: T) {
  const a = Math.abs(r.rho);
  const s = a < 0.1 ? "negligible" : a < 0.3 ? "weak" : a < 0.5 ? "moderate" : "strong";
  return t(r.p < 0.05 ? (r.rho > 0 ? "corr.plain.pos" : "corr.plain.neg") : "corr.plain.none",
    { a: r.gene, b: r.gene2, rho: fmt(r.rho), p: fmtP(r.p), n: r.n, s: t(`corr.s.${s}` as StringKey) });
}

export function panelFor(a: Analysis, figLang: FigLang, t: T): Panel | null {
  const res = a.result as { error?: string; checks?: Check[] };
  if (!res || res.error) return null;
  const F = figText[figLang];
  let el: React.ReactElement, summary: string;
  if (a.kind === "survival") {
    const r = a.result as SurvivalResult;
    const cox = r.cox_adjusted ?? r.cox;
    const p = r.cut === "optimal" ? r.p_report : r.logrank.p;
    el = <KM r={r} labels={{
      yTitle: F.osProb, xTitle: F.months, atRisk: F.atRisk, highShort: F.highShort, lowShort: F.lowShort,
      high: `${r.gene} ${F.high} (n = ${r.groups.high.n})`, low: `${r.gene} ${F.low} (n = ${r.groups.low.n})`,
      stat: fillFig(r.cut === "optimal" ? F.hrLineAdj : r.cox_adjusted ? F.aHR : F.hrLine, { hr: fmt(cox.hr), lo: fmt(cox.lo), hi: fmt(cox.hi), p: fmtP(p) }),
    }} />;
    summary = plainSurvival(r, cox, p, r.groups.high.n + r.groups.low.n, t);
  } else if (a.kind === "de") {
    const r = a.result as DEResult;
    const zh = figLang === "zh";
    const [la, lb] = r.labels;
    el = <Volcano points={r.volcano} lfc={r.thresholds.lfc} pCut={null} labels={{
      x: zh ? `log2 倍数变化（${la} 对比 ${lb}）` : `log2 fold change (${la} vs ${lb})`, y: "−log10 p",
      up: zh ? `${la} 中更高（${r.n_up}）` : `Higher in ${la} (${r.n_up})`, down: zh ? `${lb} 中更高（${r.n_down}）` : `Higher in ${lb} (${r.n_down})`,
      stat: `Welch · BH q < ${r.thresholds.q} · |log2 FC| ≥ ${r.thresholds.lfc}`,
    }} />;
    summary = t(r.n_up + r.n_down ? "de.plain" : "de.plainNone", { u: r.n_up, d: r.n_down, a: la, b: lb, g: r.n_tested.toLocaleString(), q: r.thresholds.q });
  } else if (a.kind === "correlation") {
    const r = a.result as CorrelationResult, C = CORR[figLang];
    el = <Scatter points={r.points} line={r.line} labels={{
      x: fillFig(C.expr, { g: r.gene }), y: fillFig(C.expr, { g: r.gene2 }),
      stat: fillFig(C.stat, { rho: fmt(r.rho), lo: fmt(r.rho_ci[0]), hi: fmt(r.rho_ci[1]), p: fmtP(r.p) }),
      n: fillFig(C.n, { n: r.n, r: fmt(r.pearson.r) }),
    }} />;
    summary = plainCorrelation(r, t);
  } else {
    const r = a.result as ExpressionResult;
    let groups: Group[], brackets: { a: string; b: string; text: string }[] = [];
    let colors = (k: string) => (k.endsWith("normal") ? FIG.normal : FIG.tumour), label = (k: string) => k, stat: string;
    if (r.kind === "expression_group") {
      groups = r.groups;
      const idx = Object.fromEntries(r.groups.map((g, i) => [g.key, i]));
      colors = (k) => GROUP_COLORS[(idx[k] ?? 0) % GROUP_COLORS.length];
      brackets = r.groups.length === 2 ? [{ a: r.groups[0].key, b: r.groups[1].key, text: stars(r.test.p) }] : [];
      stat = fillFig(r.groups.length === 2 ? F.rankSum : F.kw, { p: fmtP(r.test.p) });
    } else if (r.kind === "expression_stage") {
      groups = r.groups; colors = (k) => STAGE_COLORS[k] ?? FIG.ink; label = (k) => `${F.stage} ${k}`;
      stat = fillFig(F.kw, { p: fmtP(r.test.p) });
    } else {
      const per = (r.per_project ?? []).filter((e) => e.normal.n > 0);
      if (per.length > 1) {
        groups = per.flatMap((e) => [{ ...e.normal, key: `${e.project}|normal` }, { ...e.tumour, key: `${e.project}|tumour` }]);
        brackets = per.map((e) => ({ a: `${e.project}|normal`, b: `${e.project}|tumour`, text: stars(e.p_adj) }));
        label = (k) => `${k.split("|")[0].replace("TCGA-", "")} ${k.endsWith("normal") ? F.normal : F.tumour}`;
      } else {
        groups = [r.groups[1], r.groups[0]];
        brackets = [{ a: r.groups[1].key, b: r.groups[0].key, text: stars(r.test.p) }];
        label = (k) => (k === "normal" ? F.normal : F.tumour);
      }
      stat = r.test.name === "wilcoxon_signed_rank" ? fillFig(F.signedRank, { p: fmtP(r.test.p), n: r.test.n_pairs ?? 0 }) : fillFig(F.rankSum, { p: fmtP(r.test.p) });
    }
    el = <BoxPoints groups={groups} colors={colors} showPoints labels={{ yTitle: r.kind === "expression_group" ? r.gene : `${r.gene} ${F.expr}`, group: label, stat, brackets }} />;
    summary = plainExpression(r, t);
  }
  const svg = renderToStaticMarkup(el).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  return { svg, summary, checks: res.checks ?? [] };
}
