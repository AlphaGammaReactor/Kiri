// Expression across cancers: one row per TCGA cancer, a tumour box and a normal box side by side
// (horizontal, so 33 cancers stay readable), with up to 60 real points per box, the n and a star for the BH q.
import { forwardRef } from "react";
import { FIG } from "./figure";
import { stars } from "./figStrings";
import type { Summary } from "../lib/analyses";

export type AcrossRow = { code: string; tumour: Summary; normal: Summary; p: number | null; p_adj?: number; diff: number | null; points_t: number[]; points_n: number[]; n_gtex: number };
export type AcrossLabels = { x: string; tumour: string; normal: string; noNormal: string; stat: string };

const W = 620, L = 64, R = 92, T = 34, B = 46, ROW = 22;

function jitter(i: number) { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x) - 0.5; }

export const Across = forwardRef<SVGSVGElement, { rows: AcrossRow[]; labels: AcrossLabels; highlight?: string[] }>(function Across({ rows, labels, highlight = [] }, ref) {
  const H = T + rows.length * ROW + B;
  const all = rows.flatMap((r) => [r.tumour.min, r.tumour.max, r.normal.min, r.normal.max]).filter((v): v is number => typeof v === "number");
  const lo = Math.floor(Math.min(0, ...all)), hi = Math.ceil(Math.max(1, ...all));
  const PW = W - L - R;
  const sx = (v: number) => L + ((v - lo) / (hi - lo || 1)) * PW;
  const step = hi - lo > 12 ? 4 : hi - lo > 6 ? 2 : 1;
  const ticks: number[] = []; for (let v = lo; v <= hi; v += step) ticks.push(v);
  const hl = new Set(highlight);
  const box = (s: Summary, y: number, h: number, col: string) => s.n && s.q1 != null && s.q3 != null && s.median != null ? (
    <g>
      <line x1={sx(s.min!)} x2={sx(s.max!)} y1={y + h / 2} y2={y + h / 2} stroke={col} strokeWidth={1} />
      <rect x={sx(s.q1)} y={y} width={Math.max(1, sx(s.q3) - sx(s.q1))} height={h} fill={col} fillOpacity={0.18} stroke={col} strokeWidth={1} />
      <line x1={sx(s.median)} x2={sx(s.median)} y1={y} y2={y + h} stroke={col} strokeWidth={2} />
    </g>
  ) : null;
  return (
    <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labels.x} style={{ fontFamily: FIG.font }}>
      <rect width={W} height={H} fill="#ffffff" />
      {ticks.map((v) => (
        <g key={v}>
          <line x1={sx(v)} x2={sx(v)} y1={T - 4} y2={T + rows.length * ROW} stroke={FIG.grid} strokeDasharray="2 3" />
          <text x={sx(v)} y={T + rows.length * ROW + 15} fontSize={10.5} textAnchor="middle" fill={FIG.muted} fontFamily={FIG.mono}>{v}</text>
        </g>
      ))}
      <rect x={L} y={10} width={10} height={8} fill={FIG.tumour} fillOpacity={0.5} />
      <text x={L + 14} y={18} fontSize={10.5} fill={FIG.ink}>{labels.tumour}</text>
      <rect x={L + 90} y={10} width={10} height={8} fill={FIG.normal} fillOpacity={0.5} />
      <text x={L + 104} y={18} fontSize={10.5} fill={FIG.ink}>{labels.normal}</text>
      <text x={W - 6} y={18} fontSize={10} textAnchor="end" fill={FIG.muted} fontFamily={FIG.mono}>{labels.stat}</text>
      {rows.map((r, i) => {
        const y = T + i * ROW;
        const on = hl.has(r.code);
        return (
          <g key={r.code}>
            {i % 2 === 0 && <rect x={0} y={y} width={W} height={ROW} fill="#f6f2e9" fillOpacity={0.6} />}
            {on && <rect x={0} y={y} width={4} height={ROW} fill={FIG.ink} />}
            <text x={L - 8} y={y + ROW / 2 + 4} fontSize={10.5} textAnchor="end" fill={FIG.ink} fontWeight={on ? 600 : 400} fontFamily={FIG.mono}>{r.code}</text>
            {r.points_t.map((v, k) => <circle key={`t${k}`} cx={sx(v)} cy={y + 6 + jitter(k + i * 97) * 5} r={1.3} fill={FIG.tumour} fillOpacity={0.35} />)}
            {r.points_n.map((v, k) => <circle key={`n${k}`} cx={sx(v)} cy={y + 15 + jitter(k + i * 131) * 5} r={1.3} fill={FIG.normal} fillOpacity={0.35} />)}
            {box(r.tumour, y + 2, 8, FIG.tumour)}
            {box(r.normal, y + 11, 8, FIG.normal)}
            <text x={W - R + 8} y={y + ROW / 2 + 4} fontSize={10} fill={FIG.muted} fontFamily={FIG.mono}>
              {r.tumour.n}/{r.normal.n || 0}
            </text>
            <text x={W - 6} y={y + ROW / 2 + 4} fontSize={11} textAnchor="end" fill={r.p_adj != null && r.p_adj < 0.05 ? FIG.ink : FIG.muted}>
              {r.p == null ? labels.noNormal : stars(r.p_adj ?? 1)}
            </text>
          </g>
        );
      })}
      <text x={L + PW / 2} y={H - 10} fontSize={11} textAnchor="middle" fill={FIG.ink}>{labels.x}</text>
    </svg>
  );
});
