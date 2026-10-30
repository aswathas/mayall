# Mayall — "Red Room" design contract

> **Product name: Mayall.** The internal package namespace (`@helix/*`) and the
> `--hx-*` CSS custom-property prefix stay as they are — they are implementation
> detail, not the product. Everything a user reads says **Mayall**.

The single source of truth for the Mayall console redesign. Every contributor
(including delegated agents) codes against this file. If this document and a
component disagree, this document wins.

---

## 1. The concept

**A forensic instrument in a dark lab.**

HELIX is not a marketing site and not a SaaS dashboard. It is a bench
instrument for reading a crime scene that happened inside an EVM. The
reference is an autopsy room and an oscilloscope, not a fintech app: cold
darkness, one hot signal colour, bone-white chrome that never competes with
the data, and every number treated as a measurement.

- **Ground:** near-black with a warm red-black cast. Not blue-grey, not neutral.
- **Signal:** arterial red (`#ff3b30`) is the data accent — losses, mutations,
  the attack path, the trace. Red is *evidence*, not decoration, so it is
  spent only where something happened.
- **Chrome:** bone/ivory (`#efe6e4`) for interactive surfaces and primary
  actions, so the red always means data and never "button".
- **Secondary hues** are strictly semantic: ember (high), amber (medium),
  mint (safe/recovered). Nothing else is coloured.
- **Typography carries the personality.** No Inter, no Roboto, no system sans
  as a display face, no Space Grotesk.

### The one memorable moment

On first paint, an arterial scanline sweeps once down the viewport and the
console resolves out of a blur. It happens exactly once per navigation and
never repeats on scroll. Everything else is quiet and precise.

---

## 2. Tokens

Defined in `packages/web/app/globals.css` under `@theme`. Use them by name —
never a raw hex in a component.

| Token | Value | Use |
| --- | --- | --- |
| `--color-void` | `#090607` | page ground |
| `--color-panel` | `#110b0d` | panel surface |
| `--color-panel-2` | `#170f12` | nested surface / table header |
| `--color-elevated` | `#1e1417` | hover / raised control |
| `--color-edge` | `#2b1a1e` | hairline border |
| `--color-edge-strong` | `#3d2429` | emphasised border |
| `--color-ink` | `#f7eded` | primary text |
| `--color-ink-dim` | `#c3a7aa` | secondary text (>= 4.5:1 on panel) |
| `--color-ink-faint` | `#8f7276` | tertiary/meta text (large text only) |
| `--color-arterial` | `#ff3b30` | **primary signal** — losses, mutations, attack path |
| `--color-ember` | `#ff7a45` | high severity |
| `--color-amber` | `#f5b942` | medium severity |
| `--color-mint` | `#46d39a` | low severity / recovered |
| `--color-bone` | `#efe6e4` | interactive chrome, primary button |
| `--font-display` | Familjen Grotesk | headings, figures |
| `--font-sans` | Public Sans | body, UI labels |
| `--font-mono` | JetBrains Mono | addresses, hashes, gas, storage slots, any measurement |

Radius: panels `14px`, controls `9px`, chips `999px`. Never `rounded-2xl`.

---

## 3. Hard bans (these come from the loaded skills)

1. **No kicker / eyebrow above a heading.** The heading carries its own weight.
2. **No hero-metric card grid.** The overview's numbers live in one
   `MetricStrip` — a single bordered band divided by hairlines, not five cards.
3. **No nested cards.** A panel never sits inside another panel.
4. **No gradient text.**
5. **No coloured `border-left`/`border-right` thicker than 1px.**
6. **No zero-offset coloured glow** as a shadow. Elevation = one border OR one
   offset+blurred shadow, never both (no ghost cards).
7. **No emoji or unicode glyphs as icons** — use `lucide-react` SVG only.
8. **No monospace as costume.** Mono is for real data: hashes, addresses, gas,
   slot keys, file names. Never for prose.
9. **No identical fade-up entrance on every section.** One authored load
   moment, then stillness.
10. **No section numbers** (`01 / 02 / 03`) in page chrome.
11. **No raw hex in components.** Tokens only.
12. **No colour as the only signal** — severity always carries a text label too.

---

## 4. Component API (already implemented — use exactly this)

`components/Panel.tsx`:

```tsx
<Panel title="Loss timeline" actions={<button>…</button>} subtitle="USD · monthly">
  {children}
</Panel>
```

- `Panel` renders a flat surface with a 1px `--color-edge` border, 14px radius,
  and **no drop shadow**. Header: uppercase 11px mono label in
  `--color-ink-dim`, optional right-aligned actions.
- Inside a `Panel`, never wrap content in another `Panel`.

`components/MetricStrip.tsx`:

```tsx
<MetricStrip
  items={[
    { label: 'Tracked loss', value: '$2.39B', hint: 'reported at disclosure', tone: 'threat' },
    { label: 'Incidents', value: '16', hint: 'in the registry' },
  ]}
/>
```

- One horizontal band, cells separated by 1px vertical hairlines.
- Value: `--font-display`, 30px, `--color-ink`, tabular numerals.
- Label: 10px uppercase mono, `--color-ink-dim`, `letter-spacing: .14em`.
- Hint: 12px, `--color-ink-faint`.
- `tone` is optional: `'threat' | 'warn' | 'safe' | 'signal'` and only tints the
  value.

`components/SeverityChip.tsx` → `<SeverityChip severity="critical" />`
`components/ChainChip.tsx` → `<ChainChip chain="Ethereum" />`
`components/VectorChip.tsx` → `<VectorChip vectorId="reentrancy" />`

All three render a pill with a **text label**, never colour alone.

---

## 5. Motion rules

- **The boot moment** (once per page): `.boot-sweep` — an arterial scanline
  crosses the viewport top-to-bottom over 900ms; panels resolve with
  `.rise-in` (blur 6px → 0, translateY 10px → 0, opacity 0 → 1) staggered
  40ms apart, `cubic-bezier(.16,1,.3,1)`, 520ms.
- **Numbers roll up** in the MetricStrip when data arrives (translateY + opacity
  only — never animate width/height).
- **Trace tree** expands with `grid-template-rows: 0fr → 1fr` (spatial
  continuity, no height animation on a measured value).
- **Gas bars** grow from 0 with a 30ms stagger per bar.
- **Hover states**: 120ms. **Focus**: 80ms. **No transition longer than 200ms**
  except the boot moment.
- `@media (prefers-reduced-motion: reduce)` kills every animation and
  transition. This is mandatory.

---

## 6. Copy rules

- Name the action: "Run simulation", "Download forensic bundle", "Copy address".
- Errors name the problem and the recovery: "Foundry not found — run
  `npm run setup:foundry`", not "Error".
- Empty states say what will appear there and how to make it appear.
- Never claim the evidence is real-world: this is a **local Foundry
  simulation** of the exploit, and the UI must say so where it matters.

---

## 7. Accessibility floor

- Contrast: body ≥ 4.5:1, large text ≥ 3:1, on the panel ground.
- Every interactive element reachable and visible via keyboard; focus ring is
  2px `--color-bone` with a 2px offset — never `outline: none`.
- Icon-only buttons get `aria-label`.
- Charts: legend + tooltip; never colour alone.
- Touch targets ≥ 44×44px on the mobile layout.
- `tabular-nums` on every number that can change.

---

## 8. Responsive

- 320 / 768 / 1024 / 1440. Mobile-first.
- The sidebar collapses to a top bar under 1024px; nav becomes a horizontal
  scroller.
- Grids collapse to one column under 768px; the MetricStrip wraps to two
  columns then one.

---

## 9. Two worlds: dark and light

The console ships two complete themes. Both are driven by the same semantic
tokens, so **no component may branch on the theme** — it only uses tokens and
the theme flips underneath.

- **Dark — "the red room"** (default): warm black ground `#090607`, bone
  chrome `#efe6e4`, arterial `#ff3b30`.
- **Light — "the paper room"**: warm white ground `#f2efed` on `#ffffff`
  panels, ink chrome `#1c1214`, arterial darkened to `#d0221a` so text keeps
  ≥ 4.5:1 on white.

Rules:

1. The theme is set on `<html data-theme="dark|light">`. `components/ThemeToggle.tsx`
   flips it and persists to `localStorage['helix-theme']`.
2. `app/layout.tsx` injects a tiny inline bootstrap script that applies the
   stored theme **before first paint** — no flash of the wrong world.
3. Never hard-code a colour that only exists in one theme. If you need a new
   colour, add it to BOTH `:root` and `[data-theme='light']` in
   `app/globals.css`.
4. The signal red is the one accent whose value changes between themes
   (it must stay legible as text on its own ground). Everything else keeps its
   identity and only its surroundings change.
5. Chart series colours, the trace canvas and the anatomy figure must all
   read correctly in both worlds. For canvas work, read the computed CSS
   custom properties at draw time (`getComputedStyle(document.documentElement)`)
   so a theme switch repaints correctly.

---

## 10. The signature moment — "Attack Replay" (motion graphics)

The console has **one** authored motion piece, and it is the point of the
product: when a simulation runs, the attack is *replayed* as a motion graphic
drawn on a `<canvas>`. This follows the motion-graphics discipline: every
frame is a pure function of time, the style is written as numbers, and the
piece has a storyboard — not a pile of effects.

### Non-negotiable implementation rules

1. **Every frame is a pure function of time.** `draw(t)` where `t` is seconds
   since play start. No incrementing counters, no per-frame state that
   accumulates, no unseeded `Math.random()`. If you need randomness, seed it
   (a small deterministic PRNG with a fixed seed).
2. Expose a deterministic entry point: `renderAt(t)` on the component's
   imperative handle (or an exported pure `drawFrame(ctx, t, model)` function)
   so a single frame can be rendered for screenshots and tests.
3. The preview loop reads elapsed time from `performance.now()` and calls
   `draw(t)`. Nothing else.
4. No CSS transitions triggered by timers to fake animation — the canvas owns
   its own timing.
5. `await document.fonts.ready` before the first frame so labels use the real
   display face.
6. Text stays inside a 5% safe margin.
7. Style is numbers: hex colours, explicit easing curves, stagger counts in
   frames, margins in px.

### Avoid list (do not use)

Particle bursts, lens flares, neon glow, RGB split, glitch, bouncy easing on
everything, decorative gradients, and any text that merely repeats what the
picture already shows.

### Storyboard (8.0s, 60fps — build exactly this)

| # | Time | On screen | The read | Transition out |
| --- | --- | --- | --- | --- |
| 1 | 0.00–0.80s | Black field. A single arterial point at the left pulses once. | Something is about to happen. | The point draws a line right |
| 2 | 0.80–2.40s | The line reaches the target contract; the contract ignites as a small square with its gas label. | The attacker reached the target. | Contract emits its first call |
| 3 | 2.40–5.60s | The call tree draws itself, node by node, staggered ~70ms apart. Node size = gas share. A repeated function visibly spirals inward (this is the re-entrancy tell). | The call pattern. | Value starts to move |
| 4 | 5.60–7.20s | Red ticks travel along the call path OUT of the victim into the attacker; the victim's balance bar drains, the attacker's fills. | Where the money went. | Everything settles |
| 5 | 7.20–8.00s | Final frame holds: loss figure, severity, and the deepest repeated call. | The verdict. | Hold 0.8s, then rest state |

After the piece finishes, it holds the final frame. A replay control restarts
it. `prefers-reduced-motion` renders the final frame statically with no
animation at all.

### Signature palette (numbers, not names)

```
ground      #090607 / #f2efed   (per theme)
arterial    #ff3b30 / #d0221a
ember       #ff7a45 / #bf4d1c
bone        #efe6e4 / #1c1214
inkDim      #c3a7aa / #5b474a
hairline    #2b1a1e / #e4dcd9
```

Easing: `cubic-bezier(0.16, 1, 0.3, 1)` for entrances, linear for the value
travel, `cubic-bezier(0.4, 0, 0.2, 1)` for the settle.

---

## 11. The anatomy figure — "The evidence bench"

On `/docs`, one isometric SVG figure explains the pipeline as a **physical
object** — following the anatomy skill's rule that the object is the
explanation, not boxes and arrows.

- A heavy base on feet, a rail with tick rulers, a carriage that travels the
  rail, sample trays, knurled knobs, a dial gauge whose needle moves.
- The metaphor: a **specimen** (the transaction trace) enters on the left and
  travels the bench — over a **reader** (the trace parser), a **weighing
  stage** (the pattern detectors, with a dial needle), into a **press** (the
  report writer) — and a signed **bundle** drops into the tray at the right.
- Many small precise solid parts, four-tone shading, correct painter's order.
- Calm eased motion only: the carriage advances, the needle settles, the
  bundle drops. Nothing bouncy.
- Every number the figure shows comes from the same model that moves it — do
  not hard-code values that contradict the real pipeline.
- No emoji, no stock illustration, no generic "flowchart" boxes. Crisp vector
  geometry only.

---

## 12. What is already built (do not rebuild)

- `app/globals.css` — the full token system, both themes, the motion keyframes
  and the component classes (`.panel`, `.metric-strip`, `.chip`, `.btn`,
  `.data-table`, `.trace-node`, `.collapse`, `.rise-in`, `.boot-sweep`).
- `app/layout.tsx` — fonts (Familjen Grotesk / Public Sans / JetBrains Mono),
  the theme bootstrap script, the AppShell mount point.
- `components/Panel.tsx` — `Panel`, `MicroLabel`, `EmptyState`, `SubBlock`.
- `components/MetricStrip.tsx` — the overview metric band.
- `components/ThemeToggle.tsx` — the theme switch.
- `components/SeverityChip.tsx`, `ChainChip.tsx`, `VectorChip.tsx` — the chips.
- `components/AppShell.tsx` — the sidebar, nav and engine status.
- `app/api/**` — the API layer (do not change response shapes).

Build the rest against this contract.

