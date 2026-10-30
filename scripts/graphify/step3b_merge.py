"""graphify step 3 Part B3 + Part C: verify coverage, merge chunks, merge AST + semantic."""
import glob
import json
from pathlib import Path

ROOT = Path(r"C:\Users\aswat\Projects\w3-forensics")
OUT = ROOT / "graphify-out"

# ---- B3.5 coverage verification -------------------------------------------------
covered: dict[str, int] = {}
for c in sorted(glob.glob(str(OUT / ".graphify_chunk_*.json"))):
    d = json.loads(Path(c).read_text(encoding="utf-8"))
    for src, n in (d.get("coverage") or {}).items():
        covered[src] = max(covered.get(src, 0), int(n))

partial = []
for src, n in sorted(covered.items()):
    p = Path(src)
    if not p.is_absolute():
        p = ROOT / src
    if not p.is_file():
        continue
    total = sum(1 for _ in p.open(encoding="utf-8", errors="replace"))
    if total and n < total:
        partial.append((src, n, total))

(OUT / ".graphify_partial.txt").write_text(
    "\n".join(s for s, _, _ in partial), encoding="utf-8"
)
if partial:
    print(f"WARNING: {len(partial)} file(s) only partly read:")
    for src, n, total in partial:
        print(f"  {src}: read {n} of {total} lines")
else:
    print("Coverage OK - every reported file was read to its last line")

# ---- B3 merge chunks -------------------------------------------------------------
chunks = sorted(glob.glob(str(OUT / ".graphify_chunk_*.json")))
all_nodes, all_edges, all_hyperedges = [], [], []
total_in = total_out = 0
missing = []
for c in chunks:
    p = Path(c)
    if not p.exists():
        missing.append(c)
        continue
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        missing.append(c)
        continue
    all_nodes += d.get("nodes", [])
    all_edges += d.get("edges", [])
    all_hyperedges += d.get("hyperedges", [])
    total_in += d.get("input_tokens", 0)
    total_out += d.get("output_tokens", 0)

if missing:
    print("WARNING: chunk file(s) missing or invalid: " + ", ".join(missing))
if chunks and len(missing) > len(chunks) / 2:
    raise SystemExit("More than half the chunks failed - aborting.")

new = {
    "nodes": all_nodes,
    "edges": all_edges,
    "hyperedges": all_hyperedges,
    "input_tokens": total_in,
    "output_tokens": total_out,
}
(OUT / ".graphify_semantic_new.json").write_text(
    json.dumps(new, indent=2, ensure_ascii=False), encoding="utf-8"
)
print(f"Merged {len(chunks)} chunks: {total_in:,} in / {total_out:,} out tokens")

# ---- cache the semantic result --------------------------------------------------
from graphify.cache import save_semantic_cache

uncached = [
    line
    for line in (OUT / ".graphify_uncached.txt").read_text(encoding="utf-8").splitlines()
    if line
]
partials = [
    line
    for line in (OUT / ".graphify_partial.txt").read_text(encoding="utf-8").splitlines()
    if line
]
SPEC = r"C:\Users\aswat\.claude\skills\graphify\references\extraction-spec.md"
saved = save_semantic_cache(
    new["nodes"],
    new["edges"],
    new["hyperedges"],
    root=str(ROOT),
    allowed_source_files=uncached,
    prompt_file=SPEC,
    partial_source_files=partials,
)
print(f"Cached {saved} files" + (f" ({len(partials)} left partial for retry)" if partials else ""))

# ---- merge cached + new ----------------------------------------------------------
cached = json.loads((OUT / ".graphify_cached.json").read_text(encoding="utf-8"))
merged = {
    "nodes": cached["nodes"] + new["nodes"],
    "edges": cached["edges"] + new["edges"],
    "hyperedges": cached.get("hyperedges", []) + new.get("hyperedges", []),
    "input_tokens": new["input_tokens"],
    "output_tokens": new["output_tokens"],
}
seen = set()
deduped = []
for n in merged["nodes"]:
    if n["id"] not in seen:
        seen.add(n["id"])
        deduped.append(n)
merged["nodes"] = deduped

(OUT / ".graphify_semantic.json").write_text(
    json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8"
)
print(
    f"Semantic: {len(deduped)} nodes, {len(merged['edges'])} edges, "
    f"{len(merged['hyperedges'])} hyperedges"
)

# ---- Part C: merge AST + semantic ----------------------------------------------
ast = json.loads((OUT / ".graphify_ast.json").read_text(encoding="utf-8"))
sem = json.loads((OUT / ".graphify_semantic.json").read_text(encoding="utf-8"))

for n in sem["nodes"]:
    n.setdefault("_origin", "semantic")
for e in sem["edges"]:
    e.setdefault("_origin", "semantic")

seen = {n["id"] for n in ast["nodes"]}
merged_nodes = list(ast["nodes"])
for n in sem["nodes"]:
    if n["id"] not in seen:
        merged_nodes.append(n)
        seen.add(n["id"])

final = {
    "nodes": merged_nodes,
    "edges": ast["edges"] + sem["edges"],
    "hyperedges": sem.get("hyperedges", []),
    "input_tokens": sem.get("input_tokens", 0),
    "output_tokens": sem.get("output_tokens", 0),
}
(OUT / ".graphify_extract.json").write_text(
    json.dumps(final, indent=2, ensure_ascii=False), encoding="utf-8"
)
print(
    f"Merged: {len(merged_nodes)} nodes, {len(final['edges'])} edges "
    f"({len(ast['nodes'])} AST + {len(sem['nodes'])} semantic)"
)
