// Figure board: arrange figures from several analyses into one multi-panel figure at a journal's
// column width, with one font and lettered panels (page 16 of the design). Panels stay linked to their
// analyses, so re-running an analysis updates its panel here.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, NotebookPen, Plus, ShieldCheck, Trash2, TriangleAlert, X } from "lucide-react";
import { useT } from "../i18n";
import type { StringKey } from "../i18n/strings";
import type { ProjectSummary } from "../lib/api";
import { analyses, type Analysis, type Board as BoardT, type BoardSpec, type Check } from "../lib/analyses";
import { pickExportPath } from "../lib/files";
import { progress } from "../lib/progress";
import { panelFor } from "../charts/panels";
import { layoutBoard, letterOf, WIDTH_MM } from "../charts/board";
import { svgDataUrl } from "../charts/figure";
import type { FigLang } from "../charts/figStrings";
import { Dialog } from "../shell/Dialog";
import { Param } from "./workspace/Frame";

type Row = Awaited<ReturnType<typeof analyses.list>>[number];
type TFn = (k: StringKey, v?: Record<string, string | number>) => string;

/** "Survival · PARL", or the experiment name for bench data. */
export function analysisName(r: { kind: string; params: Record<string, unknown> }, t: TFn) {
  const p = r.params as { gene?: string; gene2?: string; title?: string };
  if (r.kind === "bench") return `${t("ov.kind.bench")} · ${p.title || "–"}`;
  return `${t(`ov.kind.${r.kind}` as StringKey)} · ${p.gene ?? ""}${p.gene2 ? ` · ${p.gene2}` : ""}`;
}

const worst = (c: Check[]) => c.some((x) => x.status === "problem") ? "problem" : c.some((x) => x.status === "caution") ? "caution" : "pass";

async function pngFromSvg(svg: string, w: number, h: number, dpi: number): Promise<Uint8Array> {
  const scale = dpi / 72;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
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

export function Board({ p, figLang, say, onOpenAnalysis }: { p: ProjectSummary; figLang: FigLang; say: (s: string) => void; onOpenAnalysis: (kind: string, gene?: string) => void }) {
  const { t } = useT();
  const [boards, setBoards] = useState<BoardT[] | null>(null);
  const [cur, setCur] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [full, setFull] = useState<Record<string, Analysis | null>>({});
  const [adding, setAdding] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [checking, setChecking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saveTimer = useRef<number>(0);
  const ro = p.read_only;

  useEffect(() => {
    (async () => {
      const [b, r] = await Promise.all([analyses.boards().catch(() => [] as BoardT[]), analyses.list().catch(() => [] as Row[])]);
      setBoards(b); setRows(r.filter((x) => !x.headline.error)); setCur(b[b.length - 1]?.id ?? null);
    })();
  }, []);
  const board = boards?.find((b) => b.id === cur) ?? null;

  // Fetch each panel's saved result once.
  useEffect(() => {
    const need = (board?.panels ?? []).filter((id) => !(id in full));
    if (!need.length) return;
    Promise.all(need.map((id) => analyses.get(id).catch(() => null))).then((got) =>
      setFull((f) => ({ ...f, ...Object.fromEntries(need.map((id, i) => [id, got[i]])) })));
  }, [board?.panels, full]);

  const update = useCallback((patch: Partial<BoardSpec>) => {
    if (!board || ro) return;
    const next = { ...board, ...patch };
    setBoards((bs) => bs!.map((b) => (b.id === next.id ? next : b)));
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => analyses.saveBoard(next).catch(() => say(t("fig.readOnly"))), 350);
  }, [board, ro, say, t]);

  const create = async () => {
    if (ro) { say(t("fig.readOnly")); return; }
    const b = await analyses.createBoard({ title: t("board.defaultTitle", { n: (boards?.length ?? 0) + 1 }) }).catch(() => null);
    if (b) { setBoards((bs) => [...(bs ?? []), b]); setCur(b.id); }
  };
  const remove = async () => {
    if (!board) return;
    setConfirmDelete(false);
    await analyses.deleteBoard(board.id).catch(() => say(t("fig.readOnly")));
    const rest = (boards ?? []).filter((b) => b.id !== board.id);
    setBoards(rest); setCur(rest[rest.length - 1]?.id ?? null);
  };

  const panels = useMemo(() => (board?.panels ?? []).map((id) => {
    const a = full[id];
    const row = rows.find((r) => r.id === id);
    const panel = a ? panelFor(a, figLang, t) : null;
    return { id, a, row, panel, name: row ? analysisName(row, t) : a ? analysisName(a as unknown as Row, t) : t("board.missing") };
  }), [board?.panels, full, rows, figLang, t]);
  const loading = (board?.panels ?? []).some((id) => !(id in full));
  const layout = useMemo(() => board && !loading ? layoutBoard(panels.map((x) => ({ svg: x.panel?.svg ?? null, label: x.name })), board, t("board.missing")) : null,
    [board, panels, loading, t]);

  const fileName = board ? `${p.project.name} – ${board.title}` : "";
  const save = async (kind: "pdf" | "png" | "svg") => {
    setExportMenu(false);
    if (!layout || !board) return;
    const path = await pickExportPath(t("fig.saveTitle"), fileName, kind);
    if (!path) return;
    try {
      const r = kind === "pdf" ? await analyses.exportPdf(path, layout.svg)
        : await analyses.exportFile(path, kind === "png" ? await pngFromSvg(layout.svg, layout.width, layout.height, 600) : new TextEncoder().encode(layout.svg));
      say(t("fig.saved", { p: r.path }));
    } catch { say(t("fig.saveFailed")); }
  };
  const send = async () => {
    if (!layout || !board) return;
    if (ro) { say(t("fig.readOnly")); return; }
    const summary = panels.map((x, i) => `${letterOf(i, board.letters) || i + 1}. ${x.panel?.summary ?? ""}`).join(" ");
    try {
      const r = await analyses.note("figure", { title: board.title, svg: layout.svg, summary, caption: spec(board), checks: panels.flatMap((x) => x.panel?.checks ?? []), meta: t("nav.figureBoard") });
      say(t("fig.sent", { n: r.count })); progress.mark("save");
    } catch { say(t("fig.sendFailed")); }
  };
  const spec = (b: BoardSpec) => t("board.spec", { mm: WIDTH_MM[b.width], w: t(`board.w.${b.width}` as StringKey), f: b.font, s: b.size, l: t(`board.l.${b.letters}.short` as StringKey) });

  // Check figure: what an editor or reviewer would notice.
  const checks = useMemo(() => {
    if (!board || !layout) return [];
    const out: { status: "pass" | "caution" | "problem"; text: string }[] = [];
    out.push(layout.minPt != null && layout.minPt >= Math.min(board.size, 6) - 0.01
      ? { status: "pass", text: t("board.chk.font", { s: layout.minPt.toFixed(1), f: board.font }) }
      : { status: "caution", text: t("board.chk.noText") });
    const squeezed = layout.scales.map((s, i) => ({ s, i })).filter((x) => panels[x.i]?.panel && x.s < 0.42);
    out.push(squeezed.length
      ? { status: "caution", text: t("board.chk.squeezed", { l: squeezed.map((x) => letterOf(x.i, board.letters) || x.i + 1).join(", ") }) }
      : { status: "pass", text: t("board.chk.scale") });
    const hMm = layout.height / (72 / 25.4);
    out.push(hMm > 240 ? { status: "caution", text: t("board.chk.tall", { h: Math.round(hMm) }) } : { status: "pass", text: t("board.chk.height", { h: Math.round(hMm) }) });
    const gone = panels.map((x, i) => ({ x, i })).filter(({ x }) => !x.panel);
    if (gone.length) out.push({ status: "problem", text: t("board.chk.missing", { l: gone.map(({ i }) => letterOf(i, board.letters) || i + 1).join(", ") }) });
    const weak = panels.map((x, i) => ({ x, i })).filter(({ x }) => x.panel && worst(x.panel.checks) !== "pass");
    out.push(weak.length
      ? { status: "caution", text: t("board.chk.reliability", { l: weak.map(({ x, i }) => `${letterOf(i, board.letters) || i + 1} (${x.name})`).join("; ") }) }
      : { status: "pass", text: t("board.chk.reliable") });
    out.push({ status: "pass", text: t("board.chk.vector") });
    return out;
  }, [board, layout, panels, t]);
  const worstCheck = checks.some((c) => c.status === "problem") ? "problem" : checks.some((c) => c.status === "caution") ? "caution" : "pass";

  const move = (i: number, d: -1 | 1) => {
    if (!board) return;
    const ps = [...board.panels]; const j = i + d;
    if (j < 0 || j >= ps.length) return;
    [ps[i], ps[j]] = [ps[j], ps[i]]; update({ panels: ps });
  };
  const available = rows.filter((r) => !board?.panels.includes(r.id));

  if (boards === null) return null;
  if (!board) {
    return (
      <div className="ws">
        <div className="ws-head"><div><div className="crumb mono">{p.project.name} / {t("nav.figureBoard")}</div><h1 className="page ws-title">{t("nav.figureBoard")}</h1></div></div>
        <div className="card board-empty">
          <h2 className="card-title">{t("board.empty.title")}</h2>
          <p className="muted">{t("board.empty.body")}</p>
          <div><button className="btn primary" onClick={create} disabled={ro}><Plus size={15} />{t("board.new")}</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="ws">
      <div className="ws-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="crumb mono">{p.project.name} / {t("nav.figureBoard")}</div>
          <input className="page ws-title board-title" value={board.title} onChange={(e) => update({ title: e.target.value.slice(0, 160) })} aria-label={t("board.titleLabel")} readOnly={ro} />
          <div className="ws-badges">
            {boards.length > 1 && (
              <label className="sel small-sel"><span className="mono">{t("board.pick")}</span>
                <select value={board.id} onChange={(e) => setCur(e.target.value)}>{boards.map((b) => <option key={b.id} value={b.id}>{b.title || "–"}</option>)}</select>
              </label>
            )}
            <button className="link small" onClick={create} disabled={ro}><Plus size={13} />{t("board.new")}</button>
          </div>
        </div>
        <div className="ws-actions">
          <button className="btn ghost" data-tour="check" onClick={() => setChecking(true)} disabled={!layout || !board.panels.length}>
            {worstCheck === "pass" ? <ShieldCheck size={15} /> : <TriangleAlert size={15} />}{t("board.check")}
          </button>
          <button className="btn" onClick={send} disabled={!layout || !board.panels.length}><NotebookPen size={15} />{t("fig.sendNotebook")}</button>
          <div style={{ position: "relative" }}>
            <button className="btn primary" data-tour="export" onClick={() => setExportMenu((v) => !v)} disabled={!layout || !board.panels.length}><Download size={15} />{t("board.export")}</button>
            {exportMenu && (
              <div className="menu">
                <button onClick={() => save("pdf")}>{t("fig.savePdfVector")}</button>
                <button onClick={() => save("png")}>{t("board.png")}</button>
                <button onClick={() => save("svg")}>{t("fig.saveSvg")}</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="ws-grid board-grid">
        <aside className="card ws-params">
          <span className="eyebrow">{t("board.panels")}</span>
          <ol className="board-list">
            {panels.map((x, i) => (
              <li key={x.id} className={x.panel ? "" : "gone"}>
                <b className="board-letter">{letterOf(i, board.letters) || i + 1}</b>
                <button className="board-name" onClick={() => x.row && onOpenAnalysis(x.row.kind, x.row.params.gene)} title={`${x.name} · ${t("board.open")}`}>{x.name}</button>
                <span className="board-tools">
                  <button className="icon-btn" onClick={() => move(i, -1)} disabled={ro || i === 0} aria-label={t("board.up")} title={t("board.up")}><ArrowUp size={14} /></button>
                  <button className="icon-btn" onClick={() => move(i, 1)} disabled={ro || i === panels.length - 1} aria-label={t("board.down")} title={t("board.down")}><ArrowDown size={14} /></button>
                  <button className="icon-btn" onClick={() => update({ panels: board.panels.filter((id) => id !== x.id) })} disabled={ro} aria-label={t("board.remove")} title={t("board.remove")}><X size={14} /></button>
                </span>
              </li>
            ))}
          </ol>
          <div style={{ position: "relative" }}>
            <button className="link" onClick={() => setAdding((v) => !v)} disabled={ro || board.panels.length >= 12}><Plus size={15} />{t("board.add")}</button>
            {adding && (
              <div className="menu board-add">
                {available.length ? available.map((r) => (
                  <button key={r.id} onClick={() => { setAdding(false); update({ panels: [...board.panels, r.id] }); }}>{analysisName(r, t)}</button>
                )) : <div className="menu-note muted">{t(rows.length ? "board.add.allIn" : "board.add.none")}</div>}
              </div>
            )}
          </div>
          {!board.panels.length && <p className="small muted">{t("board.panels.empty")}</p>}
          <div style={{ flex: 1 }} />
          <button className="link small danger" onClick={() => setConfirmDelete(true)} disabled={ro}><Trash2 size={13} />{t("board.delete")}</button>
        </aside>
        <section className="board-canvas">
          {layout && board.panels.length ? (
            <>
              <img className="board-page" src={svgDataUrl(layout.svg)} alt={board.title} style={{ aspectRatio: `${layout.width} / ${layout.height}`, maxWidth: board.width === "double" ? "100%" : `${(layout.width / 519) * 100}%` }} />
              <p className="mono small muted board-spec">{spec(board)}</p>
            </>
          ) : !board.panels.length ? (
            <div className="board-hint"><p className="muted">{t("board.panels.empty")}</p></div>
          ) : null}
        </section>
        <aside className="card ws-params">
          <span className="eyebrow">{t("board.layout")}</span>
          <Param label={t("board.width")}>
            <select className="text" value={board.width} onChange={(e) => update({ width: e.target.value as BoardSpec["width"] })} disabled={ro}>
              {(["single", "onehalf", "double"] as const).map((w) => <option key={w} value={w}>{t(`board.w.${w}` as StringKey)} · {WIDTH_MM[w]} mm</option>)}
            </select>
          </Param>
          <Param label={t("board.cols")}>
            <div className="segmented full">
              {[1, 2, 3].map((c) => <button key={c} aria-pressed={board.cols === c} onClick={() => update({ cols: c })} disabled={ro}>{c}</button>)}
            </div>
          </Param>
          <Param label={t("board.font")}>
            <div className="board-pair">
              <select className="text" value={board.font} onChange={(e) => update({ font: e.target.value as BoardSpec["font"] })} disabled={ro}>
                <option value="Arial">Arial</option><option value="Helvetica">Helvetica</option>
              </select>
              <select className="text" value={board.size} onChange={(e) => update({ size: Number(e.target.value) })} disabled={ro} aria-label={t("board.size")}>
                {[6, 7, 8].map((s) => <option key={s} value={s}>{s} pt</option>)}
              </select>
            </div>
          </Param>
          <Param label={t("board.letters")}>
            <select className="text" value={board.letters} onChange={(e) => update({ letters: e.target.value as BoardSpec["letters"] })} disabled={ro}>
              {(["upper", "lower", "none"] as const).map((l) => <option key={l} value={l}>{t(`board.l.${l}` as StringKey)}</option>)}
            </select>
          </Param>
          <Param label={t("board.align")}>
            <div className="segmented full">
              {(["top", "centre", "bottom"] as const).map((a) => <button key={a} aria-pressed={board.align === a} onClick={() => update({ align: a })} disabled={ro}>{t(`board.a.${a}` as StringKey)}</button>)}
            </div>
          </Param>
          <p className="small muted">{t("board.linked")}</p>
        </aside>
      </div>
      {checking && (
        <Dialog title={t("board.check")} onClose={() => setChecking(false)} width={560}>
          <ul className="board-checks">
            {checks.map((c, i) => <li key={i}><span className={`status-dot ${c.status === "pass" ? "" : c.status === "caution" ? "warn" : "bad"}`} />{c.text}</li>)}
          </ul>
        </Dialog>
      )}
      {confirmDelete && (
        <Dialog title={t("board.delete")} onClose={() => setConfirmDelete(false)}
          footer={<><button className="btn ghost" onClick={() => setConfirmDelete(false)}>{t("file.cancel")}</button><button className="btn danger" onClick={remove}>{t("board.delete")}</button></>}>
          <p>{t("board.delete.body", { b: board.title })}</p>
        </Dialog>
      )}
    </div>
  );
}
