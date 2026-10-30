"""graphify step 3 Part A: structural AST extraction over the code corpus."""
import json
from pathlib import Path

ROOT = Path(r"C:\Users\aswat\Projects\w3-forensics")
OUT = ROOT / "graphify-out"

from graphify.extract import collect_files, extract

detect = json.loads((OUT / ".graphify_detect.json").read_text(encoding="utf-8"))

code_files = []
for f in detect.get("files", {}).get("code", []):
    p = Path(f)
    code_files.extend(collect_files(p) if p.is_dir() else [p])

if code_files:
    result = extract(code_files, cache_root=ROOT, root=ROOT)
    (OUT / ".graphify_ast.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"AST: {len(result['nodes'])} nodes, {len(result['edges'])} edges")
else:
    (OUT / ".graphify_ast.json").write_text(
        json.dumps({"nodes": [], "edges": [], "input_tokens": 0, "output_tokens": 0}),
        encoding="utf-8",
    )
    print("No code files - skipping AST extraction")
