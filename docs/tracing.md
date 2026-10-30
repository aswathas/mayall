# Tracing Pipeline (`forge -vvvv` → Parsed Call Tree → Pattern Findings)

This document explains how `@helix/forensic-engine` captures raw EVM execution traces from Foundry (`forge`), parses them into a structured `TraceNode` call tree and gas flame graph, and evaluates the 10-rule heuristic detector catalog against the combined execution record.

---

## 1. Pipeline Overview

```
Foundry Execution (forge test -vvvv --json)
  │
  ├─► Structured JSON stdout ──────► SimulationArtifact (steps, storageWrites, balances, logs)
  │
  └─► Human-readable -vvvv trace ──► isolateTraceSection() ──► rawLines: string[]
                                                                  │
                                                                  ▼
                                                        parseForgeTrace(rawTrace)
                                                                  │
                                                ┌─────────────────┴─────────────────┐
                                                ▼                                   ▼
                                       nodes: TraceNode[]                 flame: GasFlameEntry[]
                                                │
                                                └─────────────────┬─────────────────┘
                                                                  ▼
                                          runDetectors({ artifact, nodes, rawLines, traceText })
                                                                  │
                                                                  ▼
                                                      PatternMatch[] + Report
```

All logic lives in three files inside `packages/forensic-engine/src/`:

- [`packages/forensic-engine/src/foundry.ts`](../packages/forensic-engine/src/foundry.ts) — Spawns `forge`, captures `stdout` and `stderr`, extracts structured simulation JSON alongside the human-readable `-vvvv` trace text (`extractTraceText`).
- [`packages/forensic-engine/src/trace-parser.ts`](../packages/forensic-engine/src/trace-parser.ts) — Converts raw `forge -vvvv` text into a nested `TraceNode[]` call tree, flat node list (`flatNodes`), gas flame entries (`flame`), and summary counters.
- [`packages/forensic-engine/src/detectors.ts`](../packages/forensic-engine/src/detectors.ts) — Evaluates the 10-rule `DETECTOR_CATALOG` over `{ artifact, nodes, rawLines, traceText }`.

---

## 2. Stage 1 — Capturing `forge -vvvv` Output

When a scenario or custom session runs, `runScenarioWithFoundry` in `packages/forensic-engine/src/foundry.ts` invokes Foundry twice (or in a paired run):

1. **Structured artifact run**:
   ```powershell
   forge test --match-contract Forensics HarnessTest --match-test test_reentrancy --json -vvv
   ```
   This emits the JSON test result containing decoded logs (`StepRecorded`, `BalanceSnap`, `SlotChange`, `Narrative`) which are assembled into a `SimulationArtifact`.

2. **Verbose trace capture (`-vvvv`)**:
   ```powershell
   forge test --match-contract ForensicsHarnessTest --match-test test_reentrancy -vvvv
   ```
   `extractTraceText(stdout, stderr)` scans the output for the `Traces:` header or the first line matching `/^\s*\[\d+\]\s+\S+/`, preserving every box-drawing character (`├─`, `└─`, `│`) verbatim. This verbatim output is saved to `evidence/trace.txt` in the forensic bundle.

### Real Trace Excerpt (`reentrancy` scenario)

```text
Traces:
  [443225] ForensicsHarnessTest::test_reentrancy()
    ├─ [298734] ReentrancyAttack::attack()
    │   ├─ [256341] ReentrancyVault::withdraw(1000000000000000000 [1e18])
    │   │   ├─ [212904] ReentrancyAttack::fallback() [value: 1000000000000000000]
    │   │   │   ├─ [172488] ReentrancyVault::withdraw(1000000000000000000 [1e18])
    │   │   │   │   ├─ [131072] ReentrancyAttack::fallback() [value: 1000000000000000000]
    │   │   │   │   │   ├─ [91656] ReentrancyVault::withdraw(1000000000000000000 [1e18])
    │   │   │   │   │   │   ├─ [51240] ReentrancyAttack::fallback() [value: 1000000000000000000]
    │   │   │   │   │   │   │   └─ ← [Stop]
    │   │   │   │   │   │   ├─ emit Withdrawal(who: ReentrancyAttack: [0x...], amount: 1000000000000000000 [1e18])
    │   │   │   │   │   │   └─ ← ()
```

---

## 3. Stage 2 — Line Classification & 4-Column Depth Calculation

`isolateTraceSection(raw)` in `packages/forensic-engine/src/trace-parser.ts` strips compiler status banners (`Compiling...`, `Ran 1 test...`, `Suite result:`) and retains only lines inside the `Traces:` block.

For each line, `parseForgeTrace` determines tree depth from the column index of the Unicode branch character (`├` or `└`):

```ts
const BRANCH_RE = /[├└]/;

const branchMatch = line.match(BRANCH_RE);
// Each nesting level in forge's ASCII tree is 4 columns wide ("│   " or "    ").
// Root line has no branch character and sits at depth 0.
const branchIndex = branchMatch?.index ?? -1;
const depth = branchIndex < 0 ? 0 : Math.floor(branchIndex / 4);
```

Why `Math.floor(branchIndex / 4)` works reliably:
- Depth `0`: `[443225] ForensicsHarnessTest::test_reentrancy()` — no `├` or `└` (`branchIndex = -1` → `depth = 0`).
- Depth `1`: `    ├─ [298734] ReentrancyAttack::attack()` — `├` at column `4` → `Math.floor(4 / 4) = 1`.
- Depth `2`: `    │   ├─ [256341] ReentrancyVault::withdraw(...)` — `├` at column `8` → `Math.floor(8 / 4) = 2`.
- Depth `3`: `    │   │   ├─ [212904] ReentrancyAttack::fallback()` — `├` at column `12` → `Math.floor(12 / 4) = 3`.

After stripping the tree prefix (`/^[\s│├└─]+/`), `trace-parser.ts` matches the content against three regular expressions:

| Pattern | Regex | Meaning |
| --- | --- | --- |
| `RETURN_RE` | `/^←\s*(\[Revert\])?\s*(.*)$/` | Return line (`← ()` or `← [Revert] ...`). Attaches `returnData` and `reverted` status to the deepest open frame at `depth - 1`. |
| `EMIT_RE` | `/^emit\s+([A-Za-z0-9_]+)\((.*)\)\s*$/` | Solidity event log (`emit Withdrawal(...)`). Appends an event object `{ name, raw, lineIndex }` to the parent frame's `events` list. |
| `CALL_RE` | `/^\[(\d+)\]\s+([^\s:(]+?)(?:::([^\s(]+))?\((.*)\)\s*(\[[^\]]+\])?\s*$/` | Call frame invocation (`[gas] Target::function(args) [tags]`). Creates a new `TraceNode`. |

The trailing bracket tag (`[delegatecall]`, `[staticcall]`, `[create]`, `[value: 1000000000000000000]`) is parsed by `parseCallKind(tag)` and `parseValue(tag)` to classify `kind: 'CALL' | 'STATICCALL' | 'DELEGATECALL' | 'CREATE' | 'INTERNAL' | 'ROOT'` and extract any ETH value attached to the frame.

---

## 4. Stage 3 — Building the `TraceNode` Call Tree & Gas Flame Graph

`parseForgeTrace` maintains an `openByDepth: Map<number, TraceNode>` cursor map as it scans lines top-to-bottom:

1. When a new `TraceNode` is created at `depth`:
   - Any previously open entries at `d >= depth` are removed from `openByDepth` (closing sibling and deeper subtrees).
   - The parent node is looked up at `openByDepth.get(depth - 1)`.
   - If a parent exists, `node` is pushed to `parent.children`; otherwise `node` is pushed to `roots`.
   - `openByDepth.set(depth, node)` marks `node` as the active open frame at `depth`.

2. **Gas Flame Construction (`buildFlame`)**:
   - Total gas is taken from the root frame's `gas` (or the sum of root frames, minimum `1`).
   - A recursive depth-first traversal emits a `GasFlameEntry` for every frame with:
     ```ts
     share = Math.min(1, node.gas / totalGas);
     ```
   - This feeds the interactive `GasFlameChart` component on `/evidence` and `evidence/gas-flame.json` in the forensic bundle.

---

## 5. Stage 4 — The 10-Rule Heuristic Detector Catalog

`runDetectors(ctx: DetectorContext)` in `packages/forensic-engine/src/detectors.ts` runs all 10 detectors in `DETECTOR_CATALOG` against:
- `artifact`: Structured `SimulationArtifact` (steps, storage writes, balance snapshots, logs)
- `nodes`: Parsed `TraceNode[]` root trees (`flatten(nodes)` provides pre-order traversal)
- `rawLines`: Isolated `forge -vvvv` trace lines
- `traceText`: Full raw trace string

Each detector returns `PatternMatch[]` containing `id`, `name`, `category`, `severity`, `confidence`, `title`, `summary`, `explanation`, `evidence: PatternEvidenceRef[]` (linking directly to `stepIndex`, `traceLine`, `slot`, or `address`), `mitigation`, and `references` (SWC IDs).

### Complete Detector Catalog (`DETECTOR_CATALOG`)

| # | Detector ID | Name | Category | Default Severity | What It Looks For | What It Emits | Known Limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `reentrancy-cei-violation` | Recursive Call Before State Update (CEI Violation) | `reentrancy` | `critical` | In the `TraceNode` tree, a `target::fn` frame that appears again inside its own descendants (`descendants.filter(d => key(d) === key(n))`), or in `artifact.steps`, multiple `withdraw`/`claim` calls before the corresponding `storageWrites` entry (Check-Effects-Interactions violation). | `PatternMatch` citing the outer and inner `traceLine` indices (or `stepIndex` and `slot` write index) plus the recursion depth. | Heuristic: flags recursive external entry into the same `target::function` frame. Legitimate recursive callbacks (such as ERC-777 hooks with reentrancy guards that revert on state mutation) require checking whether a storage write occurred after the inner call returned. |
| 2 | `unchecked-external-call` | Unchecked Low-Level Value Transfer | `reentrancy` | `medium` | Raw trace lines invoking `::fallback()` or `::receive()` with `[value: ...]` where the caller continues execution without reverting when return status is unchecked, or value-bearing steps in `artifact.steps` without post-condition assertions. | `PatternMatch` referencing the `traceLine` or `stepIndex` of the low-level ETH transfer. | Cannot prove from trace text alone whether the Solidity source ignored the `bool success` return value if the call succeeded during simulation; requires source/bytecode inspection to confirm a missing `require(success)`. |
| 3 | `spot-oracle-read-under-loan` | Spot Pool Reserve Read as Price Feed | `oracle` | `critical` | Steps touching a pool/DEX (`amm`, `pool`, `swap`, `pair`) that shift spot price via `swap` followed by a lending/borrow action (`borrow`, `liquidate`, `mint`) within the same transaction (`spotPriceBefore` vs `spotPriceAfter` in step details, or `Swap` + `Borrow` sequence in `TraceNode` / `rawLines`). | `PatternMatch` citing the swap step, the borrow step, and the spot price swing (`spotPriceBefore` → `spotPriceAfter`). | Relies on function/contract naming (`swap`, `borrow`, `pool`) or harness `spotPriceBefore`/`spotPriceAfter` metadata; obfuscated selectors without ABI decoding may not match. |
| 4 | `single-block-price-move` | Extreme Intra-Block Price Deviation | `oracle` | `high` | Any step or log in `artifact.steps` / `artifact.logs` recording a price ratio change (`spotPriceBefore / spotPriceAfter >= 2` or `<= 0.5`, i.e. ≥ 2x intra-transaction swing). | `PatternMatch` with `stepIndex` and computed price factor (`ratio.toFixed(1)x`). | Only triggers when `spotPriceBefore` and `spotPriceAfter` (or equivalent oracle observations) are emitted in the step details. |
| 5 | `missing-access-control-sensitive-setter` | Unprotected Administrative State Change | `access-control` | `critical` | Calls to administrative functions (`setOwner`, `setGuardian`, `transferOwnership`, `initialize`, `upgradeTo`, `setAdmin`, `pause`, `unpause`, `sweep`) or slot `0` ownership overwrites where the caller is an attacker/unprivileged EOA and the call succeeds without reverting. | `PatternMatch` citing the `stepIndex`, `traceLine`, and `slot` (`0x00...00`) ownership transition (`oldValue` → `newValue`). | Identifies sensitive functions by selector/name pattern and slot-0 convention; custom role mappings at arbitrary keccak256 slots require symbol metadata to classify as administrative. |
| 6 | `tx-origin-auth` | Authorization via `tx.origin` | `access-control` | `medium` | Trace lines or step details referencing `tx.origin` or caller-spoofing relay contracts. | `PatternMatch` citing the matching `traceLine` or `stepIndex`. | Standard `forge -vvvv` call traces do not print the `ORIGIN` (0x32) opcode directly unless surfaced in an event, revert string, or harness annotation. |
| 7 | `flash-loan-amplified-action` | Flash-Loan-Amplified Governance / Market Action | `flash-loan` | `high` | A `flashLoan` / `flash` call frame in `TraceNode[]` or `artifact.steps` whose subtree (or interstitial steps before repayment) executes governance actions (`queue`, `execute`, `vote`, `propose`) or large market operations. | `PatternMatch` linking the flash-loan entry step, the governance/privileged action inside the callback, and the same-transaction repayment step. | Flags the structural pattern of flash-borrowed capital co-occurring with governance or market mutations; flash loans used purely for benign arbitrage or collateral refinancing can trigger a medium/high match that requires human review. |
| 8 | `untrusted-delegatecall` | `DELEGATECALL` into Caller-Controlled or Mutating Target | `delegatecall` | `critical` | Any `TraceNode` with `kind === 'DELEGATECALL'` (from `[delegatecall]` tag in `forge -vvvv`), or storage writes inside a proxy (`Proxy::fallback`) where implementation or owner slots (`0x0` / `0x1` / EIP-1967 slots) are overwritten during a delegated frame. | `PatternMatch` citing the `[delegatecall]` `traceLine`, the proxy/implementation steps, and every storage slot mutated in the caller's context. | Standard UUPS/Transparent proxy upgrades and reads also use `[delegatecall]`; severity escalates to `critical` when combined with storage slot mutation of owner/implementation slots, otherwise `high` for reviewer verification. |
| 9 | `selfdestruct-forced-ether` | Forced Ether Injection Bypassing `receive` / Accounting | `selfdestruct` | `high` | Trace lines or steps invoking `selfdestruct` / `destroy` / `boom` / `SELFDESTRUCT`, or balance increases on a target vault where the vault's internal accounting (`recordedBalance`) diverges from `address(this).balance`. | `PatternMatch` citing the forcing step, the broken invariant check step, and the resulting denial-of-service (`revert` on subsequent `deposit`/`withdraw`). | Post-Cancun (EIP-6780), `SELFDESTRUCT` only deletes code when executed in the same transaction as contract creation, though it still unconditionally transfers Ether balance and breaks strict `address(this).balance == totalDeposits` invariants. |
| 10 | `large-value-drain` | Asymmetric Value Outflow to Single Actor | `value-drain` | `high` | Evaluates `artifact.balances` (`BalanceDelta[]`) for a vault/pool (`vault`, `pool`, `lending`, `treasury`) losing ETH/tokens while an external actor (`attacker`, `exploiter`, `drainer`) gains ≥ 50% of the drained value in the same transaction. | `PatternMatch` citing both `address` entries (`drained` and `gained` in Wei/ETH). | Depends on `BalanceSnap` checkpoints recorded in `artifact.balances`. Pure state-corruption exploits (such as bricking a contract via `selfdestruct` without extracting funds) do not trigger `large-value-drain` because net extracted value is 0 ETH. |

---

## 6. Running the Tracing Pipeline from the CLI

You can run the parser and detectors directly or inspect their output via the HTTP API:

```powershell
# 1. Run a scenario and generate its full forensic bundle on disk
npm run forensics -- simulate --scenario reentrancy

# 2. Query the parsed trace tree, gas flame, and detector matches over HTTP
Invoke-RestMethod http://localhost:3000/api/evidence/reentrancy | ConvertTo-Json -Depth 6

# 3. Inspect only the bundle manifest and SHA-256 chain of custody
Invoke-RestMethod http://localhost:3000/api/evidence/reentrancy/manifest | ConvertTo-Json -Depth 6
```
