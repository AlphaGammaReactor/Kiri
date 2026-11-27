// About (design page 18, frames 22): version and updates, how to cite, data sources, how Kiri is checked,
// what is new, licences and privacy.
import type React from "react";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useT } from "../i18n";
import { APP_VERSION } from "../lib/platform";
import type { UpdateState } from "../lib/updater";
import type { EngineState } from "../lib/engine";
import type { ProjectSummary } from "../lib/api";
const NOTES = import.meta.glob("../../release-notes/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const notes = NOTES[`../../release-notes/v${APP_VERSION}.md`] ?? "";

type Tab = "about" | "checked" | "new" | "licences" | "privacy";

// References for the data Kiri uses. Shown for the open project's cohorts.
const MSIGDB = "Liberzon A, et al. The Molecular Signatures Database Hallmark Gene Set Collection. Cell Syst. 2015;1(6):417–425. (MSigDB Hallmark 2024.1, CC BY 4.0)";
const REACTOME = "Milacic M, et al. The Reactome Pathway Knowledgebase 2024. Nucleic Acids Res. 2024;52(D1):D672–D678. (Reactome data, CC0)";
const XENA = "Goldman MJ, et al. Visualizing and interpreting cancer genomics data via the Xena platform. Nat Biotechnol. 2020;38:675–678.";
const GDC = "Grossman RL, et al. Toward a shared vision for cancer genomic data. N Engl J Med. 2016;375:1109–1112.";
const CDR = "Liu J, et al. An Integrated TCGA Pan-Cancer Clinical Data Resource to Drive High-Quality Survival Outcome Analytics. Cell. 2018;173:400–416. (progression-free interval and disease-specific survival)";
const SUBTYPES = "Sanchez-Vega F, et al. Oncogenic Signaling Pathways in The Cancer Genome Atlas. Cell. 2018;173:321–337. (molecular subtypes, from the TCGA marker papers)";
const DEPMAP = "DepMap, Broad Institute. DepMap 24Q4 Public (CC BY 4.0). Dempster JM, et al. Chronos: a cell population dynamics model of CRISPR experiments. Genome Biol. 2021;22:343. (cell line dependency)";
const OPENTARGETS = "Buniello A, et al. Open Targets Platform: facilitating therapeutic hypotheses building in drug discovery. Nucleic Acids Res. 2025;53:D1467–D1475. (CC0; target–disease associations)";
const GO = "Gene Ontology Consortium. The Gene Ontology knowledgebase in 2023. Genetics. 2023;224:iyad031. (CC BY 4.0; GO Biological Process sets via MSigDB)";
const WIKIPATHWAYS = "Agrawal A, et al. WikiPathways 2024: next generation pathway database. Nucleic Acids Res. 2024;52:D679–D689. (CC0)";
const PURITY = "Taylor AM, et al. Genomic and Functional Approaches to Understanding Cancer Aneuploidy. Cancer Cell. 2018;33:676–689. (ABSOLUTE tumour purity)";
const TCGA: Record<string, string> = {
  "TCGA-COAD": "Cancer Genome Atlas Network. Comprehensive molecular characterization of human colon and rectal cancer. Nature. 2012;487:330–337.",
  "TCGA-READ": "Cancer Genome Atlas Network. Comprehensive molecular characterization of human colon and rectal cancer. Nature. 2012;487:330–337.",
  "TCGA-BRCA": "Cancer Genome Atlas Network. Comprehensive molecular portraits of human breast tumours. Nature. 2012;490:61–70.",
};

export function About({ update, onCheck, engine, project }: { update: UpdateState; onCheck: () => void; engine: EngineState; project?: ProjectSummary | null }) {
  const { t, lang } = useT();
  const [tab, setTab] = useState<Tab>("about");
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (k: string, s: string) => { navigator.clipboard?.writeText(s); setCopied(k); setTimeout(() => setCopied(null), 1500); };
  const cite = t("about.citeText", { v: APP_VERSION });
  const fmt = (d?: Date) => d ? d.toLocaleTimeString(lang === "en" ? "en-GB" : "zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
  let badge: React.JSX.Element;
  switch (update.kind) {
    case "checking": badge = <span className="badge">{t("update.checking")}</span>; break;
    case "downloading": badge = <span className="badge">{t("update.downloading", { p: update.percent == null ? "" : update.percent + "%" })}</span>; break;
    case "ready": case "installing": badge = <span className="badge warn">● {t("update.available", { v: update.version })}</span>; break;
    case "error": badge = <span className="badge warn" title={update.message}>● {update.reason === "signature" ? t("upd.sigShort") : update.reason === "download" ? t("upd.dl.failed") : t("update.error")}</span>; break;
    case "unsupported": badge = <span className="badge">{t("update.devBuild")}</span>; break;
    default: badge = update.checkedAt ? <span className="badge ok">● {t("update.upToDate")}</span> : <span className="badge">{t("update.notChecked")}</span>;
  }
  const checkedAt = update.kind === "idle" ? update.checkedAt : update.kind === "error" ? update.checkedAt : undefined;
  const ds = (project?.project.datasets ?? []).filter((d) => d.startsWith("TCGA-"));
  const refs = [...new Set(ds.map((d) => TCGA[d]).filter(Boolean)), GDC, XENA, CDR, SUBTYPES, PURITY, DEPMAP, OPENTARGETS, MSIGDB, REACTOME, GO, WIKIPATHWAYS];
  const CopyBtn = ({ k, s }: { k: string; s: string }) => (
    <button className="icon-btn" aria-label={t("about.copy")} onClick={() => copy(k, s)}>{copied === k ? <Check size={15} /> : <Copy size={15} />}</button>
  );
  const tabs: Tab[] = ["about", "checked", "new", "licences", "privacy"];

  return (
    <div className="split">
      <div className="split-nav" style={{ paddingTop: 0 }}>
        {tabs.map((k) => <button key={k} className="nav-item" aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>{t(`about.nav.${k}` as never)}</button>)}
      </div>
      <section className="card panel">
        {tab === "about" && (
          <>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div className="app-mark">K</div>
              <div style={{ flex: 1 }}>
                <div style={{ font: "400 26px var(--font-display)" }} data-testid="about-version">Kiri {APP_VERSION}</div>
                <div className="sub">{t("about.tagline")}</div>
              </div>
              <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
                {badge}
                <span className="mono muted" style={{ fontSize: 11.5 }}>
                  {checkedAt ? t("update.checkedAt", { t: fmt(checkedAt) }) : ""}
                  {update.kind !== "unsupported" && <button className="btn ghost" style={{ height: 22, fontSize: 12 }} onClick={onCheck}>{t("update.checkNow")}</button>}
                </span>
              </div>
            </div>
            <div className="eyebrow" style={{ marginTop: 22 }}>{t("about.cite")}</div>
            <div className="cite"><span className="mono">{cite}</span><CopyBtn k="kiri" s={cite} /></div>
            <div className="eyebrow" style={{ marginTop: 22 }}>{project ? t("about.sources") : t("about.sourcesAll")}</div>
            {refs.map((r) => <div key={r} className="ref-row"><span className="small">{r}</span><CopyBtn k={r} s={r} /></div>)}
            <div className="row-gap" style={{ marginTop: 12 }}><button className="btn" onClick={() => copy("all", [cite, ...refs].join("\n"))}>{copied === "all" ? t("about.copied") : t("about.copyAll")}</button></div>
            <div className="eyebrow" style={{ marginTop: 22 }}>{t("about.engine")}</div>
            <div className="kv"><span>{engine.status === "ready" ? `Python engine ${engine.version} · 127.0.0.1:${engine.port}` : engine.status === "failed" ? `${t("engine.failed")} (${engine.message})` : t("engine.starting")}</span></div>
          </>
        )}
        {tab === "checked" && (
          <>
            <h2 className="panel-title">{t("about.nav.checked")}</h2>
            {(["1", "2", "3", "4", "5"] as const).map((n) => <div key={n} className="check-row"><Check size={16} className="accent" /><div><b>{t(`about.chk.${n}.t` as never)}</b><p className="small muted" style={{ margin: "2px 0 0" }}>{t(`about.chk.${n}.b` as never)}</p></div></div>)}
            <p className="small muted" style={{ marginTop: 16 }}>{t("about.chk.not")}</p>
          </>
        )}
        {tab === "new" && (
          <>
            <h2 className="panel-title">{t("about.nav.new")} · {APP_VERSION}</h2>
            <div className="notes">{notes.split("\n").filter(Boolean).map((l, i) => l.startsWith("- ") ? <li key={i}>{l.slice(2)}</li> : <p key={i}>{l}</p>)}</div>
            {lang !== "en" && <p className="small muted">{t("about.new.enOnly")}</p>}
          </>
        )}
        {tab === "licences" && (
          <>
            <h2 className="panel-title">{t("about.nav.licences")}</h2>
            <p style={{ maxWidth: 640, color: "var(--color-text-secondary)" }}>{t("about.licences.body")}</p>
            <table className="tbl" style={{ maxWidth: 640 }}><tbody>
              {[["Tauri", "MIT / Apache-2.0"], ["React", "MIT"], ["Python", "PSF"], ["FastAPI", "MIT"], ["NumPy", "BSD-3-Clause"], ["pandas", "BSD-3-Clause"], ["SciPy", "BSD-3-Clause"], ["lifelines", "MIT"], ["ReportLab", "BSD"], ["svglib", "LGPL-3.0"], ["Lucide icons", "ISC"], ["MSigDB Hallmark gene sets 2024.1 (Broad Institute)", "CC BY 4.0"], ["Reactome pathways", "CC0 1.0"], ["HGNC gene symbols", "CC0 1.0"]].map(([a, b]) => <tr key={a}><td>{a}</td><td className="mono small">{b}</td></tr>)}
            </tbody></table>
            <p className="small muted">{t("about.licences.data")}</p>
          </>
        )}
        {tab === "privacy" && (
          <>
            <h2 className="panel-title">{t("about.nav.privacy")}</h2>
            {(["1", "2", "3", "4"] as const).map((n) => <div key={n} className="check-row"><Check size={16} className="accent" /><div><b>{t(`about.priv.${n}.t` as never)}</b><p className="small muted" style={{ margin: "2px 0 0" }}>{t(`about.priv.${n}.b` as never)}</p></div></div>)}
          </>
        )}
      </section>
    </div>
  );
}
