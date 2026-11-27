// Figure board: lays saved figures out as one multi-panel figure at a journal's column width.
// One unit of the board is one point, so the SVG doubles as the print layout: the vector PDF is drawn
// from it unchanged, and the smallest text size can be checked in points.
import { analyses, type BoardSpec } from "../lib/analyses";
import type { StringKey } from "../i18n/strings";

type TFn = (k: StringKey, v?: Record<string, string | number>) => string;

export const WIDTH_MM: Record<BoardSpec["width"], number> = { single: 89, onehalf: 120, double: 183 };
const PT_PER_MM = 72 / 25.4;
const GAP = 12, LETTER_PT = 10, LETTER_BAND = 13;

export type BoardPanel = { svg: string | null; label: string };
export type BoardLayout = { svg: string; width: number; height: number; minPt: number | null; scales: number[] };

export const letterOf = (i: number, style: BoardSpec["letters"]) =>
  style === "none" ? "" : style === "lower" ? String.fromCharCode(97 + i) : String.fromCharCode(65 + i);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function size(svg: string): [number, number] {
  const vb = svg.match(/viewBox="[-0-9.]+ [-0-9.]+ ([0-9.]+) ([0-9.]+)"/);
  if (vb) return [Number(vb[1]), Number(vb[2])];
  const w = svg.match(/\bwidth="([0-9.]+)/), h = svg.match(/\bheight="([0-9.]+)/);
  return [w ? Number(w[1]) : 500, h ? Number(h[1]) : 400];
}

/** The inside of one figure, ready to drop into the board: shared font, no text under the target size
 *  once scaled, and ids made unique so two panels cannot clash. */
function inner(svg: string, k: number, s: number, spec: BoardSpec): { body: string; minPt: number | null } {
  const body0 = svg.split("?>").pop()!.trim().replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const fam = `${spec.font}, Helvetica, PingFang SC, sans-serif`;
  const floor = spec.size / s;
  let minPt: number | null = null;
  const raise = (v: string) => { const f = Math.max(Number(v), floor); minPt = Math.min(minPt ?? Infinity, f * s); return f.toFixed(2); };
  const body = body0
    .replace(/font-family="[^"]*"/g, `font-family="${fam}"`)
    .replace(/font-family:[^;"]*/g, `font-family:${fam}`)
    .replace(/font-size="([0-9.]+)"/g, (_, v) => `font-size="${raise(v)}"`)
    .replace(/font-size:\s*([0-9.]+)(px)?/g, (_, v) => `font-size:${raise(v)}px`)
    .replace(/\bid="([^"]+)"/g, `id="p${k}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#p${k}-$1)`);
  // Text without its own size inherits the chart's default (16 px in browsers); give it one.
  return { body: `<g font-family="${fam}" font-size="${Math.max(11, floor).toFixed(2)}">${body}</g>`, minPt };
}

export function layoutBoard(panels: BoardPanel[], spec: BoardSpec, missing: string): BoardLayout {
  const W = Math.round(WIDTH_MM[spec.width] * PT_PER_MM * 10) / 10;
  const cols = Math.max(1, Math.min(spec.cols, panels.length || 1));
  const cellW = (W - (cols - 1) * GAP) / cols;
  const band = spec.letters === "none" ? 0 : LETTER_BAND;
  const parts: string[] = [];
  const scales: number[] = [];
  let y = 0, minPt: number | null = null;
  for (let r = 0; r * cols < panels.length; r++) {
    const row = panels.slice(r * cols, r * cols + cols).map((p) => {
      if (!p.svg) return { p, w: 0, h: cellW * 0.45, s: 1 };
      const [w, h] = size(p.svg); const s = cellW / w;
      return { p, w, h: h * s, s };
    });
    const rowH = Math.max(...row.map((c) => c.h));
    row.forEach((c, j) => {
      const i = r * cols + j, x = j * (cellW + GAP);
      const dy = spec.align === "top" ? 0 : spec.align === "centre" ? (rowH - c.h) / 2 : rowH - c.h;
      const letter = letterOf(i, spec.letters);
      if (letter) parts.push(`<text x="${x.toFixed(2)}" y="${(y + LETTER_PT).toFixed(2)}" font-family="${spec.font}, Helvetica, sans-serif" font-size="${LETTER_PT}" font-weight="700" fill="#1e1c18">${letter}</text>`);
      const top = y + band + dy;
      scales.push(c.s);
      if (c.p.svg) {
        const { body, minPt: m } = inner(c.p.svg, i, c.s, spec);
        if (m != null) minPt = Math.min(minPt ?? Infinity, m);
        parts.push(`<g transform="translate(${x.toFixed(2)} ${top.toFixed(2)}) scale(${c.s.toFixed(5)})">${body}</g>`);
      } else {
        parts.push(`<rect x="${x.toFixed(2)}" y="${top.toFixed(2)}" width="${cellW.toFixed(2)}" height="${c.h.toFixed(2)}" fill="none" stroke="#c9bfa9" stroke-dasharray="3 3"/>`,
          `<text x="${(x + cellW / 2).toFixed(2)}" y="${(top + c.h / 2).toFixed(2)}" text-anchor="middle" font-family="${spec.font}, sans-serif" font-size="${spec.size}" fill="#57514a">${esc(missing)}</text>`);
      }
    });
    y += band + rowH + GAP;
  }
  const H = Math.max(40, Math.round((y - GAP) * 10) / 10);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>${parts.join("")}</svg>`;
  return { svg, width: W, height: H, minPt, scales };
}

export function addToBoard(analysisId: string, t: TFn): Promise<string> {
  // The figure toolbar's "Add to figure board": the newest board, or a new one if there is none.
  return (async () => {
    const list = await analyses.boards();
    let b = list[list.length - 1] ?? await analyses.createBoard({ title: t("board.defaultTitle", { n: 1 }) });
    if (b.panels.includes(analysisId)) return t("board.already", { b: b.title, l: letterOf(b.panels.indexOf(analysisId), "upper") || String(b.panels.indexOf(analysisId) + 1) });
    if (b.panels.length >= 12) return t("board.full", { b: b.title });
    b = await analyses.saveBoard({ ...b, panels: [...b.panels, analysisId] });
    return t("board.added", { b: b.title, l: letterOf(b.panels.length - 1, "upper") });
  })();
}
