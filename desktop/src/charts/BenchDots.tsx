// Bench data: every biological replicate as a dot, the mean as a bar and its 95% CI as a line,
// one panel per target gene (qPCR) or one panel (other measurements). Each group is compared with
// the control; the label above it gives p (Holm-adjusted when there are several comparisons).
import { forwardRef } from "react";
import { FIG } from "./figure";
import { fmtP } from "../lib/analyses";

export type BenchGroup = { group: string; n: number; points: number[]; mean: number | null; lo: number | null; hi: number | null; p?: number | null; p_adj?: number | null };
export type BenchPanel = { title: string; groups: BenchGroup[]; overall?: number | null };
export type BenchLabels = { y: string; foldAxis?: boolean; control: string; overall: string };

const PH = 250, T = 46, B = 64, L = 58, GW = 74, GAP = 26;
const COLS = ["#57514a", "#c8641a", "#2a6fa8", "#5a7f4a", "#8a4f9e", "#b0832b"];

function jitter(i: number) { const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return x - Math.floor(x) - 0.5; }

export const BenchDots = forwardRef<SVGSVGElement, { panels: BenchPanel[]; labels: BenchLabels }>(function BenchDots({ panels, labels }, ref) {
  const all = panels.flatMap((p) => p.groups.flatMap((g) => [...g.points, g.lo, g.hi])).filter((v): v is number => typeof v === "number");
  let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  const pad = (hi - lo) * 0.12 || 0.5; lo -= pad; hi += pad * 1.8;
  const span = hi - lo, step = span > 12 ? 4 : span > 6 ? 2 : span > 3 ? 1 : span > 1.5 ? 0.5 : 0.25;
  const ticks: number[] = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(Number(v.toFixed(2)));
  const sy = (v: number) => T + (1 - (v - lo) / (hi - lo)) * PH;
  const widths = panels.map((p) => p.groups.length * GW);
  const inner = widths.reduce((s, w) => s + w + GAP, 0);
  const extra = Math.max(0, 300 - inner);  // keep a narrow figure (two groups) from becoming a tall strip
  const W = L + inner + extra + (labels.foldAxis ? 34 : 6);
  const H = T + PH + B;
  let x0 = L + extra / 2;
  return (
    <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labels.y} style={{ fontFamily: FIG.font }}>
      <rect width={W} height={H} fill="#ffffff" />
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L - 4} x2={W - (labels.foldAxis ? 34 : 6)} y1={sy(v)} y2={sy(v)} stroke={v === 0 ? FIG.muted : FIG.grid} strokeDasharray={v === 0 ? undefined : "2 3"} />
          <text x={L - 8} y={sy(v) + 4} fontSize={10.5} textAnchor="end" fill={FIG.muted} fontFamily={FIG.mono}>{v}</text>
          {labels.foldAxis && <text x={W - 30} y={sy(v) + 4} fontSize={10} fill={FIG.muted} fontFamily={FIG.mono}>{2 ** v >= 10 ? Math.round(2 ** v) : Number((2 ** v).toPrecision(2))}×</text>}
        </g>
      ))}
      <text x={14} y={T + PH / 2} fontSize={11} fill={FIG.ink} textAnchor="middle" transform={`rotate(-90 14 ${T + PH / 2})`}>{labels.y}</text>
      {panels.map((p, pi) => {
        const px = x0; x0 += widths[pi] + GAP;
        return (
          <g key={pi}>
            {p.title && <text x={px + widths[pi] / 2} y={18} fontSize={12} textAnchor="middle" fill={FIG.ink} fontWeight={600} fontStyle="italic">{p.title}</text>}
            {p.overall != null && <text x={px + widths[pi] / 2} y={32} fontSize={9.5} textAnchor="middle" fill={FIG.muted}>{labels.overall} p {fmtP(p.overall).startsWith("<") ? fmtP(p.overall) : `= ${fmtP(p.overall)}`}</text>}
            {p.groups.map((g, gi) => {
              const cx = px + gi * GW + GW / 2, col = COLS[gi % COLS.length];
              const pv = g.p_adj ?? g.p;
              return (
                <g key={g.group}>
                  {g.points.map((v, k) => <circle key={k} cx={cx + jitter(k + gi * 31 + pi * 97) * 22} cy={sy(v)} r={3.6} fill={col} fillOpacity={0.75} stroke="#fff" strokeWidth={0.6} />)}
                  {g.lo != null && g.hi != null && <line x1={cx + 20} x2={cx + 20} y1={sy(g.lo)} y2={sy(g.hi)} stroke={FIG.ink} strokeWidth={1.3} />}
                  {g.mean != null && <line x1={cx - 16} x2={cx + 24} y1={sy(g.mean)} y2={sy(g.mean)} stroke={FIG.ink} strokeWidth={2.2} />}
                  {gi > 0 && pv != null && <text x={cx} y={T - 2} fontSize={10} textAnchor="middle" fill={pv < 0.05 ? FIG.ink : FIG.muted} fontFamily={FIG.mono}>p {fmtP(pv).startsWith("<") ? fmtP(pv) : `= ${fmtP(pv)}`}</text>}
                  <text x={cx} y={T + PH + 18} fontSize={11} textAnchor="middle" fill={FIG.ink}>{g.group}</text>
                  <text x={cx} y={T + PH + 32} fontSize={9.5} textAnchor="middle" fill={FIG.muted} fontFamily={FIG.mono}>n = {g.n}{gi === 0 ? ` · ${labels.control}` : ""}</text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
});
