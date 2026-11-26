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


def main() -> None:
    if "--version" in sys.argv:
        from app import __version__

        print(__version__)
        return
    port = int(os.environ.get("KIRI_ENGINE_PORT", "8765"))
    if os.environ.get("KIRI_ENGINE_WATCH_STDIN", "1") == "1":
        threading.Thread(target=_exit_when_parent_goes, daemon=True).start()

    import uvicorn
    from app.main import app

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning", access_log=False)


if __name__ == "__main__":
    main()
