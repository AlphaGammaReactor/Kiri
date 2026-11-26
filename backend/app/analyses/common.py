from __future__ import annotations

import math

import numpy as np


def clean(x) -> float | None:
    """JSON-safe float."""
    if x is None:
        return None
    x = float(x)
    return None if math.isnan(x) or math.isinf(x) else x


def check(key: str, status: str, code: str, **vars) -> dict:
    """One line of the Reliability panel. status: pass | caution | problem | info."""
    return {"check": key, "status": status, "code": code, "vars": {k: clean(v) if isinstance(v, (float, np.floating)) else v for k, v in vars.items()}}


def summary(values: np.ndarray) -> dict:
    v = values[~np.isnan(values)]
    if len(v) == 0:
        return {"n": 0}
    q1, med, q3 = np.percentile(v, [25, 50, 75])
    return {"n": int(len(v)), "median": clean(med), "q1": clean(q1), "q3": clean(q3), "min": clean(v.min()), "max": clean(v.max()), "mean": clean(v.mean())}


def bh(pvals: list[float]) -> list[float]:
    """Benjamini–Hochberg adjusted p-values."""
    p = np.asarray(pvals, dtype=float)
    n = len(p)
    if n == 0:
        return []
    order = np.argsort(p)
    ranked = p[order] * n / (np.arange(n) + 1)
    adj = np.minimum.accumulate(ranked[::-1])[::-1]
    out = np.empty(n)
    out[order] = np.minimum(adj, 1.0)
    return out.tolist()
