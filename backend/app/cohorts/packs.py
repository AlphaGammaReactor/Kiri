"""
Cohort packs: a whole TCGA project downloaded once and kept in the data folder.

Files come from the UCSC Xena GDC hub (GDC harmonised STAR TPM, survival and
clinical tables). The expression table is converted once into a float32 matrix
(genes x samples) read through a memory map, so analysing one gene reads only
that gene's row. Downloads resume after a dropped connection.
"""

from __future__ import annotations

import gzip
import json
import os
import threading
import time
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

from app.cohorts.store import Cohort, CohortUnavailable

# Tried in order. The hub's own address redirects to its file store.
# Checked from GitHub Actions on 2026-11-26: the hub address redirects to a signed file-store link;
# the file store itself refuses direct requests (403).
HUBS = ["https://gdc.xenahubs.net/download"]
# Each file is tried under these names in turn (the hub has used both plain and gzip names).
FILES = {"expr": ["{p}.star_tpm.tsv.gz"], "survival": ["{p}.survival.tsv.gz", "{p}.survival.tsv"], "clinical": ["{p}.clinical.tsv.gz", "{p}.clinical.tsv"]}
PROBEMAP = "gencode.v36.annotation.gtf.gene.probemap"


def pack_dir(data_dir: Path, project: str) -> Path:
    return data_dir / "cohorts" / project


def is_ready(data_dir: Path, project: str) -> bool:
    return (pack_dir(data_dir, project) / "ready.json").exists()


_progress: dict[str, dict] = {}
_threads: dict[str, threading.Thread] = {}


def progress_of(project: str) -> dict:
    return dict(_progress.get(project, {"state": "idle"}))


def start_download(data_dir: Path, project: str) -> None:
    """Download and convert one project in the background (one at a time per project)."""
    t = _threads.get(project)
    if t and t.is_alive() or is_ready(data_dir, project):
        return

    def work():
        _progress[project] = {"state": "downloading", "file": "", "done": 0, "total": 0, "started": time.time()}

        def prog(key, done, total):
            _progress[project].update({"file": key, "done": done, "total": total})

        try:
            build_pack(data_dir, project, prog)
            _progress[project] = {"state": "ready"}
        except Exception as e:  # noqa: BLE001 - reported to the UI as a code
            _progress[project] = {"state": "failed", "error": type(e).__name__, "detail": str(e)[:300]}

    t = threading.Thread(target=work, name=f"pack-{project}", daemon=True)
    _threads[project] = t
    t.start()


def _fetch(name: str, dest: Path, progress=None) -> None:
    last = None
    for hub in HUBS:
        try:
            _download(f"{hub}/{name}", dest, progress)
            return
        except httpx.HTTPStatusError as e:
            last = e
            part = dest.with_suffix(dest.suffix + ".part")
            if part.exists() and part.stat().st_size == 0:
                part.unlink()
    raise last or RuntimeError(name)


def _download(url: str, dest: Path, progress=None) -> None:
    part = dest.with_suffix(dest.suffix + ".part")
    have = part.stat().st_size if part.exists() else 0
    headers = {"Range": f"bytes={have}-"} if have else {}
    with httpx.stream("GET", url, headers=headers, timeout=60, follow_redirects=True) as r:
        if r.status_code == 416:
            os.replace(part, dest)
            return
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0)) + have
        mode = "ab" if r.status_code == 206 else "wb"
        done = have if mode == "ab" else 0
        with open(part, mode) as f:
            for chunk in r.iter_bytes(1 << 20):
                f.write(chunk)
                done += len(chunk)
                if progress:
                    progress(done, total)
    os.replace(part, dest)


def build_pack(data_dir: Path, project: str, progress=None) -> None:
    """Download and convert one TCGA project. Safe to call again after a failure."""
    d = pack_dir(data_dir, project)
    d.mkdir(parents=True, exist_ok=True)
    raw = {}
    for key, patterns in FILES.items():
        names = [pt.format(p=project) for pt in patterns]
        have = next((d / n for n in names if (d / n).exists()), None)
        if have is None:
            last: Exception | None = None
            for n in names:
                try:
                    _fetch(n, d / n, (lambda a, b, k=key: progress(k, a, b)) if progress else None)
                    have = d / n
                    break
                except httpx.HTTPStatusError as e:
                    last = e
            if have is None:
                raise last or RuntimeError(key)
        raw[key] = have
    probemap = data_dir / "cohorts" / PROBEMAP
    if not probemap.exists():
        _fetch(PROBEMAP, probemap)
    convert(raw["expr"], raw["survival"], raw["clinical"], probemap, d, project)
    fetch_mutations(d, project, progress)
    fetch_copies(data_dir, d, project, progress)


def fetch_copies(data_dir: Path, d: Path, project: str, progress=None) -> bool:
    """Gene-level copy number for the pack (optional, like mutations). Safe to call again."""
    from app.cohorts import copynumber

    if (d / "cn.npy").exists():
        return True
    try:
        raw = next((d / n.format(p=project) for n in copynumber.FILES if (d / n.format(p=project)).exists()), None)
        if raw is None:
            for n in copynumber.FILES:
                try:
                    _fetch(n.format(p=project), d / n.format(p=project), (lambda a, b: progress("copies", a, b)) if progress else None)
                    raw = d / n.format(p=project)
                    break
                except httpx.HTTPStatusError:
                    continue
        if raw is None:
            return False
        probemap = data_dir / "cohorts" / PROBEMAP
        if not probemap.exists():
            _fetch(PROBEMAP, probemap)
        pm = pd.read_csv(probemap, sep="\t")
        copynumber.convert(raw, dict(zip(pm["id"].str.split(".").str[0], pm["gene"])), d)
        raw.unlink(missing_ok=True)
        return True
    except Exception:  # noqa: BLE001 - copy number is an extra
        return False


def fetch_mutations(d: Path, project: str, progress=None) -> bool:
    """Somatic mutations for the pack (optional: the pack works without them). Safe to call again."""
    from app.cohorts import mutations

    out = d / "mutations.json.gz"
    if out.exists():
        return True
    name = mutations.FILE.format(p=project)
    raw = d / name
    try:
        if not raw.exists():
            _fetch(name, raw, (lambda a, b: progress("mutation", a, b)) if progress else None)
        mutations.save(mutations.parse(raw), out)
        raw.unlink(missing_ok=True)
        return True
    except Exception:  # noqa: BLE001 - mutations are an extra; expression and survival still work
        return False


def convert(expr_path: Path, surv_path: Path, clin_path: Path, probemap: Path, out: Path, project: str) -> None:
    pm = pd.read_csv(probemap, sep="\t")
    ens2sym = dict(zip(pm["id"].str.split(".").str[0], pm["gene"]))
    opener = gzip.open if str(expr_path).endswith(".gz") else open
    with opener(expr_path, "rt") as f:
        expr = pd.read_csv(f, sep="\t", index_col=0)
    expr.index = [ens2sym.get(i.split(".")[0], i.split(".")[0]) for i in expr.index]
    expr = expr[~expr.index.duplicated(keep="first")]
    mat = expr.to_numpy(dtype=np.float32)
    np.save(out / "expr.npy", mat)
    (out / "genes.json").write_text(json.dumps(list(expr.index)))
    (out / "columns.json").write_text(json.dumps(list(expr.columns)))
    samples = _samples(list(expr.columns), surv_path, clin_path, project)
    samples.to_json(out / "samples.json", orient="records")
    (out / "ready.json").write_text(json.dumps({"project": project, "genes": len(expr.index), "samples": len(samples)}))


def _stage(s) -> str:
    if not isinstance(s, str) or not s.startswith("Stage"):
        return ""
    s = s.replace("Stage ", "").strip()
    for roman in ("IV", "III", "II", "I"):
        if s.startswith(roman):
            return roman
    return ""


def _samples(columns: list[str], surv_path: Path, clin_path: Path, project: str) -> pd.DataFrame:
    surv = pd.read_csv(surv_path, sep="\t").set_index("sample")
    clin = pd.read_csv(clin_path, sep="\t", low_memory=False)
    clin = clin.set_index(clin.columns[0])
    pick = lambda c, *names: next((n for n in names if n in c.index), None)  # noqa: E731
    rows = []
    for sid in columns:
        parts = sid.split("-")
        code = parts[3][:2] if len(parts) > 3 else ""
        kind = "tumor" if code in ("01", "02", "03", "05", "06") else "normal" if code == "11" else None
        if kind is None:
            continue
        c = clin.loc[sid] if sid in clin.index else None
        sv = surv.loc[sid] if sid in surv.index else None
        st = pick(c, "ajcc_pathologic_stage.diagnoses", "ajcc_pathologic_stage") if c is not None else None
        ag = pick(c, "age_at_index.demographic", "age_at_index") if c is not None else None
        sx = pick(c, "gender.demographic", "gender") if c is not None else None
        rows.append({
            "id": sid, "case": sid[:12], "type": kind, "project": project,
            "stage": _stage(c[st]) if st else "",
            "age": float(c[ag]) if ag and pd.notna(c[ag]) else None,
            "sex": str(c[sx]) if sx and pd.notna(c[sx]) else "",
            "os_time": float(sv["OS.time"]) if sv is not None and pd.notna(sv["OS.time"]) else None,
            "os_event": int(sv["OS"]) if sv is not None and pd.notna(sv["OS"]) else None,
        })
    return pd.DataFrame(rows)


class PackReader:
    def __init__(self, dirs: list[Path]):
        self.parts = []
        for d in dirs:
            genes = json.loads((d / "genes.json").read_text())
            cols = json.loads((d / "columns.json").read_text())
            self.parts.append((np.load(d / "expr.npy", mmap_mode="r"), {g: i for i, g in enumerate(genes)}, {c: i for i, c in enumerate(cols)}))

    def has(self, gene: str) -> bool:
        return all(gene in idx for _, idx, _ in self.parts)

    def gene(self, gene: str, sample_ids: list[str]) -> np.ndarray:
        out = np.full(len(sample_ids), np.nan)
        for mat, gidx, cidx in self.parts:
            row = np.asarray(mat[gidx[gene]], dtype=float)
            for i, s in enumerate(sample_ids):
                j = cidx.get(s)
                if j is not None:
                    out[i] = row[j]
        return out


    def matrix(self, sample_ids: list[str]) -> tuple[list[str], np.ndarray]:
        """Every gene measured in all parts, for these samples (genes x samples, NaN where a sample is absent)."""
        common = [g for g in self.parts[0][1] if all(g in idx for _, idx, _ in self.parts[1:])]
        out = np.full((len(common), len(sample_ids)), np.nan, dtype=np.float32)
        for mat, gidx, cidx in self.parts:
            pos = [(i, cidx[s]) for i, s in enumerate(sample_ids) if s in cidx]
            if not pos:
                continue
            dst, src = (list(x) for x in zip(*pos))
            rows = np.fromiter((gidx[g] for g in common), dtype=np.int64, count=len(common))
            out[:, dst] = np.asarray(mat[:, src], dtype=np.float32)[rows]
        return common, out


def open_packs(projects: list[str], data_dir: Path) -> Cohort:
    missing = [p for p in projects if not is_ready(data_dir, p)]
    if missing:
        raise CohortUnavailable("needs_download", projects=missing)
    dirs = [pack_dir(data_dir, p) for p in projects]
    samples = pd.concat([pd.read_json(d / "samples.json", orient="records") for d in dirs], ignore_index=True)
    from app.cohorts import mutations

    from app.cohorts.copynumber import CopyReader

    muts = mutations.merge([mutations.load(d / "mutations.json.gz") for d in dirs])
    try:
        cr = CopyReader(dirs)
    except FileNotFoundError:
        cr = None
    return Cohort("+".join(projects), projects, samples, "GDC harmonised data (STAR, GENCODE v36) via the UCSC Xena GDC hub",
                  "log2(TPM + 1)", "downloaded", reader=PackReader(dirs), mutations=muts, copy_reader=cr)
