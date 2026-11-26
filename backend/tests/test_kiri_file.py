"""The .kiri project file: create, reopen, autosave, locks, damage and newer formats."""

import os
import sqlite3

import pytest

from app.kiri import genes
from app.kiri.fileformat import FORMAT_VERSION, KiriFileError, Workspace


@pytest.fixture
def ws(tmp_path):
    return Workspace(tmp_path / "data", "test")


def test_create_reopen_round_trip(ws, tmp_path):
    p = tmp_path / "PARL–MAVS in CRC"  # extension added, non-ASCII name kept
    s = ws.create(str(p), {"question": "Is PARL–MAVS linked to outcome?", "targets": ["PARL", "MAVS"],
                           "cancers": ["COAD", "READ"], "template": "two_gene"}, "en")
    assert s["file_name"] == "PARL–MAVS in CRC.kiri"
    assert not s["read_only"]
    ws.current.update_project({"question": "Changed"})
    ws.autosave()
    ws.close()
    s2 = ws.open(str(tmp_path / "PARL–MAVS in CRC.kiri"))
    assert s2["project"]["question"] == "Changed"
    assert s2["project"]["targets"] == ["PARL", "MAVS"]
    assert ws.recent()[0]["name"] == "PARL–MAVS in CRC"


def test_file_is_sqlite_with_kiri_id(ws, tmp_path):
    ws.create(str(tmp_path / "a.kiri"), {}, "zh")
    ws.close()
    con = sqlite3.connect(tmp_path / "a.kiri")
    assert con.execute("PRAGMA application_id").fetchone()[0] == 0x4B495249
    assert con.execute("PRAGMA user_version").fetchone()[0] == FORMAT_VERSION


def test_versions_and_copy(ws, tmp_path):
    ws.create(str(tmp_path / "a.kiri"), {}, "en")
    v = ws.current.save_version("Before group meeting")
    ws.autosave()
    assert ws.current.summary()["versions"][0]["id"] == v["id"]
    ws.save_copy(str(tmp_path / "hand-in"))
    assert (tmp_path / "hand-in.kiri").exists()


def test_second_open_elsewhere_is_read_only(ws, tmp_path):
    ws.create(str(tmp_path / "a.kiri"), {}, "en")
    lock = next((tmp_path / "data" / "locks").iterdir())
    lock.write_text(str(os.getppid()))  # pretend another running Kiri holds it
    other = Workspace(tmp_path / "data", "test")
    s = other.open(str(tmp_path / "a.kiri"))
    assert s["read_only"] and s["read_only_reason"] == "open_elsewhere"
    with pytest.raises(KiriFileError):
        other.current.update_project({"name": "x"})


def test_newer_format_opens_read_only(ws, tmp_path):
    ws.create(str(tmp_path / "a.kiri"), {}, "en")
    ws.close()
    con = sqlite3.connect(tmp_path / "a.kiri")
    con.execute(f"PRAGMA user_version={FORMAT_VERSION + 1}")
    con.commit()
    con.close()
    s = ws.open(str(tmp_path / "a.kiri"))
    assert s["read_only"] and s["read_only_reason"] == "newer_format"


def test_damaged_file_offers_and_restores_autosave(ws, tmp_path):
    p = tmp_path / "a.kiri"
    ws.create(str(p), {"question": "kept"}, "en")
    ws.close()
    data = bytearray(p.read_bytes())
    data[4096:8192] = b"\xff" * 4096  # a copy interrupted half-way
    p.write_bytes(bytes(data))
    with pytest.raises(KiriFileError) as e:
        ws.open(str(p))
    assert e.value.code == "damaged" and e.value.extra["autosave"]
    s = ws.restore_autosave(str(p))
    assert s["project"]["question"] == "kept"
    assert (tmp_path / "a (damaged).kiri").exists()


def test_not_a_kiri_file(ws, tmp_path):
    p = tmp_path / "x.kiri"
    p.write_text("hello")
    with pytest.raises(KiriFileError) as e:
        ws.open(str(p))
    assert e.value.code == "not_kiri"


def test_missing_file_shows_in_recent(ws, tmp_path):
    ws.create(str(tmp_path / "a.kiri"), {}, "en")
    ws.close()
    (tmp_path / "a.kiri").unlink()
    assert ws.recent()[0]["exists"] is False


def test_gene_check():
    assert genes.check("parl")["status"] == "ok"
    r = genes.check("MAV")
    assert r["status"] == "alias" and r["symbol"] == "KLHL2" and "MAVS" in r["suggestions"]
    assert "PARL" in genes.check("PARLL")["suggestions"]
    assert genes.check("p53")["symbol"] == "TP53"
