// Scatter plot of two genes, one point per patient, with the least-squares line and the statistics line.
import { forwardRef } from "react";
import { FIG } from "./figure";

export type ScatterLabels = { x: string; y: string; stat: string; n: string };

const W = 520, H = 400, L = 56, R = 18, T = 26, B = 54;

function ticks(lo: number, hi: number) {
  const span = hi - lo, step = span > 8 ? 2 : span > 4 ? 1 : 0.5;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(2)));
  return out;
}

export const Scatter = forwardRef<SVGSVGElement, { points: [number, number][]; line: { slope: number; intercept: number }; labels: ScatterLabels }>(
  function Scatter({ points, line, labels }, ref) {
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const pad = (a: number, b: number) => { const d = (b - a) * 0.06 || 0.5; return [a - d, b + d]; };
    const [x0, x1] = pad(Math.min(...xs), Math.max(...xs)), [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
    const PW = W - L - R, PH = H - T - B;
    const sx = (v: number) => L + ((v - x0) / (x1 - x0)) * PW;
    const sy = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * PH;
    const clampY = (v: number) => Math.max(y0, Math.min(y1, v));
    const r = points.length > 600 ? 2 : 2.6;
    return (
      <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${labels.x} · ${labels.y}`} style={{ fontFamily: FIG.font }}>
        <rect width={W} height={H} fill="#ffffff" />
        {ticks(y0, y1).map((v) => (
          <g key={`y${v}`}>
            <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke={FIG.grid} strokeDasharray="2 3" />
            <text x={L - 8} y={sy(v) + 4} fontSize={10.5} textAnchor="end" fill={FIG.muted} fontFamily={FIG.mono}>{v}</text>
          </g>
        ))}
        {ticks(x0, x1).map((v) => (
          <g key={`x${v}`}>
            <line x1={sx(v)} x2={sx(v)} y1={T + PH} y2={T + PH + 4} stroke={FIG.muted} />
            <text x={sx(v)} y={T + PH + 17} fontSize={10.5} textAnchor="middle" fill={FIG.muted} fontFamily={FIG.mono}>{v}</text>
          </g>
        ))}
        <line x1={L} x2={L} y1={T} y2={T + PH} stroke={FIG.muted} />
        <line x1={L} x2={W - R} y1={T + PH} y2={T + PH} stroke={FIG.muted} />
        {points.map((p, i) => <circle key={i} cx={sx(p[0])} cy={sy(p[1])} r={r} fill={FIG.low} fillOpacity={0.45} />)}
        <line x1={sx(x0)} y1={sy(clampY(line.intercept + line.slope * x0))} x2={sx(x1)} y2={sy(clampY(line.intercept + line.slope * x1))} stroke={FIG.high} strokeWidth={1.8} />
        <text x={(L + W - R) / 2} y={H - 14} fontSize={11} textAnchor="middle" fill={FIG.ink}>{labels.x}</text>
        <text x={14} y={T + PH / 2} fontSize={11} textAnchor="middle" fill={FIG.ink} transform={`rotate(-90 14 ${T + PH / 2})`}>{labels.y}</text>
        <rect x={L + 8} y={T + 4} width={Math.max(labels.stat.length, labels.n.length) * 6.4 + 12} height={36} fill="#ffffff" fillOpacity={0.85} />
        <text x={L + 14} y={T + 18} fontSize={11} fill={FIG.muted} fontFamily={FIG.mono}>{labels.stat}</text>
        <text x={L + 14} y={T + 33} fontSize={11} fill={FIG.muted} fontFamily={FIG.mono}>{labels.n}</text>
      </svg>
    );
  });
