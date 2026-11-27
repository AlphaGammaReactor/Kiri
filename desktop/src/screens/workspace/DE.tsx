// Differential expression workspace: which genes differ between two groups across the whole transcriptome,
// and which pathways those genes fall in (volcano plot, gene tables, Hallmark or Reactome enrichment).
import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import { useT } from "../../i18n";
import type { ProjectSummary } from "../../lib/api";
import { analyses, fmt, fmtP, type DEGene, type DEResult, type EnrichRow, type PathwayInfo, type PathwayLibrary } from "../../lib/analyses";
import { Volcano } from "../../charts/Volcano";
import type { FigLang } from "../../charts/figStrings";
import { Frame, Param, Select, FigureCard, SideTabs, Method, EmptyState, LoadingState, ErrorState, CohortDownload, OutOfDate, useRunShortcut, RunButton } from "./Frame";
import { useAnalysis, cohortLabel } from "./useAnalysis";
import { errorText } from "./errors";

type Compare = "tn" | "gene" | "group";

const FIGT = {
  en: { x: "log2 fold change ({a} vs {b})", y: "−log10 p", up: "Higher in {a} ({n})", down: "Higher in {b} ({n})", stat: "Welch t-test · BH q < {q} · |log2 FC| ≥ {l}" },
  zh: { x: "log2 倍数变化（{a} 对比 {b}）", y: "−log10 p", up: "{a} 中更高（{n}）", down: "{b} 中更高（{n}）", stat: "Welch t 检验 · BH q < {q} · |log2 FC| ≥ {l}" },
};
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const LFC = ["0.58", "1", "2"] as const;
const QS = ["0.01", "0.05", "0.1"] as const;

export function DE({ p, figLang, onFigLang, say, onLater, onGuide, onGene }: {
  p: ProjectSummary; figLang: FigLang; onFigLang: (l: FigLang) => void; say: (s: string) => void; onLater: () => void; onGuide: () => void;
  onGene: (g: string) => void;
}) {
  const { t } = useT();
  const a = useAnalysis(["de"]);
  const r = a.current?.kind === "de" && !(a.current.result as { error?: string }).error ? (a.current.result as DEResult) : null;
  const own = a.cohort?.own;
  const targets = p.project.targets.length ? p.project.targets : ["TP53"];
  const [compare, setCompare] = useState<Compare>("tn");
  const [gene, setGene] = useState(targets[0]);
  const [ga, setGa] = useState<string>("");
  const [gb, setGb] = useState<string>("");
  const [lfc, setLfc] = useState<(typeof LFC)[number]>("1");
  const [q, setQ] = useState<(typeof QS)[number]>("0.05");
  const [lib, setLib] = useState<PathwayLibrary>("hallmark");
  const [libs, setLibs] = useState<PathwayInfo[] | null>(null);
  const [tab, setTab] = useState<"genes" | "pathways">("genes");
  const [synced, setSynced] = useState<string | null>(null);
  if (a.current && synced !== a.current.id) {
    const sp = a.current.params;
    setSynced(a.current.id); setCompare(sp.compare ?? "tn"); if (sp.gene) setGene(sp.gene);
    setGa(sp.group_a ?? ""); setGb(sp.group_b ?? ""); setLib(sp.library ?? "hallmark");
    setLfc((LFC.find((x) => Number(x) === sp.lfc) ?? "1")); setQ((QS.find((x) => Number(x) === sp.q) ?? "0.05"));
  }
  useEffect(() => { analyses.pathways().then(setLibs).catch(() => setLibs([])); }, []);
  // Your own table compares two of its groups; TCGA has tumour against normal and high against low.
  useEffect(() => { if (own && compare !== "group") setCompare("group"); else if (!own && a.cohort && compare === "group") setCompare("tn"); }, [own, a.cohort]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = own?.groups ?? [];
  const A = ga && groups.includes(ga) ? ga : groups[0] ?? "", B = gb && groups.includes(gb) && gb !== A ? gb : groups.find((g) => g !== A) ?? "";
  const svgRef = useRef<SVGSVGElement>(null);
  const projects = a.cohort?.projects ?? p.project.datasets;
  const params = { kind: "de" as const, compare, gene: compare === "gene" ? gene : "", group_a: compare === "group" ? A : null, group_b: compare === "group" ? B : null, lfc: Number(lfc), q: Number(q), library: lib };
  const ok = compare !== "gene" || !!gene.trim();
  const run = useCallback(() => a.run(params), [a, JSON.stringify(params)]); // eslint-disable-line react-hooks/exhaustive-deps
  useRunShortcut(run, a.phase.kind !== "running" && ok);
  const saved = a.current?.params;
  const stale = !!r && !!saved && (saved.compare !== compare || (compare === "gene" && saved.gene !== gene.trim().toUpperCase()) || saved.lfc !== Number(lfc) || saved.q !== Number(q)
    || saved.library !== lib || (compare === "group" && (saved.group_a !== A || saved.group_b !== B)));
  const F = FIGT[figLang];
  const [la, lb] = r?.labels ?? [compare === "tn" ? t("de.tumour") : compare === "gene" ? `${gene.toUpperCase()} ${t("de.high")}` : A, compare === "tn" ? t("de.normal") : compare === "gene" ? `${gene.toUpperCase()} ${t("de.low")}` : B];
  const label = (x: string) => (x === "Tumour" ? t("de.tumour") : x === "Normal" ? t("de.normal") : x.replace(/ high$/, ` ${t("de.high")}`).replace(/ low$/, ` ${t("de.low")}`));
  const title = t("de.title", { a: label(la), b: label(lb) });
  const libInfo = libs?.find((x) => x.id === lib);

  const badges = (
    <>
      <span className="badge ok">● {cohortLabel(projects)} · {own ? t("ws.ownSource") : "GDC"}</span>
      {r && <span className="badge">● {t("de.badge.n", { a: r.n[0], b: r.n[1], g: r.n_tested })}</span>}
      {r && <span className="badge ok">● {t("de.badge.sig", { u: r.n_up, d: r.n_down })}</span>}
    </>
  );

  const paramsUi = (
    <>
      <div className="row-between"><span className="eyebrow">{t("ws.parameters")}</span>
        <button className="link small" onClick={() => { setLfc("1"); setQ("0.05"); setLib("hallmark"); setCompare(own ? "group" : "tn"); }}>{t("ws.reset")}</button></div>
      <Param label={t("ws.cohort")} help={t("ws.cohort.help")} recommended>
        <Select value="c" options={[{ value: "c", label: cohortLabel(projects) }]} onChange={() => {}} />
        {a.cohort?.sample_slice && <p className="help">{t("de.needsFull")}</p>}
      </Param>
      <Param label={t("de.compare")} help={t("de.compare.help")} recommended={compare === "tn"}>
        <Select<Compare> value={compare} onChange={setCompare} options={own
          ? [{ value: "group", label: t("de.cmp.groupShort") }]
          : [{ value: "tn", label: t("de.cmp.tnShort") }, { value: "gene", label: t("de.cmp.geneShort") }]} />
      </Param>
      {compare === "gene" && (
        <Param label={t("ws.gene")} help={t("de.gene.help")}>
          <input className="text mono" list="kiri-targets-de" value={gene} onChange={(e) => setGene(e.target.value)} spellCheck={false} aria-label={t("ws.gene")} />
          <datalist id="kiri-targets-de">{targets.map((g) => <option key={g} value={g} />)}</datalist>
          {targets.length > 1 && (
            <div className="ws-genes" role="group" aria-label={t("ws.projectGenes")}>
              {targets.map((g) => <button key={g} className={`chip ${gene.trim().toUpperCase() === g.toUpperCase() ? "on" : ""}`} onClick={() => setGene(g)}>{g}</button>)}
            </div>
          )}
        </Param>
      )}
      {compare === "group" && groups.length >= 2 && (
        <Param label={t("de.groups")} help={t("de.groups.help")}>
          <div className="de-groups">
            <Select value={A} onChange={setGa} options={groups.map((g) => ({ value: g, label: g }))} />
            <span className="small muted">{t("de.vs")}</span>
            <Select value={B} onChange={setGb} options={groups.filter((g) => g !== A).map((g) => ({ value: g, label: g }))} />
          </div>
        </Param>
      )}
      <Param label={t("de.lfc")} help={t("de.lfc.help")} recommended={lfc === "1"}>
        <Select value={lfc} onChange={setLfc} options={LFC.map((x) => ({ value: x, label: t("de.lfc.opt", { l: x, f: fmt(2 ** Number(x)) }) }))} />
      </Param>
      <Param label={t("de.q")} help={t("de.q.help")} recommended={q === "0.05"}>
        <Select value={q} onChange={setQ} options={QS.map((x) => ({ value: x, label: `q < ${x}` }))} />
      </Param>
      <Param label={t("de.lib")} help={t("de.lib.help")} recommended={lib === "hallmark"}>
        <Select<PathwayLibrary> value={lib} onChange={setLib} options={(["hallmark", "reactome"] as const).map((x) => {
          const info = libs?.find((y) => y.id === x);
          return { value: x, label: info?.n ? t("de.lib.n", { l: t(`de.lib.${x}`), n: info.n.toLocaleString() }) : t(`de.lib.${x}`), disabled: !!libs && !info?.available };
        })} />
        {libs && !libInfo?.available && <p className="help">{t("de.lib.missing")}</p>}
      </Param>
      {compare === "group" && groups.length < 2 && <div className="excluded"><CircleAlert size={14} /><span>{t("de.noGroups")}</span></div>}
      <div className="run-row">
        <RunButton onClick={run} disabled={a.phase.kind === "running" || !ok || (compare === "group" && groups.length < 2)} label={t("de.run")} />
      </div>
    </>
  );

  let body;
  if (a.phase.kind === "running") body = <LoadingState steps={[t("load.cohort"), t("de.load.matrix"), t("de.load.test"), t("de.load.enrich"), t("load.checks")]} />;
  else if (a.phase.kind === "download") body = <CohortDownload a={a} runLabel={t("de.run")} onRun={run} />;
  else if (a.phase.kind === "error") {
    const e = errorText(t, a.phase.code, { gene: String(a.phase.extra.gene ?? gene.toUpperCase()), ...a.phase.extra });
    body = <ErrorState {...e} code={a.phase.code} actions={<>
      {a.phase.code === "gene_not_in_cohort" && <button className="btn primary" onClick={() => a.download(projects)}>{t("dl.start")}</button>}
      <button className="btn" onClick={run}>{t("err.ws.retry")}</button></>} />;
  } else if (a.current?.kind === "de" && (a.current.result as { error?: string }).error) {
    const res = a.current.result as unknown as { error: string; n?: number[]; min?: number };
    const e = errorText(t, res.error, { a: res.n?.[0] ?? 0, b: res.n?.[1] ?? 0, min: res.min ?? 10 });
    body = <ErrorState {...e} code={res.error} actions={<button className="btn" onClick={run}>{t("err.ws.retry")}</button>} />;
  } else if (!r) body = a.loaded ? <EmptyState title={t("de.empty.title")} body={t(own ? "de.empty.bodyOwn" : "de.empty.body")} onRun={own && groups.length < 2 ? undefined : run} onGuide={onGuide} /> : null;

  const pCut = r ? Math.min(...r.volcano.filter((x) => x[3]).map((x) => x[2]), Infinity) : null;
  const caption = r ? t("de.caption", { a: label(la), b: label(lb), c: own ? own.name : cohortLabel(r.data_version.projects), g: r.n_tested.toLocaleString(), l: r.thresholds.lfc, q: r.thresholds.q }) : "";
  const topUp = r?.enrichment.up[0], topDown = r?.enrichment.down[0];
  const plain = r ? [
    t(r.n_up + r.n_down ? "de.plain" : "de.plainNone", { u: r.n_up, d: r.n_down, a: label(la), b: label(lb), g: r.n_tested.toLocaleString(), q: r.thresholds.q }),
    topUp && topUp.p_adj < 0.05 ? t("de.plain.pathUp", { s: topUp.name, a: label(la), q: fmtP(topUp.p_adj) }) : "",
    topDown && topDown.p_adj < 0.05 ? t("de.plain.pathDown", { s: topDown.name, b: label(lb), q: fmtP(topDown.p_adj) }) : "",
  ].filter(Boolean).join(" ") : "";

  const figure = body ? <div className="fig-state">{body}</div> : r && (
    <div className="de-stack">
      {stale && <OutOfDate onRun={run} />}
      <FigureCard svgRef={svgRef} fileName={title} chartName={t("de.chart")} why={t("de.why")} figLang={figLang} onFigLang={onFigLang} onSaid={say} onLater={onLater} readOnly={p.read_only} analysis={a.current}
        caption={caption}
        notebookBody={() => ({ analysis_id: a.current?.id, kind: "de", title, summary: plain, checks: r.checks, meta: `${r.data_version.source} · ${r.data_version.built}` })}>
        <Volcano ref={svgRef} points={r.volcano} lfc={r.thresholds.lfc} pCut={Number.isFinite(pCut) ? pCut : null} highlight={own ? [] : targets}
          labels={{ x: fill(F.x, { a: la, b: lb }), y: F.y, up: fill(F.up, { a: la, n: r.n_up }), down: fill(F.down, { b: lb, n: r.n_down }), stat: fill(F.stat, { q: r.thresholds.q, l: r.thresholds.lfc }) }} />
      </FigureCard>
      <div className="card de-results">
        <div className="row-between">
          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={tab === "genes"} className={tab === "genes" ? "on" : ""} onClick={() => setTab("genes")}>{t("de.tab.genes")}</button>
            <button role="tab" aria-selected={tab === "pathways"} className={tab === "pathways" ? "on" : ""} onClick={() => setTab("pathways")}>{t("de.tab.pathways")}</button>
          </div>
          <span className="small muted">{tab === "genes" ? t("de.genes.hint") : libInfo?.available ? t("de.path.lib", { l: t(`de.lib.${lib}`), v: libInfo.version ?? "", n: r.enrichment.n_sets ?? 0 }) : ""}</span>
        </div>
        {tab === "genes" ? (
          <div className="de-two">
            <GeneTable title={t("de.higherIn", { g: label(la) })} rows={r.top_up} onGene={onGene} cls="up" />
            <GeneTable title={t("de.higherIn", { g: label(lb) })} rows={r.top_down} onGene={onGene} cls="down" />
          </div>
        ) : !r.enrichment.library ? <p className="small muted">{t("de.lib.missing")}</p> : (
          <div className="de-two">
            <PathTable title={t("de.pathIn", { g: label(la) })} rows={r.enrichment.up} cls="up" />
            <PathTable title={t("de.pathIn", { g: label(lb) })} rows={r.enrichment.down} cls="down" />
          </div>
        )}
      </div>
    </div>
  );

  const explain = r ? (
    <>
      <div className="tiles">
        <div className="tile"><span className="eyebrow">{t("de.tile.up", { g: label(la) })}</span><b className="de-up">{r.n_up}</b><span className="mono small">{t("de.tile.of", { n: r.n_tested.toLocaleString() })}</span></div>
        <div className="tile"><span className="eyebrow">{t("de.tile.up", { g: label(lb) })}</span><b className="de-down">{r.n_down}</b>{r.n_low > 0 && <span className="mono small">{t("de.tile.low", { n: r.n_low.toLocaleString() })}</span>}</div>
      </div>
      <div className="side-card shows">
        <span className="eyebrow">{t("ws.whatShows")}</span><span className="small muted">{t("ws.fromNumbers")}</span>
        <p className="plain">{plain}</p>
        <p className="small">{t(r.compare === "tn" ? "de.note.tn" : r.compare === "gene" ? "de.note.gene" : "de.note.group")}</p>
      </div>
      <Method title={t("de.method.title")} body={t("de.method.body")} cite={`scipy · Welch 1947 · Benjamini & Hochberg 1995${libInfo?.citation ? ` · ${libInfo.citation.split(".")[0]}` : ""}`} />
      {libInfo?.licence && <p className="small muted de-licence">{t("de.licence", { l: t(`de.lib.${lib}`), v: libInfo.version ?? "", c: libInfo.licence })}</p>}
      <div className="side-card next"><span className="eyebrow">{t("ws.next")}</span><p className="small">{t("de.next")}</p></div>
    </>
  ) : (
    <>
      <Method title={t("de.method.title")} body={t("de.method.body")} cite="scipy · Welch 1947 · Benjamini & Hochberg 1995" />
      <div className="side-empty">{t("ws.sideEmpty")}</div>
    </>
  );

  return <Frame crumb={`${p.project.name}  /  ${t("nav.analyses")}  /  ${t("nav.de")}`} title={title} badges={badges} params={paramsUi}
    figure={figure} side={<SideTabs explain={explain} checks={r?.checks ?? null} />} onLater={onLater} analysis={r ? a.current : null} say={say} cohorts={a} />;
}

function GeneTable({ title, rows, onGene, cls }: { title: string; rows: DEGene[]; onGene: (g: string) => void; cls: string }) {
  const { t } = useT();
  return (
    <div className="de-col">
      <div className={`eyebrow de-${cls}`}>{title}</div>
      {rows.length ? (
        <div className="tbl-wrap de-tbl"><table className="tbl">
          <thead><tr><th>{t("de.col.gene")}</th><th className="num">log2 FC</th><th className="num">q</th></tr></thead>
          <tbody>{rows.slice(0, 15).map((g) => (
            <tr key={g.gene}><td><button className="link mono" title={t("de.openGene", { g: g.gene })} onClick={() => onGene(g.gene)}>{g.gene}</button></td>
              <td className="num">{fmt(g.lfc)}</td><td className="num">{fmtP(g.p_adj)}</td></tr>
          ))}</tbody>
        </table></div>
      ) : <p className="small muted">{t("de.none")}</p>}
    </div>
  );
}

function PathTable({ title, rows, cls }: { title: string; rows: EnrichRow[]; cls: string }) {
  const { t } = useT();
  const sig = rows.filter((r) => r.p_adj < 0.25);
  return (
    <div className="de-col">
      <div className={`eyebrow de-${cls}`}>{title}</div>
      {sig.length ? (
        <ul className="de-paths">{sig.slice(0, 10).map((r) => (
          <li key={r.id} title={r.genes.join(", ")}>
            <div className="row-between"><b>{r.name}</b><span className="mono small">q {fmtP(r.p_adj)}</span></div>
            <div className="de-bar"><span style={{ width: `${Math.min(100, r.ratio * 100 * 3)}%` }} /></div>
            <span className="small muted">{t("de.path.k", { k: r.k, n: r.size, f: fmt(r.fold) })} · <i>{r.genes.slice(0, 6).join(", ")}{r.genes.length > 6 ? "…" : ""}</i></span>
          </li>
        ))}</ul>
      ) : <p className="small muted">{t("de.path.none")}</p>}
    </div>
  );
}

