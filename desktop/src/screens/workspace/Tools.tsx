// Figure toolbar tools: the data table behind a figure, Reproduce (settings, data version, re-check), and the code.
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Loader2, TriangleAlert } from "lucide-react";
import { useT } from "../../i18n";
import type { StringKey } from "../../i18n/strings";
import { analyses, fmt, fmtP, type Analysis, type ExpressionResult, type SurvivalResult } from "../../lib/analyses";
import { pickExportPath } from "../../lib/files";
import { APP_VERSION } from "../../lib/platform";
import { Dialog } from "../../shell/Dialog";

type Rows = Awaited<ReturnType<typeof analyses.rows>>;

const csvCell = (v: unknown) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (r: Rows) => [r.columns.join(","), ...r.rows.map((row) => row.map(csvCell).join(","))].join("\n") + "\n";
const safeName = (s: string) => s.replace(/[\\/:*?"<>|·]/g, "-").replace(/\s+/g, " ").trim();

async function saveText(path: string, text: string) {
  return analyses.exportFile(path, new TextEncoder().encode(text));
}

function useRows(a: Analysis | null) {
  const [rows, setRows] = useState<Rows | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => { if (a) analyses.rows(a.id).then(setRows).catch((e) => setFailed(e?.code ?? "engine")); }, [a?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return { rows, failed };
}

/** The per-sample rows behind the figure, with a CSV save. */
export function DataTableDialog({ a, fileName, onClose, say }: { a: Analysis; fileName: string; onClose: () => void; say: (s: string) => void }) {
  const { t } = useT();
  const { rows, failed } = useRows(a);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    if (!rows) return [];
    const f = q.trim().toLowerCase();
    return (f ? rows.rows.filter((r) => r.some((c) => String(c ?? "").toLowerCase().includes(f))) : rows.rows);
  }, [rows, q]);
  const save = async () => {
    if (!rows) return;
    const path = await pickExportPath(t("tbl.save"), safeName(`${fileName} data`), "csv");
    if (!path) return;
    try { const r = await saveText(path, toCsv(rows)); say(t("fig.saved", { p: r.path })); } catch { say(t("fig.saveFailed")); }
  };
  return (
    <Dialog title={t("tbl.title")} onClose={onClose} width={820}
      footer={<><span className="small muted" style={{ marginRight: "auto" }}>{rows ? t("tbl.count", { n: rows.rows.length, u: rows.units }) : ""}</span>
        <button className="btn ghost" onClick={onClose}>{t("err.close")}</button>
        <button className="btn primary" onClick={save} disabled={!rows}><Download size={15} />{t("tbl.saveCsv")}</button></>}>
      <p className="small">{t(`tbl.body.${a.kind}` as StringKey)}</p>
      <input className="text" placeholder={t("tbl.filter")} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
      {failed ? <p className="warn-text">{t("tbl.failed", { c: failed })}</p> : !rows ? <div className="state"><Loader2 className="spin" size={22} /></div> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>{rows.columns.map((c) => <th key={c}>{t(`tbl.col.${c}` as StringKey) ?? c}</th>)}</tr></thead>
            <tbody>
              {shown.slice(0, 500).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === "number" ? "num" : ""}>{typeof c === "number" ? (Number.isInteger(c) ? c : c.toFixed(3)) : c ?? "–"}</td>)}</tr>)}
            </tbody>
          </table>
          {shown.length > 500 && <p className="small muted">{t("tbl.more", { n: shown.length - 500 })}</p>}
        </div>
      )}
    </Dialog>
  );
}

/** Reproduce: what was run on which data, a re-check, and scripts that recompute the numbers from the CSV. */
export function ReproduceDialog({ a, fileName, initialTab = "record", onClose, say }: {
  a: Analysis; fileName: string; initialTab?: "record" | "r" | "py"; onClose: () => void; say: (s: string) => void;
}) {
  const { t, lang } = useT();
  const [tab, setTab] = useState(initialTab);
  const [check, setCheck] = useState<null | "running" | { same: boolean; before: string; after: string } | { error: string }>(null);
  const { rows } = useRows(a);
  const dv = a.data_versions;
  const csvName = `${safeName(fileName)} data.csv`;
  const locale = lang === "en" ? "en-GB" : "zh-CN";
  const p = a.params;
  const settings = a.kind === "survival"
    ? [t(`surv.cut.${p.cut ?? "median"}` as StringKey), p.adjust?.length ? t("repro.adjusted", { c: p.adjust.map((x) => t(x === "age" ? "surv.adj.age" : "surv.adj.stage").toLowerCase()).join(", ") }) : t("repro.unadjusted")].join(" · ")
    : (a.kind as string) === "signature" ? t("sig.repro.settings", { s: String((a.result as { set_name?: string }).set_name ?? (p as { set_id?: string }).set_id ?? ""), n: sigMembers(a).length })
    : a.kind === "expression_tn" ? (p.paired ? t("repro.paired") : t("repro.unpaired"))
    : a.kind === "across" ? (p.normal === "tcga" ? t("acr.normal.tcga") : t("acr.normal.gtex"))
    : a.kind === "de" ? t("repro.de", { c: t(`de.cmp.${p.compare ?? "tn"}` as StringKey, { g: p.gene ?? "" }), l: p.lfc ?? 1, q: p.q ?? 0.05, lib: t(`de.lib.${p.library ?? "hallmark"}` as StringKey) }) : (p as { gene2?: string }).gene2 ? t("repro.withGene", { g: (p as { gene2?: string }).gene2! }) : "–";
  const headline = (r: unknown) => {
    const x = r as Partial<Omit<SurvivalResult, "kind">> & Partial<Omit<ExpressionResult, "kind">> & { rho?: number; p?: number };
    if (a.kind === "survival") return `HR ${fmt((x.cox_adjusted ?? x.cox)?.hr)} · p = ${fmtP(x.p_report)}`;
    if (a.kind === "across") { const d = r as { n_up?: number; n_down?: number; n_tested?: number }; return `${d.n_up} up · ${d.n_down} down / ${d.n_tested}`; }
    if (a.kind === "de") { const d = r as { n_up?: number; n_down?: number; n_tested?: number }; return `${d.n_up} up · ${d.n_down} down / ${d.n_tested}`; }
    if ((a.kind as string) === "correlation" || (a.kind as string) === "signature") return `ρ = ${fmt(x.rho)} · p = ${fmtP(x.p)}`;
    return `p = ${fmtP(x.test?.p)}`;
  };
  const recheck = async () => {
    setCheck("running");
    try {
      const b = await analyses.run({ ...(a.params as Parameters<typeof analyses.run>[0]), check_only: true });
      const err = (b.result as { error?: string }).error;
      if (err) { setCheck({ error: err }); return; }
      const before = headline(a.result), after = headline(b.result);
      setCheck({ same: before === after, before, after });
    } catch (e) { setCheck({ error: (e as { code?: string }).code ?? "engine" }); }
  };
  const code = tab === "r" ? rScript(a, csvName) : tab === "py" ? pyScript(a, csvName) : "";
  const header = `# ${t(`ov.kind.${a.kind}` as StringKey)} · ${p.gene}${(p as { gene2?: string }).gene2 ? ` · ${(p as { gene2?: string }).gene2}` : ""}\n# Kiri ${APP_VERSION} · ${new Date(a.updated_at).toISOString().slice(0, 16).replace("T", " ")} UTC\n# Data: ${dv.source} · ${dv.units} · built ${dv.built} · ${dv.projects.join(", ")}\n# Save the data table as "${csvName}" in the same folder, then run this script.\n\n`;
  const saveAll = async () => {
    const path = await pickExportPath(t("repro.saveCode"), safeName(fileName), tab === "r" ? "R" : "py");
    if (!path || !rows) return;
    try {
      await saveText(path, header + code);
      const dir = path.replace(/[\\/][^\\/]*$/, "");
      const sep = path.includes("\\") ? "\\" : "/";
      await saveText(`${dir}${sep}${csvName}`, toCsv(rows));
      say(t("repro.savedBoth", { p: dir }));
    } catch { say(t("fig.saveFailed")); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(header + code); say(t("repro.scriptCopied")); } catch { say(t("fig.copyFailed")); } };

  return (
    <Dialog title={t("repro.title")} onClose={onClose} width={820}
      footer={tab === "record"
        ? <><button className="btn ghost" onClick={onClose}>{t("err.close")}</button><button className="btn primary" onClick={recheck} disabled={check === "running"}>{check === "running" ? <Loader2 size={15} className="spin" /> : null}{t("repro.recheck")}</button></>
        : <><button className="btn ghost" onClick={copy}><Copy size={15} />{t("repro.copyScript")}</button><button className="btn primary" onClick={saveAll} disabled={!rows}><Download size={15} />{t("repro.saveBoth")}</button></>}>
      <div className="tabs" role="tablist" style={{ marginBottom: 12 }}>
        <button role="tab" aria-selected={tab === "record"} onClick={() => setTab("record")}>{t("repro.tab.record")}</button>
        <button role="tab" aria-selected={tab === "r"} onClick={() => setTab("r")}>R</button>
        <button role="tab" aria-selected={tab === "py"} onClick={() => setTab("py")}>Python</button>
      </div>
      {tab === "record" ? (
        <>
          <p className="small">{t("repro.body")}</p>
          <dl className="rep-grid">
            <dt>{t("repro.analysis")}</dt><dd>{t(`ov.kind.${a.kind}` as StringKey)} · <span className="mono">{p.gene}{(p as { gene2?: string }).gene2 ? ` · ${(p as { gene2?: string }).gene2}` : ""}</span></dd>
            <dt>{t("repro.settings")}</dt><dd>{settings}</dd>
            <dt>{t("repro.result")}</dt><dd className="mono">{headline(a.result)}</dd>
            <dt>{t("repro.cohort")}</dt><dd className="mono">{dv.projects.join(", ")}{rows ? ` · ${t("tbl.count", { n: rows.rows.length, u: dv.units })}` : ""}</dd>
            <dt>{t("repro.source")}</dt><dd>{dv.source}</dd>
            <dt>{t("repro.built")}</dt><dd className="mono">{dv.built}</dd>
            <dt>{t("repro.when")}</dt><dd className="mono">{new Date(a.updated_at).toLocaleString(locale)}</dd>
            <dt>{t("repro.method")}</dt><dd>{t(`repro.method.${a.kind}` as StringKey)}</dd>
            <dt>{t("repro.id")}</dt><dd className="mono small">{a.id}</dd>
          </dl>
          {check && check !== "running" && ("error" in check
            ? <div className="note warn"><TriangleAlert size={15} />{t("repro.checkFailed", { c: check.error })}</div>
            : check.same ? <div className="note ok"><Check size={15} />{t("repro.same", { r: check.after })}</div>
              : <div className="note warn"><TriangleAlert size={15} />{t("repro.differs", { a: check.before, b: check.after })}</div>)}
        </>
      ) : (
        <>
          <p className="small">{t(tab === "r" ? "repro.code.r" : "repro.code.py")}</p>
          <pre className="code-block">{header + code}</pre>
        </>
      )}
    </Dialog>
  );
}

function rScript(a: Analysis, csv: string) {
  const p = a.params;
  if (a.kind === "survival") {
    const adj = p.adjust ?? [];
    return `library(survival)   # install.packages("survival") if needed

d <- read.csv("${csv}")
d$high <- as.integer(d$group == "high")   # split at ${p.cut === "quartile" ? "the top and bottom quarters" : p.cut === "optimal" ? "the cutpoint Kiri chose" : "the median"} of expression

# Kaplan-Meier curves and the log-rank test
fit <- survfit(Surv(time_months, event) ~ group, data = d)
print(fit)                                  # n, events and median survival per group
survdiff(Surv(time_months, event) ~ group, data = d)
${p.cut === "optimal" ? "# Kiri reports the log-rank p adjusted for the cutpoint search (Miller-Siegmund);\n# the raw p printed here is smaller and should not be reported on its own.\n" : ""}
# Cox model: hazard ratio for high against low expression
summary(coxph(Surv(time_months, event) ~ high, data = d))
${adj.length ? `
# Adjusted for ${adj.join(" and ")} (patients with ${adj.join(" and ")} recorded)
d2 <- d${adj.includes("age") ? "\nd2 <- subset(d2, !is.na(age))" : ""}${adj.includes("stage") ? '\nd2 <- subset(d2, stage %in% c("I", "II", "III", "IV"))\nd2$stage_n <- match(d2$stage, c("I", "II", "III", "IV"))' : ""}
summary(coxph(Surv(time_months, event) ~ high${adj.includes("age") ? " + age" : ""}${adj.includes("stage") ? " + stage_n" : ""}, data = d2))
` : ""}
plot(fit, col = c("#b5462f", "#2f6b8f"), xlab = "Months", ylab = "Overall survival", mark.time = TRUE)
legend("topright", legend = levels(factor(d$group)), col = c("#b5462f", "#2f6b8f"), lty = 1)
`;
  }
  if (a.kind === "expression_tn") return `d <- read.csv("${csv}")
d$group <- factor(d$group, levels = c("tumour", "normal"))

tapply(d$expression, d$group, summary)       # n, median and quartiles per group

# Wilcoxon rank-sum test (Mann-Whitney U)
wilcox.test(expression ~ group, data = d)
${p.paired ? `
# Matched pairs: tumour and normal from the same patient
pairs <- merge(aggregate(expression ~ patient, subset(d, group == "tumour"), mean),
               aggregate(expression ~ patient, subset(d, group == "normal"), mean), by = "patient")
wilcox.test(pairs$expression.x, pairs$expression.y, paired = TRUE)
` : ""}
boxplot(expression ~ group, data = d, outline = FALSE, ylab = "${a.data_versions.units}")
stripchart(expression ~ group, data = d, vertical = TRUE, method = "jitter", add = TRUE, pch = 16, cex = 0.4)
`;
  if (a.kind === "across") return `# One row per sample, from the UCSC Toil recompute of TCGA and GTEx (log2(TPM + 1)).
d <- read.csv("${csv}", check.names = FALSE)
v <- d[[5]]
cancers <- sort(unique(d$cancer_or_tissue[d$study == "TCGA"]))
out <- data.frame(cancer = cancers, p = NA, diff = NA)
for (i in seq_along(cancers)) {
  tum <- v[d$study == "TCGA" & d$cancer_or_tissue == cancers[i] & d$group == "tumour"]
  nor <- v[d$study == "TCGA" & d$cancer_or_tissue == cancers[i] & d$group == "normal"]
  # Kiri also adds GTEx normals of the matching organ when that option is on (see the GTEx rows).
  if (length(tum) >= 3 && length(nor) >= 3) {
    out$p[i] <- wilcox.test(tum, nor)$p.value
    out$diff[i] <- median(tum) - median(nor)
  }
}
out$q <- p.adjust(out$p, method = "BH")
out[order(out$q), ]
`;
  if (a.kind === "de") return `# One row per tested gene, as Kiri computed it (Welch t-test per gene on log2 values).
# The per-sample matrix is in the project's cohort files; this script checks the
# multiple-testing correction and the thresholds, and redraws the volcano plot.
d <- read.csv("${csv}", check.names = FALSE)
d$q <- p.adjust(d$p, method = "BH")            # should match p_adj_BH
summary(abs(d$q - d$p_adj_BH))
lfc <- ${p.lfc ?? 1}; qcut <- ${p.q ?? 0.05}
up <- d$q < qcut & d$log2_fold_change >= lfc
down <- d$q < qcut & d$log2_fold_change <= -lfc
c(up = sum(up), down = sum(down), tested = nrow(d))
plot(d$log2_fold_change, -log10(d$p), pch = 16, cex = 0.4,
     col = ifelse(up, "#c8641a", ifelse(down, "#2a6fa8", "grey70")),
     xlab = "log2 fold change", ylab = "-log10 p")
abline(v = c(-lfc, lfc), h = -log10(max(d$p[d$q < qcut])), lty = 2)
`;
  if (a.kind === "expression_group") return `d <- read.csv("${csv}")
tapply(d$expression, d$group, summary)
if (length(unique(d$group)) == 2) wilcox.test(expression ~ group, data = d) else {
  kruskal.test(expression ~ group, data = d)
  pairwise.wilcox.test(d$expression, d$group, p.adjust.method = "BH")
}
boxplot(expression ~ group, data = d, outline = FALSE, ylab = "${a.data_versions.units}")
`;
  if (a.kind === "expression_stage") return `d <- read.csv("${csv}")
d$group <- factor(d$group, levels = c("I", "II", "III", "IV"))

tapply(d$expression, d$group, summary)       # n, median and quartiles per stage

# Kruskal-Wallis test across stages, then pairwise tests with Benjamini-Hochberg correction
kruskal.test(expression ~ group, data = d)
pairwise.wilcox.test(d$expression, d$group, p.adjust.method = "BH")

boxplot(expression ~ group, data = d, outline = FALSE, xlab = "Stage", ylab = "${a.data_versions.units}")
stripchart(expression ~ group, data = d, vertical = TRUE, method = "jitter", add = TRUE, pch = 16, cex = 0.4)
`;
  if ((a.kind as string) === "signature") return sigR(a, csv);
  const g2 = (p as { gene2?: string }).gene2 ?? "";
  return `d <- read.csv("${csv}", check.names = FALSE)
x <- d[["${p.gene}"]]; y <- d[["${g2}"]]

cor.test(x, y, method = "spearman", exact = FALSE)   # what Kiri reports
cor.test(x, y, method = "pearson")                   # for comparison

plot(x, y, pch = 16, cex = 0.5, xlab = "${p.gene}", ylab = "${g2}")
abline(lm(y ~ x), col = "#2f6b8f")
`;
}

function pyScript(a: Analysis, csv: string) {
  const p = a.params;
  if (a.kind === "survival") {
    const adj = p.adjust ?? [];
    return `import pandas as pd                        # pip install pandas lifelines
from lifelines import CoxPHFitter, KaplanMeierFitter
from lifelines.statistics import logrank_test

d = pd.read_csv("${csv}")
d["high"] = (d["group"] == "high").astype(int)
hi, lo = d[d.high == 1], d[d.high == 0]

for name, g in (("high", hi), ("low", lo)):
    km = KaplanMeierFitter().fit(g.time_months, g.event, label=name)
    print(name, "n =", len(g), "events =", int(g.event.sum()), "median =", km.median_survival_time_)

print("log-rank p =", logrank_test(hi.time_months, lo.time_months, hi.event, lo.event).p_value)
${p.cut === "optimal" ? "# Kiri reports this p adjusted for the cutpoint search (Miller-Siegmund); do not report the raw p alone.\n" : ""}
CoxPHFitter().fit(d[["time_months", "event", "high"]], "time_months", "event").print_summary()
${adj.length ? `
d2 = d.copy()${adj.includes("age") ? "\nd2 = d2[d2.age.notna()]" : ""}${adj.includes("stage") ? '\nd2 = d2[d2.stage.isin(["I", "II", "III", "IV"])].copy()\nd2["stage_n"] = d2.stage.map({"I": 1, "II": 2, "III": 3, "IV": 4})' : ""}
CoxPHFitter().fit(d2[["time_months", "event", "high"${adj.includes("age") ? ', "age"' : ""}${adj.includes("stage") ? ', "stage_n"' : ""}]], "time_months", "event").print_summary()
` : ""}`;
  }
  if (a.kind === "expression_tn") return `import pandas as pd                        # pip install pandas scipy
from scipy import stats

d = pd.read_csv("${csv}")
print(d.groupby("group").expression.describe())

t, n = d[d.group == "tumour"].expression, d[d.group == "normal"].expression
print("Wilcoxon rank-sum p =", stats.mannwhitneyu(t, n, alternative="two-sided").pvalue)
${p.paired ? `
pt = d[d.group == "tumour"].groupby("patient").expression.mean()
pn = d[d.group == "normal"].groupby("patient").expression.mean()
both = pt.index.intersection(pn.index)
print("signed-rank p =", stats.wilcoxon(pt[both], pn[both]).pvalue, "pairs =", len(both))
` : ""}`;
  if (a.kind === "across") return `import pandas as pd                        # pip install pandas scipy statsmodels
from scipy import stats
from statsmodels.stats.multitest import multipletests

# One row per sample, from the UCSC Toil recompute of TCGA and GTEx (log2(TPM + 1)).
d = pd.read_csv("${csv}")
v = d.columns[4]
rows = []
for c, x in d[d.study == "TCGA"].groupby("cancer_or_tissue"):
    tum, nor = x[x.group == "tumour"][v], x[x.group == "normal"][v]
    # Kiri also adds GTEx normals of the matching organ when that option is on (see the GTEx rows).
    if len(tum) >= 3 and len(nor) >= 3:
        rows.append((c, tum.median() - nor.median(), stats.mannwhitneyu(tum, nor, alternative="two-sided").pvalue))
r = pd.DataFrame(rows, columns=["cancer", "diff", "p"])
r["q"] = multipletests(r.p, method="fdr_bh")[1]
print(r.sort_values("q"))
`;
  if (a.kind === "de") return `import numpy as np, pandas as pd              # pip install pandas statsmodels matplotlib
from statsmodels.stats.multitest import multipletests
import matplotlib.pyplot as plt

# One row per tested gene, as Kiri computed it (Welch t-test per gene on log2 values).
d = pd.read_csv("${csv}")
d["q"] = multipletests(d.p, method="fdr_bh")[1]            # should match p_adj_BH
print("largest difference from Kiri:", (d.q - d.p_adj_BH).abs().max())
lfc, qcut = ${p.lfc ?? 1}, ${p.q ?? 0.05}
up = (d.q < qcut) & (d.log2_fold_change >= lfc)
down = (d.q < qcut) & (d.log2_fold_change <= -lfc)
print("up", up.sum(), "down", down.sum(), "tested", len(d))
c = np.where(up, "#c8641a", np.where(down, "#2a6fa8", "#bbbbbb"))
plt.scatter(d.log2_fold_change, -np.log10(d.p), s=4, c=c)
plt.xlabel("log2 fold change"); plt.ylabel("-log10 p"); plt.show()
`;
  if (a.kind === "expression_group") return `import pandas as pd                        # pip install pandas scipy
from scipy import stats

d = pd.read_csv("${csv}")
groups = {k: g.expression for k, g in d.groupby("group")}
print(d.groupby("group").expression.describe())
if len(groups) == 2:
    print(stats.mannwhitneyu(*groups.values(), alternative="two-sided"))
else:
    print("Kruskal-Wallis p =", stats.kruskal(*groups.values()).pvalue)
`;
  if (a.kind === "expression_stage") return `import itertools
import pandas as pd                        # pip install pandas scipy statsmodels
from scipy import stats
from statsmodels.stats.multitest import multipletests

d = pd.read_csv("${csv}")
groups = {k: g.expression for k, g in d.groupby("group")}
print(d.groupby("group").expression.describe())
print("Kruskal-Wallis p =", stats.kruskal(*groups.values()).pvalue)

pairs = list(itertools.combinations(sorted(groups), 2))
raw = [stats.mannwhitneyu(groups[a], groups[b], alternative="two-sided").pvalue for a, b in pairs]
for (a, b), p, q in zip(pairs, raw, multipletests(raw, method="fdr_bh")[1]):
    print(f"{a} vs {b}: p = {p:.3g}, BH-adjusted = {q:.3g}")
`;
  if ((a.kind as string) === "signature") return sigPy(a, csv);
  const g2 = (p as { gene2?: string }).gene2 ?? "";
  return `import pandas as pd                        # pip install pandas scipy
from scipy import stats

d = pd.read_csv("${csv}")
x, y = d["${p.gene}"], d["${g2}"]
print("Spearman", stats.spearmanr(x, y))   # what Kiri reports
print("Pearson ", stats.pearsonr(x, y))
`;
}

// Gene set score: recompute the score, the correlation, the member table, the group test and the four-group survival.
function sigMembers(a: Analysis): string[] {
  return ((a.result as { members?: string[] }).members) ?? [];
}

function sigR(a: Analysis, csv: string) {
  const g = a.params.gene, m = sigMembers(a);
  return `d <- read.csv("${csv}", check.names = FALSE)
members <- c(${m.map((x) => `"${x}"`).join(", ")})

# Score: mean of the members' z-scores across these patients (Kiri recomputes it the same way)
n <- nrow(d)
z <- scale(d[, members]) * sqrt(n / (n - 1))   # Kiri divides by the population SD
d$score_check <- rowMeans(z)
all.equal(d$score_check, d$score, tolerance = 1e-6)

# ${g} against the score (what Kiri reports), and against each member with BH correction
cor.test(d[["${g}"]], d$score, method = "spearman", exact = FALSE)
per <- sapply(members, function(m) unlist(cor.test(d[["${g}"]], d[[m]], method = "spearman", exact = FALSE)[c("estimate", "p.value")]))
per <- t(per); per <- cbind(per, p_adj = p.adjust(per[, 2], "BH")); print(round(per, 4))

# Do the members move together? Spearman matrix (the heatmap) and Cronbach's alpha
round(cor(d[, c("${g}", members)], method = "spearman"), 2)
k <- length(members); k / (k - 1) * (1 - sum(apply(z, 2, var)) / var(rowSums(z)))

# Score in ${g}-high against ${g}-low patients (median split)
wilcox.test(score ~ gene_group, data = d)

# Survival in four groups (${g} high/low x score high/low)
library(survival)
d$four <- interaction(d$gene_group, d$score_group)
survdiff(Surv(time_months, event) ~ four, data = d)
`;
}

function sigPy(a: Analysis, csv: string) {
  const g = a.params.gene, m = sigMembers(a);
  return `import numpy as np
import pandas as pd                        # pip install pandas scipy statsmodels lifelines
from scipy import stats
from statsmodels.stats.multitest import multipletests
from lifelines.statistics import multivariate_logrank_test

d = pd.read_csv("${csv}")
members = [${m.map((x) => `"${x}"`).join(", ")}]

# Score: mean of the members' z-scores across these patients
z = (d[members] - d[members].mean()) / d[members].std(ddof=0)
print("score matches:", np.allclose(z.mean(axis=1), d.score, atol=1e-6))

print("${g} vs score:", stats.spearmanr(d["${g}"], d.score))
per = pd.DataFrame([stats.spearmanr(d["${g}"], d[m]) for m in members], index=members, columns=["rho", "p"])
per["p_adj"] = multipletests(per.p, method="fdr_bh")[1]
print(per.round(4))

print(d[["${g}", *members]].corr(method="spearman").round(2))
k = len(members); print("Cronbach alpha:", k / (k - 1) * (1 - z.var(ddof=1).sum() / z.sum(axis=1).var(ddof=1)))

print("score high vs low ${g}:", stats.mannwhitneyu(d[d.gene_group == "high"].score, d[d.gene_group == "low"].score))

s = d.dropna(subset=["time_months", "event"]); s = s[s.time_months > 0]
print(multivariate_logrank_test(s.time_months, s.gene_group + "/" + s.score_group, s.event).p_value)
`;
}
