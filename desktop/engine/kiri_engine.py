"""
Kiri engine — the analysis backend as one program for the desktop app.

The app shell (Tauri) starts this with:
  KIRI_ENGINE_PORT     port to listen on, on 127.0.0.1 only
  KIRI_DESKTOP_TOKEN   per-launch secret every request must carry
  KIRI_DATA_DIR        the per-user data folder
It exits when its standard input closes, so it never outlives the app,
even if the app is killed.
"""

import os
import sys
import threading


def _exit_when_parent_goes() -> None:
    try:
        while sys.stdin.read(1):
            pass
    except Exception:
        pass
    os._exit(0)


def _matplotlib_without_font_scan() -> None:
    """Point matplotlib at a folder that already holds the bundled font list (see the spec)."""
    import glob
    import shutil

    base = os.environ.get("KIRI_DATA_DIR") or os.path.expanduser("~/.kiri")
    conf = os.path.join(base, "matplotlib")
    os.environ.setdefault("MPLCONFIGDIR", conf)
    os.environ.setdefault("MPLBACKEND", "Agg")
    try:
        os.makedirs(os.environ["MPLCONFIGDIR"], exist_ok=True)
        here = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
        for src in glob.glob(os.path.join(here, "kiri_mpl", "fontlist-v*.json")):
            dest = os.path.join(os.environ["MPLCONFIGDIR"], os.path.basename(src))
            if not os.path.exists(dest):
                shutil.copyfile(src, dest)
    except OSError:
        pass  # matplotlib then builds its own list, slowly but correctly


def main() -> None:
    if "--version" in sys.argv:
        from app import __version__

        print(__version__)
        return
    port = int(os.environ.get("KIRI_ENGINE_PORT", "8765"))
    if os.environ.get("KIRI_ENGINE_WATCH_STDIN", "1") == "1":
        threading.Thread(target=_exit_when_parent_goes, daemon=True).start()

    _matplotlib_without_font_scan()
    import uvicorn
    from app.main import app

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning", access_log=False)


if __name__ == "__main__":
    main()
