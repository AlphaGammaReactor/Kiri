// Immune context: one row per immune cell type, the Spearman ρ of my gene with that cell type's
// marker score (dot and 95% CI), the same after removing overall immune content (open diamond),
// the number of marker genes found and a star for the BH q.
import { forwardRef } from "react";
import { FIG } from "./figure";
import { stars } from "./figStrings";

export type ImmuneRow = { id: string; label: string; rho: number | null; lo?: number; hi?: number; rho_adj?: number; p_adj?: number; have: number; total: number; self?: boolean };
export type ImmuneLabels = { x: string; raw: string; adj: string; stat: string; none: string };

const W = 600, L = 170, R = 86, T = 36, B = 46, ROW = 24;

export const Immune = forwardRef<SVGSVGElement, { rows: ImmuneRow[]; labels: ImmuneLabels; highlight?: string }>(function Immune({ rows, labels, highlight }, ref) {
  const H = T + rows.length * ROW + B;
  const vals = rows.flatMap((r) => [r.lo, r.hi, r.rho_adj, r.rho]).filter((v): v is number => typeof v === "number");
  const m = Math.max(0.4, Math.ceil(Math.max(...vals.map(Math.abs), 0) * 5) / 5);
  const PW = W - L - R;
  const sx = (v: number) => L + ((v + m) / (2 * m)) * PW;
  const step = m > 0.6 ? 0.4 : 0.2;
  const ticks: number[] = []; for (let v = -m; v <= m + 1e-9; v += step) ticks.push(Number(v.toFixed(1)));
  return (
    <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labels.x} style={{ fontFamily: FIG.font }}>
      <rect width={W} height={H} fill="#ffffff" />
      {ticks.map((v) => (
        <g key={v}>
          <line x1={sx(v)} x2={sx(v)} y1={T - 4} y2={T + rows.length * ROW} stroke={v === 0 ? FIG.muted : FIG.grid} strokeDasharray={v === 0 ? undefined : "2 3"} />
          <text x={sx(v)} y={T + rows.length * ROW + 15} fontSize={10.5} textAnchor="middle" fill={FIG.muted} fontFamily={FIG.mono}>{v}</text>
        </g>
      ))}
      <circle cx={14} cy={14} r={4} fill={FIG.ink} />
      <text x={23} y={18} fontSize={10.5} fill={FIG.ink}>{labels.raw}</text>
      <path d={`M 124 9 l 5 5 l -5 5 l -5 -5 z`} fill="#ffffff" stroke={FIG.ink} strokeWidth={1.2} />
      <text x={134} y={18} fontSize={10.5} fill={FIG.ink}>{labels.adj}</text>
      <text x={W - 6} y={18} fontSize={10} textAnchor="end" fill={FIG.muted} fontFamily={FIG.mono}>{labels.stat}</text>
      {rows.map((r, i) => {
        const y = T + i * ROW, cy = y + ROW / 2;
        const sig = r.p_adj != null && r.p_adj < 0.05;
        const col = r.rho == null ? FIG.muted : !sig ? FIG.muted : r.rho > 0 ? FIG.high : FIG.low;
        const on = r.id === highlight;
        return (
          <g key={r.id}>
            {i % 2 === 0 && <rect x={0} y={y} width={W} height={ROW} fill="#f6f2e9" fillOpacity={0.6} />}
            {on && <rect x={0} y={y} width={4} height={ROW} fill={FIG.ink} />}
            <text x={L - 10} y={cy + 4} fontSize={11} textAnchor="end" fill={FIG.ink} fontWeight={on ? 600 : 400}>{r.label}{r.self ? " †" : ""}</text>
            {r.rho == null ? (
              <text x={sx(0) + 6} y={cy + 4} fontSize={10} fill={FIG.muted}>{labels.none}</text>
            ) : (
              <>
                {r.lo != null && r.hi != null && <line x1={sx(r.lo)} x2={sx(r.hi)} y1={cy} y2={cy} stroke={col} strokeWidth={1.4} />}
                {r.rho_adj != null && <path d={`M ${sx(r.rho_adj)} ${cy - 5} l 5 5 l -5 5 l -5 -5 z`} fill="#ffffff" stroke={FIG.ink} strokeWidth={1.2} opacity={0.8} />}
                <circle cx={sx(r.rho)} cy={cy} r={4.2} fill={col} />
              </>
            )}
            <text x={W - R + 10} y={cy + 4} fontSize={10} fill={FIG.muted} fontFamily={FIG.mono}>{r.have}/{r.total}</text>
            <text x={W - 6} y={cy + 4} fontSize={11} textAnchor="end" fill={sig ? FIG.ink : FIG.muted}>{r.rho == null ? "" : stars(r.p_adj ?? 1)}</text>
          </g>
        );
      })}
      <text x={L + PW / 2} y={H - 10} fontSize={11} textAnchor="middle" fill={FIG.ink}>{labels.x}</text>
    </svg>
  );
});
