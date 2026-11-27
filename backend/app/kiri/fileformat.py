"""
The .kiri project file.

A .kiri file is one SQLite database with its own application id. Kiri never
edits it in place: opening copies it to a working copy in the data folder,
every change goes to the working copy, and autosave writes the whole working
copy back to a temporary file next to the original and swaps it in with an
atomic rename. A crash or a sync client mid-copy can therefore never leave a
half-written project. The last file that saved cleanly is also kept in the
data folder, so a damaged file can be restored from it.

Format version 1 tables:
  manifest(key, value)            format, app version, created, modified, language
  project(id=1, data JSON)        name, question, template, targets, cancers, datasets, settings
  analyses(id, kind, params, result, data_versions, created_at, updated_at)
  figures(id, analysis_id, spec, thumbnail, created_at)
  notebook(id, kind, body, pinned, created_at, updated_at)
  versions(id, name, created_at, snapshot)  named checkpoints ("Save a version")
  attachments(id, name, mime, data, sha256, created_at)
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

APPLICATION_ID = 0x4B495249  # "KIRI"
FORMAT_VERSION = 1

SCHEMA = """
CREATE TABLE IF NOT EXISTS manifest (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, params TEXT NOT NULL, result TEXT,
  data_versions TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS figures (
  id TEXT PRIMARY KEY, analysis_id TEXT, spec TEXT NOT NULL, thumbnail BLOB, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notebook (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, snapshot BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT, data BLOB, sha256 TEXT, created_at TEXT NOT NULL);
"""

TEMPLATES = ("blank", "one_gene", "two_gene", "own_table", "course")


class KiriFileError(Exception):
    """A problem with a project file. `code` is shown to the person as a translated message."""

    def __init__(self, code: str, detail: str = "", **extra):
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail
        self.extra = extra


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def path_key(path: str | Path) -> str:
    return hashlib.sha256(str(Path(path).expanduser().resolve()).encode()).hexdigest()[:24]


def _connect(path: Path) -> sqlite3.Connection:
    con = sqlite3.connect(str(path), isolation_level=None, check_same_thread=False)
    con.execute("PRAGMA journal_mode=DELETE")  # one self-contained file, no -wal sidecar
    con.execute("PRAGMA foreign_keys=ON")
    return con


def create_file(path: Path, project: dict, app_version: str, language: str = "en") -> None:
    """Write a new, empty project file at `path` (atomically)."""
    tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex[:8]}.tmp")
    con = _connect(tmp)
    try:
        con.execute(f"PRAGMA application_id={APPLICATION_ID}")
        con.execute(f"PRAGMA user_version={FORMAT_VERSION}")
        con.executescript(SCHEMA)
        stamp = now()
        for k, v in {
            "format": str(FORMAT_VERSION), "app_version": app_version, "created": stamp,
            "modified": stamp, "language": language, "project_id": uuid.uuid4().hex,
        }.items():
            con.execute("INSERT INTO manifest(key, value) VALUES (?, ?)", (k, v))
        con.execute("INSERT INTO project(id, data) VALUES (1, ?)", (json.dumps(project, ensure_ascii=False),))
    finally:
        con.close()
    _fsync(tmp)
    os.replace(tmp, path)


def _fsync(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def check_file(path: Path) -> dict:
    """Is this a readable .kiri file? Returns its manifest. Raises KiriFileError."""
    if not path.exists():
        raise KiriFileError("not_found", str(path))
    try:
        with open(path, "rb") as f:
            head = f.read(100)
    except OSError as e:
        raise KiriFileError("unreadable", str(e))
    if not head.startswith(b"SQLite format 3\x00"):
        raise KiriFileError("not_kiri", "not a Kiri project file")
    app_id = int.from_bytes(head[68:72], "big")
    if app_id != APPLICATION_ID:
        raise KiriFileError("not_kiri", "not a Kiri project file")
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        ok = con.execute("PRAGMA quick_check").fetchone()[0]
        if ok != "ok":
            raise KiriFileError("damaged", ok)
        version = con.execute("PRAGMA user_version").fetchone()[0]
        manifest = dict(con.execute("SELECT key, value FROM manifest").fetchall())
        con.execute("SELECT data FROM project WHERE id = 1").fetchone()[0]
    except sqlite3.DatabaseError as e:
        raise KiriFileError("damaged", str(e))
    finally:
        con.close()
    manifest["format_int"] = version
    return manifest


@dataclass
class OpenProject:
    path: Path            # the person's file
    working: Path         # our working copy
    con: sqlite3.Connection
    read_only: bool
    read_only_reason: str | None
    manifest: dict

    # ── reading ──
    def project(self) -> dict:
        return json.loads(self.con.execute("SELECT data FROM project WHERE id = 1").fetchone()[0])

    def summary(self) -> dict:
        c = self.con
        return {
            "path": str(self.path),
            "file_name": self.path.name,
            "read_only": self.read_only,
            "read_only_reason": self.read_only_reason,
            "manifest": {k: v for k, v in self.manifest.items() if k != "format_int"},
            "project": self.project(),
            "counts": {
                "analyses": c.execute("SELECT COUNT(*) FROM analyses").fetchone()[0],
                "figures": c.execute("SELECT COUNT(*) FROM figures").fetchone()[0],
                "notebook": c.execute("SELECT COUNT(*) FROM notebook").fetchone()[0],
                "versions": c.execute("SELECT COUNT(*) FROM versions").fetchone()[0],
            },
            "versions": [
                {"id": r[0], "name": r[1], "created_at": r[2]}
                for r in c.execute("SELECT id, name, created_at FROM versions ORDER BY created_at DESC")
            ],
        }

    # ── writing (working copy, then autosave) ──
    def _writable(self):
        if self.read_only:
            raise KiriFileError("read_only", self.read_only_reason or "")

    def update_project(self, patch: dict) -> dict:
        self._writable()
        data = self.project()
        data.update(patch)
        self.con.execute("UPDATE project SET data = ? WHERE id = 1", (json.dumps(data, ensure_ascii=False),))
        return data

    def snapshot(self) -> bytes:
        """The project's content as JSON, for a named version."""
        c = self.con
        snap = {
            "project": self.project(),
            "analyses": [dict(zip(("id", "kind", "params", "result", "data_versions"), r))
                         for r in c.execute("SELECT id, kind, params, result, data_versions FROM analyses")],
            "notebook": [dict(zip(("id", "kind", "body", "pinned", "created_at"), r))
                         for r in c.execute("SELECT id, kind, body, pinned, created_at FROM notebook")],
            "figures": [dict(zip(("id", "analysis_id", "spec", "created_at"), r))
                        for r in c.execute("SELECT id, analysis_id, spec, created_at FROM figures")],
        }
        return json.dumps(snap, ensure_ascii=False).encode()

    def save_version(self, name: str) -> dict:
        self._writable()
        v = {"id": uuid.uuid4().hex, "name": name.strip()[:120] or "Version", "created_at": now()}
        self.con.execute("INSERT INTO versions(id, name, created_at, snapshot) VALUES (?, ?, ?, ?)",
                         (v["id"], v["name"], v["created_at"], self.snapshot()))
        return v

    def write_back(self, target: Path | None = None) -> None:
        """Copy the working copy to `target` (default: the person's file) atomically."""
        target = target or self.path
        if target == self.path:
            self._writable()
            self.con.execute("INSERT OR REPLACE INTO manifest(key, value) VALUES ('modified', ?)", (now(),))
        tmp = target.with_name(f".{target.name}.{uuid.uuid4().hex[:8]}.tmp")
        dst = sqlite3.connect(str(tmp))
        try:
            self.con.backup(dst)
        finally:
            dst.close()
        _fsync(tmp)
        os.replace(tmp, target)

    def close(self) -> None:
        try:
            self.con.close()
        finally:
            try:
                self.working.unlink()
            except OSError:
                pass


class Workspace:
    """Open projects, locks, recent list and autosave copies, kept in the data folder."""

    def __init__(self, data_dir: str | Path, app_version: str):
        self.root = Path(data_dir)
        self.app_version = app_version
        for d in ("working", "locks", "autosave"):
            (self.root / d).mkdir(parents=True, exist_ok=True)
        self.current: OpenProject | None = None

    # ── recent ──
    @property
    def _recent_file(self) -> Path:
        return self.root / "recent.json"

    def recent(self) -> list[dict]:
        try:
            items = json.loads(self._recent_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            items = []
        for it in items:
            it["exists"] = Path(it["path"]).exists()
        return items

    def _remember(self, op: OpenProject) -> None:
        p = op.project()
        items = [i for i in self.recent() if i["path"] != str(op.path)]
        items.insert(0, {
            "path": str(op.path), "name": p.get("name") or op.path.stem, "question": p.get("question", ""),
            "template": p.get("template", "blank"), "targets": p.get("targets", []),
            "review": bool(p.get("review_of")), "opened_at": now(),
        })
        for i in items:
            i.pop("exists", None)
        self._recent_file.write_text(json.dumps(items[:30], ensure_ascii=False, indent=1), encoding="utf-8")

    def forget(self, path: str) -> None:
        items = [i for i in self.recent() if i["path"] != path]
        for i in items:
            i.pop("exists", None)
        self._recent_file.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")

    # ── locks: a second open of the same file is read-only ──
    def _lock_path(self, path: Path) -> Path:
        return self.root / "locks" / f"{path_key(path)}.lock"

    def _locked_by_other(self, path: Path) -> bool:
        lp = self._lock_path(path)
        try:
            pid = int(lp.read_text().strip())
        except (OSError, ValueError):
            return False
        if pid == os.getpid():
            return False
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False

    def _lock(self, path: Path) -> None:
        self._lock_path(path).write_text(str(os.getpid()))

    def _unlock(self, path: Path) -> None:
        try:
            self._lock_path(path).unlink()
        except OSError:
            pass

    # ── autosave copies ──
    def _autosave_path(self, path: Path) -> Path:
        return self.root / "autosave" / f"{path_key(path)}.kiri"

    def autosave_info(self, path: Path) -> dict | None:
        a = self._autosave_path(path)
        if not a.exists():
            return None
        return {"saved_at": datetime.fromtimestamp(a.stat().st_mtime, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}

    # ── open / create / close ──
    def create(self, path: str, project: dict, language: str) -> dict:
        p = Path(path).expanduser()
        if p.suffix.lower() != ".kiri":
            p = p.with_name(p.name + ".kiri")
        if not p.parent.exists():
            raise KiriFileError("folder_missing", str(p.parent))
        project = {"name": p.stem, "question": "", "template": "blank", "targets": [], "cancers": [],
                   "datasets": [], "standard_panel": False, **project}
        if project["template"] not in TEMPLATES:
            raise KiriFileError("bad_template", project["template"])
        create_file(p, project, self.app_version, language)
        return self.open(str(p))

    def open(self, path: str) -> dict:
        p = Path(path).expanduser().resolve()
        if p.suffix.lower() != ".kiri":
            raise KiriFileError("not_kiri", "the file name does not end in .kiri")
        try:
            manifest = check_file(p)
        except KiriFileError as e:
            if e.code == "damaged":
                e.extra["autosave"] = self.autosave_info(p)
            raise
        read_only, reason = False, None
        if manifest["format_int"] > FORMAT_VERSION:
            read_only, reason = True, "newer_format"
        elif self._locked_by_other(p):
            read_only, reason = True, "open_elsewhere"
        elif not os.access(p, os.W_OK) or not os.access(p.parent, os.W_OK):
            read_only, reason = True, "no_write_access"

        self.close()
        working = self.root / "working" / f"{uuid.uuid4().hex}.kiri"
        shutil.copyfile(p, working)
        con = _connect(working)
        if manifest["format_int"] < FORMAT_VERSION and not read_only:
            shutil.copyfile(p, p.with_name(p.stem + f" (backup v{manifest['format_int']}).kiri"))
            con.executescript(SCHEMA)
            con.execute(f"PRAGMA user_version={FORMAT_VERSION}")
        op = OpenProject(p, working, con, read_only, reason, manifest)
        self.current = op
        if not read_only:
            self._lock(p)
            shutil.copyfile(p, self._autosave_path(p))
        self._remember(op)
        return op.summary()

    def autosave(self) -> None:
        op = self.require()
        op.write_back()
        shutil.copyfile(op.path, self._autosave_path(op.path))

    def restore_autosave(self, path: str) -> dict:
        p = Path(path).expanduser().resolve()
        a = self._autosave_path(p)
        if not a.exists():
            raise KiriFileError("no_autosave", str(p))
        if p.exists():
            damaged = p.with_name(p.stem + " (damaged).kiri")
            os.replace(p, damaged)
        shutil.copyfile(a, p)
        return self.open(str(p))

    def save_copy(self, path: str) -> dict:
        op = self.require()
        target = Path(path).expanduser()
        if target.suffix.lower() != ".kiri":
            target = target.with_name(target.name + ".kiri")
        op.write_back(target)
        return {"path": str(target)}

    def require(self) -> OpenProject:
        if not self.current:
            raise KiriFileError("no_project", "no project is open")
        return self.current

    def close(self) -> None:
        if self.current:
            op = self.current
            self.current = None
            if not op.read_only:
                try:
                    op.write_back()
                finally:
                    self._unlock(op.path)
            op.close()

