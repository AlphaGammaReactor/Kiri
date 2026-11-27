# PyInstaller spec for the Kiri engine (onedir: starts fast, no unpacking on each launch).
# Run from this folder:  ../../backend/.venv/bin/pyinstaller --noconfirm kiri-engine.spec
import os
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

BACKEND = os.path.abspath(os.path.join(SPECPATH, "..", "..", "backend"))

hidden = (
    collect_submodules("app")
    + collect_submodules("uvicorn")
    + collect_submodules("aiosqlite")
    + ["sqlalchemy.dialects.sqlite.aiosqlite", "rlPyCairo"]
)
datas = [(os.path.join(BACKEND, "app", "core", "gate_page.html"), "app/core")]
for pkg in ("gseapy", "lifelines", "reportlab", "svglib", "pydeseq2", "docx"):
    datas += collect_data_files(pkg)
# Any data files inside the app package itself (json, txt, html, csv)
for root, _dirs, files in os.walk(os.path.join(BACKEND, "app")):
    for f in files:
        if not f.endswith((".py", ".pyc")):
            src = os.path.join(root, f)
            datas.append((src, os.path.relpath(root, BACKEND)))

# Matplotlib (pulled in by lifelines) scans every system font on first import, which takes
# minutes on a Mac. Kiri draws no figures with it, so ship a font list of its own bundled
# fonts; the engine copies it into place before anything imports matplotlib.
import matplotlib
import matplotlib.font_manager as fm

_mpl_data = os.path.abspath(matplotlib.get_data_path())
fm.fontManager.ttflist = [f for f in fm.fontManager.ttflist if os.path.abspath(f.fname).startswith(_mpl_data)]
fm.fontManager.afmlist = [f for f in fm.fontManager.afmlist if os.path.abspath(f.fname).startswith(_mpl_data)]
os.makedirs(os.path.join(SPECPATH, "build"), exist_ok=True)
_fontlist = os.path.join(SPECPATH, "build", f"fontlist-v{fm.FontManager.__version__}.json")
fm.json_dump(fm.fontManager, _fontlist)
datas.append((_fontlist, "kiri_mpl"))

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
