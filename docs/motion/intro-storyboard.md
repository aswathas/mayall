# Mayall — intro & trace / shot lists

Two Remotion compositions, both 1920×1080 at 30 fps. Every frame is a pure
function of the frame number; all randomness is seeded (`mulberry32`, seed
`0x51ed`). Style is written as numbers in `packages/web/remotion/theme.ts`.

The piece is one authored moment, not a pile of effects: a run begins, the
trace descends, value leaves, a detector fires, the wordmark lands. No particle
bursts, lens flares, neon glow, RGB split, glitch, decorative gradients, or text
that repeats what the picture already shows. Text stays inside a 5% safe margin
(96 px at 1920).

Real facts used, nothing invented:

| Fact | Value | Source |
| --- | --- | --- |
| Reentrancy drain | 6 ETH | `artifacts/reentrancy.json` |
| Nested `withdraw()` calls | 7 | `artifacts/motion/_bundle/evidence/trace.txt` |
| Trace nodes | 83 | measured run |
| Reentrancy detector | 97% confidence | `artifacts/summary.json` |
| Scenario losses | 6 / 40 / 50 / 250 / 50 / 60 ETH | `artifacts/summary.json` |
| Registry | 16 incidents · ~$2.39B · 5 chains · 16 vectors | `packages/core/src/incidents.ts` |
| Detectors / reproductions | 10 / 6 | `packages/core/src/detectors.ts`, `scenarios.ts` |

---

## Composition A — `MayallIntro` (450 frames / 15.0 s)

| # | In | Out | On screen | The read | Transition out |
| --- | --- | --- | --- | --- | --- |
| 1 | 0.00 s (f0) | 1.40 s (f42) | Near-black ground, 96 px measuring grid at 5% opacity. A single arterial point at (300, 530) blooms once and a 1 px arterial line shoots right to x=820 over ~870 ms. Top-left micro label `LOCAL FOUNDRY SIMULATION · RUN 001`. | A run has started. | The line resolves into the target frame. |
| 2 | 1.40 s (f42) | 3.80 s (f114) | The target frame draws as a 940 × 660 rectangle at (820, 200), its label `ReentrancyVault` and `0x5615…b72f · 195,418 gas` above it, four reticle ticks expanding outward. | This is the contract under examination. | The first nested call frame draws inside it. |
| 3 | 3.80 s (f114) | 8.20 s (f246) | Fourteen call frames nest inward, alternating `withdraw()` (arterial) and `receive()` (hairline), 70 ms apart. Each withdrawal carries a depth badge `D1`…`D7` and its real gas figure. A counter in the left column climbs to `83 nodes`. The repeated selector is the only arterial element. | The recursion is the tell. | Value ticks start moving along the curve to the attacker rail. |
| 4 | 8.20 s (f246) | 10.80 s (f324) | Seven arterial ticks travel a quadratic curve from the deepest frame to the attacker rail. Bottom-left balance rails: vault `10.000 → 4.000 ETH` drains; attacker `1.000 → 7.000 ETH` fills. The loss reads `6 ETH` as the travel completes. | 6 ETH left the vault. | Everything settles; the detector plate arrives. |
| 5 | 10.80 s (f324) | 13.60 s (f408) | The detector plate rises into the left column (40 px horizontal travel, ~530 ms, `cubic-bezier(.16,1,.3,1)`): `REENTRANCY`, `97% confidence`, severity `CRITICAL`, detail `withdraw() ×7 nested · 83-node trace`. The nested frames dim to 55%. | The heuristic detector fired. | Everything dims; the wordmark takes the frame. |
| 6 | 13.60 s (f408) | 15.00 s (f450) | `MAYALL` resolves in the display face (tracking +0.16em), a 1 px hairline rule under it, one line `Web3 exploit forensics`, and a footer of real numbers: `16 incidents · $2.39B tracked · 5 chains · 6 reproductions`. Final frame is static f420–f450 (1.0 s). | The product name and what it is. | Hold. |

Hook at 0.4 s (the pulse). Something happens in every shot. Longest static
interval is the final hold, 1.0 s.

---

## Composition B — `MayallTrace` (300 frames / 10.0 s)

The technical sibling of the in-console `AttackReplay` canvas: raw trace on the
left, parsed tree on the right, detector firing last. Same palette, same
easings, same discipline.

| # | In | Out | On screen | The read | Transition out |
| --- | --- | --- | --- | --- | --- |
| 1 | 0.00 s (f0) | 1.10 s (f33) | Two columns resolve: left `raw · forge -vvvv`, right `parsed · trace`. A single arterial point at the left column top pulses. | Two representations of one run. | The raw lines begin ticking in. |
| 2 | 1.10 s (f33) | 6.60 s (f198) | Twenty real lines from `evidence/trace.txt` type into the left column, ~200 ms apart, while the right tree descends the seven nested withdrawals; depth badges and gas attribution appear after each node. | The parser is reading the trace. | The last node lands; the tree is complete. |
| 3 | 6.60 s (f198) | 8.40 s (f252) | A hairline sweep travels the tree once. Ten detector ticks run down the right edge; nine stay faint, the Reentrancy tick turns arterial and expands. | Nine detectors pass; one fires. | The detector plate settles. |
| 4 | 8.40 s (f252) | 10.0 s (f300) | Plate at the bottom-left: `REENTRANCY · 97%`, `critical`, `withdraw() ×7`, `6 ETH`, `83 nodes`. Footer: `local Foundry simulation · not mainnet evidence`. The plate is fully in at f268, so the final frame is static for f268–f300 (1.07 s). | What the detector concluded. | Hold. |

---

## Motion vocabulary

- Entrance: `cubic-bezier(0.16, 1, 0.3, 1)`, 420–620 ms.
- On-screen movement: `cubic-bezier(0.4, 0, 0.2, 1)`.
- Value travel: linear, 1.6 s.
- Stagger: ~200 ms per raw line, 70 ms per trace node, 80 ms per detector row.
- Only `transform`, `opacity`, `stroke-dashoffset`, and `clip-path` animate.
- `prefers-reduced-motion`: the page shows the poster still and does not
  autoplay; the composition itself is unchanged (it is a rendered film).

## Frame-zero contract

- A `delayRender` handle is held until `document.fonts.ready` resolves and the
  three families have loaded (30 s timeout). No frame is captured with a
  fallback face.
- No `Math.random()` — the only stochastic values in the piece are the 18 value
  ticks, produced by `mulberry32(0x51ed)` at module scope.
