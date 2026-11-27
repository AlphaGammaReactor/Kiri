// Shows a figure as large as the card allows, with zoom, pan and a full-window view.
// Only the on-screen size changes: the SVG keeps its width/height attributes, which set the
// exported size (PNG at print resolution, SVG), so exports look the same at any zoom.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2, Minus, Plus, Scan } from "lucide-react";
import { useT } from "../i18n";

const STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
const MAX_FIT = 2.5; // a figure fills the card, but text never grows past 2.5× its print size
const PAD = 16;
const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

export function FigureViewer({ children }: { children: ReactNode }) {
  const { t } = useT();
  const scroller = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [full, setFull] = useState(false);
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);

  const svg = () => scroller.current?.querySelector("svg") ?? null;
  const natural = () => {
    const s = svg();
    if (!s) return null;
    const w = Number(s.getAttribute("width")) || s.viewBox.baseVal?.width || 0;
    const h = Number(s.getAttribute("height")) || s.viewBox.baseVal?.height || 0;
    return w && h ? { w, h } : null;
  };
  const measureFit = useCallback(() => {
    const el = scroller.current, n = natural();
    if (!el || !n) return 1;
    const s = Math.min((el.clientWidth - PAD * 2) / n.w, (el.clientHeight - PAD * 2) / n.h, MAX_FIT);
    return Math.max(0.1, s);
  }, []);

  const scale = fit ? fitScale : zoom;

  // Size the SVG on screen after every render (a new result brings a new SVG).
  useLayoutEffect(() => {
    const s = svg(), n = natural();
    if (!s || !n) return;
    s.style.width = `${Math.round(n.w * scale)}px`;
    s.style.height = `${Math.round(n.h * scale)}px`;
  });
  // Recompute the fit when the card or the window changes size, or the figure changes.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setFitScale(measureFit());
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["width", "height", "viewBox"] });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [measureFit, full]);

  // Zoom keeping the point under the cursor (or the centre) in place.
  const zoomTo = useCallback((next: number, at?: { x: number; y: number }) => {
    const el = scroller.current;
    const from = fit ? fitScale : zoom;
    next = Math.min(5, Math.max(0.25, next));
    setFit(false);
    setZoom(next);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = at ? at.x - r.left : el.clientWidth / 2, py = at ? at.y - r.top : el.clientHeight / 2;
    const cx = el.scrollLeft + px, cy = el.scrollTop + py;
    requestAnimationFrame(() => {
      el.scrollLeft = (cx * next) / from - px;
      el.scrollTop = (cy * next) / from - py;
    });
  }, [fit, fitScale, zoom]);
  const step = (dir: 1 | -1) => {
    const cur = scale;
    const next = dir > 0 ? STEPS.find((s) => s > cur + 0.001) ?? 5 : [...STEPS].reverse().find((s) => s < cur - 0.001) ?? 0.25;
    zoomTo(next);
  };

  // Pinch on a trackpad arrives as ctrl+wheel; ⌘/Ctrl + wheel zooms too. Plain wheel scrolls.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomTo((fit ? fitScale : zoom) * Math.exp(-e.deltaY * 0.01), { x: e.clientX, y: e.clientY });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo, fit, fitScale, zoom]);

  // Full window: the whole figure card covers the app; Esc or the button brings it back.
  useEffect(() => {
    const card = scroller.current?.closest(".ws-fig");
    card?.classList.toggle("fig-full", full);
    document.body.classList.toggle("has-fig-full", full);
    if (!full) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); card?.classList.remove("fig-full"); document.body.classList.remove("has-fig-full"); };
  }, [full]);
  useEffect(() => { setFit(true); }, [full]);

  const el = scroller.current;
  const pannable = !!el && !fit && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
  const hint = t("fig.zoomHint", { k: isMac ? "⌘" : "Ctrl" });

  return (
    <div className="fig-canvas fig-viewer">
      <div ref={scroller} className={`fig-scroll ${pannable ? "pannable" : ""} ${drag.current ? "dragging" : ""}`}
        onDoubleClick={(e) => { if (fit) zoomTo(1, { x: e.clientX, y: e.clientY }); else setFit(true); }}
        onPointerDown={(e) => {
          if (!pannable || e.button !== 0 || !scroller.current) return;
          drag.current = { x: e.clientX, y: e.clientY, l: scroller.current.scrollLeft, t: scroller.current.scrollTop };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current, s = scroller.current;
          if (!d || !s) return;
          s.scrollLeft = d.l - (e.clientX - d.x);
          s.scrollTop = d.t - (e.clientY - d.y);
        }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <div className="fig-stage">{children}</div>
      </div>
      <div className="fig-zoom" role="toolbar" aria-label={hint}>
        <button className="zbtn" onClick={() => step(-1)} title={t("fig.zoomOut")} aria-label={t("fig.zoomOut")}><Minus size={14} /></button>
        <button className="zbtn zpct mono" onClick={() => zoomTo(1)} title={`${t("fig.actual")} · ${hint}`}>{Math.round(scale * 100)}%</button>
        <button className="zbtn" onClick={() => step(1)} title={t("fig.zoomIn")} aria-label={t("fig.zoomIn")}><Plus size={14} /></button>
        <span className="zsep" />
        <button className={`zbtn ${fit ? "on" : ""}`} onClick={() => setFit(true)} title={t("fig.fit")} aria-label={t("fig.fit")} aria-pressed={fit}><Scan size={14} /></button>
        <button className="zbtn" onClick={() => setFull((v) => !v)} title={full ? t("fig.exitFull") : t("fig.full")} aria-label={full ? t("fig.exitFull") : t("fig.full")}>
          {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
    </div>
  );
}
