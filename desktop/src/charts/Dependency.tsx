// Cell line dependency (DepMap): one row per cancer lineage, the spread of CRISPR gene effect across its
// cell lines (box: middle half, whiskers: 10th to 90th percentile, tick: median), the dependency cut at -0.5,
// and the share of lines that depend on the gene. The project's own lineage is marked.
import { forwardRef } from "react";
import { FIG } from "./figure";

export type DepRow = { lineage: string; label: string; n: number; q10: number | null; q25: number | null; median: number | null; q75: number | null; q90: number | null; dep: number | null; mine?: boolean };
export type DepLabels = { x: string; cut: string; stat: string };

const W = 620, L = 180, R = 92, T = 34, B = 48, ROW = 20;

export const Dependency = forwardRef<SVGSVGElement, { rows: DepRow[]; labels: DepLabels }>(function Dependency({ rows, labels }, ref) {
  const H = T + rows.length * ROW + B;
  const vals = rows.flatMap((r) => [r.q10, r.q90]).filter((v): v is number => typeof v === "number");
  const lo = Math.min(-1.5, Math.floor(Math.min(...vals, 0) * 2) / 2), hi = Math.max(0.5, Math.ceil(Math.max(...vals, 0) * 2) / 2);
  const PW = W - L - R;
  const sx = (v: number) => L + ((v - lo) / (hi - lo)) * PW;
  const ticks: number[] = []; for (let v = lo; v <= hi + 1e-9; v += 0.5) ticks.push(Number(v.toFixed(1)));
  const bottom = T + rows.length * ROW;
  return (
    <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labels.x} style={{ fontFamily: FIG.font }}>
      <rect width={W} height={H} fill="#ffffff" />
      {ticks.map((v) => (
        <g key={v}>
          <line x1={sx(v)} x2={sx(v)} y1={T - 4} y2={bottom} stroke={v === 0 ? FIG.muted : FIG.grid} strokeDasharray={v === 0 ? undefined : "2 3"} />
          <text x={sx(v)} y={bottom + 15} fontSize={10.5} textAnchor="middle" fill={FIG.muted} fontFamily={FIG.mono}>{v}</text>
        </g>
      ))}
      <line x1={sx(-0.5)} x2={sx(-0.5)} y1={T - 8} y2={bottom} stroke={FIG.high} strokeWidth={1.2} strokeDasharray="5 3" />
      <text x={sx(-0.5) - 4} y={T - 12} fontSize={10} textAnchor="end" fill={FIG.high}>{labels.cut}</text>
      <text x={W - 6} y={T - 12} fontSize={10} textAnchor="end" fill={FIG.muted} fontFamily={FIG.mono}>{labels.stat}</text>
      {rows.map((r, i) => {
        const y = T + i * ROW, cy = y + ROW / 2;
        const strong = (r.median ?? 0) <= -0.5;
        const col = strong ? FIG.high : FIG.muted;
        return (
          <g key={r.lineage}>
            {i % 2 === 0 && <rect x={0} y={y} width={W} height={ROW} fill="#f6f2e9" fillOpacity={0.6} />}
            {r.mine && <rect x={0} y={y} width={4} height={ROW} fill={FIG.ink} />}
            <text x={L - 10} y={cy + 4} fontSize={11} textAnchor="end" fill={FIG.ink} fontWeight={r.mine ? 600 : 400}>{r.label}</text>
            {r.q10 != null && r.q90 != null && <line x1={sx(r.q10)} x2={sx(r.q90)} y1={cy} y2={cy} stroke={col} strokeWidth={1.2} />}
            {r.q25 != null && r.q75 != null && <rect x={sx(r.q25)} y={cy - 5} width={Math.max(1, sx(r.q75) - sx(r.q25))} height={10} fill={strong ? FIG.high : "#d9d2c3"} fillOpacity={strong ? 0.35 : 0.8} stroke={col} />}
            {r.median != null && <line x1={sx(r.median)} x2={sx(r.median)} y1={cy - 6} y2={cy + 6} stroke={FIG.ink} strokeWidth={2} />}
            <text x={W - R + 10} y={cy + 4} fontSize={10} fill={FIG.muted} fontFamily={FIG.mono}>{r.n}</text>
            <text x={W - 6} y={cy + 4} fontSize={10.5} textAnchor="end" fill={strong ? FIG.ink : FIG.muted} fontFamily={FIG.mono}>{r.dep == null ? "" : `${Math.round(r.dep * 100)}%`}</text>
          </g>
        );
      })}
      <text x={L + PW / 2} y={H - 10} fontSize={11} textAnchor="middle" fill={FIG.ink}>{labels.x}</text>
    </svg>
  );
});
