# QA harness

End-to-end quality gate for Mayall (`packages/web`). One command runs the whole
suite, boots the dev server if necessary, and writes a human-readable report.

```bash
# from the repository root
node scripts/qa/run-qa.mjs
```

Exit code is `0` only when every spec passes. The script exits non-zero when a
test fails, when Playwright crashes, or when the dev server never becomes
reachable.

## What the script does

1. Probes `http://localhost:3000/api/status`. If a server is already listening
   it is **reused and left untouched**. Otherwise the script starts
   `npm run dev --workspace @helix/web`, polls for up to 90 seconds, and stops
   **only that** server afterwards.
2. Runs `npx playwright test` from `packages/web` (1 worker, system Chrome via
   `channel: 'chrome'`).
3. Collects the machine-readable artefacts the specs leave in `test-results/`.
4. Writes `test-results/qa-summary.md` with per-test status, axe violations and
   the console errors captured on each route.
5. Prints a short report to the terminal.

## Requirements

- Node.js 20+
- Google Chrome installed (Chromium is not downloaded here). Playwright uses
  `channel: 'chrome'`.
- Foundry installed at `.tools/foundry` for the live-lab spec.
- Test dependencies (`playwright`, `playwright-core`, `@axe-core/playwright`).

If the `chrome` channel cannot be found, the script retries once with
`PLAYWRIGHT_CHROME_EXECUTABLE=C:/Program Files/Google/Chrome/Application/chrome.exe`.

> Note: this environment sets `omit=dev` in npm config. When installing test
> dependencies, pass `--include=dev` or they will be pruned:
>
> ```bash
> cd packages/web
> npm install -D @axe-core/playwright playwright playwright-core --include=dev
> ```

## Specs

| Spec | Covers |
| --- | --- |
| `tests/smoke.spec.ts` | Every page route answers 200, renders a non-empty `h1` matching its expected heading, and emits **no** console errors/page errors. `/api/status`, `/api/overview`, `/api/incidents`, `/api/scenarios` return 200 JSON; `/api/overview` has `totals.incidents > 0` and a non-empty `byVector`. |
| `tests/a11y.spec.ts` | axe-core WCAG 2.1 A + AA scan on every page route. Only `critical` and `serious` violations fail. Every violation is printed with rule id, impact and selectors. |
| `tests/lab.spec.ts` | Loads `/lab?scenario=reentrancy`, presses the single-scenario run control, waits up to 60s for results, then asserts the scenario title, an `ETH` loss figure, a detector confidence percentage, and raw forge stdout containing `[PASS]`/`forge`. Saves `test-results/lab-run.png`. |
| `tests/theme.spec.ts` | Theme toggle flips `data-theme`, persists to `localStorage['mayall-theme']`, and survives a reload; captures `theme-dark.png` / `theme-light.png`; asserts no horizontal overflow at 390px. |

Shared data lives in `fixtures/scenarios.ts` (route matrix, API matrix, lab
expectations, console capture, artefact writer).

## Interpreting failures

- **Smoke / console errors** — the failure message lists every console error
  collected while navigating. This catches hydration mismatches, failed API
  calls and client exceptions that a bare status-code check misses.
- **Axe** — read the printed `rule id [impact]` and `selector(s)`. A
  `serious`/`critical` violation is a release blocker. Full detail is also in
  `test-results/axe-violations.json`.
- **Lab** — on timeout the test prints the visible page text. If Foundry is
  missing or the scenario fails to build, the page shows an engine notice; the
  test intentionally fails rather than skipping.
- **Theme** — a failure on the reload step means the inline bootstrap and the
  toggle disagree about the storage key or the applied attribute.
- **Overflow at 390px** — the failure message contains `scrollWidth` and
  `innerWidth`; find the element wider than the viewport.

## Adding a route to the smoke matrix

1. Add it to `PAGE_ROUTES` in `packages/web/fixtures/scenarios.ts`:

   ```ts
   { path: '/settings', label: 'settings' },
   ```

   The smoke spec and the axe scan both iterate this list, so the route is
   covered by both automatically.
2. The smoke spec requires the page to answer 200, expose a non-empty `h1`, and
   emit no console errors.

To add an API endpoint, append it to `API_ENDPOINTS` in the same file.

## Artefacts

All under `test-results/` at the repo root:

| File | Contents |
| --- | --- |
| `qa-summary.md` | The report: statuses, failures, axe violations, console errors. |
| `results.json` | Playwright JSON reporter output. |
| `lab-run.png` | Full-page screenshot of the finished lab run. |
| `theme-dark.png`, `theme-light.png` | The two worlds. |
| `axe-violations.json` | All axe violations, keyed by route. |
| `console-errors.json` | Console errors, keyed by route. |
| `lab.json`, `theme.json` | Lab/theme diagnostics. |
| `dev-server.log` | Dev-server output when this script started it. |
