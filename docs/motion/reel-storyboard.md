# Mayall — Forensic Reel · Storyboard

**Status:** written before any animation code.
**Format:** 1920×1080 · 16:9 · 24 fps · 26.0 s (624 frames) · no audio.
**Style (one named style):** *Red Room instrument* — warm-black ground, bone-white chrome,
arterial red reserved for data and alerts only, JetBrains Mono for every number, 1 px hairline
rules, no decorative gradients, no glow.
**Source of every number:** `artifacts/bundles/lab-reentrancy-forensic-bundle.zip`
(`evidence/trace.txt`, `evidence/patterns.json`, `evidence/storage-diff.csv`,
`evidence/balance-timeline.csv`, `evidence/artifact.json`, `chain-of-custody.json`,
`report/report.md`) plus `artifacts/summary.json` for the six-scenario losses.

**Measured facts used on screen (verified against the files):**
6 ETH drained · `withdraw()` 7× nested · 175 trace lines → 82 parsed nodes · Reentrancy
confidence 97% · vault 10 → 4 ETH (−6) · attacker 1 → 7 ETH (+6) · bundle 11 files, 225 ms.

> Note: the brief's "83-node trace" does not match the shipped data. The parser in
> `packages/forensic-engine/src/trace-parser.ts` returns **82** nodes for this trace, and
> `artifacts/summary.json` reports `"traceNodes": 82`; `report/report.md` reports 82 gas-flame
> nodes. The reel states **82** because the reel may not state a number absent from the data.

---

## Beat map

| # | Start | End | What is on screen | The read (one slot each) | Transition out |
|---|-------|-----|-------------------|--------------------------|----------------|
| 1 | 0.0 | 2.2 | A hairline corners the frame. A real trace line types in: `├─ [110836] ReentrancyVault::withdraw()`. A red counter resolves 0 → 6.000 under the label `ETH DRAINED`. | **Money left a vault.** (line starts typing at 0.06 s; the counter starts at 0.90 s and holds 6.000 from 1.45–2.20 s) | Hard cut; shot 2 enters with its header and panels lifting into place. |
| 2 | 2.2 | 7.0 | Left: the raw `forge -vvvv` text scrolls through a fixed read-band. Right: the call tree materialises row by row with depth badges and real gas numbers. A caliper strip proves `depth = floor(branchIndex / 4)` on a real `├─` line. | **This is a real nested call trace.** (2.6–6.4 s) | Hard cut; the recursion staircase slides in. |
| 3 | 7.0 | 12.5 | The 7 `withdraw()` calls draw as a depth-annotated staircase (depth 2→14), alternating with the 7 `receive()` frames. Each withdraw node carries its real gas. A bracket counts the re-entries 1…7. The real root-cause sentence sits at the base. | **The same function re-entered itself.** (9.8–12.3 s) | Hard cut; the detector rule card enters from the left. |
| 4 | 12.5 | 17.0 | Left: the real `DETECTOR_CATALOG` entry `det-reentrancy` — looks-for text, severity, and its honest limitation. Right: the five real evidence lines highlight in sequence; confidence resolves 0 → **97%** with a hairline fill to 97%. | **A rule fired on the evidence.** (14.0–16.6 s) | Hard cut; the three evidence panels rise with a 4-frame stagger. |
| 5 | 17.0 | 22.0 | Three evidence panels with real values: STORAGE DIFF (`totalDeposited` 10→11 ETH, `totalWithdrawn` 0→7 ETH, `balances[attacker]` unchanged), BALANCE TIMELINE (vault 10→4, attacker 1→7, victim EOA no movement), BUNDLE MANIFEST (`chain-of-custody.json`: 11 files, 225 ms, trace 21053 B, sha256 prefix). | **This becomes evidence, not a screenshot.** (19.0–21.8 s) | Hard cut; a short hairline opens for the wordmark. |
| 6 | 22.0 | 26.0 | Mayall wordmark in Familjen Grotesk, one hairline rule, the honest line `Local Foundry simulation. Not mainnet evidence.`, and a faint registry line (16 incidents · $2.39B · 10 detectors). | **Mayall is the instrument; the evidence is local.** (23.4–25.0 s) | Hold final frame 25.0–26.0 (1.0 s). No motion after 25.0. |

---

## Shot detail

### Shot 1 — HOOK · 0.0–2.2 s (frames 0–52)
- 0.00: four 1 px corner ticks sit at the safe margin; the frame is never black.
- 0.06–0.92: line types at 18 ms/char. Prefix `├─` in `--hx-ink-faint`. Text 30 px JetBrains Mono.
- 0.90: 1 px arterial rule grows left→right under the line (240 ms, `cubic-bezier(0.16,1,0.3,1)`).
- 0.90–1.45: `0.000 → 6.000` counter, 150 px Familjen Grotesk 600, arterial. `ETH` in 44 px mono.
- 0.90: `ETH DRAINED` micro-label (11 px mono, 0.18 em tracking, faint). `ReentrancyVault` label above the line.
- 1.45–2.20: hold the landed `6.000` (0.75 s).
- 2.20: hard cut; shot 2 lifts in.

### Shot 2 — THE TRACE · 2.2–7.0 s (frames 53–168)
- Header: `EVIDENCE / TRACE` and, right-aligned, `forge -vvvv · 175 lines → 82 nodes`.
- Left panel 96–940 × 200–960. Raw trace at 13 px / 21 px line height. Continuous upward scroll
  (to `attackIdx + 12`) with a fixed 21 px read-band at y 560; the line under the band gets bone
  text. 36 px top and 42 px bottom fade masks keep scrolling lines off the panel edge.
- Right panel 980–1824 × 200–960. Rows appear every 5 frames from 2.50 s. Each row: depth chip
  `d0…d7`, indent = depth × 26 px, `├─`/`└─` glyph, `Contract.fn`, real gas right-aligned.
- Bottom inset 980–1824 × 812–948: the caliper. One real line with 4-column ticks;
  `branchIndex 4 → floor(4 / 4) = 1` resolves at 4.4 s.
- Read slot: 2.6–6.4 s. Hard cut at 7.0.

### Shot 3 — THE RECURSION · 7.0–12.5 s (frames 168–300)
- Header: `RECURSION` / `withdraw() ×7 · depth 2 → 14`.
- Staircase: 14 nodes, step x +58, y +46, start (300, 228). Withdraw nodes arterial-edged,
  `withdraw()` + real gas; receive nodes bone, `receive{value: 1e18}`.
- Nodes appear every 4 frames (0.167 s) from 7.15 s → last at 9.23 s. Connectors draw with
  stroke-dashoffset as a pure function of t.
- 9.55–10.0: `×7 withdraw()` and `×7 receive()` blocks resolve on the right.
- 10.40–12.20: root-cause sentence (exact quote from `artifact.json`) at 96–1216 × 876; metric
  line in the header: `withdraw() ×7 · depth 2 → 14`.
- Read slot: 9.8–12.3. Hard cut at 12.5.

### Shot 4 — THE DETECTOR · 12.5–17.0 s (frames 300–408)
- Header: `DETECTOR` / `RULE · DET-REENTRANCY`.
- Left card 96–1088 × 184–936: chip `critical`, `RULE FIRED` chip top-right, title `Reentrancy`
  68 px; `LOOKS FOR` paragraph (real catalog text); `EMITS` list; hairline; `LIMITATION` in amber
  15 px (real catalog text).
- Right column 1112–1824: five real evidence lines, 4-frame stagger from 12.95 s; the two
  repeated-pair lines carry an arterial marker and bone text.
- 13.50–14.80: `97%` counter 0→97, 118 px mono, arterial; 656 px hairline bar fills to 97%;
  micro-label `CONFIDENCE · HEURISTIC`; `5 EVIDENCE ITEMS · SINGLE TRANSACTION`.
- Read slot: 14.0–16.6. Hard cut at 17.0.

### Shot 5 — THE EVIDENCE · 17.0–22.0 s (frames 408–528)
- Header: `EVIDENCE BUNDLE` / `lab-reentrancy · chain-of-custody.json`.
- Panel A 96–616 × 184–936 `STORAGE DIFF`: totalDeposited 10.000→11.000 ETH; totalWithdrawn
  0.000→7.000 ETH; balances[attacker] 0.000→0.000 (unchanged, faint). Slot suffixes `0x…01`, `0x…02`.
- Panel B 640–1160 `BALANCE TIMELINE`: paired before/after bars — vault 10.000→4.000 (−6.000),
  attacker 1.000→7.000 (+6.000), Victim EOA 990.000→990.000 (no movement). Bars sit above the
  numbers so nothing overlaps.
- Panel C 1184–1824 `BUNDLE MANIFEST`: caseRef, scenario, startedAt, durationMs 225, ok true,
  files 11, generatedAt; `trace.txt · 21,053 B · sha256 fa9dd9a5…`; `11 FILES · SEALED`.
- Panels land at 17.18 / 17.33 / 17.48 s (4-frame stagger); rows resolve from 17.22 / 17.34 / 17.50 s.
- Read slot: 19.0–21.8; caption `EVIDENCE, NOT A SCREENSHOT` resolves at 20.35 s. Hard cut at 22.0.

### Shot 6 — THE PRODUCT · 22.0–26.0 s (frames 528–624)
- 22.00–22.38: hairline at y 566 grows from 80 px → 480 px, centered (never opens on an empty frame).
- 22.20–23.05: `Mayall` 152 px Familjen Grotesk 600, bone; tracking 0.02 em → −0.03 em; opacity 0→1.
- 22.90: micro-label `WEB3 EXPLOIT FORENSICS`.
- 23.40–23.95: honest line `Local Foundry simulation. Not mainnet evidence.` 30 px Public Sans dim.
- 24.20: faint registry line `16 public incidents · $2.39B tracked · 10 detectors`.
- 25.00–26.00: full hold, nothing moves.

---

## Style rules as numbers
- Canvas 1920×1080; safe margin 96 px L/R, 54 px T/B; inner gutter 24 px; panel radius 14 px.
- Ground `#090607`; gradient `#0b0708 → #070506`; grid 64 px at `rgba(255,237,237,0.022)`.
- Panel `#110b0d`; edge `#2b1a1e`; strong edge `#3d2429`; elevated `#1e1417`.
- Ink `#f7eded`; dim `#c3a7aa`; faint `#8f7276`; arterial `#ff3b30`; deep `#b31f18`; amber `#f5b942`.
- Type: Familjen Grotesk 600 display; Public Sans 400 body; JetBrains Mono 400/500/600 data.
- Micro-labels 11 px mono, tracking 0.18 em, uppercase. Body 17 px / 1.55. Numbers tabular.
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` only. Reveal 240–520 ms. Staggers 4 and 6 frames.
- Hairlines 1 px. No glow, no gradients on content, no particles, no glitch, no bounce.
