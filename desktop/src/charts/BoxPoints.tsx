// Box plot with every sample as a point (jittered), for comparing groups of expression values.
import { forwardRef } from "react";
import type { Group } from "../lib/analyses";
import { FIG } from "./figure";

export type BoxLabels = { yTitle: string; group: (key: string) => string; stat: string; brackets?: { a: string; b: string; text: string }[] };

const H = 360, L = 52, R = 16, T = 30, PH = 250;

function jitter(i: number) { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x) - 0.5; }

export const BoxPoints = forwardRef<SVGSVGElement, { groups: Group[]; labels: BoxLabels; colors: (key: string) => string; showPoints: boolean }>(
  function BoxPoints({ groups, labels, colors, showPoints }, ref) {
    const W = Math.max(360, Math.min(560, L + R + groups.length * 120));
    const all = groups.flatMap((g) => g.values);
    const lo = Math.floor(Math.min(0, ...all)), hi = Math.ceil(Math.max(...all) + 0.5 + (labels.brackets?.length ?? 0) * 0.6);
    const sy = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * PH;
    const step = (W - L - R) / groups.length;
    const cx = (i: number) => L + step * (i + 0.5);
    const bw = Math.min(46, step * 0.45);
    const yt: number[] = [];
    const inc = hi - lo > 8 ? 2 : 1;
    for (let v = lo; v <= hi; v += inc) yt.push(v);
    const idx = (k: string) => groups.findIndex((g) => g.key === k);
    return (
      <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labels.yTitle} style={{ fontFamily: FIG.font }}>
        <rect width={W} height={H} fill="#ffffff" />
        <text x={L - 12} y={T - 14} fontSize={11} fill={FIG.ink}>{labels.yTitle}</text>
        {yt.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke={FIG.grid} strokeDasharray={v === lo ? undefined : "2 3"} />
            <text x={L - 8} y={sy(v) + 4} fontSize={10.5} textAnchor="end" fill={FIG.muted} fontFamily={FIG.mono}>{v}</text>
          </g>
        ))}
        <line x1={L} x2={L} y1={T} y2={T + PH} stroke={FIG.muted} />
        {groups.map((g, i) => {
          const c = colors(g.key);
          const iqr = g.q3 - g.q1;
          const vs = g.values;
          const wlo = Math.min(...vs.filter((v) => v >= g.q1 - 1.5 * iqr)), whi = Math.max(...vs.filter((v) => v <= g.q3 + 1.5 * iqr));
          return (
            <g key={g.key}>
              <line x1={cx(i)} x2={cx(i)} y1={sy(whi)} y2={sy(g.q3)} stroke={c} />
              <line x1={cx(i)} x2={cx(i)} y1={sy(g.q1)} y2={sy(wlo)} stroke={c} />
              <rect x={cx(i) - bw / 2} y={sy(g.q3)} width={bw} height={Math.max(1, sy(g.q1) - sy(g.q3))} fill={c} fillOpacity={0.16} stroke={c} />
              <line x1={cx(i) - bw / 2} x2={cx(i) + bw / 2} y1={sy(g.median)} y2={sy(g.median)} stroke={c} strokeWidth={2} />
              {showPoints && vs.map((v, j) => (
                <circle key={j} cx={cx(i) + jitter(j + i * 997) * bw * 0.9} cy={sy(v)} r={vs.length > 400 ? 1.3 : 1.9} fill={c} fillOpacity={0.55} />
              ))}
              <text x={cx(i)} y={T + PH + 16} fontSize={11} textAnchor="middle" fill={FIG.ink}>{labels.group(g.key)}</text>
              <text x={cx(i)} y={T + PH + 30} fontSize={10} textAnchor="middle" fill={FIG.muted} fontFamily={FIG.mono}>n = {g.n}</text>
            </g>
          );
        })}
        {labels.brackets?.map((b, k) => {
          const i = idx(b.a), j = idx(b.b);
          if (i < 0 || j < 0) return null;
          const y = sy(Math.max(...groups[i].values, ...groups[j].values)) - 10 - k * 16;
          return (
            <g key={k}>
              <path d={`M${cx(i)},${y + 5}V${y}H${cx(j)}V${y + 5}`} fill="none" stroke={FIG.muted} />
              <text x={(cx(i) + cx(j)) / 2} y={y - 4} fontSize={10.5} textAnchor="middle" fill={FIG.ink} fontFamily={FIG.mono}>{b.text}</text>
            </g>
          );
        })}
        <text x={L} y={H - 8} fontSize={10.5} fill={FIG.muted} fontFamily={FIG.mono}>{labels.stat}</text>
      </svg>
    );
  });
