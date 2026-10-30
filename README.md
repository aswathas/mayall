# Mayall — Web3 Exploit Forensics Console

[![CI](https://github.com/aswathas/mayall/actions/workflows/ci.yml/badge.svg)](https://github.com/aswathas/mayall/actions/workflows/ci.yml)
[![Deploy to GitHub Pages](https://github.com/aswathas/mayall/actions/workflows/deploy.yml/badge.svg)](https://github.com/aswathas/mayall/actions/workflows/deploy.yml)

**Live console:** <https://aswathas.github.io/mayall/> · **Source:** <https://github.com/aswathas/mayall>

> A Foundry-powered exploit forensics workbench. Reproduce a real attack in a
> local EVM simulation, reconstruct the crime scene from the transaction trace,
> classify the root cause with pattern detectors, and export a court-ready
> forensic bundle.

---

## What this is

Most incident tooling shows you *that* something happened. Mayall shows you *how*,
call by call, with the evidence chain attached.

| Pillar | What it does |
| --- | --- |
| **Forensic Simulation Engine** | Wraps the Foundry CLI. Executes exploit proofs-of-concept against deliberately vulnerable contracts in a real EVM (via `forge test`), captures the full call tree, gas profile and storage mutations. |
| **Case Dashboard** | Every incident is a case. Loss totals, attack-vector taxonomy, chain distribution, loss timeline, severity breakdown. |
| **Forensic View** | Interactive trace viewer, side-by-side storage-diff inspector, gas flame chart, pattern findings with confidence scores and evidence links. |
| **Report Generator** | Structured forensic report (Markdown + JSON) with an executive summary slot that can be authored by MiniMax Code. |
| **Forensic Bundle** | One-click ZIP: report, artifact, raw trace, foundry stdout, storage-diff CSV, balance timeline CSV, pattern findings, gas flame, and a SHA-256 chain-of-custody manifest. |

---

## Architecture

```
w3-forensics/
├── contracts/                 Foundry lab — 6 vulnerable contracts + 6 exploit PoCs
├── packages/
│   ├── core/                  Domain model, 16-vector attack taxonomy, incident dataset
│   ├── forensic-engine/       Foundry runner, trace parser, pattern detectors,
│   │                          gas flame, report builder, bundle packer
│   └── web/                   Next.js 15 console (dashboard, case view, live lab)
├── artifacts/                 Structured simulation output (JSON) per scenario
├── data/narratives/           MiniMax Code authored report summaries
└── docs/                      Architecture, detection rules, demo script
```

The engine is a standalone library with no UI coupling; the web package is a thin
consumer. Every piece of evidence the dashboard renders originates from a real
`forge test` execution — nothing is mocked.

---

## Quick start

```bash
npm install
npm run setup:foundry     # installs Foundry into .tools/foundry (no system PATH changes)
npm run forge:test        # run the 6 exploit PoCs
npm run dev               # http://localhost:3000
```

Then open **http://localhost:3000/lab** to run a live exploit simulation and
watch the trace, storage diff and pattern findings populate.

---

## Live demo script

1. **Dashboard** (`/`) — 16 public incidents, $1.5B tracked losses, attack-vector breakdown.
2. **Case view** (`/cases/curve-v2-reentrancy`) — a real incident with a local reproduction.
3. **Live lab** (`/lab`) — press *Run simulation*. Foundry executes the PoC; the
   trace tree, gas flame and storage diff render as they land.
4. **Forensic report** (`/cases/curve-v2-reentrancy/report`) — the written case.
5. **Bundle export** — download the forensic bundle ZIP and show the chain-of-custody manifest.

---

## Attack scenarios shipped

| Scenario | Vector | What is proven |
| --- | --- | --- |
| `reentrancy` | Reentrancy | `withdraw()` sends ETH before updating state → re-entrant drain |
| `oracle-manipulation` | Oracle Manipulation | Spot-price oracle pushed within the same tx → over-borrow |
| `access-control` | Access Control | Privileged mint missing its modifier → unlimited issuance |
| `flash-loan` | Flash Loan | Atomic flash-borrow inflates collateral price → free profit |
| `delegatecall` | Delegate Call Injection | Unvalidated implementation delegatecall → storage takeover |
| `selfdestruct` | Self Destruct | Mutable owner slot → forced transfer of the escrow balance |

---

## Pattern detectors

Ten detectors run over every simulation: Reentrancy, Flash Loan, Oracle
Manipulation, Access Control, Delegate Call Injection, Self Destruct,
Arithmetic/Precision Fault, Front Running, Bridge Verification Failure and
Logic Error. Each emits a confidence score, severity, human-readable evidence
pointers and a Mermaid attack-flow diagram.

See `docs/detection-rules.md` for the exact rule behind every detector.

---

## Deploy & the public site

The console is published to GitHub Pages from this repository:

- **Live:** <https://aswathas.github.io/mayall/>
- **Build:** `npm run build:static` → `static-export/`
- **Workflows:** `.github/workflows/deploy.yml` (Pages) and
  `.github/workflows/ci.yml` (Foundry + pipeline verification)

GitHub Pages is static hosting, so the deployed site is a **reading surface**
for evidence produced locally. The live Foundry simulation is local-only by
design: the Pages build has no forge binary and no server, and those controls
degrade to a "run this locally" state. The published reports and bundles come
from committed recordings of real `forge test` runs.

Chain state is **local**, and the simulations are **not mainnet evidence** —
they reproduce the exploit logic, not the original on-chain transactions.
Where no `MINIMAX_API_KEY` is available, the narrative falls back to a
deterministic generator and is never presented as an AI-authored report.

Full instructions — cloning, local runs, CLI, static preview, CI and
troubleshooting — are in [`docs/deployment.md`](docs/deployment.md).

---

## Licence & attribution

Original work. Built with [Foundry](https://getfoundry.sh/). The dashboard
concept is inspired by public Web3 forensics tooling; all code, contracts,
detection rules and datasets here are original.
