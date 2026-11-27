"""
Bench data: the student's own qPCR Ct values or other measurements (Western band intensity,
cell counts, absorbance...), pasted from a spreadsheet.

qPCR (Livak & Schmittgen 2001): technical replicates are averaged first, so n is the number of
biological samples. ΔCt = Ct(target) − Ct(reference) per sample; ΔΔCt = ΔCt − mean ΔCt of the
control group; fold change = 2^−ΔΔCt. Tests run on ΔCt, which is already on a log scale:
Welch's t-test for two groups, and for more groups Welch's ANOVA with each group compared with
the control by Welch's t-test and Holm correction.

Other measurements: the same tests on the values (or on log2 values when the person asks).
Nothing is invented: rows that cannot be read are listed back, not guessed.
"""

from __future__ import annotations

import math
import re

import numpy as np
from scipy import stats

from app.analyses.common import check, clean

MAX_ROWS = 5000
UNDETERMINED = {"undetermined", "und", "na", "n/a", "nan", "-", "", "no ct", "noct", "未检出"}


def _num(v: str) -> float | None:
    v = (v or "").strip().replace(",", ".")
    if v.lower() in UNDETERMINED:
        return None
    try:
        f = float(v)
    except ValueError:
        return None
    return f if math.isfinite(f) else None


def parse(text: str) -> list[list[str]]:
    """Rows from text pasted out of Excel (tabs), or a CSV / semicolon file."""
    lines = [ln for ln in (text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n") if ln.strip()]
    if not lines:
        return []
    sep = "\t" if "\t" in lines[0] else (";" if lines[0].count(";") > lines[0].count(",") else ",")
    return [[c.strip().strip('"') for c in re.split(sep, ln)] for ln in lines[:MAX_ROWS + 1]]


def _header(rows: list[list[str]], want: list[str]) -> tuple[dict[str, int], list[list[str]]]:
    """Find columns by name (English or Chinese); without a header, take them in order."""
    names = {"sample": ["sample", "样本", "样品", "id", "name", "mouse", "animal", "replicate"],
             "group": ["group", "condition", "treatment", "组", "分组", "处理"],
             "gene": ["gene", "target", "基因", "target name", "detector"],
             "ct": ["ct", "cq", "ct value", "cq value", "ct值", "cq值"],
             "value": ["value", "intensity", "measurement", "数值", "值", "强度", "count"]}
    first = [c.lower() for c in rows[0]]
    idx = {}
    for k in want:
        for i, c in enumerate(first):
            if c in names[k] or any(c.startswith(n) for n in names[k] if len(n) > 2):
                if i not in idx.values():
                    idx[k] = i
                    break
    if len(idx) == len(want):
        return idx, rows[1:]
    return {k: i for i, k in enumerate(want)}, rows  # no header: columns in the order asked for


def _welch(a: np.ndarray, b: np.ndarray) -> float | None:
    if len(a) < 2 or len(b) < 2:
        return None
    r = stats.ttest_ind(a, b, equal_var=False)
    return clean(r.pvalue)


def _ci(v: np.ndarray) -> tuple[float | None, float | None]:
    if len(v) < 2:
        return None, None
    m, se = float(np.mean(v)), float(np.std(v, ddof=1) / np.sqrt(len(v)))
    h = float(stats.t.ppf(0.975, len(v) - 1)) * se
    return m - h, m + h


def _holm(ps: list[float | None]) -> list[float | None]:
    idx = [i for i, p in enumerate(ps) if p is not None]
    order = sorted(idx, key=lambda i: ps[i])
    out: list[float | None] = [None] * len(ps)
    run = 0.0
    for k, i in enumerate(order):
        run = max(run, min(1.0, (len(order) - k) * ps[i]))
        out[i] = run
    return out


def _welch_anova(groups: list[np.ndarray]) -> float | None:
    """Welch's one-way ANOVA (unequal variances)."""
    g = [x for x in groups if len(x) >= 2]
    if len(g) < 3:
        return None
    n = np.array([len(x) for x in g], float)
    m = np.array([np.mean(x) for x in g])
    v = np.array([np.var(x, ddof=1) for x in g])
    if np.any(v <= 0):
        return None
    w = n / v
    mw = np.sum(w * m) / np.sum(w)
    k = len(g)
    a = np.sum(w * (m - mw) ** 2) / (k - 1)
    tmp = np.sum((1 - w / np.sum(w)) ** 2 / (n - 1))
    b = 1 + 2 * (k - 2) / (k**2 - 1) * tmp
    f = a / b
    df2 = (k**2 - 1) / (3 * tmp)
    return clean(float(stats.f.sf(f, k - 1, df2)))


def _compare(groups: dict[str, np.ndarray], control: str) -> tuple[dict, float | None, str]:
    """Each group against the control: Welch t (Holm-corrected when more than one comparison)."""
    others = [g for g in groups if g != control]
    raw = [_welch(groups[g], groups[control]) for g in others]
    adj = _holm(raw) if len(others) > 1 else raw
    overall = _welch_anova(list(groups.values())) if len(groups) > 2 else None
    test = "welch_t" if len(groups) == 2 else "welch_anova_holm"
    return {g: {"p": p, "p_adj": q} for g, p, q in zip(others, raw, adj)}, overall, test


def _order(groups: list[str], control: str) -> list[str]:
    return [control] + [g for g in groups if g != control]


def qpcr(rows: list[list[str]], ref: str, control: str | None) -> dict:
    base = {"kind": "bench", "mode": "qpcr"}
    if len(rows) < 2:
        return base | {"error": "bench_empty"}
    col, body = _header(rows, ["sample", "group", "gene", "ct"])
    skipped, high, data = [], 0, {}
    for i, r in enumerate(body, start=2 if body is not rows else 1):
        if len(r) <= max(col.values()):
            skipped.append(i)
            continue
        s, g, gene, ct = r[col["sample"]], r[col["group"]], r[col["gene"]].upper(), _num(r[col["ct"]])
        if not s or not g or not gene:
            skipped.append(i)
            continue
        if ct is None:
            data.setdefault((s, g, gene), [])  # undetermined: kept as missing, not as 40
            continue
        if ct > 35:
            high += 1
        data.setdefault((s, g, gene), []).append(ct)
    genes = sorted({k[2] for k in data})
    ref = (ref or "").upper() or next((x for x in genes if x in ("GAPDH", "ACTB", "B2M", "RPLP0", "18S", "HPRT1", "TBP")), "")
    if ref not in genes:
        return base | {"error": "bench_no_ref", "genes": genes}
    groups = list(dict.fromkeys(k[1] for k in data))
    control = control if control in groups else groups[0]
    targets = [x for x in genes if x != ref]
    if not targets:
        return base | {"error": "bench_no_target", "genes": genes}
    tech_sd = [float(np.std(v, ddof=1)) for v in data.values() if len(v) > 1]
    noisy = sum(1 for x in tech_sd if x > 0.5)
    mean_ct = {k: float(np.mean(v)) for k, v in data.items() if v}
    samples = list(dict.fromkeys((k[0], k[1]) for k in data))

    # reference stability: does the reference Ct differ between groups?
    ref_by = {g: np.array([mean_ct[(s, gg, ref)] for s, gg in samples if gg == g and (s, gg, ref) in mean_ct]) for g in groups}
    ref_p = None
    vals = [v for v in ref_by.values() if len(v) >= 2]
    if len(vals) >= 2:
        ref_p = clean(stats.kruskal(*vals).pvalue) if len(vals) > 2 else clean(stats.mannwhitneyu(vals[0], vals[1]).pvalue)
    ref_shift = (max(float(np.mean(v)) for v in vals) - min(float(np.mean(v)) for v in vals)) if len(vals) >= 2 else 0.0

    panels, per_sample, few = [], [], set()
    for t in targets:
        d = {}
        for s, g in samples:
            if (s, g, t) in mean_ct and (s, g, ref) in mean_ct:
                d.setdefault(g, []).append((s, mean_ct[(s, g, t)] - mean_ct[(s, g, ref)]))
        if control not in d or len(d) < 2:
            continue
        cmean = float(np.mean([x for _, x in d[control]]))
        dct = {g: np.array([x for _, x in v]) for g, v in d.items()}
        comp, overall, test = _compare(dct, control)
        gs = []
        for g in _order(list(d), control):
            v = dct[g]
            ddct = v - cmean
            log2fc = -ddct
            lo, hi = _ci(log2fc)
            if len(v) < 3:
                few.add(g)
            gs.append({"group": g, "n": int(len(v)), "dct_mean": clean(float(np.mean(v))), "log2fc": [clean(x) for x in log2fc],
                       "mean": clean(float(np.mean(log2fc))), "lo": clean(lo), "hi": clean(hi), "fold": clean(2 ** float(np.mean(log2fc))),
                       "samples": [s for s, _ in d[g]], **comp.get(g, {})})
            for (s, x) in d[g]:
                per_sample.append([s, g, t, clean(mean_ct[(s, g, t)]), clean(mean_ct[(s, g, ref)]), clean(x), clean(x - cmean), clean(2 ** -(x - cmean))])
        panels.append({"gene": t, "groups": gs, "overall_p": overall, "test": test})
    if not panels:
        return base | {"error": "bench_no_pairs"}

    checks = [check("data", "pass", "data.bench", n=len(samples), g=len(groups), t=len(targets), ref=ref),
              check("enough", "caution" if few else "pass", "enough.benchFew" if few else "enough.bench", list=", ".join(sorted(few)), min=3),
              check("assumptions", "pass", "assume.benchLog")]
    if ref_p is not None:
        bad = ref_shift >= 1.0 or (ref_p < 0.05 and ref_shift >= 0.5)
        checks.append(check("assumptions", "caution" if bad else "pass", "assume.benchRefShift" if bad else "assume.benchRef",
                            ref=ref, shift=round(ref_shift, 2), p=round(ref_p, 3)))
    if noisy:
        checks.append(check("data", "caution", "data.benchTech", n=noisy))
    if high:
        checks.append(check("data", "caution", "data.benchHighCt", n=high))
    if skipped:
        checks.append(check("data", "caution", "data.benchSkipped", n=len(skipped), rows=", ".join(map(str, skipped[:10]))))
    if any(len(p["groups"]) > 2 for p in panels) or len(panels) > 1:
        checks.append(check("multiple", "caution" if len(panels) > 1 else "pass", "multiple.bench", k=len(panels)))
    return base | {"ref": ref, "control": control, "groups": _order(groups, control), "genes": genes, "targets": [p["gene"] for p in panels],
                   "panels": panels, "rows": per_sample, "n_samples": len(samples), "checks": checks,
                   "data_version": {"cohort": "bench", "projects": [], "source": "your data", "units": "log2 fold change (2^-ΔΔCt)", "built": ""}}


def values(rows: list[list[str]], control: str | None, log: bool) -> dict:
    base = {"kind": "bench", "mode": "values"}
    if len(rows) < 2:
        return base | {"error": "bench_empty"}
    col, body = _header(rows, ["group", "value"])
    d, skipped, nonpos = {}, [], 0
    for i, r in enumerate(body, start=2 if body is not rows else 1):
        if len(r) <= max(col.values()):
            skipped.append(i)
            continue
        g, v = r[col["group"]], _num(r[col["value"]])
        if not g or v is None:
            skipped.append(i)
            continue
        if log and v <= 0:
            nonpos += 1
            continue
        d.setdefault(g, []).append(math.log2(v) if log else v)
    if len(d) < 2:
        return base | {"error": "bench_one_group", "groups": list(d)}
    groups = list(d)
    control = control if control in groups else groups[0]
    arr = {g: np.array(v) for g, v in d.items()}
    comp, overall, test = _compare(arr, control)
    few = [g for g in groups if len(arr[g]) < 3]
    gs = []
    for g in _order(groups, control):
        v = arr[g]
        lo, hi = _ci(v)
        gs.append({"group": g, "n": int(len(v)), "values": [clean(x) for x in v], "mean": clean(float(np.mean(v))), "lo": clean(lo), "hi": clean(hi),
                   "sd": clean(float(np.std(v, ddof=1))) if len(v) > 1 else None, **comp.get(g, {})})
    normal = []
    for g in groups:
        if len(arr[g]) >= 3:
            normal.append(stats.shapiro(arr[g]).pvalue)
    skewed = any(p < 0.05 for p in normal)
    checks = [check("data", "pass", "data.benchValues", n=sum(len(v) for v in arr.values()), g=len(groups)),
              check("enough", "caution" if few else "pass", "enough.benchFew" if few else "enough.bench", list=", ".join(few), min=3),
              check("assumptions", "caution" if skewed else "pass", "assume.benchSkew" if skewed else "assume.benchNormal")]
    if nonpos:
        checks.append(check("data", "caution", "data.benchNonPos", n=nonpos))
    if skipped:
        checks.append(check("data", "caution", "data.benchSkipped", n=len(skipped), rows=", ".join(map(str, skipped[:10]))))
    return base | {"control": control, "groups": _order(groups, control), "log": log, "panels": [{"gene": "", "groups": gs, "overall_p": overall, "test": test}],
                   "rows": [[g, x] for g in groups for x in d[g]], "checks": checks,
                   "data_version": {"cohort": "bench", "projects": [], "source": "your data", "units": "log2" if log else "", "built": ""}}


def run(mode: str, text: str, ref: str = "", control: str | None = None, log: bool = False) -> dict:
    rows = parse(text)
    if len(rows) > MAX_ROWS:
        return {"kind": "bench", "mode": mode, "error": "bench_too_big", "max": MAX_ROWS}
    return qpcr(rows, ref, control) if mode == "qpcr" else values(rows, control, log)
