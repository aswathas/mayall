# Deploying Mayall

Mayall ships two ways:

| Surface | Where | What runs there |
| --- | --- | --- |
| **Source** | <https://github.com/aswathas/mayall> | The whole product: contracts, engine, CLI, web console. |
| **Public console** | <https://aswathas.github.io/mayall/> | A static mirror of the console with recorded evidence. |

The public console is generated from the same source tree by
`npm run build:static` and deployed by `.github/workflows/deploy.yml`. GitHub
Pages serves static files only, so the build is an export, not a server.

---

## What the static site is

The site is a **reading surface** for evidence that was already produced
locally. It contains:

- Every page of the console: overview, incident registry, case views,
  historical analysis, the Forensic Bible, the evidence workbench, the docs,
  the attack-replay showcase and the tracker.
- Every **GET** API endpoint, executed once at build time and written out as
  static JSON (`/api/overview`, `/api/incidents`, `/api/incidents/<slug>`,
  `/api/historical`, `/api/historical/<slug>`, `/api/scenarios`,
  `/api/report/<caseId>`, `/api/bundle/<caseId>`, `/api/evidence/...`,
  `/api/live`, `/api/status`, `/api/agents`, `/api/custom/options`, …).
- The forensic report, its Markdown download and the forensic bundle ZIP for
  every case, generated from the **committed local simulation artifacts**
  under `artifacts/`.

The evidence in those artifacts is a real recording of `forge test -vvvv`
against the contracts in `contracts/`. It is checked in so the public report
pages do not need a Foundry install to render.

## What the static site is NOT

This matters more than anything else on a public deployment:

- **There is no server-side forge.** GitHub Pages cannot execute a binary,
  spawn a process, or stream stdout. The live simulation endpoints
  (`POST /api/simulate`, `POST /api/simulate/all`, `POST /api/custom`,
  `GET /api/custom/stream`, `GET /api/live` re-runs, `POST
  /api/report/[caseId]/narrative`) are intentionally absent from the export.
  Their buttons in the UI fall back to a clear "run this locally" state.
- **Chain state is local.** Every simulation runs against a local EVM started
  by the test harness. No mainnet node is queried, no mainnet state is read,
  and no on-chain transaction is ever replayed.
- **The simulations are not mainnet evidence.** They are reproductions of the
  same exploit *logic* against vulnerable contracts written for this lab. Loss
  figures on the incident registry are the amounts reported at disclosure.
- **The AI narrative layer is optional.** Locally it uses the `mcode` CLI when
  available. On CI and on the static site there is no `MINIMAX_API_KEY`, so the
  deterministic generator writes the summary instead. Nothing in the UI or the
  export ever labels that deterministic text as an AI-authored report.

---

## How the export is built

`scripts/build-static.mjs` is the only build entry point:

```bash
npm run build:static        # writes static-export/
```

It performs these steps:

1. **Classifies every route handler** in `packages/web/app/api/**`. Handlers
   that mutate state or stream a live process are omitted. Every remaining GET
   handler is executed once below (step 5), so the site's data is the real
   handler output rather than a second implementation.
2. **Stages a throwaway copy** of `packages/web` in the OS temp directory.
   The working tree is never modified, which matters because several
   contributors edit `packages/web/app/**` concurrently. In the copy, the
   `dynamic = 'force-dynamic'` segment config is switched to `'force-static'`
   and dynamic segments get a generated `generateStaticParams()`. (The
   original app has no `generateStaticParams`; adding one in place would fight
   the route files, and static export refuses to run without it.)
3. **Runs `next build`** with `MAYALL_STATIC_EXPORT=1` and
   `MAYALL_BASE_PATH=/mayall`, from a directory that resolves the same npm
   workspaces, so `@helix/core` and `@helix/forensic-engine` are the real
   packages.
4. **Copies `out/` to `static-export/`** and rewrites absolute `/api/…` client
   fetches to `/mayall/api/…`. `basePath` only rewrites Next's own routes, not
   arbitrary `fetch()` calls.
5. **Executes each GET handler** through the same `tsx` require hook the app
   uses, with a real `Request`, and writes the response to
   `static-export/api/<route>/index.html` (plus a `.json` sibling for humans
   and tooling). Serving JSON from `index.html` is what lets GitHub Pages
   resolve both `/api/incidents` and `/api/incidents/<slug>` — a static host
   cannot hold a file and a directory at the same path.
6. **Verifies** that `index.html` exists, contains "Mayall", and that every
   emitted API JSON file parses.

The dev server is unaffected: when `MAYALL_STATIC_EXPORT` is unset,
`packages/web/next.config.mjs` returns exactly the previous configuration.

### Preview the export locally

```bash
npm run build:static
npx serve static-export        # then append /mayall/ to the local URL
```

Any static server works as long as it serves directory indexes and preserves
the `/mayall` prefix.

---

## Run the whole thing from a clone

Prerequisites: Node.js 20+ and PowerShell (only for the Foundry bootstrap on
Windows; on macOS/Linux install Foundry normally and skip the bootstrap).

```bash
git clone https://github.com/aswathas/mayall.git
cd mayall

npm ci                       # install every workspace
npm run setup:foundry        # Windows: installs Foundry into .tools/foundry
                             # (or use https://getfoundry.sh on macOS/Linux)

npm run forge:test           # run the six exploit proofs-of-concept
npm run dev                  # http://localhost:3000
```

Then:

- <http://localhost:3000/> — exploit landscape.
- <http://localhost:3000/incidents> — the registry.
- <http://localhost:3000/lab> — press **Run full suite**. This is the only
  place where forge executes; it streams the run and shows the trace, gas
  flame, storage diff and detector findings.
- <http://localhost:3000/cases/curve-v2-reentrancy/report> — the written case.
- <http://localhost:3000/evidence> and `/trace` — the evidence workbench.

Regenerate the recorded evidence the public site replays:

```bash
npx tsx scripts/verify-pipeline.ts
```

That runs every scenario, checks it passes, and rewrites
`artifacts/<scenario>.json` plus `artifacts/bundles/*.zip`. Commit those if you
want the public report pages to change.

### Build the static site locally

```bash
npm run build:static
```

---

## CLI one-liner

The CLI produces a complete forensic folder from a single command:

```bash
npx tsx scripts/mayall.mjs run --custom \
  --vector reentrancy --txs 3 --amount 6 --seed 42 --out artifacts/custom
```

Useful companions:

```bash
npx tsx scripts/mayall.mjs scenarios          # list every reproduction
npx tsx scripts/mayall.mjs run --scenario reentrancy --out artifacts/runs/reentrancy
npx tsx scripts/mayall.mjs verify             # full suite, pass/fail table
npx tsx scripts/mayall.mjs report custom-reentrancy-1793395833908
```

The folder contains `report.md` / `report.json`, the raw `forge` stdout, the
parsed trace, storage and balance CSVs, detector findings, the gas flame and a
SHA-256 chain-of-custody manifest. It is a local simulation record, not
mainnet evidence.

---

## CI and deployment flow

Two workflows:

- **`.github/workflows/ci.yml`** — installs dependencies and Foundry, builds the
  contracts, runs `forge test`, runs `npm run typecheck`, then runs
  `npx tsx scripts/verify-pipeline.ts` so the forensic pipeline (simulate →
  detect → report → bundle) is proven on every push. Badge:

  ![CI](https://github.com/aswathas/mayall/actions/workflows/ci.yml/badge.svg)

- **`.github/workflows/deploy.yml`** — on every push to `main` (or manually),
  runs `npm ci`, `npm run typecheck`, `npm run build:static`, uploads
  `static-export/` with `actions/upload-pages-artifact@v3`, and publishes it
  with `actions/deploy-pages@v4`.

Pages is configured with **Build and deployment → Source: GitHub Actions**. The
deployed base path is `/mayall`, matching the repository name.

Neither workflow needs a repository secret. `MINIMAX_API_KEY` is deliberately
not configured; the narrative layer falls back to its deterministic generator
and the workflow says so in its logs.

### If a deployment fails

1. Check `Actions → Deploy to GitHub Pages` for the failing step.
2. Reproduce locally with `npm run build:static`.
3. If `npm ci` reports lockfile drift, run `npm install --no-audit --no-fund`
   and commit the updated `package-lock.json`.
4. If Pages rejects the artefact, confirm **Settings → Pages → Source** is
   "GitHub Actions" and that `static-export/index.html` exists.

---

## Honesty checklist for this deployment

- [x] The site states that chain state is local and simulations are not mainnet evidence.
- [x] No page implies a server-side forge; live-run controls degrade to "run this locally".
- [x] The deterministic narrative fallback is never described as an AI report.
- [x] Detector output is labelled as heuristic, with confidence scores and evidence pointers.
- [x] Every published report and bundle traces back to a committed local simulation artifact.
