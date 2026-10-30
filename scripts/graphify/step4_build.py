"""graphify step 4 + 4.5: build the graph, cluster, analyse, health-check, write outputs."""
import json
from pathlib import Path

ROOT = Path(r"C:\Users\aswat\Projects\w3-forensics")
OUT = ROOT / "graphify-out"

from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json
from graphify.diagnostics import diagnose_extraction, format_diagnostic_report

extraction = json.loads((OUT / ".graphify_extract.json").read_text(encoding="utf-8"))
detection = json.loads((OUT / ".graphify_detect.json").read_text(encoding="utf-8"))

G = build_from_json(extraction, root=str(ROOT), directed=False)
if G.number_of_nodes() == 0:
    print("ERROR: Graph is empty - extraction produced no nodes.")
    raise SystemExit(1)

communities = cluster(G)
cohesion = score_all(G, communities)
tokens = {
    "input": extraction.get("input_tokens", 0),
    "output": extraction.get("output_tokens", 0),
}
gods = god_nodes(G)
surprises = surprising_connections(G, communities)
labels = {cid: "Community " + str(cid) for cid in communities}
questions = suggest_questions(G, communities, labels)

wrote = to_json(G, communities, str(OUT / "graph.json"))
if not wrote:
    print("ERROR: refused to shrink graph.json (existing graph has more nodes).")
    raise SystemExit(1)

report = generate(
    G, communities, cohesion, labels, gods, surprises, detection, tokens, str(ROOT),
    suggested_questions=questions,
)
(OUT / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")

analysis = {
    "communities": {str(k): v for k, v in communities.items()},
    "cohesion": {str(k): v for k, v in cohesion.items()},
    "gods": gods,
    "surprises": surprises,
    "questions": questions,
}
(OUT / ".graphify_analysis.json").write_text(
    json.dumps(analysis, indent=2, ensure_ascii=False), encoding="utf-8"
)

print(
    f"Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, "
    f"{len(communities)} communities"
)

# ---- 4.5 health check (read-only) ------------------------------------------------
summary = diagnose_extraction(extraction, directed=False, root=str(ROOT))
print(format_diagnostic_report(summary))
flags = [
    f"{summary[k]} {label}"
    for k, label in (
        ("dangling_endpoint_edges", "dangling-endpoint edges"),
        ("missing_endpoint_edges", "missing-endpoint edges"),
        ("self_loop_edges", "self-loop edges"),
        ("directed_same_endpoint_collapsed_edges", "collapsed (directed) edges"),
        ("undirected_same_endpoint_collapsed_edges", "collapsed (undirected) edges"),
    )
    if summary.get(k, 0)
]
print(
    "GRAPH HEALTH WARNING: " + "; ".join(flags) + " - graph may be incomplete/corrupt."
    if flags
    else "Graph health: OK (no dangling/missing/collapsed edges)."
)
