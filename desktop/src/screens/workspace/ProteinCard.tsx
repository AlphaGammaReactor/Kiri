// Protein and tissue facts from the Human Protein Atlas (CC BY 4.0): CPTAC tumour-vs-normal protein, where in
// the cell the protein sits, the tissues with most RNA and with high antibody staining. Shown beside Expression.
import { useT } from "../../i18n";
import type { ExpressionResult } from "../../lib/analyses";

export type ProteinProfile = {
  gene: string;
  cptac?: { cancer: string | null; studied: boolean; rows: { cancer: string; log2fc: number | null; padj: number | null }[] };
  location?: string[]; reliability?: string | null;
  rna_top?: { tissue: string; ntpm: number | null }[]; ihc_high?: string[]; cell_top?: { cell: string; ntpm: number | null }[];
  source: { name: string; version: string; licence: string; url: string };
};

const fx = (v: number | null | undefined) => v == null ? "–" : (v > 0 ? "+" : "") + v.toFixed(2);
const sig = (q: number | null | undefined) => q != null && q < 0.05;

export function ProteinCard({ pr, r }: { pr: ProteinProfile; r: ExpressionResult }) {
  const { t, lang } = useT();
  const c = pr.cptac;
  const here = c?.studied ? c.rows.find((x) => x.cancer === c.cancer) : undefined;
  const others = (c?.rows ?? []).filter((x) => x !== here).sort((a, b) => Math.abs(b.log2fc ?? 0) - Math.abs(a.log2fc ?? 0)).slice(0, 5);
  // Tumour vs normal RNA in this project, against tumour vs normal protein in CPTAC.
  let agree: string | null = null;
  if (here && r.kind === "expression_tn" && r.effect.median_diff != null && r.test.p < 0.05 && sig(here.padj)) {
    agree = Math.sign(r.effect.median_diff) === Math.sign(here.log2fc ?? 0) ? t("hpa.agree") : t("hpa.disagree");
  }
  const word = (x: { log2fc: number | null; padj: number | null }) =>
    (x.log2fc ?? 0) > 0 ? t("hpa.higher", { x: (2 ** (x.log2fc ?? 0)).toFixed(1) }) : t("hpa.lower", { x: (2 ** -(x.log2fc ?? 0)).toFixed(1) });
  return (
    <div className="side-card hpa-card" data-testid="hpa-card">
      <span className="eyebrow">{t("hpa.title")}</span>
      {c && (
        <div className="hpa-block">
          <b className="small">{t("hpa.cptac")}</b>
          {here ? <p className="small">{sig(here.padj) ? t("hpa.here", { g: pr.gene, c: here.cancer, w: word(here) }) : t("hpa.hereSame", { g: pr.gene, c: here.cancer })} <span className="mono muted">{fx(here.log2fc)} log2</span></p>
            : <p className="small muted">{t("hpa.notHere")}</p>}
          {agree && <p className="small">{agree}</p>}
          {others.length > 0 && <table className="mini"><tbody>
            {others.map((x) => <tr key={x.cancer}><td>{x.cancer}</td><td className="mono">{fx(x.log2fc)}</td><td className="mono muted">{sig(x.padj) ? "q<0.05" : "n.s."}</td></tr>)}
          </tbody></table>}
        </div>
      )}
      {!!pr.location?.length && (
        <div className="hpa-block">
          <b className="small">{t("hpa.where")}</b>
          <p className="small">{pr.location.join(", ")}{pr.reliability && <span className="muted"> · {t("hpa.rel", { r: pr.reliability })}</span>}</p>
        </div>
      )}
      {!!pr.rna_top?.length && (
        <div className="hpa-block">
          <b className="small">{t("hpa.rna")}</b>
          <p className="small">{pr.rna_top.map((x) => `${x.tissue} (${x.ntpm == null ? "–" : Math.round(x.ntpm)} nTPM)`).join(", ")}</p>
        </div>
      )}
      {!!pr.cell_top?.length && (
        <div className="hpa-block">
          <b className="small">{t("hpa.cells")}</b>
          <p className="small">{pr.cell_top.map((x) => `${x.cell} (${x.ntpm == null ? "–" : Math.round(x.ntpm)})`).join(", ")}</p>
        </div>
      )}
      {!!pr.ihc_high?.length && (
        <div className="hpa-block">
          <b className="small">{t("hpa.ihc")}</b>
          <p className="small">{pr.ihc_high.length > 6 ? t("hpa.ihcMany", { n: pr.ihc_high.length }) : pr.ihc_high.join(", ")}</p>
        </div>
      )}
      {lang !== "en" && <p className="small muted">{t("hpa.enNames")}</p>}
      <div className="mono small muted">{pr.source.name} {pr.source.version} · {pr.source.licence}{c ? " · CPTAC" : ""}</div>
    </div>
  );
}
