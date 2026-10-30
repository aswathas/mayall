# Mayall — Forensic Reel

A 26-second, 1920×1080, 24 fps motion piece rendered frame by frame from
`docs/motion/scene.html`. No audio (silence path). Every number on screen is read from the
real reentrancy bundle in `artifacts/bundles/lab-reentrancy-forensic-bundle.zip`
(unpacked to `artifacts/motion/_bundle/`).

## Deliverables

| File | What it is |
|---|---|
| `docs/motion/reel-storyboard.md` | The shot list written before the animation code. |
| `docs/motion/scene.html` | One scene that draws any moment: `window.renderAt(t)` + a normal `requestAnimationFrame` preview loop reading `performance.now()`. |
| `artifacts/motion/contact-sheet.png` | One frame per second, sampled at `t = i + 0.6 s`, tiled 5×6. |
| `artifacts/motion/draft.mp4` | Half-resolution draft, 960×540, 24 fps. |
| `artifacts/motion/mayall-reel.mp4` | Final, 1920×1080, h264, yuv420p, `+faststart`. |

## Re-render

```bash
# 1. contact sheet (26 stills, tiled)
node scripts/render-reel.mjs sheet

# 2. half-resolution draft
node scripts/render-reel.mjs draft

# 3. final 1920x1080
node scripts/render-reel.mjs final

# everything in order
node scripts/render-reel.mjs all
```

The wrapper uses the same virtual clock as the reference script: `performance.now`, `Date.now`
and `requestAnimationFrame` are replaced, time advances by exactly `1000 / 24` ms per frame,
and every frame is a screenshot of a pure function of `t`. It also bounds ffmpeg stdin with
`drain` so a 624-frame 1080p render does not buffer in memory.

The untouched reference renderer still works and is useful for a one-off:

```bash
node scripts/claude-video-render.mjs docs/motion/scene.html artifacts/motion/out.mp4 26 24 1920 1080
```

`node scripts/claude-video-render.mjs` does not build the contact sheet; `scripts/render-reel.mjs`
does. The virtual-clock discipline is identical in both.

## Verification (real output)

`ffprobe -v error -show_entries format=duration,size -show_entries stream=width,height,r_frame_rate -of json artifacts/motion/mayall-reel.mp4`:

```json
{
  "streams": [
    { "width": 1920, "height": 1080, "r_frame_rate": "24/1" }
  ],
  "format": {
    "duration": "26.000000",
    "size": "1946606"
  }
}
```

Full probe also reports `codec_name: h264`, `pix_fmt: yuv420p`, `nb_frames: 624`, no audio
stream. Draft probe: 960×540, 24/1, 26.000 s, 674,291 bytes. `ffmpeg -version` works.

Fonts: `document.fonts.check` returned `true` for Familjen Grotesk (display), Public Sans
(body) and JetBrains Mono (data) in the render browser. If the network is unavailable, the
font strings fall back to `Public Sans` → system-ui → sans-serif and `JetBrains Mono` →
Cascadia Mono → Consolas.

## Style rules as numbers

- Canvas 1920×1080. Duration 26.0 s = 624 frames at 24 fps. No audio.
- Safe margin 96 px left/right, 54 px top/bottom. Inner gutter 24 px. Panel radius 14 px.
- Ground `#090607`; ground gradient `#0b0708 → #090607 → #070506`; 64 px grid at
  `rgba(255,237,237,0.022)` with a functional radial fade at the edges.
- Panel `#110b0d`; edge `#2b1a1e`; strong edge `#3d2429`; elevated `#1e1417`.
- Ink `#f7eded`; dim `#c3a7aa`; faint `#8f7276`; arterial `#ff3b30`; arterial-deep `#b31f18`;
  amber `#f5b942`; bone `#efe6e4`.
- Type: Familjen Grotesk 600 for display; Public Sans 400 for body; JetBrains Mono 400/500/600
  for every number and label. Sizes used: 152 wordmark, 150 hook counter, 118 confidence,
  68 detector title, 66 card title, 30 hook line, 30 honest line, 31 storage values,
  26 balance values, 20 body, 18 looks-for, 17/15/13.5/13/12.5/11/10.5 data and labels.
- Micro-labels: 10.5–12 px mono, tracking 0.18 em, uppercase. Numbers tabular by font.
- Easing: only `cubic-bezier(0.16, 1, 0.3, 1)`. Reveals 240–520 ms. Staggers 4, 5 and 6 frames.
- Hairlines 1 px. No glow, no gradients on content, no particles, no glitch, no bounce.
- Cuts: hard cut at each shot boundary (no dip-to-black), with the incoming shot lifting
  12–26 px into place. Final frame held 25.0–26.0 s with nothing moving.

## Data provenance and one discrepancy

Used verbatim from the bundle: `6 ETH` (`lossEth`), `withdraw() ×7` and `receive() ×7`
(`patterns.json` evidence), `97%` confidence, the five evidence strings, the exact root-cause
sentence, storage values (`totalDeposited` 10→11 ETH, `totalWithdrawn` 0→7 ETH,
`balances[attacker]` 0→0), balance movements (vault 10→4, attacker 1→7, victim EOA 990→990),
and `chain-of-custody.json` (11 files, 225 ms, trace.txt 21,053 B, sha256 prefix).

**One correction to the brief:** the brief says “83-node trace”. The real parser
(`packages/forensic-engine/src/trace-parser.ts`) returns **82** nodes for this trace, and
`artifacts/summary.json` reports `"traceNodes": 82`; `report/report.md` reports 82 gas-flame
nodes. The reel states **82** (`175 lines → 82 nodes`) because it may not state a number absent
from the data. Everything else in the brief's measured-facts list matches the files.

## The two weakest moments (and the fix for another round)

1. **Shot 3, 7.0–9.2 s — the staircase builds too slowly.** For roughly two seconds the frame
   is a sparse diagonal with only a few nodes, and the `×7` blocks do not land until 9.55 s, so
   the recursion read only fully resolves at 9.8 s. In another round I would draw a 22%-opacity
   ghost of the complete staircase at 7.0 s, animate each node from ghost to full with a
   0.10 s stagger, and land both `×7` blocks at 8.6 s. That keeps the build visible but never
   leaves the right half empty, and buys ~1.2 s more hold on the read.
2. **Shot 2, 2.2–7.0 s — the raw trace is not really readable.** The trace is 12.5 px mono and
   pans through ~20 lines between 3.9 and 6.4 s (about 8 lines/s); at 1080p the viewer reads the
   call tree on the right, not the raw text. In another round I would raise the trace to 14.5 px,
   replace the continuous pan with 3–4 deterministic cut-scrolls that each freeze for ~0.8 s,
   and show ~24 lines per page with the active line pinned in the read band. The tree and the
   caliper already carry the meaning; the raw text should support them, not race them.
   (A smaller third issue: the bundle manifest has ~200 px of unused space below the hash block;
   I would add the real `command` line or the 11-file list there.)

## Ownership

Only these paths were created or modified: `docs/motion/**`, `artifacts/motion/**`,
`scripts/render-reel.mjs`. `scripts/claude-video-render.mjs` was not modified.
