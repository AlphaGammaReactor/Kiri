// Figures for the gene set score: marker heatmap, four-group survival, enrichment curve and the across-cancers forest plot.
import { forwardRef } from "react";
import { FIG } from "./figure";

// Diverging blue–white–vermillion for correlations, colour-blind safe and readable in print.
function rhoColour(v: number | null) {
  if (v == null) return "#eeeae2";
  const a = Math.max(-1, Math.min(1, v));
  const mix = (c: [number, number, number], t: number) => c.map((x) => Math.round(255 + (x - 255) * t));
  const [r, g, b] = a >= 0 ? mix([200, 100, 26], a) : mix([42, 111, 168], -a);
  return `rgb(${r},${g},${b})`;
}

export type HeatLabels = { title: string; legend: string; note: string };

/** Spearman matrix: my gene and the members. The first row/column (my gene) is outlined. */
export const Heatmap = forwardRef<SVGSVGElement, { labels: string[]; rho: (number | null)[][]; padj: (number | null)[]; text: HeatLabels }>(
  function Heatmap({ labels, rho, padj, text }, ref) {
    const k = labels.length;
    const cell = Math.max(26, Math.min(44, 360 / k));
    const L = 84, T = 40, W = Math.max(440, L + k * cell + 110), H = T + k * cell + 74;
    return (
      <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={text.title} style={{ fontFamily: FIG.font }}>
        <rect width={W} height={H} fill="#ffffff" />
        <text x={L} y={22} fontSize={11.5} fill={FIG.ink}>{text.title}</text>
        {labels.map((g, i) => (
          <g key={`l${g}`}>
            <text x={L - 8} y={T + i * cell + cell / 2 + 4} fontSize={10.5} textAnchor="end" fill={i === 0 ? FIG.ink : FIG.muted} fontWeight={i === 0 ? 600 : 400} fontFamily={FIG.mono}>{g}</text>
            <text x={0} y={0} fontSize={10.5} textAnchor="start" fill={i === 0 ? FIG.ink : FIG.muted} fontWeight={i === 0 ? 600 : 400} fontFamily={FIG.mono}
              transform={`translate(${L + i * cell + cell / 2 + 4},${T + k * cell + 8}) rotate(60)`}>{g}</text>
          </g>
        ))}
        {rho.map((row, i) => row.map((v, j) => (
          <g key={`${i}-${j}`}>
            <rect x={L + j * cell} y={T + i * cell} width={cell - 1} height={cell - 1} fill={i === j ? "#f4f1ea" : rhoColour(v)} />
            {i !== j && v != null && <text x={L + j * cell + cell / 2} y={T + i * cell + cell / 2 + 3.5} fontSize={cell > 34 ? 10 : 8.5} textAnchor="middle"
              fill={Math.abs(v) > 0.55 ? "#ffffff" : FIG.ink} fontFamily={FIG.mono}>{v.toFixed(2).replace("0.", ".")}{i === 0 && padj[j - 1] != null && padj[j - 1]! < 0.05 ? "*" : ""}</text>}
          </g>
        )))}
        <rect x={L} y={T} width={k * cell - 1} height={cell - 1} fill="none" stroke={FIG.ink} strokeWidth={1.2} />
        {/* legend */}
        <g transform={`translate(${L + k * cell + 22},${T})`}>
          <text x={0} y={-6} fontSize={10} fill={FIG.muted}>{text.legend}</text>
          {Array.from({ length: 21 }, (_, i) => 1 - i * 0.1).map((v, i) => <rect key={i} x={0} y={i * 7} width={14} height={7} fill={rhoColour(v)} />)}
          {[1, 0.5, 0, -0.5, -1].map((v) => <text key={v} x={20} y={(1 - v) * 70 + 4} fontSize={9.5} fill={FIG.muted} fontFamily={FIG.mono}>{v}</text>)}
        </g>
        <text x={L} y={H - 8} fontSize={10} fill={FIG.muted}>{text.note}</text>
      </svg>
    );
  });

export type Curve4 = { n: number; events: number; time: number[]; surv: number[]; censor_times: number[]; censor_surv: number[]; median: number | null };
export type Surv4 = { curves: Record<string, Curve4>; at_risk: { ticks: number[] } & Record<string, number[]>; logrank: { p: number }; n: number; fewest_events: number; enough: boolean };
export const FOUR = ["gene_high_score_high", "gene_high_score_low", "gene_low_score_high", "gene_low_score_low"] as const;
const C4: Record<string, { c: string; dash?: string }> = {
  gene_high_score_high: { c: FIG.high }, gene_high_score_low: { c: FIG.high, dash: "5 3" },
  gene_low_score_high: { c: FIG.low }, gene_low_score_low: { c: FIG.low, dash: "5 3" },
};

export type KM4Labels = { yTitle: string; xTitle: string; atRisk: string; stat: string; group: (k: string) => string; short: (k: string) => string };

export const KM4 = forwardRef<SVGSVGElement, { s: Surv4; labels: KM4Labels }>(function KM4({ s, labels }, ref) {
  const W = 580, L = 64, R = 16, T = 26, PH = 210;
  const ticks = s.at_risk.ticks;
  const xmax = ticks[ticks.length - 1] || 1;
  const sx = (t: number) => L + (Math.min(t, xmax) / xmax) * (W - L - R);
  const sy = (v: number) => T + (1 - v) * PH;
  const keys = FOUR.filter((k) => s.curves[k]);
  const tableY = T + PH + 58;
  const H = tableY + keys.length * 15 + 10;
  const path = (c: Curve4) => {
    let d = `M${sx(0)},${sy(1)}`;
    for (let i = 0; i < c.time.length; i++) { if (c.time[i] > xmax) break; d += `H${sx(c.time[i])}V${sy(c.surv[i])}`; }
    return d + `H${sx(Math.min(xmax, Math.max(...c.time)))}`;
  };
  return (
    <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labels.yTitle} style={{ fontFamily: FIG.font }}>
      <rect width={W} height={H} fill="#ffffff" />
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke={FIG.grid} strokeDasharray="2 3" />
          <text x={L - 8} y={sy(v) + 4} fontSize={10.5} textAnchor="end" fill={FIG.muted} fontFamily={FIG.mono}>{v}</text></g>
      ))}
      {ticks.map((v) => <text key={v} x={sx(v)} y={T + PH + 16} fontSize={10.5} textAnchor="middle" fill={FIG.muted} fontFamily={FIG.mono}>{v}</text>)}
      <line x1={L} x2={L} y1={T} y2={T + PH} stroke={FIG.muted} /><line x1={L} x2={W - R} y1={T + PH} y2={T + PH} stroke={FIG.muted} />
      <text x={(L + W - R) / 2} y={T + PH + 34} fontSize={11} textAnchor="middle" fill={FIG.ink}>{labels.xTitle}</text>
      <text x={14} y={T + PH / 2} fontSize={11} textAnchor="middle" fill={FIG.ink} transform={`rotate(-90 14 ${T + PH / 2})`}>{labels.yTitle}</text>
      {keys.map((k) => {
        const c = s.curves[k];
        return (
          <g key={k}>
            <path d={path(c)} fill="none" stroke={C4[k].c} strokeWidth={1.8} strokeDasharray={C4[k].dash} />
            {c.censor_times.map((t, i) => t <= xmax && <line key={i} x1={sx(t)} x2={sx(t)} y1={sy(c.censor_surv[i]) - 3} y2={sy(c.censor_surv[i]) + 3} stroke={C4[k].c} />)}
          </g>
        );
      })}
      <g transform={`translate(${L + 12},${T + PH - keys.length * 15 - 14})`}>
        <rect x={-6} y={-12} width={218} height={keys.length * 15 + 22} fill="#ffffff" fillOpacity={0.85} />
        {keys.map((k, i) => (
          <g key={k} transform={`translate(0,${i * 15})`}>
            <line x1={0} x2={18} y1={-3} y2={-3} stroke={C4[k].c} strokeWidth={1.8} strokeDasharray={C4[k].dash} />
            <text x={24} y={1} fontSize={10.5} fill={FIG.ink}>{labels.group(k)} (n = {s.curves[k].n})</text>
          </g>
        ))}
        <text x={0} y={keys.length * 15 + 4} fontSize={10.5} fill={FIG.muted} fontFamily={FIG.mono}>{labels.stat}</text>
      </g>
      <text x={L - 56} y={tableY - 8} fontSize={10.5} fill={FIG.ink}>{labels.atRisk}</text>
      {keys.map((k, i) => (
        <g key={k}>
          <text x={L - 8} y={tableY + 8 + i * 15} fontSize={10} textAnchor="end" fill={C4[k].c} fontFamily={FIG.mono}>{labels.short(k)}</text>
          {ticks.map((v, j) => <text key={v} x={sx(v)} y={tableY + 8 + i * 15} fontSize={10} textAnchor="middle" fill={FIG.muted} fontFamily={FIG.mono}>{s.at_risk[k]?.[j] ?? ""}</text>)}
        </g>
      ))}
    </svg>
  );
});

export type GseaCurveT = { x: number[]; y: (number | null)[]; hits: number[]; n: number; ranked_min: number; ranked_max: number };
export type GseaLabels = { title: string; yTitle: string; xTitle: string; stat: string; left: string; right: string };

/** Running enrichment score along genes ranked by their correlation with my gene, with a tick for each member. */
export const GseaCurve = forwardRef<SVGSVGElement, { c: GseaCurveT; labels: GseaLabels }>(function GseaCurve({ c, labels }, ref) {
  const W = 560, L = 60, R = 16, T = 34, PH = 190, TH = 26, H = T + PH + TH + 64;
  const ys = c.y.filter((v): v is number => v != null);
  const lo = Math.min(0, ...ys) - 0.05, hi = Math.max(0, ...ys) + 0.05;
  const sx = (i: number) => L + (i / (c.n - 1 || 1)) * (W - L - R);
  const sy = (v: number) => T + (1 - (v - lo) / (hi - lo)) * PH;
  const d = c.x.map((x, i) => `${i ? "L" : "M"}${sx(x)},${sy(c.y[i] ?? 0)}`).join("");
  const yt = [lo, 0, hi].map((v) => Number(v.toFixed(2)));
  return (
    <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labels.title} style={{ fontFamily: FIG.font }}>
      <rect width={W} height={H} fill="#ffffff" />
      <text x={L} y={18} fontSize={11.5} fill={FIG.ink}>{labels.title}</text>
      {yt.map((v) => <g key={v}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke={v === 0 ? FIG.muted : FIG.grid} strokeDasharray={v === 0 ? undefined : "2 3"} />
        <text x={L - 8} y={sy(v) + 4} fontSize={10.5} textAnchor="end" fill={FIG.muted} fontFamily={FIG.mono}>{v}</text></g>)}
      <line x1={L} x2={L} y1={T} y2={T + PH} stroke={FIG.muted} />
      <path d={d} fill="none" stroke={FIG.high} strokeWidth={1.8} />
      <text x={14} y={T + PH / 2} fontSize={11} textAnchor="middle" fill={FIG.ink} transform={`rotate(-90 14 ${T + PH / 2})`}>{labels.yTitle}</text>
      <rect x={L} y={T + PH + 6} width={W - L - R} height={TH} fill="#faf8f3" stroke={FIG.grid} />
      {c.hits.map((h) => <line key={h} x1={sx(h)} x2={sx(h)} y1={T + PH + 8} y2={T + PH + 4 + TH} stroke={FIG.ink} strokeWidth={1.2} />)}
      <defs><linearGradient id="gsea-rank" x1="0" x2="1"><stop offset="0" stopColor={FIG.high} /><stop offset="0.5" stopColor="#ffffff" /><stop offset="1" stopColor={FIG.low} /></linearGradient></defs>
      <rect x={L} y={T + PH + TH + 10} width={W - L - R} height={8} fill="url(#gsea-rank)" />
      <text x={L} y={T + PH + TH + 32} fontSize={10} fill={FIG.muted}>{labels.left}</text>
      <text x={W - R} y={T + PH + TH + 32} fontSize={10} textAnchor="end" fill={FIG.muted}>{labels.right}</text>
      <text x={(L + W - R) / 2} y={H - 10} fontSize={11} textAnchor="middle" fill={FIG.ink}>{labels.xTitle}</text>
      <text x={W - R - 6} y={T + 14} fontSize={10.5} textAnchor="end" fill={FIG.muted} fontFamily={FIG.mono}>{labels.stat}</text>
    </svg>
  );
});

export type ForestRow = { label: string; n: number; rho: number; lo: number; hi: number; p_adj?: number; current?: boolean };

/** One row per cohort: Spearman ρ with its 95% interval. */
export const Forest = forwardRef<SVGSVGElement, { rows: ForestRow[]; title: string; xTitle: string; nLabel: string }>(function Forest({ rows, title, xTitle, nLabel }, ref) {
  const W = 560, L = 150, R = 110, T = 40, RH = 22, H = T + rows.length * RH + 54;
  const sx = (v: number) => L + ((v + 1) / 2) * (W - L - R);
  return (
    <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} style={{ fontFamily: FIG.font }}>
      <rect width={W} height={H} fill="#ffffff" />
      <text x={16} y={20} fontSize={11.5} fill={FIG.ink}>{title}</text>
      {[-1, -0.5, 0, 0.5, 1].map((v) => <g key={v}><line x1={sx(v)} x2={sx(v)} y1={T - 6} y2={T + rows.length * RH} stroke={v === 0 ? FIG.muted : FIG.grid} strokeDasharray={v === 0 ? undefined : "2 3"} />
        <text x={sx(v)} y={T + rows.length * RH + 16} fontSize={10.5} textAnchor="middle" fill={FIG.muted} fontFamily={FIG.mono}>{v}</text></g>)}
      <text x={W - R + 10} y={T - 10} fontSize={10} fill={FIG.muted}>{nLabel}</text>
      {rows.map((r, i) => {
        const y = T + i * RH + RH / 2;
        const sig = r.p_adj != null && r.p_adj < 0.05;
        const col = r.rho >= 0 ? FIG.high : FIG.low;
        return (
          <g key={r.label}>
            <text x={L - 10} y={y + 4} fontSize={10.5} textAnchor="end" fill={FIG.ink} fontWeight={r.current ? 600 : 400} fontFamily={FIG.mono}>{r.label}</text>
            <line x1={sx(r.lo)} x2={sx(r.hi)} y1={y} y2={y} stroke={col} strokeWidth={1.6} />
            <rect x={sx(r.rho) - 4} y={y - 4} width={8} height={8} fill={sig ? col : "#ffffff"} stroke={col} strokeWidth={1.4} />
            <text x={W - R + 10} y={y + 4} fontSize={10} fill={FIG.muted} fontFamily={FIG.mono}>{r.n} · {r.rho.toFixed(2)}</text>
          </g>
        );
      })}
      <text x={sx(0)} y={H - 10} fontSize={11} textAnchor="middle" fill={FIG.ink}>{xTitle}</text>
    </svg>
  );
});
