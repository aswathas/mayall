"""graphify step 5: derive community labels from member node labels, regenerate the report."""
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(r"C:\Users\aswat\Projects\w3-forensics")
OUT = ROOT / "graphify-out"

from graphify.build import build_from_json
from graphify.cluster import score_all
from graphify.analyze import suggest_questions
from graphify.report import generate
from graphify.export import to_json

extraction = json.loads((OUT / ".graphify_extract.json").read_text(encoding="utf-8"))
detection = json.loads((OUT / ".graphify_detect.json").read_text(encoding="utf-8"))
analysis = json.loads((OUT / ".graphify_analysis.json").read_text(encoding="utf-8"))

G = build_from_json(extraction, root=str(ROOT), directed=False)
communities = {int(k): v for k, v in analysis["communities"].items()}
cohesion = {int(k): v for k, v in analysis["cohesion"].items()}
tokens = {
    "input": extraction.get("input_tokens", 0),
    "output": extraction.get("output_tokens", 0),
}

STOP = {
    "the", "and", "for", "with", "that", "this", "from", "into", "not", "you", "your",
    "are", "was", "were", "has", "have", "had", "but", "all", "can", "will", "one",
    "our", "its", "may", "use", "used", "using", "via", "per", "how", "why", "what",
    "src", "lib", "app", "api", "core", "web", "packages", "contracts", "index",
    "true", "false", "null", "void", "string", "number", "boolean", "any", "unknown",
    "component", "function", "method", "class", "const", "let", "var", "type",
}


def derive_label(members: list[str]) -> str:
    """Pick the most distinctive words from a community's node labels."""
    words: Counter[str] = Counter()
    for label in members:
        for token in re.split(r"[^A-Za-z0-9]+", str(label)):
            t = token.strip()
            if len(t) < 3 or t.lower() in STOP:
                continue
            if t.lower().startswith(("hx", "get", "set", "on", "is")) and len(t) < 6:
                continue
            words[t] += 1
    if not words:
        return "Community"
    top = [w for w, _ in words.most_common(3)]
    # Prefer the longest meaningful phrase among the top words.
    top.sort(key=len, reverse=True)
    return " ".join(top[:2]) if len(top) > 1 else top[0]


node_label = {n["id"]: str(n.get("label") or n.get("name") or n["id"]) for n in G.nodes()}

labels: dict[int, str] = {}
for cid, members in communities.items():
    member_labels = [node_label.get(m, m) for m in members]
    labels[cid] = derive_label(member_labels)

questions = suggest_questions(G, communities, labels)

report = generate(
    G, communities, cohesion, labels, analysis["gods"], analysis["surprises"],
    detection, tokens, str(ROOT), suggested_questions=questions,
)
(OUT / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")
(OUT / ".graphify_labels.json").write_text(
    json.dumps({str(k): v for k, v in labels.items()}, ensure_ascii=False), encoding="utf-8"
)

wrote = to_json(G, communities, str(OUT / "graph.json"), community_labels=labels)
if not wrote:
    print("ERROR: refused to shrink graph.json.")

print(f"Labelled {len(labels)} communities; report updated.")
for cid, name in sorted(labels.items(), key=lambda kv: -len(communities[kv[0]])):
    print(f"  [{cid}] {name}  ({len(communities[cid])} nodes)")
