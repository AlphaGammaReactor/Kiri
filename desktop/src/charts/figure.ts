// Turning an on-screen SVG figure into files: SVG text, PNG at print resolution, clipboard.
export function svgText(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.querySelectorAll("[data-screen-only]").forEach((n) => n.remove());
  // The on-screen zoom sets a CSS size; files keep the figure's own width and height.
  clone.style.removeProperty("width");
  clone.style.removeProperty("height");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

export async function pngBytes(svg: SVGSVGElement, scale = 4): Promise<Uint8Array> {
  const w = Number(svg.getAttribute("width")) || svg.viewBox.baseVal.width;
  const h = Number(svg.getAttribute("height")) || svg.viewBox.baseVal.height;
  const url = URL.createObjectURL(new Blob([svgText(svg)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("render")); img.src = url; });
    const c = document.createElement("canvas");
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("png"))), "image/png"));
    return new Uint8Array(await blob.arrayBuffer());
  } finally { URL.revokeObjectURL(url); }
}

export async function copyPng(svg: SVGSVGElement): Promise<boolean> {
  try {
    const bytes = await pngBytes(svg, 3);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([bytes as BlobPart], { type: "image/png" }) })]);
    return true;
  } catch { return false; }
}

// Figure palette: colour-blind safe pair (vermillion / blue), same in both themes, as in the design.
export const FIG = {
  high: "#c8641a", low: "#2a6fa8", ink: "#1e1c18", muted: "#57514a", grid: "#ddd5c3", tumour: "#c8641a", normal: "#2a6fa8",
  font: "IBM Plex Sans, Helvetica, Arial, PingFang SC, sans-serif", mono: "IBM Plex Mono, Menlo, monospace",
};
