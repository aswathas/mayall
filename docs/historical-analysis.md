# Historical analysis

Mayall's historical layer applies the product's own taxonomy and detector suite to every incident in
`packages/core/src/incidents.ts` (17 at the time of writing; the analysis is data-driven and picks
up registry additions automatically). It exists to answer a judge's question — *does this
work on something that actually happened?* — without pretending that a local Foundry harness can
replay a mainnet transaction.

The short version: **the classification is retrospective metadata analysis; the reproductions are
local Foundry simulations of the same attack vector.** The two are never conflated in the API, the
UI or the reports.

## What the analysis does

`packages/forensic-engine/src/historical.ts` turns every registry incident into a
`HistoricalIncidentAnalysis`:

1. **Reads the registry record.** Chain, date, reported loss, native amount, target, root cause,
   summary, actors, transaction hashes and references all come from `INCIDENTS`. Nothing is
   fetched from a block explorer.
2. **Classifies each recorded vector.** Every incident carries one or more ids from our 16-vector
   taxonomy. Each `(incident, vector)` pair becomes one `HistoricalFinding`.
3. **Maps the vector to a Bible attack pattern.** The pattern name is chosen from the mechanism the
   public record describes (see below), and always exists verbatim in Bible sheet `04 Attack Pattern
   Catalog`.
4. **Attaches the signals that would prove that pattern.** The signal names are the pattern's
   "Correlated Signals" from sheet 04, resolved against sheet 03 for family and confidence weight.
   Each signal is marked `observed`, `expected` or `notApplicable`.
5. **Attaches the detector limitation verbatim.** `limitations` is the matching rule's
   `DETECTOR_CATALOG.limitation` string, unedited. Vectors with no Mayall detector say so.
6. **Aggregates.** Findings by vector, findings by Bible family, a confidence distribution, and a
   coverage split between locally reproduced and retrospective-only incidents.

Measured output at the time of writing:

| Metric | Value |
| --- | --- |
| Incidents | 17 |
| Findings (`incident × vector`) | 32 |
| Incidents with a local Foundry reproduction | 10 of 17 (58.8%) |
| Retrospective-only incidents | 7 of 17 |
| Sum of reported losses | $8,694,400,000 |
| Bible signals observed in the record | 43 |
| Bible signals expected from a full trace | 50 |
| Bible signals not applicable | 6 |
| Taxonomy vectors exercised | 11 |
| Bible families exercised | 6 |

These numbers are recomputed on every request; the table is a snapshot for orientation, not a
constant.

### Confidence is about the record, not the trace

The confidence score is a transparent, additive model:

- `0.58` base for a vector the registry records;
- `+0.14` when the root cause or summary uses that vector's own vocabulary;
- `+0.06` when a transaction hash is published;
- `+0.08` when a local Foundry scenario exists;
- `+0.04` when the root cause is substantial (≥ 90 characters);
- `-0.06` for each additional vector beyond the first (the registry lists the primary mechanism
  first);
- clamped to `0.35–0.94`.

It answers "how explicitly does the public record name this mechanism?", not "how certain is the
trace?". The UI and reports say this next to the number.

## How the mapping to the Bible works

The Bible is loaded at runtime from `data/bible/forensic-bible.json`, not copied into the code:

- **Sheet 03 — Detection Signals** is parsed into a `name → { family, detects, weight }` index.
  Signals are the Bible's 54 named detections (`recursive_depth_pattern`,
  `flashloan_bracket_detected`, `spot_price_manipulation`, …).
- **Sheet 04 — Attack Pattern Catalog** is parsed into a `name → { family, simple meaning, attack
  type, threshold, correlated signals, derived logs, raw foundation, real-world example }` index.
  Patterns are the Bible's 37 attacks across 8 families.
- The "Correlated Signals" column is split on newlines. If a name in that column is not defined in
  sheet 03, it is marked `notApplicable` with a note saying it is a sheet-04 input, not a detection
  signal. This is how derived logs such as `balance_spike_registry` are handled honestly.

The pattern resolver is contextual, because the Bible has no generic "logic error" row:

| Vector | Pattern selection |
| --- | --- |
| `reentrancy` | `Read-Only Reentrancy` for stale-price/liquidation wording, `Cross-Function Reentrancy` for two-function wording, `ERC777 Hook Reentrancy` for hooks, otherwise `Classic Reentrancy` |
| `flash-loan` | `Flash Loan + Governance Attack`, `Flash Loan + Oracle Manipulation`, `Multi-Pool Chained Flash Loan`, otherwise `Classic Flash Loan Exploit` |
| `oracle-manipulation` | `TWAP Manipulation`, `Multi-Oracle Inconsistency Exploit`, otherwise `AMM Spot Price Manipulation` |
| `access-control` | `Delegatecall Privilege Escalation`, `Selfdestruct Drain`, `Uninitialized Proxy Exploit`, otherwise `Ownership Hijack + Drain` |
| `logic-error` | Chosen by the named mechanism: donation → `Donation Attack`; initialization → `Uninitialized Proxy Exploit`; governance → `Governance Manipulation`; signature/replay → `Signature Replay Attack`; price/oracle/liquidation → `AMM Spot Price Manipulation`; owner/key/multisig → `Ownership Hijack + Drain` |
| `bridge-exploit` | `Delegatecall Privilege Escalation` for facet/proxy wording, `Signature Replay Attack` for guardian/signature wording, otherwise `Ownership Hijack + Drain` |
| `signature-replay` | `Signature Replay Attack` |
| `delegatecall-injection` | `Delegatecall Privilege Escalation` |
| `self-destruct` | `Selfdestruct Drain` |
| `arithmetic-overflow`, `integer-truncation` | `Integer Overflow Exploit` |
| `front-running` | `Governance Manipulation` for governance wording, otherwise `Frontrunning` |
| `price-impact` | `AMM Spot Price Manipulation` |
| `unchecked-call` | `Classic Reentrancy` |
| `gas-griefing` | `Frontrunning` |
| `liquidation-abuse` | `Liquidation Manipulation` |

If the Bible cannot be loaded, the analysis degrades to the taxonomy defaults and the missing
signals simply do not appear. It does not throw.

### Signal status semantics

- **`observed`** — the incident's root cause, summary or reference label explicitly names the
  mechanism the signal detects. It is a statement about the published record, not an on-chain
  observation. Matching is intentionally conservative and ignores the incident's title or target, so
  a target called "Ronin Bridge" does not count as a bridge fund trail.
- **`expected`** — the Bible signal would be required to prove the pattern from a full trace, but no
  raw log for the incident is in the registry. This is the default for structural signals.
- **`notApplicable`** — the record does not describe the variant the signal belongs to (for example,
  an ERC777 hook signal on an incident with no hook wording), or the name in sheet 04 is not a
  detection signal in sheet 03.

## What is retrospective vs reproduced

| Layer | What it is | What it is not |
| --- | --- | --- |
| Vector and Bible classification | Inference from the registry's root cause and summary | Not an on-chain finding, not proof of call order |
| `observed` signal status | A text match in the published record | Not a decoded event or a trace frame |
| `expected` signal status | The signal the Bible would require | Not evidence that it actually occurred |
| Local detector output | `runDetectors` executed against `artifacts/<scenario>.json` for the same vector | Not the historic transaction, not the same addresses or amounts |
| Local Foundry reproduction | A working exploit harness for the vector | Not a replay of the incident; not mainnet state |

The 10 incidents with a local reproduction (`inc-0005` Curve, `inc-0006` Euler, `inc-0008` Cream,
`inc-0009` Olympus, `inc-0010` Thena, `inc-0011` Li.Fi, `inc-0012` zkSync Era, `inc-0013` Radiant,
`inc-0014` Vault destruction, `inc-0016` Badger) are marked `reproduced` on every surface. The other
seven — including the registry's newest entry, the 2026 Binance key-misuse incident — are marked
`retrospective`, and the UI never implies otherwise.

## AI reports

`packages/forensic-engine/src/aireport.ts` and `scripts/generate-historical-reports.ts` generate one
report per incident at:

- `data/narratives/incident-<slug>.md` — the human-readable markdown. `caseId` is
  `incident-<slug>`, which matches `saveNarrative` / `loadNarrative` in
  `packages/forensic-engine/src/report.ts`.
- `data/ai-reports/incident-<slug>.json` — machine-readable: findings, detector evidence, parsed
  sections, mermaid source and the `generatedBy` provenance.

Every report contains the seven required sections:

1. Case header
2. Executive summary
3. Attack sequence, ending in an `### Attack flow` mermaid block
4. Evidence reconstruction (claim / status / basis table)
5. Detection analysis, with detector limitations quoted verbatim
6. Remediation, per vector and tied to the Bible pattern
7. Client action plan (first 24 hours / first week / first month)

Generation flow:

1. Build the analysis and run the detectors against the local artifact.
2. Write a strict prompt: use only the supplied facts, never invent an address or loss, never claim
   a signal was observed on-chain, do not infer a transfer the record does not state, do not write
   files, return only markdown with the exact H2 headings.
3. Invoke the local MiniMax Code CLI in **standard** mode (lightweight mode cannot read the attached
   prompt file):

   ```powershell
   & "$env:USERPROFILE\.minimax-code\mcode.ps1" exec `
       --cwd "C:\Users\aswat\Projects\w3-forensics" `
       --model minimax/MiniMax-M3.1-Flash `
       --effort high `
       --permission off `
       --timeout 205s `
       --file <prompt.md> `
       --output-format text `
       -o <answer.md>
   ```

   The brief specified `--effort on`; the installed CLI rejects that level for this model and
   reports the valid set (`default, low, medium, high, xhigh, max`). `high` is used. The brief's
   fallback model (`minimax/MiniMax-M3`) was not needed.
4. Validate the answer: all seven H2 headings, exactly one mermaid fence that starts with
   `flowchart` / `graph` / `sequenceDiagram`, and a plausible length. If headings are missing, one
   repair round is attempted.
5. If the model is unavailable, times out, or fails validation, build the deterministic report and
   set `generatedBy: "deterministic"`. A deterministic report is never labelled as a model report.

At the time of writing, all 17 stored reports are `generatedBy: "minimax-code"` with model
`minimax/MiniMax-M3.1-Flash`. The deterministic writer was exercised during development and remains
the guaranteed fallback; it is never presented as a model report.

Runner options:

```bash
npx tsx scripts/generate-historical-reports.ts                 # generate missing reports
npx tsx scripts/generate-historical-reports.ts --force         # regenerate everything
npx tsx scripts/generate-historical-reports.ts --only=slug1,slug2
npx tsx scripts/generate-historical-reports.ts --limit=4
npx tsx scripts/generate-historical-reports.ts --timeout=240   # seconds per incident
npx tsx scripts/generate-historical-reports.ts --no-ai         # deterministic only
npx tsx scripts/generate-historical-reports.ts --dry-run       # analysis table, no writes
```

## API

- `GET /api/historical` — the aggregate `HistoricalAnalysis` (totals, coverage, confidence
  distribution, findings by vector and family, and every incident analysis).
- `GET /api/historical/[slug]` — `{ incident, analysis, report }`, where `report` says whether the
  markdown and JSON are stored.
- `GET /api/historical/[slug]/report` — the stored report, or a deterministic draft generated on
  request with `generatedBy: "deterministic"` and `stored: false`. The response always includes
  `{ markdown, mermaid, generatedBy, caseId }` plus the structured analysis, detector output and
  parsed sections.

All three routes follow `packages/web/app/api/_lib.ts`: `dynamic = 'force-dynamic'`, the tsx engine
loader, and `errorResponse`.

## UI

- `/historical` — metric strip, coverage panel, confidence distribution, findings-by-family and
  findings-by-vector tables, and a findings table with severity, chain, vector, Bible pattern,
  confidence bar and reproduction status.
- `/historical/[slug]` — the seven report sections rendered with a small markdown renderer (tables,
  lists, bold, inline code), the mermaid diagram via the existing `MermaidDiagram`, the structured
  detector output via `PatternReport`, quoted detector limitations, and the client action plan.

Both pages use tokens only (no raw hex), `lucide-react` icons only, text labels alongside every
colour, `aria-label`s on icon-only controls, 44px touch targets on mobile, and a skeleton that
announces `aria-busy`. Dark and light themes are driven entirely by the shared semantic tokens.

## Limitations

1. **No mainnet trace.** The registry holds transaction hashes, not calldata, receipts or logs. No
   call tree, storage diff or event sequence was read for a historical incident.
2. **Classification is keyword-assisted.** Pattern selection and `observed` statuses are text rules
   over the published narrative. They are auditable but not semantic proof.
3. **Confidence is not correctness.** The additive score is a readability heuristic. It is capped at
   0.94 and never reaches 1.0 for a retrospective classification.
4. **Detector output is local.** The 10 Mayall detectors are heuristic (see their published
   `limitation` strings). They fire on the Foundry artifact for the same vector, not on the historic
   transaction.
5. **Coverage is incident-level, not per-vector.** An incident counted as reproduced has a scenario
   for its primary vector; a secondary vector on the same incident may not have its own scenario, and
   the UI labels the chips and columns accordingly. No scenario reproduces each protocol's specific
   bug.
6. **No per-vector loss split.** Aggregate loss by vector or family repeats an incident's loss when
   it maps to several vectors. The tables label this; the figures are not additive.
7. **ABI-free history.** The Bible's ABI-dependent signals cannot be evaluated without decoded
   events. They remain `expected`, never upgraded to `observed`.
8. **Registry is authoritative.** The Bible's sheet 04 real-world examples are annotations and can
   cite different figures. For example, the Bible lists Beanstalk at $182M while the registry
   records $75M. Reports use the registry figure and the report page carries an explicit source
   precedence note; no figure is silently merged.
9. **A record can be short.** Some incidents publish only one transaction hash and no actor detail.
   The report says what is absent rather than filling the gap.
10. **Model output is validated, not verified.** The seven headings and mermaid block are checked
    mechanically. Factual fidelity depends on the model obeying the prompt; the deterministic report
    is always available as the auditable baseline.

## Verification

- `npx tsx scripts/generate-historical-reports.ts` produces a report for every registry incident
  (17 at the time of writing), each with seven sections and a mermaid block, and prints a summary
  table with the real `generatedBy` value per incident.
- `npx tsc --noEmit -p packages/forensic-engine/tsconfig.json` and
  `npx tsc --noEmit -p packages/web/tsconfig.json` both exit 0 with zero errors, as does
  `npm run typecheck --workspaces --if-present`. The repository has no root `tsconfig.json`, so a bare
  `npx tsc --noEmit` at the root prints the compiler help; the package-level commands are the
  meaningful check.
- The API routes are exercised against the dev server on `http://localhost:3000`.
