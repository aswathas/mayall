# Custom Attack Lab

The Custom Attack Lab runs a **real Foundry exploit** against a deliberately vulnerable
contract in this repository, with the attack family, transaction count, drain amount and
noise seed chosen at run time. It is an instrument for reading one exploit end to end:
forge output streams line by line, the call tree is parsed live, detectors classify the
pattern, and a report plus a ZIP evidence bundle drop out of the same run.

Everything here is a **local Foundry simulation**. No RPC is contacted, no mainnet state is
replayed, and no real funds exist. Detectors are heuristic. Treat the output as a
reproduction you can inspect and re-run, not as evidence of an on-chain incident.

---

## 1. Quick start

### Console

```
npm run dev
open http://localhost:3000/attack-lab
```

Pick a family, set `txs` / amount / seed, and press **Run simulation**, or hit a preset to
run the family at its default amount immediately. The live panel streams forge output and
grows the parsed call tree; when the run finishes the evidence appears in place.

Completed runs can be reopened without re-running forge:

```
http://localhost:3000/attack-lab?case=custom-reentrancy-1793396337975
```

### CLI

```
npx tsx scripts/mayall-custom.ts --vector reentrancy --txs 3 --amount 6
```

Options: `--vector`, `--txs`, `--amount` (ETH), `--seed`, `--out` (default
`artifacts/custom`). It prints the findings table and the absolute paths of the artifact,
the markdown report, the report JSON and the bundle.

### API

```
GET  /api/custom/options
POST /api/custom                       { "vector": "reentrancy", "txs": 3,
                                         "amountWei": "6000000000000000000", "seed": 1 }
GET  /api/custom/stream?vector=&txs=&amountWei=&seed=      (Server-Sent Events)
GET  /api/custom?caseId=<caseId>       rehydrates a completed run
GET  /api/custom/report/<caseId>       generated report JSON
GET  /api/custom/bundle/<caseId>       forensic ZIP
```

The canonical `/api/report/[caseId]` and `/api/bundle/[caseId]` handlers resolve engine
scenarios (`lab-*`, incident slugs) through `resolveScenarioId()` in
`packages/web/app/api/_lib.ts`. A custom case id is not an engine scenario, and that file is
owned by another workstream, so the custom lab serves its cases from
`/api/custom/report/...` and `/api/custom/bundle/...` instead. Both use the **existing**
`buildReport` and `buildForensicBundle` builders, so the bundle layout and hash manifest are
identical to every other case.

---

## 2. Parameters

| Parameter | Meaning | Bounds | Default |
| --- | --- | --- | --- |
| `vector` | Attack family to run | `reentrancy`, `access-control`, `oracle-manipulation`, `flash-loan`, `delegatecall`, `selfdestruct` | `reentrancy` |
| `txs` | Number of attacker transactions in the session loop | 1..12 | 3 |
| `amountWei` | Total wei the attacker is expected to extract | > 0, up to 1000 ETH | 6 ETH |
| `seed` | Seeds benign session traffic | 0..2147483647 | 1 |

The API clamps `txs` into range and rejects non-numeric or non-positive amounts. The Foundry
test clamps again, and if `txs > amountWei` it reduces `txs` so every attacker transaction
still moves at least one wei.

The amount is split evenly across the `txs` slices (the remainder goes to the last slice).
Each slice is a complete attacker action, so the requested total is also the measured total.

---

## 3. The target contract

`contracts/src/CustomTarget.sol` is one contract whose behaviour is selected by an enum:

```solidity
enum Family { Reentrancy, AccessControl, OracleManipulation, FlashLoan, Delegatecall, Selfdestruct }
```

`setFamily()` is called by the test before any attack. Every family entry point checks the
enum, so a run cannot accidentally exercise another family's code path.

### Storage layout

`owner` (20 bytes) and `family` (1 byte) are packed into slot 0. The test's slot labeller
depends on this layout; changing the order of the storage variables changes the labels in
the storage diff.

| Slot | Variable | Role |
| --- | --- | --- |
| 0 | `owner` + `family` | privileged identity, selected family |
| 1 | `balances` | depositor ledger (re-entrancy path) |
| 2 | `totalDeposited` | accounting total, updated after the external call |
| 3 | `poolEth` | ETH side of the spot pool |
| 4 | `poolToken` | token side of the spot pool |
| 5 | `collateral` | borrower collateral, in token units |
| 6 | `debt` | outstanding debt |
| 7 | `implementation` | delegatecall target |
| 8 | `flashNonce` | flash-loan counter |

### Families

| Family | Entry point | Flaw |
| --- | --- | --- |
| Reentrancy | `withdraw()` | Sends ETH before zeroing `balances[msg.sender]`; a contract receiver re-enters and is paid again. |
| Access Control | `setOwner()`, `drain(amount)` | `setOwner()` has no authorisation; `drain()` checks `msg.sender == owner \|\| tx.origin == owner`. |
| Oracle Manipulation | `pump()`, `borrow(amount)` | Collateral is valued from `spotPrice()` = `poolEth / poolToken` with no TWAP and no deviation bound. A plain ETH pump moves the borrow limit. |
| Flash Loan | `flashLoan(amount, borrower)` | Sends the balance to the borrower and never verifies settlement. No repayment check, no fee. |
| Delegatecall | `upgradeTo(impl)`, `execute(data)` | The implementation is caller-supplied and unvalidated; attacker code runs in the target's context and sweeps its balance. |
| Selfdestruct | `destroy()` | Reachable after the unguarded owner takeover; `selfdestruct` forwards the whole balance to the caller. |

The attacker-authored implementation (`CustomImplementation`) lives in `CustomTarget.sol` and
is executed only through `delegatecall`.

`contracts/src/CustomNoise.sol` holds `CustomNoise` and `CustomNoiseDesk`. They move no value
and exist so the session has realistic top-level calls and two levels of call depth. Noise is
interleaved at the head and tail of the loop rather than on every iteration: enough depth,
without burying the attack under identical frames.

---

## 4. The test and its invariants

`contracts/test/CustomAttack.t.sol` contains exactly one test, `testCustomAttack`, configured
entirely from the environment:

| Env var | Maps to |
| --- | --- |
| `MAYALL_VECTOR` | family selection (default `reentrancy`) |
| `MAYALL_TXS` | attacker transaction count (default 3) |
| `MAYALL_AMOUNT` | total wei drained (default 6 ether) |
| `MAYALL_SEED` | noise seed (default 1) |
| `MAYALL_ARTIFACT` | artifact base name written by the test |
| `HELIX_ARTIFACT_DIR` | output directory (same variable `ExploitBase` uses) |

The test measures the two real ETH balances immediately around the attack window:

```
targetBefore, attackerBefore
  ... txs attacker actions interleaved with benign traffic ...
targetAfter, attackerAfter

gain    = attackerAfter  - attackerBefore
deficit = targetBefore   - targetAfter

assertEq(gain,    requested)
assertEq(deficit, requested)
assertGt(deficit, 0)
```

Both assertions are properties of the scenario, not tautologies: for every family the
attacker is paid exactly the requested amount and the target loses exactly that amount.
`deposit`/`withdraw` accounting, oracle pricing, flash settlement, delegatecall execution and
`selfdestruct` are all real EVM behaviour; nothing is mocked out or short-circuited.

Additional assertion: at least one storage slot must be mutated in the attack window. For
selfdestruct the whole account is wiped, so the diff shows every tracked slot zeroed.

After the state assertions, the test snapshots, records accesses, reverts to the snapshot and
reads the pre-attack values, producing the before/after storage diff through the same
`ExploitBase` helpers every other PoC uses.

### Measured results (this machine, `--txs 3 --amount 6 --seed 1`)

| Family | Verdict | Trace nodes | Depth | Value transfers | Gas | Top finding |
| --- | --- | --- | --- | --- | --- | --- |
| Reentrancy | PASS | 114 | 5 | 10 | 7,772,336 | Reentrancy 97% |
| Access Control | PASS | 102 | 3 | 4 | 6,928,057 | Access Control Failure 90% |
| Oracle Manipulation | PASS | 114 | 3 | 8 | 7,801,525 | Oracle Manipulation 90% |
| Flash Loan | PASS | 103 | 3 | 4 | 7,022,801 | Flash Loan 85% |
| Delegatecall | PASS | 105 | 4 | 4 | 7,047,224 | Delegate Call Injection 93% |
| Selfdestruct | PASS | 96 | 2 | 2 | 6,680,215 | Access Control Failure 90% |

Selfdestruct ranks Access Control first because the kill path genuinely requires the
unguarded `setOwner()`; the Self Destruct finding follows at 85% with the forced-transfer
evidence. The UI states which vector is under test so the expected family is unambiguous.

---

## 5. How the trace is produced and parsed

The engine invokes:

```
forge test --match-path test/CustomAttack.t.sol --match-test testCustomAttack -vvvv
```

with `HELIX_ARTIFACT_DIR` pointing at `artifacts/custom/` and `MAYALL_ARTIFACT` set to the
case id, so concurrent runs cannot overwrite each other's artifact.

`-vvvv` makes forge emit the human-readable call tree. Output is captured in two ways:

- **POST** waits for forge to finish, then extracts the `Traces:` section.
- **SSE** spawns forge and splits stdout/stderr into lines as they arrive. Each line becomes
  an SSE `line` event; the timer emits `progress` with elapsed time, line count and the last
  lines; the terminal event is `done` with the full evidence payload (or `error`).

Both paths call the same `finalizeCustomRun()`:

1. `extractTraceText()` isolates the trace section from forge output.
2. `parseForgeTrace()` (existing engine parser, unmodified) builds the `TraceNode` tree and the
   proportional gas flame. It understands forge's 4-column indent per depth and `Contract::fn`
   frames.
3. The artifact JSON written by the test is read and checked for freshness.
4. `runDetectors()` (existing detectors, unmodified) classifies the evidence.
5. `buildReport()` (existing report builder) writes the report; `buildForensicBundle()`
   (existing bundle builder) writes the bundle, including the SHA-256 manifest.

### Harness frames in the detection pass

`vm.envOr("MAYALL_VECTOR", string("reentrancy"))` prints its **default literal** in the trace,
even when the environment selects another family, and `vm.writeFile` prints the whole artifact
JSON. Those lines are harness noise, and the detectors already skip `VM` trace nodes for the
same reason. For the custom lab, `VM::*` lines and nodes are excluded from the detector input
(the full trace is still stored verbatim in the run record and the bundle). Without this, every
run would match the re-entrancy keyword rule at 0.72 simply because of the cheatcode default.

The live client parser in `components/LiveTraceStream.tsx` mirrors the server parser closely
enough to draw the tree while forge is writing; the authoritative tree always comes from the
server on completion.

---

## 6. How detections are derived

Detectors are the shared rules in `packages/forensic-engine/src/detectors.ts`. Each rule
produces a 0..1 confidence and a severity, and the report orders findings by confidence. For
the lab, the relevant rules are:

| Detector | What fires it |
| --- | --- |
| Reentrancy | The same `contract::function` pair appears more than once in one transaction; the root-cause narrative mentions re-entrancy; more than one value-bearing call. |
| Access Control | Privilege vocabulary in the artifact, an authority-bearing slot rewritten (`owner`), or a privileged entry point reached from the trace. |
| Oracle Manipulation | Oracle vocabulary, a price/reserve/rate slot mutated, or a step that describes pushing a price. |
| Flash Loan | Flash vocabulary, a very large atomic value transfer, or a step that names a flash loan **or a borrow**. |
| Delegatecall | A `delegatecall` frame in the trace, or a step that installs an implementation. |
| Selfdestruct | Destruction vocabulary, a `SELFDESTRUCT` path, or a victim balance moved while the path ran. |

Honest caveats:

- **Repetition is not causality.** Any multi-transaction session calls the same functions
  repeatedly, so the re-entrancy rule fires at 79% on most families (0.55 + 0.12 per extra
  occurrence). Read its evidence: if the repeated frames are noise or top-level calls rather
  than a nested re-entry, it is a correlation, not the mechanism.
- **"borrow" triggers the flash-loan rule.** An oracle scenario that borrows against a
  manipulated price also surfaces a Flash Loan finding at 85%, because the rule keys on the
  step vocabulary. The oracle finding (90%) ranks above it.
- **Mocked characterisation.** The oracle family simplifies token custody to a collateral
  credit (`postCollateral`) and the flash-loan family models a pool that never verifies
  settlement. The ETH flows and assertions are real; the surrounding DeFi plumbing is a
  deliberately thin teaching target.

---

## 7. Report and bundle

`buildReport()` produces a `ForensicReport`:

- Scope (case, scenario, vector, chain, target, command, timing)
- Attack sequence (steps with measured gas and value)
- Storage diff
- Balance movements
- Findings with evidence
- Root cause and remediation
- Evidence index

The executive summary is deterministic unless a narrative exists in `data/narratives/<caseId>.md`.
The page labels the narrative as a draft generated from simulated evidence.

The bundle is a ZIP containing the report (Markdown + JSON), the artifact, the full trace,
forge stdout/stderr, storage/balance/timeline CSVs, the pattern JSON, the gas flame and a
chain-of-custody manifest with a SHA-256 per file. Runs are persisted under:

```
artifacts/custom/<caseId>.json                 artifact written by the test
artifacts/custom/<caseId>.run.json             rehydration record (trace, stdout, report, detections)
artifacts/custom/<caseId>.report.json          generated report
artifacts/custom/<caseId>.report.md            markdown report
artifacts/custom/<caseId>.trace.txt            extracted trace
artifacts/custom/<caseId>-forensic-bundle.zip  bundle
```

Case ids are `custom-<vector>-<unix-ms>` and are validated against
`^custom-[a-z0-9-]+$` before any path is built, so a case id cannot escape the artifact
directory.

---

## 8. Limitations

- **Local only.** Foundry executes against a local EVM. There is no mainnet fork, no RPC, no
  block context and no real liquidity. The gas numbers are this machine's execution gas.
- **One target, six flaws.** `CustomTarget` is deliberately simple. It is a teaching contract,
  not an audit target and not a copy of any deployed vault.
- **Selfdestruct semantics.** Under Cancun (EIP-6780) `SELFDESTRUCT` only deletes an account
  created in the same transaction; the balance still moves. The test asserts the balance
  movement, which is the property the family is about.
- **Oracle simplification.** Collateral tokens are credited rather than transferred, so the
  evidence shows the price path and the borrow, not an ERC-20 transfer graph.
- **Flash-loan simplification.** The pool has no fee, no callback validation and no settlement
  check; the scenario demonstrates the missing economic check rather than a composed
  flash-loan arbitrage.
- **Heuristic detectors.** They are keyword- and structure-driven. They can miss a mechanism
  that is never named, and they can fire on correlated-but-benign structure. Confidence is a
  heuristic score, not a probability and not a proof.
- **No claim of real-world attribution.** An address in the trace belongs to the simulated
  test, not to an actor on any chain.
- **Navigation.** `components/AppShell.tsx` owns the console navigation and is outside this
  workstream's file ownership, so `/attack-lab` is reachable by URL and from the overview's
  links but has no sidebar entry. Adding one requires a one-line change to the `NAV` array in
  `AppShell.tsx`.

---

## 9. Files

| File | Purpose |
| --- | --- |
| `contracts/src/CustomTarget.sol` | Enum-switched vulnerable vault + attacker implementation |
| `contracts/src/CustomNoise.sol` | Benign session traffic (two contracts, two levels of depth) |
| `contracts/test/CustomAttack.t.sol` | The single parameterised test and its invariants |
| `packages/forensic-engine/src/custom.ts` | Run planning, finalisation, persistence, catalogue |
| `packages/web/app/api/custom/route.ts` | POST run, GET case rehydration |
| `packages/web/app/api/custom/stream/route.ts` | SSE live run |
| `packages/web/app/api/custom/options/route.ts` | Catalogue, bounds, toolchain status |
| `packages/web/app/api/custom/_engine.ts` | tsx loader for the engine module (dev cache-busting) |
| `packages/web/app/api/custom/report/[caseId]/route.ts` | Report JSON for a custom case |
| `packages/web/app/api/custom/bundle/[caseId]/route.ts` | Forensic ZIP for a custom case |
| `packages/web/app/attack-lab/page.tsx` | Route shell |
| `packages/web/app/attack-lab/loading.tsx` | Route-level skeleton |
| `packages/web/components/AttackLabConsole.tsx` | Controls, presets, SSE orchestration, evidence |
| `packages/web/components/LiveTraceStream.tsx` | Raw forge stream + live parsed call tree |
| `scripts/mayall-custom.ts` | CLI entry point |

Reused unchanged: `trace-parser.ts`, `detectors.ts`, `report.ts`, `bundle.ts`, `foundry.ts`,
`simulator.ts` helpers, and the shared UI components (`Panel`, `MetricStrip`, `TraceViewer`,
`GasFlameChart`, `StorageDiffInspector`, `BalanceTimeline`, `PatternReport`, `MermaidDiagram`,
`Loading`).
