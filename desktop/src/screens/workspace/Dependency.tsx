// Cell line dependency (DepMap): does knocking the gene out slow cancer cells down, in the project's own
// cancer lineage and in every other? From the DepMap CRISPR screens, bundled with Kiri (works offline).
import { useCallback, useRef, useState } from "react";
import { useT } from "../../i18n";
import type { StringKey } from "../../i18n/strings";
import type { ProjectSummary } from "../../lib/api";
import { fmt, type DependencyResult } from "../../lib/analyses";
import { Dependency as DepChart } from "../../charts/Dependency";
import type { FigLang } from "../../charts/figStrings";
import { Frame, Param, Select, FigureCard, SideTabs, Method, EmptyState, LoadingState, ErrorState, OutOfDate, useRunShortcut, RunButton } from "./Frame";
import { useAnalysis } from "./useAnalysis";
import { errorText } from "./errors";

type Sort = "effect" | "name";

export const LIN_ZH: Record<string, string> = {
  Bowel: "肠", Breast: "乳腺", Lung: "肺", Pleura: "胸膜", Skin: "皮肤", Eye: "眼", "CNS/Brain": "中枢神经/脑", "Ovary/Fallopian Tube": "卵巢/输卵管",
  Pancreas: "胰腺", "Esophagus/Stomach": "食管/胃", Kidney: "肾", Liver: "肝", "Biliary Tract": "胆道", Prostate: "前列腺", Uterus: "子宫",
  "Head and Neck": "头颈", "Bladder/Urinary Tract": "膀胱/尿路", Myeloid: "髓系", Lymphoid: "淋巴系", "Soft Tissue": "软组织", Bone: "骨",
  Thyroid: "甲状腺", Cervix: "宫颈", "Adrenal Gland": "肾上腺", "Peripheral Nervous System": "周围神经系统", Testis: "睾丸", Thymus: "胸腺",
  Ampulla: "壶腹", Vulva: "外阴", Other: "其他", Fibroblast: "成纤维细胞", Muscle: "肌肉", Embryonal: "胚胎性",
};
export const linLabel = (l: string, zh: boolean) => (zh ? LIN_ZH[l] ?? l : l);
export const DEP_FIG = {
  en: { x: "CRISPR gene effect of {g} in cancer cell lines (0: no effect, −1: as for essential genes)", cut: "dependent ≤ −0.5", stat: "lines · dependent" },
  zh: { x: "{g} 在癌细胞系中的 CRISPR 基因效应（0：无影响；−1：与必需基因相当）", cut: "依赖 ≤ −0.5", stat: "细胞系 · 依赖比例" },
};

export function Dependency({ p, figLang, onFigLang, say, onLater, onGuide }: {
  p: ProjectSummary; figLang: FigLang; onFigLang: (l: FigLang) => void; say: (s: string) => void; onLater: () => void; onGuide: () => void;
}) {
  const { t } = useT();
  const a = useAnalysis(["dependency"]);
  const r = a.current?.kind === "dependency" && !(a.current.result as { error?: string }).error ? (a.current.result as DependencyResult) : null;
  const targets = p.project.targets.length ? p.project.targets : ["TP53"];
  const [gene, setGene] = useState(targets[0]);
  const [sort, setSort] = useState<Sort>("effect");
  const [synced, setSynced] = useState<string | null>(null);
  if (a.current && synced !== a.current.id) { setSynced(a.current.id); setGene(a.current.params.gene); }
  const svgRef = useRef<SVGSVGElement>(null);
  const run = useCallback(() => a.run({ kind: "dependency", gene }), [a, gene]);
  useRunShortcut(run, a.phase.kind !== "running" && !!gene.trim());
  const stale = !!r && !!a.current && a.current.params.gene !== gene.trim().toUpperCase();
  const zh = figLang === "zh";
  const F = DEP_FIG[figLang];
  const G = r?.gene ?? (gene.trim().toUpperCase() || "…");
  const title = t("dep.title", { g: G });
  const rows = r ? [...r.rows].sort((x, y) => (sort === "name" ? x.lineage.localeCompare(y.lineage) : (x.median ?? 0) - (y.median ?? 0))) : [];
  const f = r?.focus;

  const badges = (
    <>
      <span className="badge ok">● {t("dep.badge.src")}</span>
      {r && <span className="badge">● {t("dep.badge.n", { n: r.all.n, k: r.rows.length })}</span>}
      {r?.common_essential && <span className="badge warn">● {t("dep.badge.common")}</span>}
    </>
  );

  const params = (
    <>
      <div className="row-between"><span className="eyebrow">{t("ws.parameters")}</span><button className="link small" onClick={() => setSort("effect")}>{t("ws.reset")}</button></div>
      <Param label={t("ws.gene")} help={t("ws.gene.help")}>
        <input className="text mono" list="kiri-targets-dep" value={gene} onChange={(e) => setGene(e.target.value)} spellCheck={false} aria-label={t("ws.gene")} />
        <datalist id="kiri-targets-dep">{targets.map((g) => <option key={g} value={g} />)}</datalist>
        {targets.length > 1 && (
          <div className="ws-genes" role="group" aria-label={t("ws.projectGenes")}>
            {targets.map((g) => <button key={g} className={`chip ${gene.trim().toUpperCase() === g.toUpperCase() ? "on" : ""}`} onClick={() => setGene(g)}>{g}</button>)}
          </div>
        )}
      </Param>
      <Param label={t("acr.sort")}>
        <Select<Sort> value={sort} onChange={setSort} options={[{ value: "effect", label: t("dep.sort.effect") }, { value: "name", label: t("acr.sort.name") }]} />
      </Param>
      <p className="help">{t("dep.source.help")}</p>
      <div className="run-row"><RunButton onClick={run} disabled={a.phase.kind === "running" || !gene.trim()} label={t("dep.run")} /></div>
    </>
  );

  let body;
  if (a.phase.kind === "running") body = <LoadingState steps={[t("dep.load.table"), t("dep.load.gene", { g: gene.toUpperCase() }), t("load.checks")]} />;
  else if (a.phase.kind === "error") {
    const e = errorText(t, a.phase.code, { gene: String(a.phase.extra.gene ?? gene.toUpperCase()), ...a.phase.extra });
    body = <ErrorState {...e} code={a.phase.code} actions={<button className="btn primary" onClick={run}>{t("err.ws.retry")}</button>} />;
  } else if (!r) body = a.loaded ? <EmptyState title={t("dep.empty.title")} body={t("dep.empty.body", { g: gene.toUpperCase() })} onRun={run} onGuide={onGuide} /> : null;

  const plain = r ? plainDependency(r, t, zh) : "";
  const figure = body ? <div className="fig-state">{body}</div> : r && (
    <div className="de-stack acr-stack">
      {stale && <OutOfDate onRun={run} />}
      <FigureCard svgRef={svgRef} fileName={title} chartName={t("dep.chart")} why={t("dep.why")} figLang={figLang} onFigLang={onFigLang} onSaid={say} onLater={onLater} readOnly={p.read_only} analysis={a.current}
        caption={t("dep.caption", { g: r.gene, r: r.data_version.built })}
        notebookBody={() => ({ analysis_id: a.current?.id, kind: "dependency", gene: r.gene, title, summary: plain, checks: r.checks, meta: r.data_version.source })}>
        <DepChart ref={svgRef} rows={rows.map((x) => ({ ...x, label: linLabel(x.lineage, zh) }))} labels={{ x: F.x.replace("{g}", r.gene), cut: F.cut, stat: F.stat }} />
      </FigureCard>
    </div>
  );

  const explain = r ? (
    <>
      <div className="tiles">
        <div className="tile"><span className="eyebrow">{f ? linLabel(f.lineage, zh) : t("dep.tile.all")}</span><b className={(f ?? r.all).median != null && ((f ?? r.all).median ?? 0) <= -0.5 ? "de-up" : ""}>{fmt((f ?? r.all).median)}</b>
          <span className="mono small">{t("dep.tile.median")}</span></div>
        <div className="tile"><span className="eyebrow">{t("dep.tile.dep")}</span><b>{Math.round(((f ?? r.all).dep ?? 0) * 100)}%</b><span className="mono small">{t("dep.tile.of", { n: (f ?? r.all).n })}</span></div>
      </div>
      <div className="side-card shows">
        <span className="eyebrow">{t("ws.whatShows")}</span><span className="small muted">{t("ws.fromNumbers")}</span>
        <p className="plain">{plain}</p>
        <p className="small">{t("dep.note")}</p>
      </div>
      {r.opentargets && <OpenTargetsCard ot={r.opentargets} gene={r.gene} />}
      <Method title={t("dep.method.title")} body={t("dep.method.body")} cite={r.data_version.cite} />
    </>
  ) : (
    <>
      <Method title={t("dep.method.title")} body={t("dep.method.body")} cite="DepMap (CC BY 4.0) · Dempster et al. 2021 (Chronos)" />
      <div className="side-empty">{t("ws.sideEmpty")}</div>
    </>
  );

  return <Frame crumb={`${p.project.name}  /  ${t("nav.analyses")}  /  ${t("nav.dependency")}`} title={title} badges={badges} params={params}
    figure={figure} side={<SideTabs explain={explain} checks={r?.checks ?? null} />} onLater={onLater} analysis={r ? a.current : null} say={say} cohorts={null} />;
}

export function plainDependency(r: DependencyResult, t: ReturnType<typeof useT>["t"], zh = false) {
  const f = r.focus;
  const s = r.common_essential ? t("dep.plain.common", { g: r.gene, d: Math.round((r.all.dep ?? 0) * 100) })
    : f ? t((f.median ?? 0) <= -0.5 ? "dep.plain.yes" : (f.dep ?? 0) >= 0.2 ? "dep.plain.some" : "dep.plain.no",
      { g: r.gene, l: linLabel(f.lineage, zh), m: fmt(f.median), d: Math.round((f.dep ?? 0) * 100), n: f.n })
    : t("dep.plain.all", { g: r.gene, m: fmt(r.all.median), d: Math.round((r.all.dep ?? 0) * 100), n: r.all.n });
  const top = r.rows[0];
  return top && !r.common_essential && (top.median ?? 0) <= -0.5 && top.lineage !== f?.lineage
    ? `${s} ${t("dep.plain.top", { l: linLabel(top.lineage, zh), m: fmt(top.median) })}` : s;
}

const OT_TYPES = ["somatic_mutation", "genetic_association", "known_drug", "clinical", "affected_pathway", "rna_expression", "literature", "genetic_literature", "animal_model"] as const;

/** Open Targets: how strongly the gene is linked to the project's cancer, and by which kinds of evidence. */
function OpenTargetsCard({ ot, gene }: { ot: NonNullable<DependencyResult["opentargets"]>; gene: string }) {
  const { t } = useT();
  return (
    <div className="side-card ot-card">
      <span className="eyebrow">{t("ot.title")}</span>
      {ot.score == null ? <p className="small">{t("ot.none", { g: gene, d: ot.disease, m: ot.min_score })}</p> : <>
        <div className="row-between"><span className="small">{ot.disease}</span><b className="mono">{fmt(ot.score)}</b></div>
        <p className="small muted">{t("ot.rank", { r: ot.rank ?? 0, n: ot.linked.toLocaleString() })}</p>
        <table className="mini"><tbody>
          {OT_TYPES.filter((k) => ot.types[k] != null).map((k) => (
            <tr key={k}><td>{t(`ot.type.${k}` as StringKey)}</td><td className="ot-bar"><span style={{ width: `${Math.round((ot.types[k] ?? 0) * 100)}%` }} /></td><td className="mono">{fmt(ot.types[k])}</td></tr>
          ))}
        </tbody></table>
        <p className="small muted">{t("ot.note")}</p>
      </>}
      <div className="mono small muted">{ot.release} · CC0</div>
    </div>
  );
}
