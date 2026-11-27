// Expression across cancers: one gene in tumour and normal tissue for every TCGA cancer,
// optionally with GTEx healthy tissue, all from the UCSC Toil recompute (one pipeline for both).
import { useCallback, useRef, useState } from "react";
import { useT } from "../../i18n";
import type { ProjectSummary } from "../../lib/api";
import { fmt, fmtP, type AcrossResult } from "../../lib/analyses";
import { Across as AcrossChart } from "../../charts/Across";
import type { FigLang } from "../../charts/figStrings";
import { Frame, Param, Select, FigureCard, SideTabs, Method, EmptyState, LoadingState, ErrorState, OutOfDate, useRunShortcut, runKeys } from "./Frame";
import { useAnalysis } from "./useAnalysis";
import { errorText } from "./errors";

type Normal = "tcga" | "tcga_gtex";
type Sort = "tumour" | "diff" | "name";

const FIGT = {
  en: { x: "{g} expression, log2(TPM + 1)", tumour: "Tumour (TCGA)", normal: "Normal", normalG: "Normal (TCGA + GTEx)", noNormal: "no normal", stat: "n T/N · BH q" },
  zh: { x: "{g} 表达量，log2(TPM + 1)", tumour: "肿瘤（TCGA）", normal: "正常", normalG: "正常（TCGA + GTEx）", noNormal: "无正常", stat: "n 肿瘤/正常 · BH q" },
};

export function Across({ p, figLang, onFigLang, say, onLater, onGuide, onMode, initialGene }: {
  p: ProjectSummary; figLang: FigLang; onFigLang: (l: FigLang) => void; say: (s: string) => void; onLater: () => void; onGuide: () => void;
  onMode: (m: "tn" | "stage", gene: string) => void; initialGene?: string;
}) {
  const { t } = useT();
  const a = useAnalysis(["across"]);
  const r = a.current?.kind === "across" && !(a.current.result as { error?: string }).error ? (a.current.result as AcrossResult) : null;
  const targets = p.project.targets.length ? p.project.targets : ["TP53"];
  const [gene, setGene] = useState(initialGene || targets[0]);
  const [normal, setNormal] = useState<Normal>("tcga_gtex");
  const [sort, setSort] = useState<Sort>("tumour");
  const [synced, setSynced] = useState<string | null>(null);
  if (a.current && synced !== a.current.id) { setSynced(a.current.id); if (!initialGene || synced) setGene(a.current.params.gene); setNormal(a.current.params.normal ?? "tcga_gtex"); }
  const svgRef = useRef<SVGSVGElement>(null);
  const projCancers = p.project.datasets.filter((d) => d.startsWith("TCGA-")).map((d) => d.slice(5));
  const run = useCallback(() => a.run({ kind: "across", gene, normal }), [a, gene, normal]);
  useRunShortcut(run, a.phase.kind !== "running" && !!gene.trim());
  const saved = a.current?.params;
  const stale = !!r && !!saved && (saved.gene !== gene.trim().toUpperCase() || saved.normal !== normal);
  const F = FIGT[figLang];
  const G = r?.gene ?? (gene.trim().toUpperCase() || "…");
  const title = t("acr.title", { g: G });
  const rows = r ? [...r.rows].sort((x, y) => sort === "name" ? x.code.localeCompare(y.code)
    : sort === "diff" ? (y.diff ?? -99) - (x.diff ?? -99) : (y.tumour.median ?? -99) - (x.tumour.median ?? -99)) : [];

  const badges = (
    <>
      <span className="badge ok">● {t("acr.badge.src")}</span>
      {r && <span className="badge">● {t("acr.badge.n", { n: r.rows.length, k: r.n_tested })}</span>}
      {r && <span className="badge ok">● {t("acr.badge.sig", { u: r.n_up, d: r.n_down })}</span>}
    </>
  );

  const params = (
    <>
      <div className="row-between"><span className="eyebrow">{t("ws.parameters")}</span>
        <button className="link small" onClick={() => { setNormal("tcga_gtex"); setSort("tumour"); }}>{t("ws.reset")}</button></div>
      <Param label={t("ws.gene")} help={t("ws.gene.help")}>
        <input className="text mono" list="kiri-targets-acr" value={gene} onChange={(e) => setGene(e.target.value)} spellCheck={false} aria-label={t("ws.gene")} />
        <datalist id="kiri-targets-acr">{targets.map((g) => <option key={g} value={g} />)}</datalist>
        {targets.length > 1 && (
          <div className="ws-genes" role="group" aria-label={t("ws.projectGenes")}>
            {targets.map((g) => <button key={g} className={`chip ${gene.trim().toUpperCase() === g.toUpperCase() ? "on" : ""}`} onClick={() => setGene(g)}>{g}</button>)}
          </div>
        )}
      </Param>
      <Param label={t("expr.compare")}>
        <div className="segmented full">
          <button aria-pressed={false} onClick={() => onMode("tn", gene)}>{t("expr.mode.normal")}</button>
          <button aria-pressed={false} onClick={() => onMode("stage", gene)}>{t("expr.mode.stage")}</button>
          <button aria-pressed>{t("expr.mode.cancers")}</button>
        </div>
      </Param>
      <Param label={t("expr.normalRef")} help={t("acr.normal.help")} recommended={normal === "tcga_gtex"}>
        <Select<Normal> value={normal} onChange={setNormal} options={[{ value: "tcga_gtex", label: t("acr.normal.gtex") }, { value: "tcga", label: t("acr.normal.tcga") }]} />
      </Param>
      <Param label={t("acr.sort")}>
        <Select<Sort> value={sort} onChange={setSort} options={[{ value: "tumour", label: t("acr.sort.tumour") }, { value: "diff", label: t("acr.sort.diff") }, { value: "name", label: t("acr.sort.name") }]} />
      </Param>
      <p className="help">{t("acr.source.help")}</p>
      <div className="run-row">
        <button className="btn primary" onClick={run} disabled={a.phase.kind === "running" || !gene.trim()}>{t("acr.run")}</button>
        <span className="kbd">{runKeys}</span>
      </div>
    </>
  );

  let body;
  if (a.phase.kind === "running") body = <LoadingState steps={[t("acr.load.samples"), t("acr.load.gene", { g: gene.toUpperCase() }), t("acr.load.test"), t("load.checks")]} />;
  else if (a.phase.kind === "error") {
    const e = errorText(t, a.phase.code, { gene: String(a.phase.extra.gene ?? gene.toUpperCase()), ...a.phase.extra });
    body = <ErrorState {...e} code={a.phase.code} actions={<button className="btn primary" onClick={run}>{t("err.ws.retry")}</button>} />;
  } else if (!r) body = a.loaded ? <EmptyState title={t("acr.empty.title")} body={t("acr.empty.body", { g: gene.toUpperCase() })} onRun={run} onGuide={onGuide} /> : null;

  const caption = r ? t(r.normal === "tcga_gtex" ? "acr.caption.gtex" : "acr.caption", { g: r.gene }) : "";
  const top = r ? [...r.rows].filter((x) => x.p_adj != null && x.p_adj < 0.05).sort((x, y) => Math.abs(y.diff ?? 0) - Math.abs(x.diff ?? 0))[0] : undefined;
  const plain = r ? [
    t(r.n_up + r.n_down ? "acr.plain" : "acr.plainNone", { g: r.gene, u: r.n_up, d: r.n_down, k: r.n_tested }),
    top ? t((top.diff ?? 0) > 0 ? "acr.plain.topUp" : "acr.plain.topDown", { c: top.code, m: fmt(Math.abs(top.diff ?? 0)), q: fmtP(top.p_adj) }) : "",
    t("acr.plain.highest", { c: [...r.rows].sort((x, y) => (y.tumour.median ?? -99) - (x.tumour.median ?? -99))[0]?.code ?? "–" }),
  ].filter(Boolean).join(" ") : "";

  const figure = body ? <div className="fig-state">{body}</div> : r && (
    <div className="de-stack">
      {stale && <OutOfDate onRun={run} />}
      <FigureCard svgRef={svgRef} fileName={title} chartName={t("acr.chart")} why={t("acr.why")} figLang={figLang} onFigLang={onFigLang} onSaid={say} onLater={onLater} readOnly={p.read_only} analysis={a.current}
        caption={caption}
        notebookBody={() => ({ analysis_id: a.current?.id, kind: "across", gene: r.gene, title, summary: plain, checks: r.checks, meta: `${r.data_version.source} · ${r.data_version.built}` })}>
        <AcrossChart ref={svgRef} rows={rows} highlight={projCancers}
          labels={{ x: F.x.replace("{g}", r.gene), tumour: F.tumour, normal: r.normal === "tcga_gtex" ? F.normalG : F.normal, noNormal: F.noNormal, stat: F.stat }} />
      </FigureCard>
    </div>
  );

  const explain = r ? (
    <>
      <div className="tiles">
        <div className="tile"><span className="eyebrow">{t("acr.tile.up")}</span><b className="de-up">{r.n_up}</b><span className="mono small">{r.up.slice(0, 6).join(" ") || "–"}</span></div>
        <div className="tile"><span className="eyebrow">{t("acr.tile.down")}</span><b className="de-down">{r.n_down}</b><span className="mono small">{r.down.slice(0, 6).join(" ") || "–"}</span></div>
      </div>
      <div className="side-card shows">
        <span className="eyebrow">{t("ws.whatShows")}</span><span className="small muted">{t("ws.fromNumbers")}</span>
        <p className="plain">{plain}</p>
        <p className="small">{t(r.normal === "tcga_gtex" ? "acr.note.gtex" : "acr.note.tcga")}</p>
      </div>
      <Method title={t("acr.method.title")} body={t("acr.method.body")} cite="scipy · Mann & Whitney 1947 · Benjamini & Hochberg 1995 · Vivian et al. 2017 (Toil)" />
      <div className="side-card next"><span className="eyebrow">{t("ws.next")}</span><p className="small">{t("acr.next")}</p></div>
    </>
  ) : (
    <>
      <Method title={t("acr.method.title")} body={t("acr.method.body")} cite="scipy · Vivian et al. 2017 (Toil)" />
      <div className="side-empty">{t("ws.sideEmpty")}</div>
    </>
  );

  return <Frame crumb={`${p.project.name}  /  ${t("nav.analyses")}  /  ${t("nav.expression")}`} title={title} badges={badges} params={params}
    figure={figure} side={<SideTabs explain={explain} checks={r?.checks ?? null} />} onLater={onLater} analysis={r ? a.current : null} say={say} />;
}
