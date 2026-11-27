// Coach marks for a running tutorial (page 11 of the design): a ring around the real control and a
// card beside it. The dimming never blocks the app, so the person does each step themselves.
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import type { StringKey } from "../i18n/strings";
import { tutorial, type TutId } from "../lib/tutorials";
import type { Screen } from "./Sidebar";

type Rect = { x: number; y: number; w: number; h: number };
const CARD_W = 320, PAD = 6, GAP = 14;

export function Tour({ id, step, onStep, onClose, onDone, onNav }: {
  id: TutId; step: number; onStep: (n: number) => void; onClose: () => void; onDone: () => void; onNav: (s: Screen) => void;
}) {
  const { t } = useT();
  const tut = tutorial(id)!;
  const s = tut.steps[step];
  const last = step === tut.steps.length - 1;
  const [rect, setRect] = useState<Rect | null>(null);
  const [met, setMet] = useState(!s.wait && !s.click);
  const card = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(200);
  const k = (f: "t" | "b") => t(`tut.${id}.${step + 1}.${f}` as StringKey);

  const next = () => (last ? onDone() : onStep(step + 1));
  const nextRef = useRef(next); nextRef.current = next;

  useEffect(() => { if (s.screen) onNav(s.screen); }, [id, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the target, and notice when a waiting step's condition is met.
  useEffect(() => {
    const waited = s.wait ? !!document.querySelector(s.wait) : false;
    setMet(!s.wait && !s.click ? true : waited && !s.click);
    let wasMet = waited, missing = 0;
    const tick = () => {
      const el = s.target ? document.querySelector(s.target) : null;
      const r = el?.getBoundingClientRect();
      setRect(r && r.width > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null);
      // The person went ahead of the tutorial (e.g. imported before being asked): catch up with them.
      if (s.target && !el && !s.screen) {
        if (++missing >= 6) {
          const ahead = tut.steps.findIndex((x, i) => i > step && !!x.target && !!document.querySelector(x.target));
          if (ahead > 0) { onStep(ahead); return; }
        }
      } else missing = 0;
      if (s.wait) {
        const now = !!document.querySelector(s.wait);
        if (now && !wasMet) setTimeout(() => nextRef.current(), 600);  // done just now (a re-run counts too)
        if (now) setMet(true);
        wasMet = now;
      }
    };
    tick();
    const iv = window.setInterval(tick, 250);
    const onClick = (e: MouseEvent) => {
      if (s.click && s.target && (e.target as Element)?.closest?.(s.target)) setTimeout(() => nextRef.current(), 400);
    };
    document.addEventListener("click", onClick, true);
    return () => { clearInterval(iv); document.removeEventListener("click", onClick, true); };
  }, [id, step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (card.current) setCardH(card.current.offsetHeight); });

  // Place the card beside the target: right, left, below, above, or in the middle if there is none.
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = (vw - CARD_W) / 2, top = (vh - cardH) / 2;
  if (rect) {
    const cy = Math.min(Math.max(12, rect.y + rect.h / 2 - cardH / 2), vh - cardH - 12);
    if (rect.x + rect.w + GAP + CARD_W < vw - 8) { left = rect.x + rect.w + GAP; top = cy; }
    else if (rect.x - GAP - CARD_W > 8) { left = rect.x - GAP - CARD_W; top = cy; }
    else if (rect.y + rect.h + GAP + cardH < vh - 8) { top = rect.y + rect.h + GAP; left = Math.min(Math.max(12, rect.x), vw - CARD_W - 12); }
    else { top = Math.max(12, rect.y - GAP - cardH); left = Math.min(Math.max(12, rect.x), vw - CARD_W - 12); }
  }
  const hint = !met ? t(s.click ? "tour.doClick" : "tour.doWait") : "";

  return (
    <div className="tour" aria-live="polite">
      {rect ? <div className="tour-ring" style={{ left: rect.x - PAD, top: rect.y - PAD, width: rect.w + PAD * 2, height: rect.h + PAD * 2 }} />
        : <div className="tour-dim" />}
      <div ref={card} className="tour-card" role="dialog" aria-label={k("t")} style={{ left, top, width: CARD_W }}>
        <div className="row-between">
          <span className="eyebrow">{t("tour.step", { n: step + 1, m: tut.steps.length })}</span>
          <button className="link small" onClick={onClose}>{t("tour.leave")}</button>
        </div>
        <h3 className="tour-title">{k("t")}</h3>
        <p className="tour-body">{k("b")}</p>
        {hint && <p className="tour-hint small">{hint}</p>}
        <div className="row-between tour-foot">
          <span className="tour-dots" aria-hidden>{tut.steps.map((_, i) => <i key={i} className={i <= step ? "on" : ""} />)}</span>
          <span className="row-gap">
            {step > 0 && <button className="btn ghost sm" onClick={() => onStep(step - 1)}>{t("tour.back")}</button>}
            <button className="btn primary sm" onClick={next} disabled={!met}>{last ? t("tour.finish") : t("tour.next")}</button>
          </span>
        </div>
      </div>
    </div>
  );
}
