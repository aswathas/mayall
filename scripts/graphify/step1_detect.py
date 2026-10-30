"""graphify step 1+2: resolve interpreter, write root marker, detect corpus."""
import json
import sys
from pathlib import Path

ROOT = Path(r"C:\Users\aswat\Projects\w3-forensics")
OUT = ROOT / "graphify-out"
OUT.mkdir(parents=True, exist_ok=True)

utf8 = "utf-8"
(OUT / ".graphify_python").write_text(sys.executable, encoding=utf8)
(OUT / ".graphify_root").write_text(str(ROOT), encoding=utf8)

from graphify.detect import detect
from graphify.paths import out_path
from graphify.watch import _read_build_excludes, _read_build_gitignore

result = detect(
    ROOT,
    extra_excludes=_read_build_excludes(out_path()),
    gitignore=_read_build_gitignore(out_path()),
)
(OUT / ".graphify_detect.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")

print(f"Detected {result['total_files']} files")
print(f"total_words: {result.get('total_words')}")
for cat, files in result.get("files", {}).items():
    print(f"  {cat}: {len(files)}")
if result.get("skipped_sensitive"):
    print("skipped_sensitive:", result["skipped_sensitive"][:10])
print("scan_root:", result.get("scan_root"))
