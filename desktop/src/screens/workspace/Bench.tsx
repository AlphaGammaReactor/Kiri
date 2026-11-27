// Bench data: paste qPCR Ct values (ΔΔCt) or any other measurements from a spreadsheet and get an
// honest dot plot with every replicate, the mean, its 95% CI and the comparison with the control.
import { useCallback, useRef, useState } from "react";
import { useT } from "../../i18n";
import type { StringKey } from "../../i18n/strings";
import type { ProjectSummary } from "../../lib/api";
import { fmt, fmtP, type BenchResult } from "../../lib/analyses";
import { BenchDots } from "../../charts/BenchDots";
import type { FigLang } from "../../charts/figStrings";
import { Frame, Param, Select, FigureCard, SideTabs, Method, EmptyState, LoadingState, ErrorState, OutOfDate, useRunShortcut, runKeys } from "./Frame";
import { useAnalysis } from "./useAnalysis";
import { errorText } from "./errors";

type Mode = "qpcr" | "values";

// A practice table, clearly marked as made up, so a student can see the layout and try the screen.
const PRACTICE: Record<Mode, string> = {
  qpcr: ["Sample\tGroup\tGene\tCt", ...[["C1", 18.1, 25.1], ["C2", 18.0, 25.3], ["C3", 18.2, 24.9], ["T1", 18.1, 23.2], ["T2", 17.9, 23.0], ["T3", 18.0, 23.4]]
    .flatMap(([s, r, t]) => [`${s}\t${String(s).startsWith("C") ? "Control" : "Treated"}\tGAPDH\t${r}`, `${s}\t${String(s).startsWith("C") ? "Control" : "Treated"}\tMYGENE\t${t}`])].join("\n"),
  values: ["Group\tValue", "WT\t1.00", "WT\t0.92", "WT\t1.10", "KO\t0.45", "KO\t0.52", "KO\t0.38"].join("\n"),
};

const FIGT = {
  en: { yq: "log2 fold change (2^−ΔΔCt)", yv: "Value", yvl: "log2 value", control: "control", overall: "Welch ANOVA" },
  zh: { yq: "log2 倍数变化（2^−ΔΔCt）", yv: "数值", yvl: "log2 数值", control: "对照", overall: "Welch 方差分析" },
};

type TFn = (k: StringKey, v?: Record<string, string | number>) => string;

/** Plain-language result, shared by the screen and the one-page summary. */
export function plainBench(r: BenchResult, t: TFn) {
  const first = r.panels[0];
  if (r.mode === "qpcr") return r.panels.map((pn) => pn.groups.slice(1).map((g) => t((g.p_adj ?? g.p ?? 1) < 0.05 ? "bench.plain.q" : "bench.plain.qns",
    { gene: pn.gene, g: g.group, c: r.control, f: fmt(g.fold ?? 1), dir: t((g.mean ?? 0) >= 0 ? "bench.up" : "bench.down"), p: fmtP(g.p_adj ?? g.p), n: g.n })).join(" ")).join(" ");
  return first.groups.slice(1).map((g) => {
    const d = (g.mean ?? 0) - (first.groups[0].mean ?? 0), sig = (g.p_adj ?? g.p ?? 1) < 0.05;
    return r.log ? t(sig ? "bench.plain.vlog" : "bench.plain.vlogns", { g: g.group, c: r.control, f: fmt(2 ** d), p: fmtP(g.p_adj ?? g.p), n: g.n })
      : t(sig ? "bench.plain.v" : "bench.plain.vns", { g: g.group, c: r.control, d: fmt(d), p: fmtP(g.p_adj ?? g.p), n: g.n });
  }).join(" ");
}

/** Props for the bench figure in the chosen figure language. */
export function benchFigure(r: BenchResult, figLang: FigLang) {
  const F = FIGT[figLang];
  return {
    labels: { y: r.mode === "qpcr" ? F.yq : r.log ? F.yvl : F.yv, foldAxis: r.mode === "qpcr", control: F.control, overall: F.overall },
    panels: r.panels.map((pn) => ({ title: pn.gene, overall: pn.groups.length > 2 ? pn.overall_p : null,
      groups: pn.groups.map((g) => ({ group: g.group, n: g.n, points: (r.mode === "qpcr" ? g.log2fc : g.values) ?? [], mean: g.mean, lo: g.lo, hi: g.hi, p: g.p, p_adj: g.p_adj })) })),
  };
}

export function Bench({ p, figLang, onFigLang, say, onLater, onGuide }: {
  p: ProjectSummary; figLang: FigLang; onFigLang: (l: FigLang) => void; say: (s: string) => void; onLater: () => void; onGuide: () => void;
}) {
  const { t } = useT();
  const a = useAnalysis(["bench"]);
  const r = a.current?.kind === "bench" && !(a.current.result as { error?: string }).error ? (a.current.result as BenchResult) : null;
  const [mode, setMode] = useState<Mode>("qpcr");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [ref, setRef] = useState("");
  const [control, setControl] = useState("");
  const [log, setLog] = useState(false);
  const [synced, setSynced] = useState<string | null>(null);
  if (a.current && synced !== a.current.id) {
    const q = a.current.params;
    setSynced(a.current.id); setMode(q.mode ?? "qpcr"); setText(q.text ?? ""); setTitle(q.title ?? ""); setRef(q.ref ?? ""); setControl(q.control ?? ""); setLog(!!q.log);
  }
  const svgRef = useRef<SVGSVGElement>(null);
  const ok = text.trim().split("\n").length >= 3;
  const run = useCallback(() => a.run({ kind: "bench", gene: "", mode, text, ref, control: control || null, log, title }), [a, mode, text, ref, control, log, title]);
  useRunShortcut(run, a.phase.kind !== "running" && ok);
  const saved = a.current?.params;
  const stale = !!r && !!saved && (saved.text !== text || saved.mode !== mode || (saved.ref ?? "") !== ref || (saved.control ?? "") !== control || !!saved.log !== log);
  const name = title.trim() || t(mode === "qpcr" ? "bench.title.qpcr" : "bench.title.values");

  const badges = (
    <>
      <span className="badge ok">● {t("bench.badge.src")}</span>
      {r && <span className="badge">● {r.mode === "qpcr" ? t("bench.badge.q", { n: r.n_samples ?? 0, k: r.targets?.length ?? 0, ref: r.ref ?? "" }) : t("bench.badge.v", { g: r.groups.length })}</span>}
    </>
  );

  const params = (
    <>
      <div className="row-between"><span className="eyebrow">{t("ws.parameters")}</span>
        <button className="link small" onClick={() => setText(PRACTICE[mode])}>{t("bench.practice")}</button></div>
      <Param label={t("bench.kind")}>
        <div className="segmented full">
          <button aria-pressed={mode === "qpcr"} onClick={() => setMode("qpcr")}>{t("bench.kind.qpcr")}</button>
          <button aria-pressed={mode === "values"} onClick={() => setMode("values")}>{t("bench.kind.values")}</button>
        </div>
      </Param>
      <Param label={t("bench.name")}>
        <input className="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t(mode === "qpcr" ? "bench.name.phq" : "bench.name.phv")} aria-label={t("bench.name")} />
      </Param>
      <Param label={t("bench.paste")} help={t(mode === "qpcr" ? "bench.paste.helpq" : "bench.paste.helpv")}>
        <textarea className="text mono bench-paste" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} rows={9}
          placeholder={mode === "qpcr" ? "Sample\tGroup\tGene\tCt\nC1\tControl\tGAPDH\t18.1\nC1\tControl\tMYGENE\t25.1\n…" : "Group\tValue\nWT\t1.00\nKO\t0.45\n…"} aria-label={t("bench.paste")} />
      </Param>
      {mode === "qpcr" && (
        <Param label={t("bench.ref")} help={t("bench.ref.help")}>
          {r?.genes?.length ? <Select value={ref || r.ref || ""} onChange={setRef} options={r.genes.map((g) => ({ value: g, label: g }))} />
            : <input className="text mono" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder={t("bench.ref.auto")} aria-label={t("bench.ref")} />}
        </Param>
      )}
      {r && r.groups.length > 1 && (
        <Param label={t("bench.control")}>
          <Select value={control || r.control} onChange={setControl} options={r.groups.map((g) => ({ value: g, label: g }))} />
        </Param>
      )}
      {mode === "values" && (
        <label className="bench-check"><input type="checkbox" checked={log} onChange={(e) => setLog(e.target.checked)} /> {t("bench.log")}</label>
      )}
      <div className="run-row">
        <button className="btn primary" onClick={run} disabled={a.phase.kind === "running" || !ok}>{t("bench.run")}</button>
        <span className="kbd">{runKeys}</span>
      </div>
    </>
  );

  let body;
  if (a.phase.kind === "running") body = <LoadingState steps={[t("bench.load.read"), t(mode === "qpcr" ? "bench.load.ddct" : "bench.load.groups"), t("load.checks")]} />;
  else if (a.phase.kind === "error") {
    const x = a.phase.extra as { genes?: string[]; groups?: string[]; max?: number };
    const e = errorText(t, a.phase.code, { list: (x.genes ?? x.groups ?? []).join(", ") || "–", max: x.max ?? "" });
    body = <ErrorState {...e} code={a.phase.code} actions={<button className="btn primary" onClick={run}>{t("err.ws.retry")}</button>} />;
  } else if (!r && a.current && (a.current.result as { error?: string }).error) {
    const res = a.current.result as { error: string; genes?: string[]; groups?: string[] };
    const e = errorText(t, res.error, { list: (res.genes ?? res.groups ?? []).join(", ") || "–" });
    body = <ErrorState {...e} code={res.error} actions={<button className="btn primary" onClick={run} disabled={!ok}>{t("err.ws.retry")}</button>} />;
  } else if (!r) body = a.loaded ? <EmptyState title={t("bench.empty.title")} body={t("bench.empty.body")} onRun={() => setText(PRACTICE[mode])} onGuide={onGuide} /> : null;

  const first = r?.panels[0];
  const sig = r ? r.panels.flatMap((pn) => pn.groups.filter((g) => (g.p_adj ?? g.p ?? 1) < 0.05).map((g) => ({ gene: pn.gene, g }))) : [];
  const plain = r ? plainBench(r, t) : "";
  const caption = r ? t(r.mode === "qpcr" ? "bench.caption.q" : "bench.caption.v", { ref: r.ref ?? "", c: r.control,
    test: t(first?.test === "welch_t" ? "bench.test.t" : "bench.test.anova") }) : "";

  const figure = body ? <div className="fig-state">{body}</div> : r && (
    <div className="de-stack">
      {stale && <OutOfDate onRun={run} />}
      <FigureCard svgRef={svgRef} fileName={name} chartName={t("bench.chart")} why={t("bench.why")} figLang={figLang} onFigLang={onFigLang} onSaid={say} onLater={onLater}
        readOnly={p.read_only} analysis={a.current} caption={caption}
        notebookBody={() => ({ analysis_id: a.current?.id, kind: "bench", title: name, summary: plain, checks: r.checks, meta: t("bench.badge.src") })}>
        <BenchDots ref={svgRef} {...benchFigure(r, figLang)} />
      </FigureCard>
      <div className="card de-results">
        <span className="eyebrow">{t("bench.table")}</span>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr>{r.mode === "qpcr" && <th>{t("bench.col.gene")}</th>}<th>{t("bench.col.group")}</th><th className="num">n</th>
            {r.mode === "qpcr" ? <><th className="num">ΔCt</th><th className="num">log2 FC</th><th className="num">{t("bench.col.fold")}</th></> : <><th className="num">{t("bench.col.mean")}</th><th className="num">SD</th></>}
            <th className="num">95% CI</th><th className="num">p</th></tr></thead>
          <tbody>{r.panels.flatMap((pn) => pn.groups.map((g, i) => (
            <tr key={`${pn.gene}-${g.group}`}>
              {r.mode === "qpcr" && <td className="mono"><i>{i === 0 ? pn.gene : ""}</i></td>}
              <td>{g.group}{i === 0 ? <span className="muted small"> · {t("bench.controlTag")}</span> : null}</td><td className="num">{g.n}</td>
              {r.mode === "qpcr" ? <><td className="num">{fmt(g.dct_mean ?? 0)}</td><td className="num">{fmt(g.mean ?? 0)}</td><td className="num">{fmt(g.fold ?? 1)}×</td></>
                : <><td className="num">{fmt(g.mean ?? 0)}</td><td className="num">{g.sd != null ? fmt(g.sd) : "–"}</td></>}
              <td className="num">{g.lo != null ? `${fmt(g.lo)} to ${fmt(g.hi ?? 0)}` : "–"}</td>
              <td className="num">{i === 0 ? "–" : fmtP(g.p_adj ?? g.p)}</td>
            </tr>
          )))}</tbody>
        </table></div>
      </div>
    </div>
  );

  const explain = r ? (
    <>
      <div className="tiles">
        <div className="tile"><span className="eyebrow">{t("bench.tile.groups")}</span><b>{r.groups.length}</b><span className="small">{t("bench.tile.control", { c: r.control })}</span></div>
        <div className="tile"><span className="eyebrow">{t("bench.tile.sig")}</span><b className="de-up">{sig.length}</b><span className="small">{t("bench.tile.p")}</span></div>
      </div>
      <div className="side-card shows">
        <span className="eyebrow">{t("ws.whatShows")}</span><span className="small muted">{t("ws.fromNumbers")}</span>
        <p className="plain">{plain}</p>
        <p className="small">{t(r.mode === "qpcr" ? "bench.note.q" : "bench.note.v")}</p>
      </div>
      <Method title={t(r.mode === "qpcr" ? "bench.method.q" : "bench.method.v")} body={t(r.mode === "qpcr" ? "bench.method.qb" : "bench.method.vb")}
        cite={r.mode === "qpcr" ? "Livak & Schmittgen 2001 · Welch 1947/1951 · Holm 1979" : "Welch 1947/1951 · Holm 1979 · scipy"} />
    </>
  ) : (
    <>
      <Method title={t("bench.method.q")} body={t("bench.method.qb")} cite="Livak & Schmittgen 2001" />
      <div className="side-empty">{t("bench.side.empty")}</div>
    </>
  );

  return <Frame crumb={`${p.project.name}  /  ${t("nav.analyses")}  /  ${t("nav.bench")}`} title={name} badges={badges} params={params}
    figure={figure} side={<SideTabs explain={explain} checks={r?.checks ?? null} />} onLater={onLater} analysis={r ? a.current : null} say={say} />;
}
