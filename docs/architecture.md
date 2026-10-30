# Architecture

Mayall is a Foundry-powered exploit forensics workbench. It executes exploit
proofs-of-concept against deliberately vulnerable Solidity contracts in a real
local EVM, reconstructs the transaction as a call tree plus a storage diff, and
classifies the mechanism with evidence-weighted pattern detectors.

Nothing in the console is mimicked: every trace, storage write and gas figure
the UI renders originates from a `forge test` execution.

## Layers

| Layer | Path | Responsibility |
| --- | --- | --- |
| Foundry lab | `contracts/` | Vulnerable contracts and their exploit PoCs, plus the Foundry project config. |
| Domain core | `packages/core/src/` | Chain and attack-vector taxonomy, severity model, simulation/report types, 16 seeded incidents. |
| Forensic engine | `packages/forensic-engine/src/` | Foundry runner, trace parser, gas flame, detectors, scenario registry, report builder, bundle packer. |
| Console | `packages/web/` | Next.js 15 dashboard, case views, live lab, report view, bundle download. |

The engine is a standalone library. The console is a thin consumer of it, not a
second implementation.

---

## 1. Foundry lab - `contracts/`

`contracts/foundry.toml` pins the compiler and grants the test harness the
filesystem access it needs to write artifacts:

```toml
[profile.default]
src = "src"
test = "test"
out = "out"
libs = ["lib"]
solc = "0.8.20"
optimizer = true
optimizer_runs = 200

fs_permissions = [
  { access = "read-write", path = "./" },
  { access = "read-write", path = "../artifacts" },
  { access = "read-write", path = "<repo>/artifacts" }
]
```

The third entry is the machine-specific absolute path to the repository's
`artifacts/` directory.

The scenarios are registered in `packages/forensic-engine/src/scenarios.ts`:

| Scenario id | Test file | Contract |
| --- | --- | --- |
| `reentrancy` | `test/ReentrancyExploit.t.sol` | `ReentrancyVault` |
| `oracle-manipulation` | `test/OracleExploit.t.sol` | `OracleLendingPool` |
| `access-control` | `test/AccessControlExploit.t.sol` | `AccessControlVault` |
| `flash-loan` | `test/FlashLoanExploit.t.sol` | `FlashLoanPool` |
| `delegatecall` | `test/DelegatecallExploit.t.sol` | `DelegateVault` |
| `selfdestruct` | `test/SelfdestructExploit.t.sol` | `SelfdestructVault` |

Each spec also carries `title`, `vectorId`, `chain`, `description` and a
`lookFor[]` list that the console renders as investigator guidance.

Foundry v1.8.7 is installed into `.tools/foundry` by `scripts/setup-foundry.ps1`;
the system PATH is never modified. `packages/forensic-engine/src/foundry.ts`
resolves the binaries in this order:

1. `<repo>/.tools/foundry/<tool>.exe` (or `<tool>` on non-Windows)
2. `$env:FOUNDRY_BIN_DIR`
3. `$env:FOUNDRY_BIN`
4. the bare command name, i.e. whatever is on PATH

`foundryAvailable()` is `existsSync(foundryTool('forge'))`. `runTool()` wraps
`execFile` with a 64 MB stdout buffer, a configurable timeout (default 180 s,
240 s from the simulator) and a composed `command` string that is stored on the
result and later stamped into the chain-of-custody manifest.

---

## 2. Domain core - `packages/core/src/`

`index.ts` holds the pure domain model: types and constant tables, no runtime
dependencies.

| Export | Contents |
| --- | --- |
| `Chain`, `CHAIN_COLORS` | 8 chains: Ethereum, Arbitrum, Optimism, Polygon, BSC, Base, Avalanche, Solana. |
| `AttackVectorId` | 16-vector union. |
| `ATTACK_VECTORS` | Per-vector `label`, `signature`, `severityWeight` (0..1) and `category`. |
| `Severity`, `SEVERITY_ORDER`, `SEVERITY_COLORS` | `critical`, `high`, `medium`, `low`. |
| `Incident`, `CaseFile` | Incident dataset shape and case-file metadata. |
| `TraceNode`, `StorageWrite`, `BalanceDelta`, `AttackStep` | Evidence primitives. |
| `PatternDetection`, `GasFlameNode` | Detector output and gas profile. |
| `SimulationArtifact`, `SimulationResult` | What a run produces. |
| `ForensicReport` | What the report builder produces. |

The 16 attack vectors, with their severity weights:

| id | label | category | weight |
| --- | --- | --- | --- |
| `flash-loan` | Flash Loan | Value Extraction | 0.90 |
| `reentrancy` | Reentrancy | Logic & Math | 0.95 |
| `oracle-manipulation` | Oracle Manipulation | Oracle & Market | 0.90 |
| `access-control` | Access Control | Access & Control | 0.85 |
| `arithmetic-overflow` | Arithmetic Overflow | Logic & Math | 0.80 |
| `front-running` | Front Running | Oracle & Market | 0.60 |
| `delegatecall-injection` | Delegate Call Injection | Access & Control | 0.90 |
| `self-destruct` | Self Destruct | Infrastructure | 0.75 |
| `logic-error` | Logic Error | Logic & Math | 0.70 |
| `bridge-exploit` | Bridge Exploit | Infrastructure | 0.95 |
| `signature-replay` | Signature Replay | Access & Control | 0.80 |
| `price-impact` | Price Impact | Oracle & Market | 0.55 |
| `integer-truncation` | Integer Truncation | Logic & Math | 0.60 |
| `unchecked-call` | Unchecked Call | Logic & Math | 0.65 |
| `gas-griefing` | Gas Griefing | Infrastructure | 0.50 |
| `liquidation-abuse` | Liquidation Abuse | Oracle & Market | 0.70 |

`incidents.ts` seeds 16 publicly reported incidents and exposes
`INCIDENT_BY_SLUG`. Ten carry a `scenarioId` that points at a local
reproduction: `inc-0005` (reentrancy), `inc-0006` (flash-loan), `inc-0008`
(flash-loan), `inc-0009` (reentrancy), `inc-0010` (oracle-manipulation),
`inc-0011` (delegatecall), `inc-0012` (access-control), `inc-0013`
(reentrancy), `inc-0014` (selfdestruct) and `inc-0016` (access-control).

---

## 3. Forensic engine - `packages/forensic-engine/src/`

| File | Role |
| --- | --- |
| `foundry.ts` | Locates the repo root and local Foundry binaries; `runTool()` wraps `execFile`. |
| `scenarios.ts` | `SCENARIOS` registry and `SCENARIO_BY_ID`. |
| `simulator.ts` | `runSimulation()`: execute forge, extract and parse the trace, load the artifact, run detectors. |
| `trace-parser.ts` | `parseForgeTrace()`: `-vvvv` call tree -> `TraceNode` tree + `GasFlameNode[]`. |
| `detectors.ts` | The 10 detectors, `runDetectors()` and `stepsMermaid()`. |
| `report.ts` | `buildReport()`, `reportToMarkdown()`, narrative storage, `sha256()`. |
| `bundle.ts` | `buildForensicBundle()`: ZIP assembly and chain-of-custody manifest. |

`repoRoot()` walks up from `process.cwd()` until it finds a directory that
contains both `packages/` and `contracts/`, or until ten levels are exhausted.
`HELIX_ROOT` overrides the search. This is why the engine works unchanged from
the repo root, from `packages/web` under Next.js, and from a standalone script.

---

## 4. Console - `packages/web/`

The Next.js app is a thin consumer of `@helix/forensic-engine`; it holds no
forensic logic of its own. `packages/web/app/globals.css` defines the design
tokens (`--color-void`, `--color-panel`, `--color-signal`, `--color-threat`,
`--color-safe`, the mono/sans font stacks and `--radius-panel`) and the
component classes (`.panel`, `.chip`, `.btn`, `.mono`, `.stat-value`,
`.scroll-y`) the console is built from.

---

## End-to-end flow of one simulation

```text
POST /api/simulate  { "scenarioId": "reentrancy" }
        |
        v
runSimulation(scenarioId)          packages/forensic-engine/src/simulator.ts
        |
        +-- ScenarioSpec from SCENARIO_BY_ID
        +-- foundryAvailable() gate (fails fast if .tools/foundry is missing)
        |
        v
forge test --match-path test/ReentrancyExploit.t.sol --match-test testExploit \
           -vvvv --decode-internal --json
        cwd: contracts/          env: HELIX_ARTIFACT_DIR=<repo>/artifacts
        timeout: 240000 ms       maxBuffer: 64 MB
        |
        +-- (a) stdout
        |       extractTraceText()   unwraps the --json envelope, slices "Traces:"
        |       parseForgeTrace()    -> TraceNode tree + buildFlame() -> GasFlameNode[]
        |
        +-- (b) artifacts/<scenario>.json, written by the PoC test
        |       storageWrites[]  (vm.record / vm.accesses, vm.load before+after)
        |       balances[]       (before/after in wei)
        |       steps[], rootCause, lossWei, lossEth, severity
        |
        v
runDetectors({ artifact, nodes, rawLines, traceText })
        |   evidence-weighted scoring, 10 detectors
        |   -> PatternDetection[] sorted by confidence, descending
        v
SimulationResult
        |
        +--> /lab console: trace tree, storage diff, findings, gas flame
        +--> buildReport()          -> ForensicReport (7 sections + summary)
        +--> buildForensicBundle()  -> <caseRef>-forensic-bundle.zip
```

Three details matter for correctness:

- **Trace extraction.** `forge test --json` returns a JSON document whose
  `stdout` field holds the original human output. `extractTraceText()` unwraps
  that, then `isolateTraceSection()` keeps only the region starting at
  `Traces:` and ending at the next `Ran N test`, `Suite result:` or
  `Encountered a total of`.
- **Artifact freshness.** Before the run, `runSimulation` records the mtime of
  `artifacts/<scenario>.json`. It loads the file only if the mtime did not go
  backwards (or `allowStaleArtifact` is set); otherwise it logs `Artifact file
  was not refreshed by this run.` and continues with a `null` artifact.
- **Success.** `ok` is true only when forge exits 0, the output reports success
  (`"status": "success"` or `[PASS]`) **and** an artifact was loaded.

---

## The TraceNode model

`TraceNode` (defined in `packages/core/src/index.ts`) is the structured form of
the `-vvvv` call tree:

| Field | Type | How the parser derives it |
| --- | --- | --- |
| `id` | string | Sequential `n0`, `n1`, ... in document order. |
| `depth` | number | Width of the whitespace prefix before the branch glyph, divided by 2. |
| `address` | string | First 40-hex address on the line; for creation, the `@0x...` address. |
| `contractName` | string | `Name` from `Name::fn(`, or `Name` from `new Name@0x...`. |
| `fn` | string | See the resolution table below. |
| `selector` | string? | Declared on the type. The parser does **not** populate it: the human `-vvvv` rendering resolves names, not 4-byte selectors. |
| `gasUsed` | number | The integer inside the `[n]` bracket. |
| `raw` | string | The original line, stripped of trailing whitespace. |
| `children` | TraceNode[] | Built from the indent stack. |
| `isExternalCall` | boolean | True for `new Contract@addr` frames and for frames that carry only an address. |
| `isValueTransfer` | boolean | True only for frames whose body names `selfdestruct`; other value movement is read from `(value=N)` in `raw`. |

`describe()` and `fn` resolution, in order:

| Trace text | Result |
| --- | --- |
| `new ReentrancyVault@0x5FbD...` | `contractName`, `address`, `fn = 'constructor'`, `isExternalCall = true` |
| `Contract::function(args)` | `contractName`, `fn` |
| `function(` with no `::` | `fn` only |
| an address but no function name | `fn = 'fallback/receive'`, `isExternalCall = true` |
| `<- Return`, `Revert`, `Stop`, `SelfDestruct` (or a leading `<-`) | `fn = 'result'` |
| body containing `selfdestruct` | `fn = 'selfdestruct'` (if unresolved), `isValueTransfer = true` |

### Mapping the forge tree onto nodes

```text
forge test -vvvv output                  TraceNode tree
--------------------------------------   -----------------------------------
[21000] -> new ReentrancyVault@0x5FbD    n0  depth 0  constructor  0x5FbD..
+- [50000] ReentrancyVault::deposit()    n1  depth 1  deposit
|  +- [2300] 0x1234..::withdraw()        n2  depth 2  withdraw   (external)
|  |  +- [2300] ReentrancyVault::withdraw()
|  |                                      n3  depth 3  withdraw   <- re-entry
+- [Return]                              skipped (no numeric gas bracket)
```

Parser behaviour, from `parseForgeTrace()`:

- A line must match `[<digits>] ...` to become a node. Result markers such as
  `+- <- [Return]` are normally skipped because `Return` is not a number; a
  result line that does carry a gas bracket and resolves to no function is
  folded into the parent's `raw` instead of being pushed.
- Lines carrying `[PASS]` / `[FAIL]`, and lines starting with `Ran N test`,
  `Suite result:` or `Encountered a total of`, are filtered before parsing.
- Nesting uses a stack: pop while the top node's depth is greater than or equal
  to the incoming depth, attach the node to the new top, or promote it to
  `root` when the stack is empty.
- External calls are rendered with `->`; the parser strips that arrow before
  resolving contract and function.
- `rawLines` is the flat list of every node's `raw` line in document order and
  is passed to the detectors alongside the tree.

The gas flame comes from the same tree via `buildFlame()`: a pre-order walk
emits `{ id, label, gasUsed, share, depth }` for every node, where `label` is
`Contract.fn` (or `fn`, or the address, or `call`), and `share` is that node's
`gasUsed` divided by the sum of `gasUsed` across **all** nodes, rounded to six
decimals. Nested frames are counted in both parent and child, so `share` is a
relative weight for flame sizing, not a fraction of the transaction's gas.
`flattenTrace()` produces the depth-first node list the detectors consume.

---

## How storage diffs are captured

Storage mutation capture is **cheatcode-based**, inside the proof-of-concept
test, not reconstructed from RPC:

1. The PoC takes a state snapshot with `vm.snapshot()`, then calls `vm.record()`
   before the exploit sequence.
2. After the exploit it calls `vm.accesses(address)` to collect every slot the
   exploit touched, deduplicates them, and reads their post-attack values with
   `vm.load`.
3. It reverts to the snapshot and reads the same slots again with `vm.load`, so
   the pre-attack values come from real EVM state rather than a reconstruction.
4. The test assembles the `SimulationArtifact` and writes it to
   `vm.envOr("HELIX_ARTIFACT_DIR", "../artifacts")/<scenario>.json`. The engine
   sets `HELIX_ARTIFACT_DIR` to `<repo>/artifacts`, and `contracts/foundry.toml`
   grants the harness write access there.

Each entry lands in `SimulationArtifact.storageWrites` as a `StorageWrite`:

```ts
{ contract, contractName, slot, label, before, after,
  kind: 'balance' | 'state' | 'flag',
  changed: boolean }      // changed === (before !== after)
```

Balance movement is captured the same way into `balances[]` as `BalanceDelta`
(`address`, `label`, `beforeWei`, `afterWei`, `deltaWei`), and the ordered
attack steps into `steps[]` as `AttackStep` (`n`, `title`, `description`,
`txHash`, `gasUsed`, `valueWei`).

The engine never infers state: if the artifact is missing, `artifact` is
`null`, the detectors fall back to trace-only signals, and the report sections
say so.

Why this beats diffing chain state over RPC for a local simulation:

| Concern | Cheatcode capture (local) | RPC state diffing |
| --- | --- | --- |
| Node requirement | none - the EVM runs locally via `forge` | archive node with historical state |
| Determinism | identical replay from the same source | depends on live chain head and reorgs |
| Granularity | per-slot, labelled, with semantic `kind` | raw storage deltas, unlabelled |
| Slot discovery | the EVM reports which slots the transaction touched | requires tracing or guesswork |
| Cost | process-local | network-bound and rate-limited |
| Trust | the simulator you just ran | a third-party indexer's reconstruction |

The tradeoff is scope: this only works because the chain state is local and
controlled. Reconstructing a real mainnet incident would still require RPC or
archive access. Mayall does not fork mainnet and does not claim to.

---

## The detector contract

Detectors live in `packages/forensic-engine/src/detectors.ts`. Each receives the
same context and returns a candidate finding:

```ts
interface DetectorContext {
  artifact: SimulationArtifact | null;
  nodes: TraceNode[];
  rawLines: string[];
  traceText: string;
}

interface Detector {
  id: string;
  vectorId: PatternDetection['vectorId'];
  label: string;
  baseSeverity: Severity;
  detect(ctx: DetectorContext): {
    confidence: number;          // 0..1
    evidence: string[];          // human-readable pointers
    rationale: string;
    severity?: Severity;         // overrides baseSeverity when present
  };
}
```

`runDetectors()` drops every result with `confidence <= 0` (an empty finding
list is a valid outcome, not an error), attaches `id`, `vectorId`, `label`,
`severity = result.severity ?? baseSeverity` and `mermaid` (the step-based
attack flow from `stepsMermaid(artifact)`), then sorts the survivors by
confidence, descending.

### Confidence philosophy

Confidence is evidence-weighted and capped. Each rule accumulates independent
signals; each signal has a floor, and the score is the **maximum** of the
floors it triggered - signals are never summed. For example, a re-entered
`contract::function` pair scores `0.55 + 0.12 * (count - 1)`; a root-cause
narrative that mentions reentrancy floors it at `0.72`; more than one
value-bearing call floors it at `0.60`.

Per-detector caps sit between 0.93 and 0.98 because a trace heuristic should
never claim certainty. A detector that matches nothing returns confidence `0`
and a rationale such as `No repeated call pattern detected in the trace.`;
nothing is invented to fill the table. A finding is only as strong as its
`evidence[]`, and the report renders those lines verbatim.

### Known limitation: narrative keywords

`text(ctx)` is the concatenation of `traceText`, `rawLines`,
`artifact.rootCause` and every step's `title + description`, lowercased. The
`has(ctx, ...)` helper searches that whole corpus. Several detectors therefore
fire partly on how the incident is **described**, not only on what the EVM
executed. That is a real property of heuristic detectors, documented per
detector in [detection-rules.md](./detection-rules.md) - a misleading
`rootCause` string can raise a detector's confidence. Treat confidence as a
triage signal and read the evidence list.

---

## Report pipeline

`buildReport(caseId, sim, incident)` in `report.ts` turns a `SimulationResult`
into a `ForensicReport` with a fixed seven-section body:

| # | Heading |
| --- | --- |
| 1 | `1. Scope` |
| 2 | `2. Attack sequence` |
| 3 | `3. State mutations (storage diff)` |
| 4 | `4. Balance movements` |
| 5 | `5. Pattern findings` |
| 6 | `6. Root cause and remediation` |
| 7 | `7. Evidence index` |

- **Severity** is merged from the findings by `severityOf()`: any `critical`
  finding makes the report `critical`, then `high`, then `medium`, otherwise
  `low`. With no findings it falls back to the artifact severity, then `high`.
- **Confidence** is the top finding's confidence, or `0.5` when nothing fired.
- **Evidence count** is `storageWrites + balances + steps + detections`.
- **Section 6** joins the artifact's `rootCause` with the `REMEDIATION` entry
  for the attack vector. The map covers `reentrancy`, `flash-loan`,
  `oracle-manipulation`, `access-control`, `delegatecall-injection`,
  `self-destruct`, `arithmetic-overflow`, `front-running`, `bridge-exploit` and
  `logic-error`.
- `reportToMarkdown()` renders the title, a metadata header (case reference,
  generated time, chain, severity, confidence, evidence items), the executive
  summary and every section.

### The MiniMax Code narrative injection point

`executiveSummary` is `loadNarrative(caseId) ?? deterministicSummary(...)`.

- Narratives live at `data/narratives/<caseId>.md`. `narrativePath()`
  sanitises the case id by replacing anything outside `[a-z0-9_-]` with `_`.
- `POST /api/report/[caseId]/narrative` stores an authored summary through
  `saveNarrative(caseId, text)`, which creates `data/narratives/` if needed.
- When no narrative is stored, `deterministicSummary()` composes the summary
  from the evidence: incident date/target/chain and loss, the incident summary,
  the artifact root cause, the top detection with its confidence and evidence
  count, and up to two secondary signals. Its final line states that a MiniMax
  Code narrative can replace it.

The same case id must be used for the simulation, the report and the POST, or
the narrative will not be found.

---

## Forensic bundle layout

`buildForensicBundle(report, sim)` returns
`{ filename: "<caseRef>-forensic-bundle.zip", buffer }`, compressed with
DEFLATE. The archive contains exactly these entries:

| Path | Source |
| --- | --- |
| `report/report.md` | `reportToMarkdown(report)` |
| `report/report.json` | The full `ForensicReport`, pretty-printed. |
| `evidence/artifact.json` | `sim.artifact`, or a note when no artifact was produced. |
| `evidence/trace.txt` | `sim.traceText`, or `No trace captured.` |
| `evidence/foundry-stdout.txt` | Raw forge stdout. |
| `evidence/foundry-stderr.txt` | Raw forge stderr. |
| `evidence/storage-diff.csv` | Header `contract,contractName,slot,label,kind,before,after,changed`. |
| `evidence/balance-timeline.csv` | Header `address,label,beforeWei,afterWei,deltaWei`. |
| `evidence/timeline.csv` | Header `step,title,description,txHash,gasUsed,valueWei`. |
| `evidence/patterns.json` | `sim.detections`, pretty-printed. |
| `evidence/gas-flame.json` | `sim.flame`, pretty-printed. |
| `chain-of-custody.json` | The SHA-256 hash manifest. |

### Chain of custody

Every file is added through one helper that records `{ path, sha256, bytes }` at
the moment it is written. `sha256` is the hex-encoded SHA-256 of the file's
text content (`sha256()` in `report.ts`); `bytes` is
`Buffer.byteLength(content)`. The manifest carries:

```json
{
  "caseRef": "...",
  "scenario": "...",
  "command": "forge test ...",
  "startedAt": "...",
  "durationMs": 0,
  "ok": true,
  "generatedAt": "...",
  "files": [{ "path": "...", "sha256": "...", "bytes": 0 }]
}
```

`chain-of-custody.json` is written last and does not hash itself. To verify a
bundle later, recompute the SHA-256 of each listed file and compare it with the
manifest entry. `command` records the exact invocation that produced the
evidence, and `generatedAt` is independent of `startedAt`, so report generation
can be distinguished from execution.

---

## Extension points

### Add a scenario

1. Write the vulnerable contract and a PoC in
   `contracts/test/<Name>Exploit.t.sol` whose test is named `testExploit`. The
   test must emit a `SimulationArtifact` JSON to
   `$HELIX_ARTIFACT_DIR/<scenario>.json`.
2. Add a `ScenarioSpec` to `SCENARIOS` in
   `packages/forensic-engine/src/scenarios.ts` with `id`, `title`, `vectorId`
   (an existing `AttackVectorId`), `testFile` (relative to `contracts/`),
   `contractName`, `chain`, `description` and `lookFor[]`.
3. Optional: give a seeded incident the same `scenarioId` in
   `packages/core/src/incidents.ts` so the case page can launch it.

`SCENARIO_BY_ID` is derived from `SCENARIOS`, and `runAllSimulations()`
iterates the array, so nothing else needs registering. Detectors run unchanged
unless the scenario needs a new signal.

### Add a detector

1. Append a `Detector` to `DETECTORS` in
   `packages/forensic-engine/src/detectors.ts`: a unique `id`, a `vectorId`,
   `label`, `baseSeverity`, and `detect(ctx)`.
2. Return `{ confidence: 0, evidence: [], rationale: ... }` when no signal is
   present. Do not manufacture evidence strings.
3. Use only the context you were given: `artifact`, `nodes`, `rawLines`,
   `traceText`. Mermaid generation and severity defaulting are attached by
   `runDetectors()`.

If the finding does not fit an existing vector, add the vector to
`ATTACK_VECTORS` in `packages/core/src/index.ts` first - `vectorId` is typed
against `AttackVectorId`.

### Add a chain

1. Extend the `Chain` union and add its colour to `CHAIN_COLORS` in
   `packages/core/src/index.ts`. `CHAIN_COLORS` is a `Record<Chain, string>`,
   so the compiler forces the new entry.
2. Use the new id in `ScenarioSpec.chain` and in any `Incident.chain`.

No migration is needed: chain is a plain string in the artifact and report
payloads.
