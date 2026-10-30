# Demo script - 6 minutes

Judge-facing walkthrough for Mayall. Times are cumulative. Every command is run
from the repository root unless stated otherwise.

## Before you start

```powershell
npm install
npm run setup:foundry     # idempotent; prints forge/cast/anvil v1.8.7 and exits 0
npm run dev               # http://localhost:3000
```

Have two terminal panes open: one for `npm run dev`, one for forge commands.

`npm run forge:test` invokes `forge` from PATH; the console and the
direct command in this script call the local `.tools/foundry` binary instead.
Close every other browser tab. At 0:00 the browser is already on
`http://localhost:3000/`.

---

## 0:00 - The hook

**Screen:** dashboard at `/`.

**Say:**

> Every block explorer answers the same question: *that* it happened. Here is
> the transaction, here is the value that moved. None of them answer *how*.
> Which call re-entered which contract, which storage slot was rewritten, and
> why the protocol's own invariant stopped holding.
>
> Mayall is a forensics workbench for that second question. It reproduces the
> exploit in a local EVM, reconstructs the crime scene from the execution
> trace, and packages the evidence so someone else can verify it.

**Point at:** the loss total, the attack-vector breakdown, and the incident
list. Sixteen seeded incidents, each with a written root cause.

---

## 0:45 - Live lab: reentrancy

**Click:** `/lab`.

**Click:** select scenario `reentrancy` ("Re-entrant Withdrawal Drain"), press
*Run simulation*.

**Say while it runs:**

> This is a real exploit proof-of-concept in Solidity: a vault whose `withdraw()`
> sends ETH before it decrements the balance. The attacker re-enters through a
> malicious receiver. Foundry executes it, not a mock.

**Terminal (optional, for the audience that wants to see the machinery):**

```powershell
cd contracts
..\.tools\foundry\forge.exe test --match-path test/ReentrancyExploit.t.sol `
  --match-test testExploit -vvvv
cd ..
```

**When the trace lands, point at the call tree and say:**

> Watch the selector. `ReentrancyVault::withdraw()` appears once at the top
> level, then again nested inside the attacker's receive callback. The same
> entry point, twice, inside one transaction. The vault pays out on the first
> frame, asks for the money back on the second, and the balance update only
> happens after both.

**Cue:** the value-bearing frames and the repeated `withdraw` entry. If asked
why it matters: a normal withdrawal cannot nest inside itself, because the
balance is decremented first.

---

## 2:00 - The forensic view

**Screen:** the same `/lab` result.

**Say, walking down the panels in order:**

> Four artefacts, one per question.

1. **Trace tree** - every call, nested, with gas per frame. This is the
   execution as the EVM saw it.
2. **Storage diff** - the vault's balance slot, before and after, captured
   inside the test with Foundry cheatcodes. Not a guess from a running chain:
   the slot is read before and after the exploit in the same simulation.
3. **Pattern findings** - each finding carries a confidence, a severity, a
   rationale and a list of evidence pointers. Here the top finding is
   reentrancy, and the evidence says the contract entry point was invoked twice
   and that multiple value-bearing calls occurred.
4. **Gas flame** - where the transaction spent its gas. The payout frames
   dominate; there is no hidden expensive path.

---

## 3:00 - A second scenario, for contrast

**Click:** `/lab`, select `flash-loan` ("Flash-Loan Price Inflation"), *Run
simulation*.

**Say:**

> Same machinery, different mechanism. This time the trace has a large atomic
> value transfer at the start, the collateral price moves, and the borrow
> happens after the price move. The detector that wins here is flash loan, not
> reentrancy, and the evidence names the borrow step.

**Point at:** the finding list ordering. Confidence decides the order; nothing
is hard-coded per scenario.

**Optional contrast:** `oracle-manipulation` shows the price-labelled storage
slot as the strongest evidence line, with the borrow immediately after it.

**Say, honestly:**

> If two detectors disagree, you get both, sorted by confidence, each with its
> evidence. Mayall does not hide the ambiguity. Ordering and logic-error findings
> are deliberately weak heuristics here; they are triaged, not trusted.

---

## 4:00 - The written case file and the bundle

**Click:** `/cases/curve-v2-reentrancy` - a real incident with a local
reproduction. Read one line of the root cause, then:

**Click:** `/cases/curve-v2-reentrancy/report`.

**Say:**

> The report is seven fixed sections: scope, attack sequence, state mutations,
> balance movements, pattern findings, root cause and remediation, evidence
> index. The executive summary slot is written by MiniMax Code through
> `POST /api/report/[caseId]/narrative`; without a narrative, a deterministic
> summary is generated from the simulation evidence.

**Click:** the bundle export control on the report page, save the ZIP, open it.

**Say, pointing at the archive contents:**

> `report/` holds the Markdown and JSON. `evidence/` holds the raw trace, the
> Foundry stdout and stderr, the storage diff CSV, the balance timeline, the
> step timeline, the pattern findings and the gas flame. And
> `chain-of-custody.json` is a SHA-256 manifest: every file, its hash and its
> byte count, plus the exact command that produced it.

**Open `chain-of-custody.json` and read one entry aloud** - path, hash, bytes.

> Anyone can recompute those hashes and prove the evidence was not edited after
> export.

---

## 4:30 - The CLI: one command, one complete folder

**Terminal (keep the browser on the case file):**

```powershell
npx tsx scripts/mayall.mjs run --custom `
  --vector reentrancy --txs 3 --amount 6 --seed 42 --out artifacts/custom
```

**Say while it runs (about two minutes, mostly MiniMax Code writing):**

> The console and the CLI are the same engine. This is the whole product in one
> command: it runs a real Foundry proof-of-concept, segments the trace, runs the
> ten detectors, and then hands the measured evidence to **MiniMax Code** to
> write the narrative and the client plan. The model is local; the reports are
> not a template.

**When the readout lands, point at the fields in order:**

1. **`MONEY`** - the measured balance delta, not an estimate.
2. **Findings table** - detector, confidence, severity, and the strongest matched
   evidence line. Say: *the confidence is a triage score; the evidence is on the
   next line so you can disagree with it.*
3. **`NARRATIVE` / `PLAN`** - both read
   `minimax-code | model: minimax/MiniMax-M3.1-Flash`. Say: *if mcode were down,
   this line would say `deterministic`. The output never pretends a template is
   an AI report.*
4. **`FOLDER`** - open it. `report/` has `report.md`, `report.json`,
   `narrative.md`, `plan.md` (24 hours / week / month) and `diagram.mmd`.
   `evidence/` has the raw forge output, trace, artifact, CSVs, patterns, gas
   flame, a SHA-256 `chain-of-custody.json` and `bundle.zip`.

**If asked where the diagram comes from:**

> MiniMax Code returns a fenced mermaid block with the narrative. The CLI pulls
> it into `diagram.mmd`. If the model returns no diagram, a deterministic one is
> built from the artifact steps and labelled `deterministic` in the readout.

**Optional, if there is time:**

```powershell
npx tsx scripts/mayall.mjs scenarios          # what every scenario proves and drains
npx tsx scripts/mayall.mjs bible --sheet 04   # the knowledge base from the terminal
npx tsx scripts/mayall.mjs verify             # 16 real runs, pass/fail table
```

---

## 5:00 - Architecture in one breath, and what is real

**Say (no slide needed, or one):**

> Four layers. `contracts/` is a Foundry lab: vulnerable contracts plus exploit
> proofs-of-concept. `@helix/core` is the domain model: chains, sixteen attack
> vectors with severity weights, the simulation and report types.
> `@helix/forensic-engine` runs the PoC with
> `forge test -vvvv --decode-internal --json`, parses the call tree, reads the
> artifact the test wrote, runs ten detectors over both, and builds the report
> and bundle. `@helix/web` is a Next.js console that only renders what the
> engine produced.

**Then the honesty slide, verbatim:**

> What is real: the contracts are real Solidity, the execution is a real EVM via
> Foundry, the trace and gas figures are real, and the storage diff is read from
> the EVM inside the test. What is simulated: the chain state is local. We do
> not fork mainnet, and we do not claim to. The incident dataset is seeded from
> public disclosures with rounded loss figures; the reproductions are our own
> contracts written to demonstrate the same mechanism.
>
> The detectors are heuristics over one transaction. They do not read bytecode
> and cannot see mempool ordering. Confidence is a triage score, and every
> finding shows its evidence so you can disagree with it.

---

## 5:45 - The ask

**Say:**

> We built the part that is missing between an explorer and an audit: a
> reproducible, verifiable record of *how* an exploit worked. The next steps are
> archive-fork mode for real mainnet transactions, more scenarios per vector,
> and running the detector suite in CI so a protocol can gate a release on its
> own exploit proofs.
>
> The repository runs with three commands: `npm install`,
> `npm run setup:foundry`, `npm run dev`.

**Stop talking.** Leave `/lab` on screen with the reentrancy trace visible.

---

## Contingency

If the live run fails on stage, do not debug. Say:

> The live run is optional; I will show the written case instead.

Then go to `/cases/curve-v2-reentrancy`, whose incident carries
`reproducible: true` and the same `reentrancy` scenario, and continue from 2:00.
The report and bundle at 4:00 work from the case page without a new simulation.

## Route and command reference

| Action | Path or command |
| --- | --- |
| Dashboard | `/` |
| Live lab | `/lab` |
| Case file | `/cases/curve-v2-reentrancy` |
| Forensic report | `/cases/curve-v2-reentrancy/report` |
| Store a narrative | `POST /api/report/[caseId]/narrative` |
| Install Foundry | `npm run setup:foundry` |
| Run all PoCs | `npm run forge:test` (see note) |
| Start console | `npm run dev` |
| One command, complete folder | `npx tsx scripts/mayall.mjs run --custom --vector reentrancy --txs 3 --amount 6 --seed 42 --out artifacts/custom` |
| List scenarios | `npx tsx scripts/mayall.mjs scenarios` |
| Browse the bible | `npx tsx scripts/mayall.mjs bible --sheet 04` |
| Full verification | `npx tsx scripts/mayall.mjs verify` |
| Print a stored report | `npx tsx scripts/mayall.mjs report <caseId>` |
| Run one PoC directly | see below |

`npm run forge:test` is defined as `cd contracts && forge test -vv`, so it needs
Foundry on `PATH`, which the setup script deliberately does not modify. On a
clean machine use the direct `.tools` invocation below instead.

```powershell
cd contracts
..\.tools\foundry\forge.exe test --match-path test/ReentrancyExploit.t.sol `
  --match-test testExploit -vvvv
cd ..
```
