# PyInstaller spec for the Kiri engine (onedir: starts fast, no unpacking on each launch).
# Run from this folder:  ../../backend/.venv/bin/pyinstaller --noconfirm kiri-engine.spec
import os
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

BACKEND = os.path.abspath(os.path.join(SPECPATH, "..", "..", "backend"))

hidden = (
    collect_submodules("app")
    + collect_submodules("uvicorn")
    + collect_submodules("aiosqlite")
    + ["sqlalchemy.dialects.sqlite.aiosqlite"]
)
datas = [(os.path.join(BACKEND, "app", "core", "gate_page.html"), "app/core")]
for pkg in ("gseapy", "lifelines", "reportlab", "svglib", "pydeseq2"):
    datas += collect_data_files(pkg)
# Any data files inside the app package itself (json, txt, html, csv)
for root, _dirs, files in os.walk(os.path.join(BACKEND, "app")):
    for f in files:
        if not f.endswith((".py", ".pyc")):
            src = os.path.join(root, f)
            datas.append((src, os.path.relpath(root, BACKEND)))

a = Analysis(
    [os.path.join(SPECPATH, "kiri_engine.py")],
    pathex=[BACKEND],
    hiddenimports=hidden,
    datas=datas,
    excludes=["tkinter", "pytest", "IPython", "jupyter", "notebook", "google.genai", "asyncpg", "redis"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="kiri-engine", console=True, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, name="kiri-engine", upx=False)
