// Figures for the one-page summary, drawn from saved results with the same charts and figure text as the workspaces,
// so a panel exists even for an analysis that was never opened or sent to the notebook.
import { renderToStaticMarkup } from "react-dom/server";
import type { StringKey } from "../i18n/strings";
import { fmt, fmtP, type Analysis, type Check, type AcrossResult, type CorrelationResult, type ImmuneResult, type BenchResult, type InteractionsResult, type DEResult, type ExpressionResult, type Group, type SurvivalResult } from "../lib/analyses";
import { BoxPoints } from "./BoxPoints";
import { KM } from "./KM";
import { Scatter } from "./Scatter";
import { Volcano } from "./Volcano";
import { Across } from "./Across";
import { Immune } from "./Immune";
import { BenchDots } from "./BenchDots";
import { Network } from "./Network";
import { networkFigure, plainInteractions } from "../screens/workspace/Interactions";
import { benchFigure, plainBench } from "../screens/workspace/Bench";
import { FIG } from "./figure";
import { probTitle, figText, fillFig, stars, type FigLang } from "./figStrings";
import { plainSurvival } from "../screens/workspace/Survival";
import type { SignatureResult } from "../screens/workspace/Signature";
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
      yTitle: probTitle(F, r.endpoint), xTitle: F.months, atRisk: F.atRisk, highShort: r.cut === "mutation" ? F.mutShort : F.highShort, lowShort: r.cut === "mutation" ? F.wtShort : F.lowShort,
      high: `${r.gene} ${r.cut === "mutation" ? F.mutated : F.high} (n = ${r.groups.high.n})`, low: `${r.gene} ${r.cut === "mutation" ? F.notMutated : F.low} (n = ${r.groups.low.n})`,
      stat: fillFig(r.cut === "optimal" ? F.hrLineAdj : r.cox_adjusted ? F.aHR : F.hrLine, { hr: fmt(cox.hr), lo: fmt(cox.lo), hi: fmt(cox.hi), p: fmtP(p) }),
    }} />;
    summary = plainSurvival(r, cox, p, r.groups.high.n + r.groups.low.n, t);
  } else if (a.kind === "across") {
    const r = a.result as AcrossResult;
    const zh = figLang === "zh";
    const rows = [...r.rows].sort((x, y) => (y.tumour.median ?? -99) - (x.tumour.median ?? -99));
    el = <Across rows={rows} labels={{ x: zh ? `${r.gene} 表达量，log2(TPM + 1)` : `${r.gene} expression, log2(TPM + 1)`, tumour: zh ? "肿瘤" : "Tumour",
      normal: r.normal === "tcga_gtex" ? (zh ? "正常（TCGA + GTEx）" : "Normal (TCGA + GTEx)") : (zh ? "正常" : "Normal"), noNormal: zh ? "无正常" : "no normal", stat: "n T/N · BH q" }} />;
    summary = t(r.n_up + r.n_down ? "acr.plain" : "acr.plainNone", { g: r.gene, u: r.n_up, d: r.n_down, k: r.n_tested });
  } else if (a.kind === "immune") {
    const r = a.result as ImmuneResult;
    const zh = figLang === "zh";
    el = <Immune highlight={r.top ?? undefined}
      rows={r.rows.map((x) => ({ id: x.id, label: zh ? x.zh : x.name, rho: x.rho, lo: x.lo, hi: x.hi, rho_adj: x.rho_adj, p_adj: x.p_adj, have: x.have.length, total: x.markers.length, self: x.self }))}
      labels={{ x: zh ? `与 ${r.gene} 的 Spearman ρ（肿瘤样本）` : `Spearman ρ with ${r.gene} across tumours`, raw: zh ? "ρ 及 95% CI" : "ρ with 95% CI",
        adj: zh ? "去除总体免疫含量后" : "after removing overall immune content", stat: zh ? "标志基因 · BH q" : "markers · BH q", none: zh ? "数据中无标志基因" : "markers not in the data" }} />;
    summary = t(r.pos.length || r.neg.length ? "imm.plain" : "imm.plainNone", { g: r.gene, u: r.pos.length, d: r.neg.length, k: r.rows.filter((x) => x.rho != null && x.id !== "cd45").length });
  } else if (a.kind === "bench") {
    const r = a.result as BenchResult;
    el = <BenchDots {...benchFigure(r, figLang)} />;
    summary = plainBench(r, t);
  } else if (a.kind === "interactions") {
    const r = a.result as InteractionsResult;
    el = <Network {...networkFigure(r, figLang)} />;
    summary = plainInteractions(r, t);
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
  } else if ((a.kind as string) === "signature") {
    const r = a.result as unknown as SignatureResult;
    const sn = figLang === "zh" ? r.set_name_zh : r.set_name;
    const S = figLang === "zh"
      ? { x: `${r.gene} 表达量，log2(TPM + 1)`, y: `${sn} 评分（z 分数均值）`, n: `n = ${r.n} 位患者 · 评分含 ${r.members.length} 个基因`, ci: "至" }
      : { x: `${r.gene} expression, log2(TPM + 1)`, y: `${sn} score (mean z-score)`, n: `n = ${r.n} patients · ${r.members.length} genes in the score`, ci: "to" };
    el = <Scatter points={r.points} line={r.line} labels={{ x: S.x, y: S.y, n: S.n,
      stat: `Spearman ρ = ${fmt(r.rho)} (95% CI ${fmt(r.rho_ci[0])} ${S.ci} ${fmt(r.rho_ci[1])}) · p ${fmtP(r.p).startsWith("<") ? "" : "= "}${fmtP(r.p)}` }} />;
    const st = Math.abs(r.rho) < 0.1 ? "negligible" : Math.abs(r.rho) < 0.3 ? "weak" : Math.abs(r.rho) < 0.5 ? "moderate" : "strong";
    summary = t(r.p < 0.05 ? (r.rho > 0 ? "sig.plain.pos" : "sig.plain.neg") : "sig.plain.none",
      { g: r.gene, s: sn, rho: fmt(r.rho), p: fmtP(r.p), n: r.n, str: t(`corr.s.${st}` as StringKey) });
  } else {
    const r = a.result as ExpressionResult;
    let groups: Group[], brackets: { a: string; b: string; text: string }[] = [];
    let colors = (k: string) => (k.endsWith("normal") ? FIG.normal : FIG.tumour), label = (k: string) => k, stat: string;
    if (r.kind === "expression_cn") {
      const CN: Record<string, string> = { deletion: "#2f5f8f", loss: "#7fa3c4", normal: "#9a9184", gain: "#d08a5c", amplification: "#a5402a" };
      groups = r.groups; colors = (k) => CN[k] ?? FIG.ink; label = (k) => F[`cn_${k}` as "cn_normal"] ?? k;
      stat = fillFig(F.kw, { p: fmtP(r.test.p) });
    } else if (r.kind === "expression_mut") {
      groups = r.groups;
      colors = (k) => (k === "mutated" ? FIG.tumour : FIG.normal);
      label = (k) => `${r.gene2} ${k === "mutated" ? F.mutated : F.notMutated}`;
      brackets = [{ a: r.groups[0].key, b: r.groups[1].key, text: stars(r.test.p) }];
      stat = fillFig(F.rankSum, { p: fmtP(r.test.p) });
    } else if (r.kind === "expression_group") {
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
