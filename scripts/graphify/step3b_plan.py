"""graphify step 3 Part B0/B1: semantic cache check + chunk planning."""
import json
from pathlib import Path

ROOT = Path(r"C:\Users\aswat\Projects\w3-forensics")
OUT = ROOT / "graphify-out"
SPEC = Path(r"C:\Users\aswat\.claude\skills\graphify\references\extraction-spec.md")

from graphify.cache import check_semantic_cache

detect = json.loads((OUT / ".graphify_detect.json").read_text(encoding="utf-8"))
all_files = [
    f
    for cat in ("document", "paper", "image")
    for f in detect["files"].get(cat, [])
]

cached_nodes, cached_edges, cached_hyperedges, uncached = check_semantic_cache(
    all_files, root=str(ROOT), prompt_file=str(SPEC)
)

if cached_nodes or cached_edges or cached_hyperedges:
    (OUT / ".graphify_cached.json").write_text(
        json.dumps(
            {"nodes": cached_nodes, "edges": cached_edges, "hyperedges": cached_hyperedges},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
else:
    (OUT / ".graphify_cached.json").write_text(
        json.dumps({"nodes": [], "edges": [], "hyperedges": []}), encoding="utf-8"
    )

(OUT / ".graphify_uncached.txt").write_text("\n".join(uncached), encoding="utf-8")
for stale in OUT.glob(".graphify_chunk_*.json"):
    stale.unlink()

print(f"Cache: {len(all_files) - len(uncached)} hit, {len(uncached)} need extraction")

# ---- chunk planning: max 22 files AND max ~6000 lines per chunk ----
chunks: list[list[str]] = []
cur: list[str] = []
cur_lines = 0

for f in sorted(uncached):
    p = Path(f)
    if not p.is_absolute():
        p = ROOT / f
    try:
        lines = sum(1 for _ in p.open(encoding="utf-8", errors="replace"))
    except OSError:
        lines = 0

    too_many_files = len(cur) >= 22
    too_many_lines = cur_lines + lines > 6000
    long_file = lines > 2000

    if cur and (too_many_files or too_many_lines):
        chunks.append(cur)
        cur, cur_lines = [], 0

    if long_file and cur:
        chunks.append(cur)
        cur, cur_lines = [], 0

    cur.append(f)
    cur_lines += lines

    if long_file:
        chunks.append(cur)
        cur, cur_lines = [], 0

if cur:
    chunks.append(cur)

for i, c in enumerate(chunks):
    print(f"chunk {i}: {len(c)} files")

(OUT / ".graphify_chunks.json").write_text(
    json.dumps(chunks, indent=1, ensure_ascii=False), encoding="utf-8"
)
print(f"TOTAL CHUNKS: {len(chunks)}")
