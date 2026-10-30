# Mayall CLI

Mayall is a Web3 exploit forensics console. The CLI runs a **real Foundry
simulation**, reconstructs the crime scene from the execution trace, and writes
a complete forensic folder that a client — or a judge — can read and re-verify.

Everything below runs from the repository root.

```
mayall run --custom --vector reentrancy --txs 3 --amount 6 --seed 42 --out artifacts/custom
```

That single command produces the whole case: measured evidence, a written
report, a MiniMax Code narrative, a 24 h / week / month client plan, a mermaid
diagram, and a sealed ZIP with a SHA-256 chain of custody.

---

## Getting started

```powershell
npm install
npm run setup:foundry          # installs forge/cast/anvil into .tools/foundry (idempotent)
npx tsx scripts/mayall.mjs --help
```

There is no build step. `scripts/mayall.mjs` is a thin launcher that resolves the
repository root and runs the TypeScript entry point through `tsx`.

Foundry is resolved from `.tools/foundry` inside the CLI (see
`packages/forensic-engine/src/foundry.ts`). The system `PATH` is never changed.

---

## The one-liner a judge should run

```powershell
npx tsx scripts/mayall.mjs run --custom `
  --vector reentrancy --txs 3 --amount 6 --seed 42 --out artifacts/custom
```

It executes the parameterised Foundry proof-of-concept, analyses the trace with
the ten detectors, builds the report, has **MiniMax Code (`mcode`)** write the
narrative and the client plan, draws the mermaid diagram, writes the folder, and
prints a forensic readout with the case id, the money moved, the trace size and
the absolute paths of the folder and the ZIP.

A complete run takes roughly 10–30 s of simulation plus 60–150 s of mcode. Pass
`--no-llm` to skip the model and get deterministic documents in a few seconds.

---

## Commands

| Command | What it does |
| --- | --- |
| `mayall run --custom [options]` | Run the Custom Attack Lab and write a complete forensic folder. |
| `mayall run --scenario <id>` | Run one fixed scenario (or `all`) and write a run folder. |
| `mayall scenarios` | List every scenario and custom vector, what it proves and what it drains. |
| `mayall bible [--sheet 04] [--rows n]` | Browse `data/bible/forensic-bible.json` from the terminal. |
| `mayall verify [--llm]` | Run the whole suite — six scenarios, six custom vectors, the knowledge base, the mcode pairing — and print a pass/fail table. |
| `mayall report <caseId> [--json]` | Print the stored report for a case. |
| `mayall analyze <folder>` | Re-analyse an existing run folder without re-running Foundry. |
| `mayall bundle <folder>` | Rebuild the ZIP for an existing run folder. |
| `mayall list` | Alias for `mayall scenarios`. |
| `mayall --help` | The help screen. |

---

## `run` options

| Flag | Applies to | Default | Meaning |
| --- | --- | --- | --- |
| `--custom` | — | off | Run the Custom Attack Lab instead of a fixed scenario. |
| `--vector <id>` | custom | `reentrancy` | `reentrancy`, `access-control`, `oracle-manipulation`, `flash-loan`, `delegatecall`, `selfdestruct` (`self-destruct` and `delegatecall-injection` are accepted aliases). |
| `--txs <n>` | custom | `3` | Attacker transactions, 1–12. |
| `--amount <eth>` | custom | `6` | Total ETH to drain, as a decimal ETH value. |
| `--seed <n>` | custom | `1` | Noise seed for the benign traffic the attack hides in. |
| `--scenario <id>` | fixed | `all` | A scenario id from `mayall scenarios`, or `all`. |
| `--tx <n>` | fixed | `200` | Transactions in the long-session run. |
| `--out <dir>` | both | `artifacts/custom` / `artifacts/runs/<utc>-<scenario>` | Output base directory. |
| `--narrative` | fixed | off | Author the executive summary with mcode. |
| `--no-llm` | custom | off | Skip mcode; write deterministic narrative and plan, labelled as such. |
| `--no-bundle` | both | off | Skip the evidence ZIP. |

`run --custom` writes `<out>/<caseId>/`. `run --scenario <id>` writes
`<out>/` directly for one scenario, or `<out>/<scenario>/` for `all`.

---

## Folder layout (custom run)

```
artifacts/custom/<caseId>/
  report/
    report.md            written forensic report (Markdown)
    report.json          machine-readable report + provenance
    narrative.md         mcode executive narrative, with a generatedBy header
    plan.md              client action plan: 24 h / week / month
    diagram.mmd          mermaid funds-flow / attack diagram
  evidence/
    artifact.json        structured evidence written by the PoC
    trace.txt            raw forge call tree
    foundry-stdout.txt   exact forge stdout
    foundry-stderr.txt   exact forge stderr
    storage-diff.csv     storage slots mutated, before vs after
    balance-timeline.csv measured balance movement per actor
    timeline.csv         one row per recorded attack step
    patterns.json        detector findings with confidence and evidence
    gas-flame.json       gas flame derived from the trace
    chain-of-custody.json SHA-256 manifest of every file in the folder
    bundle.zip           the same folder sealed as a ZIP
  README.md              what this folder is and how it was produced
```

`chain-of-custody.json` hashes every file except itself and `bundle.zip`
(which is written after the manifest). Anyone can recompute those SHA-256
values and prove the evidence was not edited after export.

The fixed-scenario path keeps its own layout (`raw/`, `derived/`, `report/`,
`narrative/`, `plan/`, `bundle/`, `MANIFEST.md`) — see `mayall run --scenario`.

---

## MiniMax Code pairing

The narrative and the client action plan are authored by the local **`mcode`**
CLI — not by a static template.

- Binary: `%USERPROFILE%\.minimax-code\mcode.ps1`
- Model: `minimax/MiniMax-M3.1-Flash`, falling back to `minimax/MiniMax-M3`
- Reasoning effort: `high`
- Timeout: 240 s per attempt; the child process tree is killed on timeout
- Transport: the prompt is written to a temporary brief file and attached with
  `--file`. It is never placed on the command line: PowerShell 5.1 does not
  escape embedded double quotes when forwarding arguments to a native process,
  which mangles markdown briefs.

> **Note on `--effort on`.** The installed runtime rejects `on` and lists the
> valid levels as `default | low | medium | high | xhigh | max`. The CLI uses
> `high` (override with `MAYALL_MCODE_EFFORT`). If a future runtime rejects the
> configured level, the CLI parses the advertised levels and retries with the
> strongest one.

The brief handed to mcode contains the case id, the attack vector, the measured
loss, the balance and storage evidence, the segmented transactions, every
detector finding with its evidence lines, a required section list (executive
summary, attack sequence, evidence reconstruction, detection analysis,
remediation, client action plan), and a request for a fenced ```mermaid block.

### Fallback rule

If mcode is not installed, fails, times out, or returns something unusable, the
CLI falls back to the deterministic generator and **labels it**. A template is
never presented as an AI report.

Every generated document starts with a provenance header:

```html
<!-- generatedBy: minimax-code | model: minimax/MiniMax-M3.1-Flash -->
```

Possible values:

| `generatedBy` | Meaning |
| --- | --- |
| `minimax-code \| model: …` | Authored by the local mcode CLI. |
| `command-code \| model: …` | Authored by Command Code (fixed-scenario `--narrative` only, if mcode is unavailable). |
| `ollama \| model: …` | Authored by a local Ollama model (fixed-scenario `--narrative` only). |
| `deterministic` | Produced by the deterministic generator. The CLI says so in the readout. |

The same provenance is embedded in `report/report.json`,
`evidence/chain-of-custody.json`, and the folder `README.md`.

Environment overrides: `MAYALL_MCODE_MODEL`, `MAYALL_MCODE_EFFORT`.
Set `MAYALL_DEBUG=1` to print per-attempt mcode diagnostics to stderr.

---

## Reading the console

```
  CASE          custom-reentrancy-1793396780532
  VECTOR        Reentrancy · reentrancy · CRITICAL
  REQUEST       3 txs · 6000000000000000000 wei · seed 42
  SIMULATION    PASS · 0.35 s · local Foundry EVM
  TRACE         114 nodes · depth 5 · 10 value transfers · 7773051 gas
  TRANSACTIONS  13 segmented · 3 suspicious
  MONEY         CustomTarget -6000000000000000000 wei → CustomAttacker +6000000000000000000 wei
  LOSS          6 ETH moved out of the target
```

The findings table lists each detector that fired, its confidence, its severity,
and the strongest matched evidence line. `NARRATIVE` / `PLAN` show the exact
`generatedBy` value observed for that run.

---

## Honesty

Mayall reproduces exploits; it does not observe mainnet.

- The contracts are real Solidity and the execution is a real EVM, but the chain
  state is local. **This is not mainnet evidence**, and it does not prove a live
  deployment was exploited.
- The detectors are heuristics over a single execution trace. Confidence is a
  triage score, not proof. Every finding prints the evidence it rests on.
- The incident database is seeded from public disclosures; loss figures are
  rounded. Reproductions are Mayall's own contracts, written to demonstrate the
  same mechanism.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Foundry not found` | `npm run setup:foundry` |
| `mcode was unavailable or failed` | Check `%USERPROFILE%\.minimax-code\mcode.ps1` exists and `mcode --version` works. The run still completes with deterministic documents. Run with `MAYALL_DEBUG=1` to see the exact failure. |
| `--amount must be a positive decimal ETH value` | Pass e.g. `--amount 6` or `--amount 2.5`. |
| `--txs must be an integer between 1 and 12` | The harness caps at 12 attacker transactions. |
| Case folder exists from an earlier run | Mayall writes `<caseId>` folders, and the case id contains a timestamp, so runs never overwrite each other. |
