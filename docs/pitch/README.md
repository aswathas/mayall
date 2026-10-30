# Mayall — hackathon pitch kit

Everything needed to present Mayall in six minutes, or in thirty seconds.

| File | What it is |
| --- | --- |
| `index.html` | The 8-slide deck. One self-contained file, no build step, works offline. |
| `speaker-notes.md` | Word-for-word script, cumulative timings, click paths, expected questions, two fallbacks. |
| `one-pager.md` | A single page a judge can read in 60 seconds. |
| `README.md` | This file. |

## Open the deck

Double-click `docs/pitch/index.html`. It opens in any modern browser with no
server, no network and no build step. The stage is a fixed 1280 × 720 canvas
scaled to fit the window; letterboxing at other aspect ratios is intentional.

## Present it

The deck is built for a 6:00 pitch. Read `speaker-notes.md`; it is written to be
said aloud, not paraphrased at the last minute.

- **Advance:** `→`, `↓`, `PageDown`, `Space`, or click the right edge.
- **Back:** `←`, `↑`, `PageUp`, `Backspace`, or click the left edge.
- **First / last:** `Home` / `End`.
- **Counter and rail:** top right shows `03 / 08`; the bottom rail fills as you
  advance.
- **Motion:** one arterial wipe per slide transition. It is disabled
  automatically under `prefers-reduced-motion: reduce`.

**Stage direction:** keep `/lab` open in a second tab with the reentrancy
scenario pre-run. Do not refresh it. If the live run is slow, the previous
evidence is still on screen. See fallback A in the speaker notes.

## Print to PDF

1. Open `index.html` in Chrome or Edge.
2. `Ctrl+P` (Windows) or `Cmd+P` (macOS).
3. Destination: **Save as PDF**.
4. Layout: **Landscape**. Margins: **None**. Background graphics: **on**.
5. Save.

The deck's `@media print` rules lay **one slide per 1280 × 720 page**, hide the
HUD and click zones, and force exact colours. A verified export is eight pages;
if you get more, check that background graphics is on and margins are none.

## The 30-second version

If you only get 30 seconds, say this:

> Every block explorer tells you *that* an exploit happened. Mayall tells you
> *how*. It runs a real Solidity exploit proof-of-concept in a local Foundry EVM,
> reconstructs the call-by-call tree and storage diff, and scores the mechanism
> with ten detectors. The reentrancy run captures 83 call-tree nodes, with the
> same `withdraw()` function nested seven times, draining 6 ETH in one
> transaction. It exports a ZIP with a SHA-256 chain-of-custody manifest.
> The execution is real; the chain state is local, and we say so. Six scenarios,
> all six in about 1.3 seconds. Bring us one real incident and we will replay it.

Then open slide 4. That is the whole pitch.

## The demo path

```text
http://localhost:3000/lab
  → select reentrancy ("Re-entrant Withdrawal Drain")
  → press Run
  → watch the call tree, storage diff, findings and gas flame land
```

For the written case: `http://localhost:3000/cases/curve-v2-reentrancy/report`.
For the bundle: **Download bundle** on that page, then open
`chain-of-custody.json`.

## Three commands

```bash
npm install
npm run setup:foundry
npm run dev
```

Then open `http://localhost:3000/lab`. The full suite is the **Run full suite**
button; all six scenarios take about 1.3 seconds.

## What was verified

- Every slide was screenshotted headlessly at 1280 × 720. No clipped,
  off-screen or overlapping content. Fixed during review: slide 3's trace
  line spacing, slide 5's last row colliding with the footer, and the
  print-time fade that left pages 2–8 at partial opacity.
- Keyboard navigation, the slide counter, the progress rail and the click zones
  were exercised in a real browser.
- The print stylesheet produces eight pages at 1280 × 720 with `transition:
  none`, full opacity and `print-color-adjust: exact`.
- Every figure in the deck matches the verified fact list: 6/40/50/250/50/60
  ETH, 97/90/82/90/93/92%, 83 nodes, 7 nested calls, 6 ETH, ~1.3 s, 16
  incidents, 5 chains, ~$2.39B, 10 reproduced, 16 vectors, 10 detectors.
