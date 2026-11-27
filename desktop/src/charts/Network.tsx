// Interaction partners: my gene in the centre, STRING partners around it (strongest at the top,
// clockwise), line width = STRING combined score, node colour = Spearman ρ with my gene in the
// project's tumours (dashed outline when the partner is not in the data).
import { forwardRef } from "react";
import { FIG } from "./figure";

export type NetNode = { gene: string; score: number; rho?: number | null; q?: number | null };
export type NetLabels = { width: string; colour: string; missing: string; stat: string };

const W = 600, H = 520, CX = W / 2, CY = 236, RAD = 168;

function rhoFill(rho: number | null | undefined) {
  if (rho == null) return "#ffffff";
  const a = Math.min(1, Math.abs(rho) / 0.6);
  const [r, g, b] = rho > 0 ? [200, 100, 26] : [42, 111, 168];
  const mix = (c: number) => Math.round(255 + (c - 255) * (0.15 + 0.85 * a));
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

export const Network = forwardRef<SVGSVGElement, { gene: string; nodes: NetNode[]; edges: [string, string, number][]; labels: NetLabels }>(
  function Network({ gene, nodes, edges, labels }, ref) {
    const ordered = [...nodes].sort((a, b) => b.score - a.score);
    const pos = new Map<string, { x: number; y: number; ang: number }>();
    ordered.forEach((n, i) => {
      const ang = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, ordered.length);
      pos.set(n.gene, { x: CX + RAD * Math.cos(ang), y: CY + RAD * Math.sin(ang), ang });
    });
    const legendY = H - 46;
    return (
      <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${gene} · STRING`} style={{ fontFamily: FIG.font }}>
        <rect width={W} height={H} fill="#ffffff" />
        <text x={W - 10} y={18} fontSize={10} textAnchor="end" fill={FIG.muted} fontFamily={FIG.mono}>{labels.stat}</text>
        {edges.map(([a, b, s]) => {
          const p = pos.get(a), q = pos.get(b);
          return p && q ? <line key={`${a}-${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={FIG.grid} strokeWidth={0.6 + s} /> : null;
        })}
        {ordered.map((n) => {
          const p = pos.get(n.gene)!;
          return <line key={`c-${n.gene}`} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke={FIG.muted} strokeOpacity={0.55} strokeWidth={0.6 + 4 * Math.max(0, n.score - 0.4)} />;
        })}
        {ordered.map((n) => {
          const p = pos.get(n.gene)!;
          const sig = n.q != null && n.q < 0.05;
          const lx = CX + (RAD + 26) * Math.cos(p.ang), ly = CY + (RAD + 26) * Math.sin(p.ang);
          const anchor = Math.abs(Math.cos(p.ang)) < 0.25 ? "middle" : Math.cos(p.ang) > 0 ? "start" : "end";
          return (
            <g key={n.gene}>
              <circle cx={p.x} cy={p.y} r={12} fill={rhoFill(n.rho)} stroke={n.rho == null ? FIG.muted : FIG.ink} strokeWidth={sig ? 1.8 : 0.9} strokeDasharray={n.rho == null ? "2 2" : undefined} />
              <text x={lx} y={ly + 4} fontSize={11} textAnchor={anchor} fill={FIG.ink} fontFamily={FIG.mono}>{n.gene}</text>
            </g>
          );
        })}
        <circle cx={CX} cy={CY} r={30} fill={FIG.ink} />
        <text x={CX} y={CY + 4} fontSize={12} textAnchor="middle" fill="#ffffff" fontWeight={600} fontFamily={FIG.mono}>{gene}</text>
        <g transform={`translate(24 ${legendY})`}>
          <line x1={0} x2={22} y1={6} y2={6} stroke={FIG.muted} strokeWidth={1} /><line x1={0} x2={22} y1={16} y2={16} stroke={FIG.muted} strokeWidth={3} />
          <text x={30} y={15} fontSize={10.5} fill={FIG.ink}>{labels.width}</text>
          {[-0.6, -0.3, 0, 0.3, 0.6].map((v, i) => <rect key={v} x={200 + i * 14} y={4} width={14} height={12} fill={rhoFill(v)} stroke={FIG.grid} strokeWidth={0.5} />)}
          <text x={200} y={30} fontSize={9.5} fill={FIG.muted} fontFamily={FIG.mono}>−0.6</text>
          <text x={270} y={30} fontSize={9.5} textAnchor="end" fill={FIG.muted} fontFamily={FIG.mono}>0.6</text>
          <text x={278} y={15} fontSize={10.5} fill={FIG.ink}>{labels.colour}</text>
          <circle cx={436} cy={10} r={6} fill="#ffffff" stroke={FIG.muted} strokeDasharray="2 2" />
          <text x={448} y={14} fontSize={10.5} fill={FIG.ink}>{labels.missing}</text>
        </g>
      </svg>
    );
  });
