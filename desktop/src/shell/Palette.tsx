// Command palette (design page 18, frame 18): genes, analyses and notebook entries in this project, glossary, actions.
import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { BookOpen, ChartSpline, FlaskConical, Globe, Keyboard, NotebookPen, Search, Settings2, SlidersHorizontal, Database, LifeBuoy } from "lucide-react";
import { useT, type Lang } from "../i18n";
import { api, type GeneCheck } from "../lib/api";
import { analyses, type Note } from "../lib/analyses";
import { TERMS, fold } from "../i18n/glossary";
import type { Screen } from "./Sidebar";

type Item = { group: string; icon: React.ReactNode; title: string; sub?: string; run: () => void };
export type PaletteActions = {
  projectOpen: boolean;
  go: (s: Screen) => void;
  openGene: (kind: "survival" | "expression", gene: string) => void;
  glossary: (id?: string) => void;
  lang: (l: Lang) => void;
  shortcuts: () => void;
  report: () => void;
};

export function Palette({ onClose, a }: { onClose: () => void; a: PaletteActions }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [gene, setGene] = useState<GeneCheck | null>(null);
  const [runs, setRuns] = useState<{ id: string; kind: string; params: { gene: string }; updated_at: string }[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!a.projectOpen) return;
    analyses.list().then((x) => setRuns(x as typeof runs)).catch(() => {});
    analyses.notes().then(setNotes).catch(() => {});
  }, [a.projectOpen]);
  useEffect(() => {
    const s = q.trim();
    if (!/^[A-Za-z0-9-]{2,15}$/.test(s)) { setGene(null); return; }
    const id = setTimeout(() => api.checkGene(s).then(setGene).catch(() => setGene(null)), 150);
    return () => clearTimeout(id);
  }, [q]);

  const items = useMemo<Item[]>(() => {
    const f = q.trim().toLowerCase();
    const out: Item[] = [];
    const done = (fn: () => void) => () => { onClose(); fn(); };
    const sym = gene && gene.status !== "unknown" ? gene.symbol! : null;
    if (sym && a.projectOpen) {
      out.push({ group: t("pal.genes"), icon: <FlaskConical size={16} />, title: sym, sub: `${gene!.name ?? ""}${gene!.status === "alias" ? ` · ${t("pal.alias", { q: q.trim() })}` : ""}`, run: done(() => a.openGene("survival", sym)) });
      out.push({ group: t("pal.withGene", { g: sym }), icon: <ChartSpline size={16} />, title: t("pal.survivalOf", { g: sym }), sub: t("pal.openOrRun"), run: done(() => a.openGene("survival", sym)) });
      out.push({ group: t("pal.withGene", { g: sym }), icon: <SlidersHorizontal size={16} />, title: t("pal.expressionOf", { g: sym }), sub: t("pal.openOrRun"), run: done(() => a.openGene("expression", sym)) });
    }
    if (f && a.projectOpen) {
      runs.filter((r) => r.params.gene.toLowerCase().includes(f)).slice(0, 4).forEach((r) => out.push({
        group: t("pal.analyses"), icon: r.kind === "survival" ? <ChartSpline size={16} /> : <SlidersHorizontal size={16} />,
        title: `${t(r.kind === "survival" ? "nav.survival" : "nav.expression")} · ${r.params.gene}`, sub: t("pal.saved", { d: r.updated_at.slice(0, 10) }),
        run: done(() => a.openGene(r.kind === "survival" ? "survival" : "expression", r.params.gene)),
      }));
      notes.filter((n) => [n.body.title, n.body.text, n.body.summary].filter(Boolean).join(" ").toLowerCase().includes(f)).slice(0, 3).forEach((n) => out.push({
        group: t("nav.notebook"), icon: <NotebookPen size={16} />, title: n.body.title ?? (n.body.text ?? "").slice(0, 60), sub: n.created_at.slice(0, 16).replace("T", " "), run: done(() => a.go("notebook")),
      }));
    }
    if (f) {
      const g = fold(q);
      TERMS.filter((x) => [x.en, x.zh, x.py, x.abbr ?? ""].some((s) => fold(s).includes(g))).slice(0, 3).forEach((x) => out.push({
        group: t("gl.title"), icon: <BookOpen size={16} />, title: `${x.en} · ${x.zh}`, sub: x.py, run: done(() => a.glossary(x.id)),
      }));
    }
    const actions: Item[] = [
      ...(a.projectOpen ? [
        { group: t("pal.actions"), icon: <ChartSpline size={16} />, title: t("nav.survival"), run: done(() => a.go("survival")) },
        { group: t("pal.actions"), icon: <SlidersHorizontal size={16} />, title: t("nav.expression"), run: done(() => a.go("expression")) },
        { group: t("pal.actions"), icon: <NotebookPen size={16} />, title: t("nav.notebook"), run: done(() => a.go("notebook")) },
        { group: t("pal.actions"), icon: <Database size={16} />, title: t("nav.data"), run: done(() => a.go("data")) },
      ] : []),
      { group: t("pal.actions"), icon: <BookOpen size={16} />, title: t("gl.title"), run: done(() => a.glossary()) },
      { group: t("pal.actions"), icon: <Keyboard size={16} />, title: t("help.shortcuts"), run: done(a.shortcuts) },
      { group: t("pal.actions"), icon: <LifeBuoy size={16} />, title: t("help.report"), run: done(a.report) },
      { group: t("pal.actions"), icon: <Settings2 size={16} />, title: t("settings.title"), run: done(() => a.go("settings")) },
      ...(["en", "zh", "bi"] as Lang[]).map((l) => ({ group: t("pal.actions"), icon: <Globe size={16} />, title: `${t("pal.language")}: ${t(`lang.${l}`)}`, run: done(() => a.lang(l)) })),
    ];
    out.push(...actions.filter((x) => !f || x.title.toLowerCase().includes(f)));
    return out;
  }, [q, gene, runs, notes, a, t, onClose]);

  useEffect(() => setSel(0), [q, gene]);
  useEffect(() => { listRef.current?.querySelector(".pal-item.on")?.scrollIntoView({ block: "nearest" }); }, [sel]);
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter" && !e.nativeEvent.isComposing) items[sel]?.run();
  };

  let last = "";
  return (
    <div className="scrim top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t("app.search")}>
        <div className="pal-input"><Search size={17} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder={t("app.search")} /><kbd className="kbd">Esc</kbd></div>
        <div className="pal-list" ref={listRef}>
          {items.length === 0 && <div className="side-empty">{t("pal.none")}</div>}
          {items.map((it, i) => {
            const head = it.group !== last ? <div className="pal-group">{(last = it.group)}</div> : null;
            return (
              <div key={i}>
                {head}
                <button className={`pal-item ${i === sel ? "on" : ""}`} onMouseEnter={() => setSel(i)} onClick={it.run}>
                  {it.icon}<span className="grow"><b>{it.title}</b>{it.sub && <span className="small muted">{it.sub}</span>}</span>{i === sel && <kbd className="kbd">Enter</kbd>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="pal-foot mono small">{t("pal.foot")}</div>
      </div>
    </div>
  );
}
