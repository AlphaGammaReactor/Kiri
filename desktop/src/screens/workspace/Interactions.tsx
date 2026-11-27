// Interactions & structure: STRING partners of my gene (and whether they move with it in the project's
// tumours), and the protein map from UniProt with AlphaFold confidence.
import { useCallback, useRef, useState } from "react";
import { useT } from "../../i18n";
import type { StringKey } from "../../i18n/strings";
import type { ProjectSummary } from "../../lib/api";
import { fmt, fmtP, type InteractionsResult, type Partner } from "../../lib/analyses";
import { Network } from "../../charts/Network";
import { ProteinMap } from "../../charts/ProteinMap";
import type { FigLang } from "../../charts/figStrings";
import { Frame, Param, FigureCard, SideTabs, Method, EmptyState, LoadingState, ErrorState, OutOfDate, useRunShortcut, runKeys } from "./Frame";
import { useAnalysis, cohortLabel } from "./useAnalysis";
import { errorText } from "./errors";

type View = "partners" | "protein";
const EVID: (keyof Partner)[] = ["experiments", "databases", "textmining", "coexpression"];

const FIGT = {
  en: { width: "line: STRING score", colour: "ρ in your tumours", missing: "not in your data", stat: "STRING {v} · score ≥ 0.4",
    title: "{g} · {name} · {len} aa", residues: "Residue", plddt: "AlphaFold pLDDT", bands: ["Very high (> 90)", "Confident (70–90)", "Low (50–70)", "Very low (< 50)"] as [string, string, string, string],
    tm: "Transmembrane", signal: "Signal / transit peptide", site: "Active site / motif", noModel: "No AlphaFold model for this protein." },
  zh: { width: "线宽：STRING 评分", colour: "你的肿瘤中的 ρ", missing: "不在你的数据中", stat: "STRING {v} · 评分 ≥ 0.4",
    title: "{g} · {name} · {len} 个氨基酸", residues: "残基", plddt: "AlphaFold pLDDT", bands: ["很高（> 90）", "可信（70–90）", "低（50–70）", "很低（< 50）"] as [string, string, string, string],
    tm: "跨膜区", signal: "信号肽 / 转运肽", site: "活性位点 / 基序", noModel: "该蛋白没有 AlphaFold 模型。" },
};
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

export function Interactions({ p, figLang, onFigLang, say, onLater, onGuide, onCorrelate }: {
  p: ProjectSummary; figLang: FigLang; onFigLang: (l: FigLang) => void; say: (s: string) => void; onLater: () => void; onGuide: () => void;
  onCorrelate: (a: string, b: string) => void;
}) {
  const { t } = useT();
  const a = useAnalysis(["interactions"]);
  const r = a.current?.kind === "interactions" && !(a.current.result as { error?: string }).error ? (a.current.result as InteractionsResult) : null;
  const targets = p.project.targets.length ? p.project.targets : ["TP53"];
  const [gene, setGene] = useState(targets[0]);
  const [view, setView] = useState<View>("partners");
  const [synced, setSynced] = useState<string | null>(null);
  if (a.current && synced !== a.current.id) { setSynced(a.current.id); setGene(a.current.params.gene); }
  const svgRef = useRef<SVGSVGElement>(null);
  const projects = a.cohort?.projects ?? p.project.datasets;
  const run = useCallback(() => a.run({ kind: "interactions", gene }), [a, gene]);
  useRunShortcut(run, a.phase.kind !== "running" && !!gene.trim());
  const stale = !!r && !!a.current && a.current.params.gene !== gene.trim().toUpperCase();
  const F = FIGT[figLang];
  const G = r?.gene ?? (gene.trim().toUpperCase() || "…");
  const title = t(view === "partners" ? "int.title" : "int.title.protein", { g: G });
  const tested = r ? r.partners.filter((x) => x.p_adj != null) : [];

  const badges = (
    <>
      <span className="badge ok">● {t("int.badge.src")}</span>
      {r && <span className="badge">● {t("int.badge.k", { k: r.partners.length, s: r.strong })}</span>}
      {r && r.n > 0 && <span className="badge ok">● {t("int.badge.coexp", { k: r.together.length, n: tested.length })}</span>}
    </>
  );

  const params = (
    <>
      <div className="row-between"><span className="eyebrow">{t("ws.parameters")}</span>
        <button className="link small" onClick={() => setView("partners")}>{t("ws.reset")}</button></div>
      <Param label={t("ws.gene")} help={t("ws.gene.help")}>
        <input className="text mono" list="kiri-targets-int" value={gene} onChange={(e) => setGene(e.target.value)} spellCheck={false} aria-label={t("ws.gene")} />
        <datalist id="kiri-targets-int">{targets.map((g) => <option key={g} value={g} />)}</datalist>
        {targets.length > 1 && (
          <div className="ws-genes" role="group" aria-label={t("ws.projectGenes")}>
            {targets.map((g) => <button key={g} className={`chip ${gene.trim().toUpperCase() === g.toUpperCase() ? "on" : ""}`} onClick={() => setGene(g)}>{g}</button>)}
          </div>
        )}
      </Param>
      <Param label={t("imm.view")}>
        <div className="segmented full">
          <button aria-pressed={view === "partners"} onClick={() => setView("partners")}>{t("int.view.partners")}</button>
          <button aria-pressed={view === "protein"} onClick={() => setView("protein")}>{t("int.view.protein")}</button>
        </div>
      </Param>
      <Param label={t("int.cohort")} help={t("int.cohort.help")}>
        <span className="small">{cohortLabel(projects)}</span>
      </Param>
      <p className="help">{t("int.source.help")}</p>
      <div className="run-row">
        <button className="btn primary" onClick={run} disabled={a.phase.kind === "running" || !gene.trim()}>{t("int.run")}</button>
        <span className="kbd">{runKeys}</span>
      </div>
    </>
  );

  let body;
  if (a.phase.kind === "running") body = <LoadingState steps={[t("int.load.string"), t("int.load.protein"), t("int.load.coexp"), t("load.checks")]} />;
  else if (a.phase.kind === "error") {
    const e = errorText(t, a.phase.code, { gene: String(a.phase.extra.gene ?? gene.toUpperCase()), ...a.phase.extra });
    body = <ErrorState {...e} code={a.phase.code} actions={<button className="btn primary" onClick={run}>{t("err.ws.retry")}</button>} />;
  } else if (!r) body = a.loaded ? <EmptyState title={t("int.empty.title")} body={t("int.empty.body", { g: gene.toUpperCase() })} onRun={run} onGuide={onGuide} /> : null;

  const plain = r ? [
    r.partners.length ? t("int.plain", { g: r.gene, k: r.partners.length, s: r.strong, top: r.partners.slice(0, 3).map((x) => x.gene).join(", ") }) : t("int.plainNone", { g: r.gene }),
    r.experimental.length ? t("int.plain.exp", { list: r.experimental.slice(0, 5).join(", ") }) : "",
    r.n > 0 ? t(r.together.length ? "int.plain.coexp" : "int.plain.coexpNone", { k: r.together.length, n: tested.length, list: r.together.slice(0, 5).join(", ") }) : t("int.plain.noCohort"),
    r.n > 0 && r.opposite.length ? t("int.plain.opposite", { k: r.opposite.length, list: r.opposite.slice(0, 5).join(", ") }) : "",
  ].filter(Boolean).join(" ") : "";
  const protPlain = r?.protein ? [
    t("int.prot.plain", { name: r.protein.name, len: r.protein.length, loc: r.protein.locations.join(", ") || "–" }),
    r.bands ? t("int.prot.bands", { hi: r.bands.very_high + r.bands.confident, lo: r.bands.low + r.bands.very_low }) : "",
  ].filter(Boolean).join(" ") : "";
  const caption = r ? (view === "partners"
    ? t("int.caption", { g: r.gene, k: r.partners.length, v: r.string_version ?? "", co: r.n ? cohortLabel(r.data_version.projects) : "–", n: r.n, d: r.fetched })
    : t("int.caption.protein", { g: r.gene, acc: r.protein?.accession ?? "–", af: r.alphafold?.id ?? "–", d: r.fetched })) : "";

  const figure = body ? <div className="fig-state">{body}</div> : r && (
    <div className="de-stack">
      {stale && <OutOfDate onRun={run} />}
      <FigureCard svgRef={svgRef} fileName={title} chartName={t(view === "partners" ? "int.chart" : "int.chart.protein")} why={t(view === "partners" ? "int.why" : "int.why.protein")}
        figLang={figLang} onFigLang={onFigLang} onSaid={say} onLater={onLater} readOnly={p.read_only} analysis={a.current} caption={caption}
        notebookBody={() => ({ analysis_id: a.current?.id, kind: "interactions", gene: r.gene, title, summary: view === "partners" ? plain : protPlain, checks: r.checks, meta: `STRING ${r.string_version ?? ""} · UniProt · AlphaFold DB · ${r.fetched}` })}>
        {view === "partners" || !r.protein ? (
          <Network ref={svgRef} gene={r.gene} nodes={r.partners.map((x) => ({ gene: x.gene, score: x.score, rho: x.rho, q: x.p_adj }))} edges={r.edges}
            labels={{ width: F.width, colour: F.colour, missing: F.missing, stat: fill(F.stat, { v: r.string_version ?? "" }) }} />
        ) : (
          <ProteinMap ref={svgRef} length={r.protein.length} features={r.protein.features} plddt={r.plddt}
            labels={{ title: fill(F.title, { g: r.gene, name: r.protein.name, len: r.protein.length }), residues: F.residues, plddt: F.plddt, bands: F.bands, tm: F.tm, signal: F.signal, site: F.site, noModel: F.noModel }} />
        )}
      </FigureCard>
      {view === "partners" && r.partners.length > 0 && (
        <div className="card de-results">
          <div className="row-between"><span className="eyebrow">{t("int.table")}</span><span className="small muted">{t("int.table.hint")}</span></div>
          <div className="tbl-wrap"><table className="tbl int-tbl">
            <thead><tr><th>{t("int.col.partner")}</th><th className="num">{t("int.col.score")}</th><th>{t("int.col.evidence")}</th><th className="num">ρ</th><th className="num">q</th><th /></tr></thead>
            <tbody>{r.partners.map((x) => (
              <tr key={x.gene}>
                <td className="mono">{x.gene}</td>
                <td className="num">{x.score.toFixed(2)}</td>
                <td><div className="int-ev">{EVID.map((k) => <span key={k} title={`${t(`int.ev.${k}` as StringKey)} ${Number(x[k]).toFixed(2)}`} className={`ev-${k}`} style={{ opacity: 0.15 + 0.85 * Number(x[k]) }}>{t(`int.evs.${k}` as StringKey)}</span>)}</div></td>
                <td className="num">{x.rho != null ? fmt(x.rho) : "–"}</td>
                <td className="num">{x.p_adj != null ? fmtP(x.p_adj) : "–"}</td>
                <td>{x.rho != null && <button className="link small" onClick={() => onCorrelate(r.gene, x.gene)}>{t("int.scatter")}</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );

  const explain = r ? (
    <>
      <div className="tiles">
        <div className="tile"><span className="eyebrow">{t("int.tile.partners")}</span><b>{r.partners.length}</b><span className="small">{t("int.tile.strong", { s: r.strong })}</span></div>
        <div className="tile"><span className="eyebrow">{t("int.tile.coexp")}</span><b className="de-up">{r.n ? r.together.length : "–"}</b><span className="small">{r.n ? t("int.tile.of", { n: tested.length }) + (r.opposite.length ? ` · ${t("int.tile.opposite", { k: r.opposite.length })}` : "") : t("int.tile.noCohort")}</span></div>
      </div>
      <div className="side-card shows">
        <span className="eyebrow">{t("ws.whatShows")}</span><span className="small muted">{t("ws.fromNumbers")}</span>
        <p className="plain">{view === "partners" ? plain : protPlain || t("int.prot.none")}</p>
        <p className="small">{t(view === "partners" ? "int.note" : "int.note.protein")}</p>
      </div>
      <Method title={t("int.method.title")} body={t("int.method.body")} cite="STRING (Szklarczyk 2023, CC BY 4.0) · UniProt (CC BY 4.0) · AlphaFold DB (Varadi 2024, CC BY 4.0)" />
      <div className="side-card next"><span className="eyebrow">{t("ws.next")}</span><p className="small">{t("int.next")}</p></div>
    </>
  ) : (
    <>
      <Method title={t("int.method.title")} body={t("int.method.body")} cite="STRING · UniProt · AlphaFold DB" />
      <div className="side-empty">{t("ws.sideEmpty")}</div>
    </>
  );

  return <Frame crumb={`${p.project.name}  /  ${t("nav.analyses")}  /  ${t("nav.interactions")}`} title={title} badges={badges} params={params}
    figure={figure} side={<SideTabs explain={explain} checks={r?.checks ?? null} />} onLater={onLater} analysis={r ? a.current : null} say={say} />;
}
