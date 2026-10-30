"""Correct the trace-node figure to the measured value (82) everywhere it is stated as fact."""
import re
from pathlib import Path

ROOT = Path(r"C:\Users\aswat\Projects\w3-forensics")

# Files where "83" is presented as a measured fact and must become 82.
TARGETS = [
    "packages/web/components/ShowcaseEvidence.tsx",
    "packages/web/components/ShowcaseHero.tsx",
    "packages/web/components/ShowcasePipeline.tsx",
    "packages/web/remotion/data.ts",
    "packages/web/app/intro/page.tsx",
    "docs/pitch/one-pager.md",
    "docs/pitch/README.md",
    "docs/pitch/speaker-notes.md",
    "docs/motion/intro-storyboard.md",
    "docs/motion/intro-and-tracker.md",
]

# "83 nodes", "83-node", "83 call-tree nodes", "| Trace nodes | 83 |"
PATTERNS = [
    (re.compile(r"(?<![\d.])83(?=\s*(?:-|\s)?nodes)"), "82"),
    (re.compile(r"(?<![\d.])83(?=\s*call-tree)"), "82"),
    (re.compile(r"(?<![\d.])83(?=\s*\|)"), "82"),
    (re.compile(r"TRACE_NODE_COUNT\s*=\s*83"), "TRACE_NODE_COUNT = 82"),
]

for rel in TARGETS:
    p = ROOT / rel
    if not p.exists():
        print(f"skip (missing): {rel}")
        continue
    text = p.read_text(encoding="utf-8")
    original = text
    for pat, repl in PATTERNS:
        text = pat.sub(repl, text)
    if text != original:
        p.write_text(text, encoding="utf-8")
        changed = sum(1 for a, b in zip(original.splitlines(), text.splitlines()) if a != b)
        print(f"updated {rel} ({changed} lines)")
    else:
        print(f"no change  {rel}")
