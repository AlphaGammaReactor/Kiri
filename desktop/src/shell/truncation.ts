// App-wide button rule: labels stay on one line and end in "…" when there is no room. Hovering (or
// focusing) a cut-off control shows its whole name, so nothing is hidden for good.
const SEL = "button, .btn, [role=tab], [role=menuitem], .nav-item, .badge, a";

function reveal(e: Event) {
  const el = (e.target as Element | null)?.closest?.(SEL) as HTMLElement | null;
  if (!el) return;
  const cut = [el, ...Array.from(el.querySelectorAll<HTMLElement>(".run-label, .btn-label"))].some((x) => x.scrollWidth > x.clientWidth + 1);
  if (cut && !el.title) { el.title = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim(); el.dataset.autoTitle = ""; }
  else if (!cut && el.dataset.autoTitle !== undefined) { el.removeAttribute("title"); delete el.dataset.autoTitle; }
}

export function installTruncationTitles() {
  document.addEventListener("mouseover", reveal, true);
  document.addEventListener("focusin", reveal, true);
}
