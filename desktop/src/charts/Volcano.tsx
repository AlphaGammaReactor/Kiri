// Volcano plot: every tested gene, log2 fold change against −log10 p, with the thresholds and the strongest genes named.
import { forwardRef } from "react";
import { FIG } from "./figure";

export type VolcanoLabels = { x: string; y: string; up: string; down: string; stat: string };
type Pt = [string, number, number, "up" | "down" | ""];

const W = 560, H = 420, L = 56, R = 18, T = 30, B = 54;

function ticks(lo: number, hi: number, n = 6) {
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(2)));
  return out;
}

export const Volcano = forwardRef<SVGSVGElement, { points: Pt[]; lfc: number; pCut: number | null; labels: VolcanoLabels; named?: number; highlight?: string[] }>(
  function Volcano({ points, lfc, pCut, labels, named = 12, highlight = [] }, ref) {
    const xs = points.map((p) => p[1]), ys = points.map((p) => p[2]);
    const xm = Math.max(lfc + 0.5, ...xs.map(Math.abs)) * 1.06;
    const ym = Math.max(2, ...ys) * 1.06;
    const PW = W - L - R, PH = H - T - B;
    const sx = (v: number) => L + ((v + xm) / (2 * xm)) * PW;
    const sy = (v: number) => T + (1 - v / ym) * PH;
    const col = (d: string) => (d === "up" ? FIG.high : d === "down" ? FIG.low : "#b9ae96");
    const sig = points.filter((p) => p[3]);
    const hl = new Set(highlight.map((g) => g.toUpperCase()));
    // Name the strongest genes on each side (by p, then fold change) and any project targets.
    const pick = (d: "up" | "down") => sig.filter((p) => p[3] === d).sort((a, b) => b[2] - a[2] || Math.abs(b[1]) - Math.abs(a[1])).slice(0, Math.ceil(named / 2));
    const toName = [...pick("up"), ...pick("down"), ...points.filter((p) => hl.has(p[0].toUpperCase()))];
    const seen = new Set<string>();
    const placed: { x: number; y: number }[] = [];
    const names = toName.filter((p) => !seen.has(p[0]) && seen.add(p[0])).map((p) => {
      let x = sx(p[1]) + (p[1] >= 0 ? 5 : -5), y = sy(p[2]) - 4;
      for (let i = 0; i < 8 && placed.some((q) => Math.abs(q.x - x) < 44 && Math.abs(q.y - y) < 11); i++) y += 11;
      placed.push({ x, y });
      x = Math.max(L + 4, Math.min(W - R - 4, x));
      return { p, x, y };
    });
    const order = [...points.filter((p) => !p[3]), ...sig];
    const r = points.length > 2500 ? 1.7 : 2.3;
    return (
      <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${labels.x} · ${labels.y}`} style={{ fontFamily: FIG.font }}>
        <rect width={W} height={H} fill="#ffffff" />
        {ticks(0, ym).map((v) => (
          <g key={`y${v}`}>
            <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke={FIG.grid} strokeDasharray="2 3" />
            <text x={L - 8} y={sy(v) + 4} fontSize={10.5} textAnchor="end" fill={FIG.muted} fontFamily={FIG.mono}>{v}</text>
          </g>
        ))}
        {ticks(-xm, xm).map((v) => (
          <g key={`x${v}`}>
            <line x1={sx(v)} x2={sx(v)} y1={T + PH} y2={T + PH + 4} stroke={FIG.muted} />
            <text x={sx(v)} y={T + PH + 17} fontSize={10.5} textAnchor="middle" fill={FIG.muted} fontFamily={FIG.mono}>{v}</text>
          </g>
        ))}
        <line x1={L} x2={L} y1={T} y2={T + PH} stroke={FIG.muted} />
        <line x1={L} x2={W - R} y1={T + PH} y2={T + PH} stroke={FIG.muted} />
        {[-lfc, lfc].map((v) => <line key={v} x1={sx(v)} x2={sx(v)} y1={T} y2={T + PH} stroke={FIG.muted} strokeDasharray="4 3" strokeOpacity={0.7} />)}
        {pCut != null && <line x1={L} x2={W - R} y1={sy(pCut)} y2={sy(pCut)} stroke={FIG.muted} strokeDasharray="4 3" strokeOpacity={0.7} />}
        {order.map((p, i) => <circle key={i} cx={sx(p[1])} cy={sy(Math.min(p[2], ym))} r={p[3] ? r + 0.4 : r} fill={col(p[3])} fillOpacity={p[3] ? 0.8 : 0.45} />)}
        {names.map(({ p, x, y }) => (
          <text key={p[0]} x={x} y={y} fontSize={10} fontStyle="italic" textAnchor={p[1] >= 0 ? "start" : "end"} fill={FIG.ink}
            stroke="#ffffff" strokeWidth={3} paintOrder="stroke">{p[0]}</text>
        ))}
        <text x={W - R - 4} y={T - 10} fontSize={11} textAnchor="end" fill={FIG.high} fontWeight={500}>{labels.up}</text>
        <text x={L + 4} y={T - 10} fontSize={11} fill={FIG.low} fontWeight={500}>{labels.down}</text>
        <text x={(L + W - R) / 2} y={H - 14} fontSize={11} textAnchor="middle" fill={FIG.ink}>{labels.x}</text>
        <text x={14} y={T + PH / 2} fontSize={11} textAnchor="middle" fill={FIG.ink} transform={`rotate(-90 14 ${T + PH / 2})`}>{labels.y}</text>
        <text x={(L + W - R) / 2} y={T - 10} fontSize={10.5} textAnchor="middle" fill={FIG.muted} fontFamily={FIG.mono}>{labels.stat}</text>
      </svg>
    );
  });
