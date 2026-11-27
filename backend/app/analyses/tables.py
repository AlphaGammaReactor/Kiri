"""
The rows behind an analysis: one line per sample or patient, exactly as the
analysis used them. Shown in the app's data table, saved as CSV, and read by
the R and Python scripts the app offers, so a student can recompute every
number outside Kiri.
"""

from __future__ import annotations

import numpy as np

from app.analyses.common import clean
from app.analyses.survival import _patients, _split
from app.cohorts.store import Cohort


def _r(x):
    if isinstance(x, (float, np.floating)):
        return clean(x)
    if isinstance(x, (np.integer,)):
        return int(x)
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else x


def rows_for(c: Cohort, kind: str, params: dict) -> dict:
    gene = params.get("gene") or ""
    if kind == "signature":
        return _signature_rows(c, params)
    if kind == "immune":
        from app.analyses import immune

        return immune.table(c, gene)
    if kind == "de":
        # One line per tested gene (not per sample): the full table behind the volcano plot.
        from app.analyses import de

        r = de.run(c, params.get("compare", "tn"), gene or None, params.get("group_a"), params.get("group_b"),
                   lfc=params.get("lfc", 1.0), q=params.get("q", 0.05))
        a, b = r.get("labels", ["A", "B"])
        cols = ["gene", "log2_fold_change", f"mean_{a}", f"mean_{b}", "welch_t", "p", "p_adj_BH", "direction"]
        return {"columns": cols, "rows": [[x["gene"], x["lfc"], x["mean_a"], x["mean_b"], x["t"], x["p"], x["p_adj"], x["dir"]] for x in r.get("rows", [])]}
    if kind == "survival":
        t, _ = _patients(c, gene, params.get("endpoint", "OS"))
        g, value, _ = _split(t, params.get("cut", "median"))
        g = g.sort_values("expr", ascending=False)
        cols = ["sample", "patient", "project", "expression", "group", "time_months", "event", "age", "stage"]
        rows = [[r["id"], r["case"], r["project"], _r(r["expr"]), "high" if r["high"] else "low", _r(r["time"]), int(r["event"]),
                 _r(r.get("age")), r.get("stage") if isinstance(r.get("stage"), str) else None] for _, r in g.iterrows()]
        return {"columns": cols, "rows": rows, "cut_value": clean(value)}
    s = c.samples.copy()
    s["expr"] = c.gene(gene)
    s = s[s["expr"].notna()]
    if kind == "expression_tn":
        s = s[s["type"].isin(["tumor", "normal"])]
        group = s["type"].map({"tumor": "tumour", "normal": "normal"})
    elif kind == "expression_stage":
        s = s[(s["type"] == "tumor") & s["stage"].isin(["I", "II", "III", "IV"])]
        group = s["stage"]
    elif kind == "expression_group":
        s = s[s["group"].notna() & (s["group"].astype(str) != "")]
        group = s["group"].astype(str)
    elif kind == "correlation":
        s["expr2"] = c.gene(params["gene2"])
        s = s[(s["type"] == "tumor") & s["expr2"].notna()].sort_values("id").drop_duplicates("case", keep="first")
        cols = ["sample", "patient", "project", params["gene"], params["gene2"]]
        return {"columns": cols, "rows": [[r["id"], r["case"], r["project"], _r(r["expr"]), _r(r["expr2"])] for _, r in s.iterrows()]}
    else:
        raise ValueError(kind)
    s = s.assign(group=group).sort_values(["group", "expr"], ascending=[True, False])
    cols = ["sample", "patient", "project", "group", "expression"]
    return {"columns": cols, "rows": [[r["id"], r["case"], r["project"], r["group"], _r(r["expr"])] for _, r in s.iterrows()]}


def _signature_rows(c: Cohort, params: dict) -> dict:
    """One row per patient: my gene, each member, the score (mean of the members' z-scores) and the groups."""
    from app.analyses.signature import _tumours, resolve_members, score_of

    gene = params["gene"]
    members, _ = resolve_members(params.get("set_id", "uprmt_markers"), params.get("members") or [], gene)
    present = [g for g in members if c.has(g)]
    t = _tumours(c, [gene] + present)
    t = t[t[f"g:{gene}"].notna() & t[[f"g:{g}" for g in present]].notna().all(axis=1)].copy()
    t["score"] = score_of(t[[f"g:{g}" for g in present]].to_numpy(float))
    t["gene_group"] = np.where(t[f"g:{gene}"] > t[f"g:{gene}"].median(), "high", "low")
    t["score_group"] = np.where(t["score"] > t["score"].median(), "high", "low")
    t["time_months"] = t["os_time"] / 30.4375
    cols = ["sample", "patient", "project", gene, *present, "score", "gene_group", "score_group", "time_months", "event"]
    rows = [[r["id"], r["case"], r["project"], _r(r[f"g:{gene}"]), *[_r(r[f"g:{g}"]) for g in present], _r(r["score"]),
             r["gene_group"], r["score_group"], _r(r["time_months"]), _r(r["os_event"])] for _, r in t.iterrows()]
    return {"columns": cols, "rows": rows}
