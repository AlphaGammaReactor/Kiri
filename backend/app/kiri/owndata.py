"""Your own table: a CSV, TSV or Excel file imported into the open .kiri project (design page 19, "Import my data").

Two shapes are understood:
* samples in rows (one row per patient or sample): a sample ID, optional group, survival time and event,
  and one or more numeric columns (gene expression or any measurement);
* genes in rows (an expression matrix): the first column names the genes, every other column is a sample.

The file is read once, checked with the person (encoding, what each column is, what each event value
means), and stored inside the .kiri file. Nothing leaves the computer. Analyses then run on it through
the same Cohort interface as the TCGA data.
"""

from __future__ import annotations

import csv
import gzip
import io
import json
import re
import uuid
from pathlib import Path
from typing import Literal, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.cohorts.store import Cohort
from app.kiri.api import ws
from app.kiri.fileformat import KiriFileError, now

router = APIRouter(prefix="/kiri", tags=["own data"])

MAX_BYTES = 200 * 1024 * 1024
MAX_VALUES = 60_000          # value columns (genes) kept from one file
PREVIEW_ROWS = 8
ROLES = ("sample_id", "group", "time", "event", "value", "unused")

_TABLE = """CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, meta TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL)"""

EVENT_YES = {"1", "1.0", "dead", "deceased", "death", "died", "event", "yes", "y", "true", "relapse", "recurred", "progressed",
             "死亡", "是", "复发", "进展", "已故"}
EVENT_NO = {"0", "0.0", "alive", "living", "censored", "no", "n", "false", "none", "disease free", "lost",
            "存活", "生存", "否", "无", "失访", "健在", "删失"}
NA = {"", "na", "n/a", "nan", "null", "none", "-", "—", "–", ".", "?", "#n/a", "缺失", "无数据"}
GENE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9\-\.]{0,19}$")


# ── reading ──
def _decode(raw: bytes, encoding: str | None) -> tuple[str, str]:
    if encoding:
        return raw.decode(encoding, errors="replace"), encoding
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16"), "utf-16"
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw.decode("utf-8-sig"), "utf-8"
    for enc in ("utf-8", "gb18030", "big5"):
        try:
            return raw.decode(enc), enc
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1"), "latin-1"


def read_table(path: Path, encoding: str | None = None, sheet: str | None = None) -> tuple[pd.DataFrame, dict]:
    """Every cell as text; the first row is the header."""
    if not path.is_file():
        raise KiriFileError("import_not_found", str(path))
    if path.stat().st_size > MAX_BYTES:
        raise KiriFileError("import_too_big", str(path))
    ext = path.suffix.lower()
    info: dict = {"file_name": path.name}
    if ext in (".xlsx", ".xlsm", ".xls"):
        try:
            book = pd.ExcelFile(path)
        except Exception as e:  # noqa: BLE001 - a damaged or password-protected workbook
            raise KiriFileError("import_unreadable", str(e)) from e
        sheets = [str(s) for s in book.sheet_names]
        use = sheet if sheet in sheets else sheets[0]
        df = book.parse(use, header=None, dtype=str).fillna("")
        info |= {"encoding": "excel", "sheets": sheets, "sheet": use, "delimiter": None}
    elif ext in (".csv", ".tsv", ".txt", ".tab"):
        text, enc = _decode(path.read_bytes(), encoding)
        sample = text[:20000]
        try:
            delim = csv.Sniffer().sniff(sample, delimiters=",\t;").delimiter
        except csv.Error:
            delim = "\t" if sample.count("\t") > sample.count(",") else ","
        df = pd.read_csv(io.StringIO(text), sep=delim, header=None, dtype=str, keep_default_na=False,
                         skip_blank_lines=True, engine="python")
        info |= {"encoding": enc, "delimiter": {"\t": "tab", ",": "comma", ";": "semicolon"}[delim]}
    else:
        raise KiriFileError("import_type", ext)
    df = df.apply(lambda col: col.astype(str).str.strip())
    df = df.loc[~(df == "").all(axis=1), ~(df == "").all(axis=0)]
    if df.shape[0] < 2 or df.shape[1] < 2:
        raise KiriFileError("import_empty", str(path))
    header = _dedupe([h or f"column {i + 1}" for i, h in enumerate(df.iloc[0].tolist())])
    body = df.iloc[1:].reset_index(drop=True)
    body.columns = header
    return body, info


def _dedupe(names: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    out = []
    for n in names:
        k = n
        while k in seen:
            seen[n] += 1
            k = f"{n} ({seen[n]})"
        seen.setdefault(k, 1)
        out.append(k)
    return out


def _num(s: pd.Series) -> pd.Series:
    """Numbers from text; decimal commas allowed; NA words become NaN."""
    t = s.str.replace("−", "-", regex=False).str.replace(",", ".", regex=False)
    t = t.where(~t.str.lower().isin(NA), None)
    return pd.to_numeric(t, errors="coerce")


def _numeric_share(s: pd.Series) -> float:
    present = ~s.str.lower().isin(NA)
    if not present.any():
        return 0.0
    return float(_num(s)[present].notna().mean())


# ── guessing what each column is ──
NAME_HINTS = {
    "sample_id": re.compile(r"sample|patient|subject|case|barcode|^id$|\bid\b|编号|样本|病人|患者|病例|受试者", re.I),
    "time": re.compile(r"time|month|day|year|follow|surviv|\bos\b|\bpfs\b|\bdfs\b|随访|生存期|时间|月|天|年", re.I),
    "event": re.compile(r"event|status|death|dead|vital|censor|outcome|结局|状态|死亡|事件|转归", re.I),
    "group": re.compile(r"group|arm|class|type|subtype|stage|grade|sex|gender|cohort|分组|组别|类型|分型|分期|性别", re.I),
}


def guess_orientation(df: pd.DataFrame) -> str:
    first = df.iloc[:, 0]
    genes = first.map(lambda v: bool(GENE_RE.match(v))).mean()
    numeric_cols = sum(_numeric_share(df[c]) > 0.9 for c in df.columns[1:])
    gene_header = bool(re.search(r"gene|symbol|基因|ensembl|probe", str(df.columns[0]), re.I))
    if genes > 0.8 and numeric_cols >= max(3, 0.9 * (df.shape[1] - 1)) and (gene_header or df.shape[0] > df.shape[1]):
        return "genes_in_rows"
    return "samples_in_rows"


def guess_roles(df: pd.DataFrame) -> dict[str, str]:
    roles: dict[str, str] = {}
    taken = set()
    cols = list(df.columns)
    shares = {c: _numeric_share(df[c]) for c in cols}
    for c in cols:
        if "sample_id" not in taken and NAME_HINTS["sample_id"].search(c) and df[c].nunique() >= 0.9 * len(df):
            roles[c] = "sample_id"; taken.add("sample_id")
    if "sample_id" not in taken:
        for c in cols:
            if shares[c] < 0.5 and df[c].nunique() == len(df):
                roles[c] = "sample_id"; taken.add("sample_id"); break
    for c in cols:
        if c in roles:
            continue
        vals = {v.lower() for v in df[c].unique() if v.lower() not in NA}
        if "event" not in taken and (NAME_HINTS["event"].search(c) or (0 < len(vals) <= 3 and vals <= EVENT_YES | EVENT_NO)) and len(vals) <= 4:
            roles[c] = "event"; taken.add("event"); continue
        if "time" not in taken and NAME_HINTS["time"].search(c) and shares[c] > 0.8:
            roles[c] = "time"; taken.add("time"); continue
        if shares[c] > 0.8:
            roles[c] = "value"; continue
        if "group" not in taken and 2 <= len(vals) <= 8 and (NAME_HINTS["group"].search(c) or len(vals) <= 4):
            roles[c] = "group"; taken.add("group"); continue
        roles[c] = "unused"
    return roles


def time_unit_of(name: str) -> str:
    n = name.lower()
    if re.search(r"day|天|日", n):
        return "days"
    if re.search(r"year|年", n):
        return "years"
    return "months"


def event_suggestion(values: list[str]) -> dict[str, Optional[int]]:
    out: dict[str, Optional[int]] = {}
    for v in values:
        k = v.lower()
        out[v] = 1 if k in EVENT_YES else 0 if k in EVENT_NO else None
    return out


def checks_for(df: pd.DataFrame, roles: dict[str, str], event_map: dict[str, Optional[int]] | None = None) -> list[dict]:
    """Things the person should look at before importing."""
    out = []
    by = {r: [c for c, x in roles.items() if x == r] for r in ROLES}
    if not by["sample_id"]:
        out.append({"code": "no_id", "level": "problem"})
    else:
        ids = df[by["sample_id"][0]]
        dup = int(ids.duplicated().sum())
        if dup:
            out.append({"code": "dup_ids", "level": "caution", "n": dup})
    if not by["value"]:
        out.append({"code": "no_values", "level": "problem"})
    if by["event"]:
        col = df[by["event"][0]]
        vals = sorted({v for v in col.unique() if v.lower() not in NA})
        words = [v for v in vals if not re.fullmatch(r"-?\d+(\.\d+)?", v)]
        nums = [v for v in vals if re.fullmatch(r"-?\d+(\.\d+)?", v)]
        em = event_map if event_map is not None else event_suggestion(vals)
        unknown = [v for v in vals if em.get(v) is None]
        if (words and nums) or unknown:
            out.append({"code": "event_mixed" if words and nums else "event_unknown", "level": "caution",
                        "values": vals[:12], "counts": {v: int((col == v).sum()) for v in vals[:12]}})
        if not by["time"]:
            out.append({"code": "event_no_time", "level": "caution"})
    if by["time"]:
        t = _num(df[by["time"][0]])
        missing = int(t.isna().sum())
        if missing:
            out.append({"code": "no_time", "level": "info", "n": missing,
                        "rows": df.index[t.isna()].tolist()[:20]})
        neg = int((t < 0).sum())
        if neg:
            out.append({"code": "negative_time", "level": "caution", "n": neg})
    bad = 0
    for c in by["value"]:
        s = df[c]
        present = ~s.str.lower().isin(NA)
        bad += int((present & _num(s).isna()).sum())
    if bad:
        out.append({"code": "non_numeric", "level": "caution", "n": bad})
    return out


# ── preview ──
class PreviewBody(BaseModel):
    path: str
    encoding: Optional[str] = None
    sheet: Optional[str] = None
    orientation: Optional[Literal["samples_in_rows", "genes_in_rows"]] = None


@router.post("/import/preview")
def preview(body: PreviewBody):
    try:
        df, info = read_table(Path(body.path).expanduser(), body.encoding, body.sheet)
    except KiriFileError as e:
        return JSONResponse(status_code=400, content={"error": e.code})
    orientation = body.orientation or guess_orientation(df)
    if orientation == "genes_in_rows":
        samples = list(df.columns[1:])
        return {**info, "orientation": orientation, "n_rows": len(df), "columns": list(df.columns[:12]),
                "rows": df.iloc[:PREVIEW_ROWS, :12].values.tolist(), "n_genes": len(df), "n_samples": len(samples),
                "roles": {}, "checks": [] if len(samples) >= 3 else [{"code": "few_samples", "level": "problem"}],
                "time_unit": "months", "event_values": {}}
    roles = guess_roles(df)
    ev_col = next((c for c, r in roles.items() if r == "event"), None)
    time_col = next((c for c, r in roles.items() if r == "time"), None)
    ev_vals = sorted({v for v in df[ev_col].unique() if v.lower() not in NA}) if ev_col else []
    return {
        **info, "orientation": orientation, "n_rows": len(df), "columns": list(df.columns),
        "rows": df.iloc[:PREVIEW_ROWS].values.tolist(), "roles": roles,
        "time_unit": time_unit_of(time_col) if time_col else "months",
        "event_values": event_suggestion(ev_vals), "checks": checks_for(df, roles),
    }


class RecheckBody(PreviewBody):
    roles: dict[str, str] = Field(default_factory=dict)
    event_map: dict[str, Optional[int]] = Field(default_factory=dict)


@router.post("/import/check")
def recheck(body: RecheckBody):
    """The checks again after the person changed a column's role or an event value."""
    try:
        df, _ = read_table(Path(body.path).expanduser(), body.encoding, body.sheet)
    except KiriFileError as e:
        return JSONResponse(status_code=400, content={"error": e.code})
    roles = {c: r for c, r in body.roles.items() if c in df.columns and r in ROLES}
    ev_col = next((c for c, r in roles.items() if r == "event"), None)
    ev_vals = sorted({v for v in df[ev_col].unique() if v.lower() not in NA}) if ev_col else []
    em = {v: body.event_map.get(v, event_suggestion([v])[v]) for v in ev_vals}
    return {"checks": checks_for(df, roles, em), "event_values": em}


# ── commit ──
class CommitBody(RecheckBody):
    name: str = ""
    time_unit: Literal["days", "months", "years"] = "months"
    scale: Literal["log2", "linear", "as_is"] = "as_is"  # linear: log2(x + 1) is applied


def _store(op, ds_id: str, name: str, meta: dict, data: dict) -> None:
    op.con.execute(_TABLE)
    blob = gzip.compress(json.dumps(data, allow_nan=False).encode())
    op.con.execute("INSERT OR REPLACE INTO datasets(id, name, meta, data, created_at) VALUES (?, ?, ?, ?, ?)",
                   (ds_id, name, json.dumps(meta, ensure_ascii=False), blob, now()))


def build_dataset(df: pd.DataFrame, orientation: str, roles: dict[str, str], event_map: dict[str, Optional[int]],
                  time_unit: str, scale: str) -> tuple[dict, dict]:
    if orientation == "genes_in_rows":
        names = df.iloc[:, 0].tolist()
        mat = df.iloc[:, 1:].apply(_num)
        ids = list(df.columns[1:])
        samples = {"id": ids, "group": [None] * len(ids), "time_days": [None] * len(ids), "event": [None] * len(ids)}
        values = {}
        for n, (_, row) in zip(names, mat.iterrows()):
            k = n.strip().upper()
            if k and k not in values and len(values) < MAX_VALUES:
                values[k] = row.to_numpy(float)
        labels = {n.strip().upper(): n.strip() for n in names}
    else:
        by = {r: [c for c, x in roles.items() if x == r] for r in ROLES}
        if not by["sample_id"] or not by["value"]:
            raise KiriFileError("import_roles", "needs a sample ID and at least one value column")
        id_col = by["sample_id"][0]
        df = df[df[id_col].str.len() > 0].drop_duplicates(id_col, keep="first").reset_index(drop=True)
        factor = {"days": 1.0, "months": 30.4375, "years": 365.25}[time_unit]
        t = _num(df[by["time"][0]]) * factor if by["time"] else pd.Series([np.nan] * len(df))
        ev = df[by["event"][0]].map(lambda v: event_map.get(v)) if by["event"] else pd.Series([None] * len(df))
        grp = df[by["group"][0]].where(~df[by["group"][0]].str.lower().isin(NA), None) if by["group"] else pd.Series([None] * len(df))
        samples = {"id": df[id_col].tolist(), "group": grp.tolist(),
                   "time_days": [None if pd.isna(x) or x < 0 else float(x) for x in t],
                   "event": [None if v is None or pd.isna(v) else int(v) for v in ev]}
        values, labels = {}, {}
        for c in by["value"]:
            k = c.strip().upper()
            if k not in values:
                values[k] = _num(df[c]).to_numpy(float)
                labels[k] = c.strip()
    if scale == "linear":
        values = {k: np.log2(np.clip(v, 0, None) + 1) for k, v in values.items()}
    vals = {k: [None if np.isnan(x) else round(float(x), 6) for x in v] for k, v in values.items()}
    units = "log2(value + 1)" if scale == "linear" else "log2" if scale == "log2" else "as imported"
    meta = {"n_samples": len(samples["id"]), "n_values": len(vals), "units": units,
            "has_survival": any(x is not None for x in samples["time_days"]) and any(e is not None for e in samples["event"]),
            "groups": sorted({g for g in samples["group"] if g}), "labels": labels}
    return {"samples": samples, "values": vals}, meta


@router.post("/import/commit")
def commit(body: CommitBody):
    try:
        op = ws().require()
        op._writable()
        p = Path(body.path).expanduser()
        df, info = read_table(p, body.encoding, body.sheet)
        orientation = body.orientation or guess_orientation(df)
        roles = {c: r for c, r in body.roles.items() if c in df.columns and r in ROLES} or guess_roles(df)
        data, meta = build_dataset(df, orientation, roles, body.event_map, body.time_unit, body.scale)
    except KiriFileError as e:
        return JSONResponse(status_code=400 if e.code.startswith("import") else 409, content={"error": e.code})
    ds_id = uuid.uuid4().hex[:12]
    name = (body.name or p.stem).strip()[:80]
    meta |= {"file_name": info["file_name"], "encoding": info.get("encoding"), "orientation": orientation, "imported_at": now()}
    _store(op, ds_id, name, meta, data)
    pr = op.project()
    datasets = [d for d in pr.get("datasets", []) if not d.startswith("own:")] + [f"own:{ds_id}"]
    patch = {"datasets": datasets}
    if not pr.get("targets"):
        patch["targets"] = [meta["labels"].get(k, k) for k in list(data["values"])[:5]] if orientation == "samples_in_rows" else []
    op.update_project(patch)
    op.con.commit()
    try:
        ws().autosave()
    except KiriFileError:
        pass
    return {"id": f"own:{ds_id}", "name": name, **meta}


@router.get("/datasets")
def list_datasets():
    try:
        op = ws().require()
    except KiriFileError as e:
        return JSONResponse(status_code=409, content={"error": e.code})
    if not op.read_only:
        op.con.execute(_TABLE)
    try:
        rows = op.con.execute("SELECT id, name, meta, created_at FROM datasets ORDER BY created_at").fetchall()
    except Exception:  # noqa: BLE001 - a read-only older file without the table
        rows = []
    used = set(op.project().get("datasets", []))
    return [{"id": f"own:{r[0]}", "name": r[1], **json.loads(r[2]), "created_at": r[3], "in_use": f"own:{r[0]}" in used} for r in rows]


@router.get("/datasets/{ds}/genes")
def dataset_genes(ds: str, q: str = "", limit: int = 20):
    """Value names in an imported table, for the gene box."""
    try:
        op = ws().require()
        c = own_cohort(op, ds)
    except (KiriFileError, KeyError):
        return JSONResponse(status_code=404, content={"error": "not_found"})
    labels = c.labels
    qq = q.strip().upper()
    hits = [labels.get(k, k) for k in c._genes if not qq or k.startswith(qq)]
    return {"items": hits[:limit], "total": len(c._genes)}


@router.delete("/datasets/{ds}")
def delete_dataset(ds: str):
    try:
        op = ws().require()
        op._writable()
    except KiriFileError as e:
        return JSONResponse(status_code=409, content={"error": e.code})
    key = ds.removeprefix("own:")
    op.con.execute("DELETE FROM datasets WHERE id = ?", (key,))
    pr = op.project()
    op.update_project({"datasets": [d for d in pr.get("datasets", []) if d != f"own:{key}"]})
    op.con.commit()
    _CACHE.clear()
    return {"ok": True}


# ── the imported table as a cohort ──
_CACHE: dict[tuple[str, str], Cohort] = {}


def own_cohort(op, ds: str) -> Cohort:
    key = ds.removeprefix("own:")
    row = op.con.execute("SELECT name, meta, data, created_at FROM datasets WHERE id = ?", (key,)).fetchone()
    if not row:
        raise KeyError(ds)
    cache_key = (str(op.path), key + row[3])
    if cache_key in _CACHE:
        return _CACHE[cache_key]
    meta = json.loads(row[1])
    data = json.loads(gzip.decompress(row[2]))
    s = data["samples"]
    n = len(s["id"])
    samples = pd.DataFrame({
        "id": s["id"], "case": s["id"], "type": ["tumor"] * n, "project": [row[0]] * n, "stage": [""] * n,
        "age": [np.nan] * n, "sex": [""] * n,
        "os_time": [np.nan if x is None else x for x in s["time_days"]],
        "os_event": [np.nan if x is None else x for x in s["event"]],
        "group": s["group"],
    })
    genes = {k: np.array([np.nan if x is None else x for x in v], dtype=float) for k, v in data["values"].items()}
    c = Cohort(row[0], [ds if ds.startswith("own:") else f"own:{key}"], samples,
               f"Your table: {meta.get('file_name', row[0])}", meta.get("units", "as imported"), row[3][:10], genes)
    c.labels = meta.get("labels", {})  # type: ignore[attr-defined]
    c.own = True  # type: ignore[attr-defined]
    _CACHE.clear()
    _CACHE[cache_key] = c
    return c


def own_dataset_of(project: dict) -> str | None:
    return next((d for d in project.get("datasets", []) if d.startswith("own:")), None)
