// Protein map: the protein as a line from residue 1 to its length, with UniProt domains,
// transmembrane segments, signal/transit peptides and active sites, and below it the AlphaFold
// per-residue confidence (pLDDT) in the AlphaFold DB colour bands.
import { forwardRef } from "react";
import { FIG } from "./figure";

export type ProtFeature = { kind: string; start: number; end: number; label: string };
export type ProtLabels = { title: string; residues: string; plddt: string; bands: [string, string, string, string]; tm: string; signal: string; site: string; noModel: string };

const W = 680, L = 56, R = 20;
const AF = ["#0053D6", "#65CBF3", "#FFDB13", "#FF7D45"]; // AlphaFold DB: very high, confident, low, very low
const DOMAIN = ["#e9d8c4", "#d5e3ef", "#e4ead5", "#efdce6", "#efe6c8"];

export const ProteinMap = forwardRef<SVGSVGElement, { length: number; features: ProtFeature[]; plddt: number[]; labels: ProtLabels }>(
  function ProteinMap({ length, features, plddt, labels }, ref) {
    const PW = W - L - R;
    const sx = (v: number) => L + ((v - 1) / Math.max(1, length - 1)) * PW;
    const domains = features.filter((f) => f.kind === "domain" || f.kind === "region" || f.kind === "coil");
    const tms = features.filter((f) => f.kind === "tm" || f.kind === "intramem");
    const sig = features.filter((f) => f.kind === "signal" || f.kind === "transit");
    const sites = features.filter((f) => f.kind === "site" || f.kind === "motif");
    // stack overlapping domain labels on two rows
    const rows: number[] = []; const lastEnd = [-1e9, -1e9];
    domains.forEach((d) => { const r = sx(d.start) > lastEnd[0] + 4 ? 0 : 1; rows.push(r); lastEnd[r] = sx(d.start) + Math.max(sx(d.end) - sx(d.start), d.label.length * 5.6); });
    const TY = 70, AY = 150, AH = 70;
    const H = plddt.length ? AY + AH + 64 : TY + 70;
    const step = length > 1500 ? 250 : length > 600 ? 100 : length > 250 ? 50 : 25;
    const ticks: number[] = [1]; for (let v = step; v < length; v += step) ticks.push(v); ticks.push(length);
    const band = (v: number) => (v > 90 ? AF[0] : v > 70 ? AF[1] : v > 50 ? AF[2] : AF[3]);
    const bw = PW / Math.max(1, plddt.length);
    return (
      <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labels.title} style={{ fontFamily: FIG.font }}>
        <rect width={W} height={H} fill="#ffffff" />
        <text x={L} y={20} fontSize={12} fill={FIG.ink} fontWeight={600}>{labels.title}</text>
        {domains.map((d, i) => (
          <text key={`dl${i}`} x={sx(d.start)} y={TY - 16 - rows[i] * 12} fontSize={10} fill={FIG.ink}>{d.label}</text>
        ))}
        <line x1={sx(1)} x2={sx(length)} y1={TY} y2={TY} stroke={FIG.muted} strokeWidth={3} strokeLinecap="round" />
        {sig.map((f, i) => <rect key={`s${i}`} x={sx(f.start)} y={TY - 5} width={Math.max(2, sx(f.end) - sx(f.start))} height={10} fill="#7aa66a" />)}
        {domains.map((d, i) => <rect key={`d${i}`} x={sx(d.start)} y={TY - 11} width={Math.max(3, sx(d.end) - sx(d.start))} height={22} rx={4} fill={DOMAIN[i % DOMAIN.length]} stroke={FIG.ink} strokeWidth={0.8} />)}
        {tms.map((f, i) => <rect key={`t${i}`} x={sx(f.start)} y={TY - 14} width={Math.max(2, sx(f.end) - sx(f.start))} height={28} fill={FIG.ink} />)}
        {sites.map((f, i) => <path key={`a${i}`} d={`M ${sx(f.start)} ${TY + 16} l -4 7 l 8 0 z`} fill={FIG.high} />)}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={sx(v)} x2={sx(v)} y1={TY + 26} y2={TY + 30} stroke={FIG.muted} />
            <text x={sx(v)} y={TY + 41} fontSize={9.5} textAnchor="middle" fill={FIG.muted} fontFamily={FIG.mono}>{v}</text>
          </g>
        ))}
        <g transform={`translate(${L} ${TY + 54})`}>
          <rect x={0} y={-8} width={8} height={10} fill={FIG.ink} /><text x={12} y={1} fontSize={10} fill={FIG.ink}>{labels.tm}</text>
          <rect x={150} y={-6} width={12} height={7} fill="#7aa66a" /><text x={166} y={1} fontSize={10} fill={FIG.ink}>{labels.signal}</text>
          <path d="M 314 -6 l -4 7 l 8 0 z" fill={FIG.high} /><text x={322} y={1} fontSize={10} fill={FIG.ink}>{labels.site}</text>
        </g>
        {plddt.length ? (
          <>
            {[50, 70, 90].map((v) => <line key={v} x1={L} x2={W - R} y1={AY + AH - (v / 100) * AH} y2={AY + AH - (v / 100) * AH} stroke={FIG.grid} strokeDasharray="2 3" />)}
            {[0, 50, 100].map((v) => <text key={v} x={L - 6} y={AY + AH - (v / 100) * AH + 3} fontSize={9.5} textAnchor="end" fill={FIG.muted} fontFamily={FIG.mono}>{v}</text>)}
            {plddt.map((v, i) => <rect key={i} x={L + i * bw} y={AY + AH - (v / 100) * AH} width={Math.max(0.6, bw)} height={(v / 100) * AH} fill={band(v)} />)}
            <text x={14} y={AY + AH / 2} fontSize={10} fill={FIG.ink} transform={`rotate(-90 14 ${AY + AH / 2})`} textAnchor="middle">{labels.plddt}</text>
            <g transform={`translate(${L} ${AY + AH + 22})`}>
              {labels.bands.map((b, i) => (
                <g key={b} transform={`translate(${i * 150} 0)`}><rect x={0} y={-8} width={10} height={10} fill={AF[i]} /><text x={14} y={1} fontSize={10} fill={FIG.ink}>{b}</text></g>
              ))}
            </g>
            <text x={L + PW / 2} y={H - 8} fontSize={11} textAnchor="middle" fill={FIG.ink}>{labels.residues}</text>
          </>
        ) : (
          <text x={L} y={TY + 70} fontSize={10.5} fill={FIG.muted}>{labels.noModel}</text>
        )}
      </svg>
    );
  });
