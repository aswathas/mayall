# MAYALL CLI

One command runs a real exploit simulation in Foundry, analyses the result and
writes a complete forensic folder a client can act on — with a **MiniMax Code
(`mcode`)** narrative and client plan.

```bash
# one command → complete forensic folder (the judge path)
npx tsx scripts/mayall.mjs run --custom --vector reentrancy --txs 3 --amount 6 --seed 42 --out artifacts/custom

node scripts/mayall.mjs run --scenario long-session --tx 200 --out artifacts/runs/demo-session
npx tsx packages/cli/src/index.ts run --scenario reentrancy --out artifacts/runs/demo-reentrancy
npx tsx scripts/mayall.mjs scenarios
```

Full reference: [`docs/cli.md`](../../docs/cli.md).

## Commands

| command | what it does |
| --- | --- |
| `run --custom [--vector <id>] [--txs <n>] [--amount <eth>] [--seed <n>] [--out <dir>] [--no-llm] [--no-bundle]` | Runs the Custom Attack Lab through the shared engine, authors the narrative and plan with `mcode`, and writes the complete case folder. |
| `run [--scenario <id\|all>] [--out <dir>] [--tx <n>] [--narrative] [--no-bundle]` | Executes the scenario(s), segments the trace, scores every transaction, and writes the run folder. `all` (the default) runs the six lab scenarios plus `long-session` into one subfolder each. |
| `scenarios` / `list` | Prints the scenarios, the custom vectors, what each proves and what it drains. |
| `bible [--sheet 04] [--rows <n>]` | Browses `data/bible/forensic-bible.json` from the terminal. |
| `verify [--llm]` | Runs every scenario, every custom vector, the bible and the mcode probe; prints a pass/fail table. |
| `report <caseId> [--json]` | Prints the stored report for a case. |
| `analyze <folder>` | Re-reads `raw/` and rebuilds `derived/`, the report, the narrative and the plan. Raw evidence is left untouched. |
| `bundle <folder>` | Rebuilds `<case>-forensic-bundle.zip` and adds the plan, narrative, HTML report and derived signals. |

## Custom case folder

```
<out>/<caseId>/
├── report/report.md            written forensic report
├── report/report.json          machine-readable report + provenance
├── report/narrative.md         mcode narrative (generatedBy header)
├── report/plan.md              client plan: first 24 h / week / month
├── report/diagram.mmd          mermaid funds-flow / attack diagram
├── evidence/artifact.json      structured evidence written by the PoC
├── evidence/trace.txt          raw forge call tree
├── evidence/foundry-stdout.txt exact forge stdout
├── evidence/foundry-stderr.txt exact forge stderr
├── evidence/storage-diff.csv   storage slots mutated, before vs after
├── evidence/balance-timeline.csv measured balance movement per actor
├── evidence/timeline.csv       one row per recorded attack step
├── evidence/patterns.json      detector findings with evidence
├── evidence/gas-flame.json     gas flame from the trace
├── evidence/chain-of-custody.json SHA-256 manifest for the folder
├── evidence/bundle.zip         the folder sealed as a ZIP
└── README.md                   what this folder is and how it was produced
```

## Run folder

```
<out>/
├── MANIFEST.md              provenance, reproduction commands, file index (sha256)
├── report/report.md         written forensic report
├── report/report.json       machine-readable report
├── report/report.html       self-contained, print-ready A4 report
├── raw/                     the evidence: forge stdout/stderr, trace text + JSON,
│                            artifact, environment
├── derived/                 recomputable conclusions: storage diff, balance
│                            timeline, per-transaction timeline, gas flame,
│                            signals, pattern findings
├── narrative/               executive summary
├── plan/client-plan.md      where the flaw was + what to do Monday morning
├── plan/remediation.md      code-level remediation
└── bundle/                  forensic zip (evidence + deliverables + custody hashes)
```

`raw/` is never inferred: it is exactly what Foundry produced. Everything in
`derived/` can be recomputed from `raw/`.

## The long session

`--scenario long-session --tx 200` runs `contracts/test/LongSession.t.sol`,
which performs 200 top-level vault transactions and hides one real re-entrancy
drain at index 137 (configurable in the PoC through `HELIX_ATTACK_INDEX`). The
CLI segments the trace into 200 transactions, runs the pattern detectors on
each subtree, and prints the isolation result:

```
200 transactions analysed, 1 suspicious (index 137, Reentrancy, 97% confidence)
isolation PASS — isolated transaction 137 out of 200
```

## Narrative

`run --custom` always authors the narrative and the client plan with the local
**MiniMax Code** binary (`%USERPROFILE%\.minimax-code\mcode.ps1`, model
`minimax/MiniMax-M3.1-Flash`, effort `high`). The prompt is attached as a brief
file, never placed on the command line, because PowerShell 5.1 mangles embedded
double quotes when forwarding native arguments.

Fixed scenarios (`--narrative`) try providers in this order:

1. **MiniMax Code** (`mcode`) — same client as the custom path.
2. **Command Code** (`cmdc`, `deepseek/deepseek-v4.1-flash`) — prompt written to
   a temp `.md` file and passed as a single-line `@path` argument.
3. **Ollama** (`qwen2.5:3b`).
4. The engine's deterministic summary, recorded as such in `MANIFEST.md`.

Every document carries `<!-- generatedBy: … -->`: `minimax-code`, `command-code`,
`ollama`, or `deterministic`. When `mcode` is unavailable the custom path falls
back to the deterministic generator and says so in the console readout. A
template is never presented as an AI report.

## Layout

- `src/index.ts` — argument parsing, dispatch, help
- `src/custom.ts` — custom attack orchestration and forensic readout
- `src/custom-folder.ts` — custom case folder, chain of custody, ZIP
- `src/mcode.ts` — MiniMax Code client: brief file, timeout, retry, model fallback
- `src/narrative.ts` — narrative prompts, provider chain, deterministic fallback
- `src/client-plan.ts` — 24 h / week / month client plan
- `src/diagram.ts` — mermaid extraction / deterministic diagram
- `src/bible.ts`, `src/verify.ts`, `src/report-command.ts`, `src/scenarios-command.ts`
- `src/run.ts` — scenario execution, orchestration, console summaries
- `src/folder.ts` — folder writer, manifest, loader, bundle
- Session segmentation and client plan seeds live in the engine
  (`packages/forensic-engine/src/session.ts` and `plan.ts`).
