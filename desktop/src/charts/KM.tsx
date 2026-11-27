// Kaplan–Meier figure: two step curves with 95% bands, censor ticks, legend, HR line and the number-at-risk table.
import { forwardRef } from "react";
import type { SurvivalResult } from "../lib/analyses";
import { FIG } from "./figure";

export type KMLabels = { yTitle: string; xTitle: string; high: string; low: string; atRisk: string; highShort: string; lowShort: string; stat: string };

const W = 560, H = 372, L = 60, R = 16, T = 26, PH = 210;

function steps(time: number[], y: number[], xmax: number, sx: (t: number) => number, sy: (s: number) => number) {
  let d = `M${sx(0)},${sy(y[0] ?? 1)}`;
  let prev = y[0] ?? 1;
  for (let i = 1; i < time.length; i++) {
    if (time[i] > xmax) break;
    d += `H${sx(time[i])}V${sy(y[i])}`;
    prev = y[i];
  }
  return d + `H${sx(xmax)}` + (prev ? "" : "");
}

function band(time: number[], lo: number[], hi: number[], xmax: number, sx: (t: number) => number, sy: (s: number) => number) {
  const n = time.findIndex((t) => t > xmax);
  const k = n === -1 ? time.length : n;
  let top = `M${sx(0)},${sy(hi[0] ?? 1)}`;
  for (let i = 1; i < k; i++) top += `H${sx(time[i])}V${sy(hi[i])}`;
  top += `H${sx(xmax)}`;
  let bottom = `V${sy(lo[k - 1] ?? 1)}`;
  for (let i = k - 1; i >= 1; i--) bottom += `H${sx(time[i])}V${sy(lo[i - 1])}`;
  return top + bottom + `H${sx(0)}Z`;
}

export const KM = forwardRef<SVGSVGElement, { r: SurvivalResult; labels: KMLabels }>(function KM({ r, labels }, ref) {
  const ticks = r.at_risk.ticks;
  const xmax = ticks[ticks.length - 1] || 1;
  const sx = (t: number) => L + (Math.min(t, xmax) / xmax) * (W - L - R);
  const sy = (s: number) => T + (1 - s) * PH;
  const g = r.groups;
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const tableY = T + PH + 58;
  return (
    <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labels.yTitle} style={{ fontFamily: FIG.font }}>
      <rect width={W} height={H} fill="#ffffff" />
      <text x={L - 12} y={T - 10} fontSize={11} fill={FIG.ink}>{labels.yTitle}</text>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke={FIG.grid} strokeDasharray={v === 0 ? undefined : "2 3"} />
          <text x={L - 8} y={sy(v) + 4} fontSize={10.5} textAnchor="end" fill={FIG.muted} fontFamily={FIG.mono}>{v === 0 ? "0" : v.toFixed(2)}</text>
        </g>
      ))}
      <line x1={L} x2={L} y1={T} y2={T + PH} stroke={FIG.muted} />
      {ticks.map((x) => (
        <g key={x}>
          <line x1={sx(x)} x2={sx(x)} y1={T + PH} y2={T + PH + 4} stroke={FIG.muted} />
          <text x={sx(x)} y={T + PH + 16} fontSize={10.5} textAnchor="middle" fill={FIG.muted} fontFamily={FIG.mono}>{Math.round(x)}</text>
        </g>
      ))}
      <text x={(L + W - R) / 2} y={T + PH + 32} fontSize={11} textAnchor="middle" fill={FIG.ink}>{labels.xTitle}</text>
      {(["low", "high"] as const).map((k) => (
        <g key={k}>
          <path d={band(g[k].time, g[k].lo, g[k].hi, xmax, sx, sy)} fill={FIG[k]} fillOpacity={0.13} stroke="none" />
          <path d={steps(g[k].time, g[k].surv, xmax, sx, sy)} fill="none" stroke={FIG[k]} strokeWidth={1.8} />
          {g[k].censor_times.map((t, i) => t <= xmax && (
            <line key={i} x1={sx(t)} x2={sx(t)} y1={sy(g[k].censor_surv[i]) - 3.5} y2={sy(g[k].censor_surv[i]) + 3.5} stroke={FIG[k]} strokeWidth={1.2} />
          ))}
        </g>
      ))}
      <g transform={`translate(${L + 14},${T + PH - 74})`}>
        <line x1={0} x2={16} y1={0} y2={0} stroke={FIG.high} strokeWidth={2.4} />
        <text x={22} y={4} fontSize={11} fill={FIG.ink}>{labels.high}</text>
        <line x1={0} x2={16} y1={17} y2={17} stroke={FIG.low} strokeWidth={2.4} />
        <text x={22} y={21} fontSize={11} fill={FIG.ink}>{labels.low}</text>
      </g>
      <text x={L + 10} y={T + PH - 10} fontSize={11} fill={FIG.muted} fontFamily={FIG.mono}>{labels.stat}</text>
      <text x={L} y={tableY - 16} fontSize={10.5} fill={FIG.ink}>{labels.atRisk}</text>
      {(["high", "low"] as const).map((k, row) => (
        <g key={k}>
          <text x={4} y={tableY + row * 16} fontSize={10.5} textAnchor="start" fill={FIG[k]} fontWeight={500}>{k === "high" ? labels.highShort : labels.lowShort}</text>
          {ticks.map((x, i) => <text key={x} x={sx(x)} y={tableY + row * 16} fontSize={10.5} textAnchor="middle" fill={FIG.ink} fontFamily={FIG.mono}>{r.at_risk[k][i]}</text>)}
        </g>
      ))}
    </svg>
  );
});
