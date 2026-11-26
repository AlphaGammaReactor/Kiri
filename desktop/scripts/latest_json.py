"""Write the updater feed (latest.json) for a release from the built files.

usage: latest_json.py <tag> <folder with Kiri_<v>_<arch>.app.tar.gz(.sig)> <owner/repo>
"""
import datetime
import json
import pathlib
import sys

tag, folder, repo = sys.argv[1], pathlib.Path(sys.argv[2]), sys.argv[3]
version = tag.lstrip("v")
platforms = {}
for arch, key in (("aarch64", "darwin-aarch64"), ("x64", "darwin-x86_64")):
    name = f"Kiri_{version}_{arch}.app.tar.gz"
    sig = folder / (name + ".sig")
    if sig.exists():
        platforms[key] = {
            "signature": sig.read_text().strip(),
            "url": f"https://github.com/{repo}/releases/download/{tag}/{name}",
        }
if not platforms:
    sys.exit("no updater bundles found")
notes_file = pathlib.Path(__file__).parent.parent / "release-notes" / f"{tag}.md"
print(json.dumps({
    "version": version,
    "notes": notes_file.read_text(encoding="utf-8") if notes_file.exists() else "",
    "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "platforms": platforms,
}, indent=2, ensure_ascii=False))
