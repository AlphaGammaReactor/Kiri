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
    gene = params["gene"]
    if kind == "survival":
        t, _ = _patients(c, gene)
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
