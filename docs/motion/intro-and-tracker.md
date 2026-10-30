# Mayall — intro page & live attack tracker

Implementation notes for the two deliverables: the Remotion intro and the
live tracker. The storyboard is in [`intro-storyboard.md`](./intro-storyboard.md).

## 1. What shipped

| Path | What it is |
| --- | --- |
| `packages/web/remotion/index.ts` | Remotion entry (`registerRoot`). |
| `packages/web/remotion/Root.tsx` | Registers `MayallIntro` and `MayallTrace`. |
| `packages/web/remotion/MayallIntro.tsx` | The 15 s brand composition. |
| `packages/web/remotion/MayallTrace.tsx` | The 10 s raw-trace / parsed-tree / detector composition. |
| `packages/web/remotion/theme.ts` | The Red Room palette as numbers, easings, seeded PRNG, `rgba`. |
| `packages/web/remotion/data.ts` | Real measured facts and the verbatim trace lines. |
| `packages/web/remotion/fonts.ts` | `delayRender` font gate (render-time only). |
| `packages/web/remotion/ui.tsx` | Ground grid, micro labels, rules, readouts. |
| `packages/web/remotion/constants.ts` | Dimensions, fps, durations, composition ids. |
| `packages/web/remotion.config.ts` | Entry, output format, installed-Chrome executable. |
| `packages/web/components/IntroPlayer.tsx` | `@remotion/player` mount + reduced-motion poster. |
| `packages/web/components/Tracker*.tsx` | Rail, gas meter, balance readout, depth gauge, trace feed, console. |
| `packages/web/app/intro/page.tsx` | The full-page intro. |
| `packages/web/app/intro/loading.tsx` | Intro skeleton. |
| `packages/web/app/tracker/page.tsx` | The tracker page (server shell around the client console). |
| `packages/web/app/tracker/loading.tsx` | Tracker skeleton. |
| `packages/web/public/intro/mayall-intro.mp4` | Rendered intro film. |
| `packages/web/public/intro/mayall-intro-poster.png` | Rendered poster frame (f440). |
| `packages/web/public/intro/mayall-trace.mp4` | Rendered trace film. |
| `scripts/remotion-render.mjs` | One-command reproduction of all three outputs. |

No other dependencies were added beyond `remotion`, `@remotion/player` and
`@remotion/cli` (all `4.0.539`, hoisted to the workspace root).

## 2. Remotion

```bash
cd packages/web
npm i remotion @remotion/player
npm i -D @remotion/cli
```

Installed and rendered successfully. Both compositions are 1920 × 1080 at
30 fps:

| Composition | Frames | Duration |
| --- | --- | --- |
| `MayallIntro` | 450 | 15.00 s |
| `MayallTrace` | 300 | 10.00 s |

`npx remotion compositions remotion/index.ts`:

```
MayallIntro    30      1920x1080      450 (15.00 sec)
MayallTrace    30      1920x1080      300 (10.00 sec)
```

Rendered with the Chrome already on the machine
(`C:\Program Files\Google\Chrome\Application\chrome.exe`) via
`Config.setBrowserExecutable`; override with `REMOTION_BROWSER_EXECUTABLE`.

### Real `ffprobe` numbers

```
mayall-intro.mp4
  codec_name=h264  width=1920  height=1080
  r_frame_rate=30/1  avg_frame_rate=30/1  nb_frames=450
  duration=15.000000  size=693793

mayall-trace.mp4
  codec_name=h264  width=1920  height=1080
  r_frame_rate=30/1  avg_frame_rate=30/1  nb_frames=300
  duration=10.000000  size=938093

mayall-intro-poster.png  126779 bytes
```

Full paths:

- `packages/web/public/intro/mayall-intro.mp4`
- `packages/web/public/intro/mayall-trace.mp4`
- `packages/web/public/intro/mayall-intro-poster.png`

### Motion discipline

- Every frame is a pure function of the frame number. No accumulating state,
  no clock reads inside the composition, no unseeded `Math.random()`.
- The only stochastic values are the seven value ticks, produced once at module
  scope by `mulberry32(0x51ed)`.
- `useMayallFonts` holds a `delayRender` handle until `document.fonts.ready`
  and the three faces load — **only while Remotion is rendering or in Studio**.
  In the browser Player the handle would pause playback, so it is skipped there
  and the composition simply re-renders when the fonts arrive.
- Style is numbers: hex palette in one module, explicit `cubic-bezier` easings,
  frame counts for staggers, 96 px safe margin.
- The avoid list is respected: no particle bursts, lens flares, neon glow, RGB
  split, glitch, decorative gradients, bouncy easing or text that repeats the
  picture.

## 3. The intro page (`/intro`)

- Full-bleed hero inside the console shell: the wordmark `MAYALL`, the
  positioning line “The trace is the evidence.”, an honest paragraph, the
  “local Foundry simulation, not mainnet evidence” notice, and CTAs into
  `/attack-lab`, `/tracker`, `/lab`, `/historical`, `/bible`, `/showcase`,
  `/docs` and the reentrancy evidence bundle.
- The Remotion `<Player>` autoplays and loops in a 1 px bordered instrument
  frame, with the composition id, 1920 × 1080 / 30 fps / 15.0 s readouts and a
  download link to the MP4. `prefers-reduced-motion` replaces the player with
  the rendered poster and never autoplays.
- Below the hero: one `MetricStrip` with the real registry numbers (16
  incidents, $2.39B, 5 chains, 16 vectors, 10 detectors, 6 reproductions); the
  five-stage pipeline band (raw → parsed → detectors → report → bundle); a
  table of the six reproductions with real losses, top detectors, confidences
  and trace-node counts; a capability list; a route list; and the evidence
  bundle contents.
- Tokens only, no raw hex, no gradient text, no kicker above a heading, no
  hero-metric card grid, no nested panels, no shadows, no emoji. Server
  component; the only client leaf is `IntroPlayer`.

## 4. The tracker page (`/tracker`)

- **Left rail** — all six reproductions with idle / running / complete / error
  status, measured loss, top detector and confidence. The list is fetched from
  `/api/scenarios` (polled every 10 s); engine health and artifact count come
  from `/api/status` (polled every 5 s). Per-scenario run state is session-local
  — the API exposes aggregate status, not a run queue — while the scenario list
  and engine status are genuinely polled. Each row selects the scenario; the
  play control runs it.
- **Main stage** — the existing `AttackReplay` component, imported unchanged.
  It draws the real call tree, the re-entrancy spiral, value travel, balances
  and the verdict from the last run.
- **Instrumentation** — one panel with three cells synced to the 8 s replay:
  gas attributed (with a live bar), balance movement (victim drain / attacker
  fill with real wei→ETH values), and a call-depth gauge with the withdrawal
  count. A footer shows the real loss and parsed-frame count.
- **Trace feed** — the parsed frames, newest first, revealed as the replay
  reaches them, with depth, `Contract::fn` and frame gas.
- **Two honest modes**
  - *Artifact replay*: `POST /api/simulate` runs the selected Foundry scenario
    and returns the full `SimulationResult`; the stage replays that captured
    trace. The rail labels this `artifact replay`.
  - *Live stream*: the “Stream live” action consumes
    `/api/custom/stream?vector=…` as SSE. Forge output lines appear in the
    stage while the run is active; the terminal `done` payload hydrates the
    same stage. The chip reads `live stream`, then `stream captured`.
  - If no run exists, the page says “No run in flight” and offers both a run
    and a link to `/attack-lab`. No mock values are ever shown — empty gauges
    read zero and say so.
- `prefers-reduced-motion` makes the replay jump to its final frame; the
  instrumentation jumps to the final measured values with it.
- `/api/custom/stream` starts a forge run when connected, so the tracker never
  auto-connects on mount — only the explicit “Stream live” action opens it.

## 5. Verification

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` (from `packages/web`) | Passes: exit 0, zero errors. |
| `npx remotion compositions` | Both compositions listed, 450/300 frames at 30 fps, 1920×1080. |
| MP4 exists + `ffprobe` | `mayall-intro.mp4`, 693,793 bytes, 15.000 s, 30 fps, 1920×1080, 450 frames. `mayall-trace.mp4`, 938,093 bytes, 10.000 s, 30 fps, 1920×1080, 300 frames. |
| `GET /intro` | 200, HTML contains “Mayall”. |
| `GET /tracker` | 200, HTML contains “Mayall”. |
| Screenshots, both themes | `artifacts/shots/intro.png`, `intro-light.png`, `tracker.png`, `tracker-light.png`; inspected. No console errors. |

`npx tsc --noEmit` was run after the last edit and returned exit 0. (Earlier in
the session three errors existed in `packages/core` and
`packages/forensic-engine`; their owners fixed them concurrently, and the final
run is clean.)

### What the screenshots caught and what was fixed

- The Remotion Player was stalled at 0:00 because Chrome blocked the Player's
  audio-context resume and Remotion's clock waited on that promise. The film is
  silent, so the Player now starts muted (`initiallyMuted`) — playback runs on
  the visual clock. Verified advancing to frame ~240 at 8 s.
- The tracker rail stretched to the full grid height, leaving a large empty
  panel; removed `h-full`. The rail subtitle no longer truncates.
- The depth gauge painted a full arterial bar at `0 / 0` before any run;
  it is neutral until a trace exists.
- The intro's evidence-bundle column used a bordered inner box; it is now a
  hairline divider (no nested card).
- Rule hairlines in the intro composition were visible from frame 0; they are
  now gated to their shot.
- The loss counter in the composition outran the balance travel; it now follows
  the same 0→6 ETH travel.

## 6. Reproduce

```bash
# dev server
npm run dev

# inspect / re-render the films (poster + both MP4s)
node scripts/remotion-render.mjs
```

## 7. Notes and limits

- The brief this film was built from quoted an **83-node** trace figure. That
  number was wrong: it came from the brief, not from a measurement. The real
  parser (`packages/forensic-engine/src/trace-parser.ts`) returns **82** nodes
  for the reentrancy trace, `artifacts/summary.json` reports `"traceNodes": 82`,
  and `report/report.md` reports 82 gas-flame nodes. The film, the `/intro`
  table and the pitch deck all state **82**.
- `/api/custom/stream` is a run trigger, not a passive status feed: connecting
  executes forge. The tracker therefore treats it as an explicit live run and
  uses `/api/simulate` for the scenario replay.
- `AttackReplay` is owned by another agent and is imported unchanged. Its own
  “Replay attack” control restarts the canvas only; the tracker's own
  “Replay” control restarts the canvas and the instrumentation together.
- The product copy is **Mayall** throughout these files. The console shell is
  owned by another agent; it now renders `MAYALL` as well.
