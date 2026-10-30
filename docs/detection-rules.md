# Detection rules

Ten detectors run on every simulation. They live in
`packages/forensic-engine/src/detectors.ts` and share one context: the
structured artifact (when the PoC wrote one), the flattened trace nodes, the raw
trace lines, and the isolated trace text.

`runDetectors()` discards any result with `confidence <= 0`, attaches
`severity = result.severity ?? baseSeverity`, generates a Mermaid attack-flow
diagram from the artifact steps, and sorts the findings by confidence,
descending.

Confidence is the **maximum** of the evidence floors a rule triggered, never a
sum, and every rule has a cap below 1.0. Evidence strings are written verbatim
into the report, so a finding is only as strong as the evidence it lists.

## Summary

| id | label | vectorId | base severity | cap |
| --- | --- | --- | --- | --- |
| `det-reentrancy` | Reentrancy | `reentrancy` | critical | 0.97 |
| `det-flash-loan` | Flash Loan | `flash-loan` | critical | 0.97 |
| `det-oracle` | Oracle Manipulation | `oracle-manipulation` | critical | 0.97 |
| `det-access-control` | Access Control Failure | `access-control` | high | 0.97 |
| `det-delegatecall` | Delegate Call Injection | `delegatecall-injection` | critical | 0.98 |
| `det-selfdestruct` | Self Destruct / Forced Transfer | `self-destruct` | high | 0.97 |
| `det-arithmetic` | Arithmetic / Precision Fault | `arithmetic-overflow` | high | 0.95 |
| `det-front-running` | Ordering / Front Running | `front-running` | medium | 0.93 |
| `det-bridge` | Bridge / Cross-Chain Verification Failure | `bridge-exploit` | critical | 0.95 |
| `det-logic` | Invariant / Logic Error | `logic-error` | high | none (max 0.70) |

Detector labels are the investigator-facing names. They do not have to match
the `ATTACK_VECTORS` label for the same id - for example `det-access-control`
is "Access Control Failure" while the vector label is "Access Control".

---

## det-reentrancy - Reentrancy

| Field | Value |
| --- | --- |
| id | `det-reentrancy` |
| vectorId | `reentrancy` |
| base severity | `critical` (also returned explicitly) |
| confidence cap | `0.97` |

**Signal.** Structural repetition of a `contract::function` pair in the trace,
plus two supporting signals:

```ts
for (const n of ctx.nodes) {
  if (!n.contractName || !n.fn || n.fn === 'result') continue;
  const key = `${n.contractName}::${n.fn}`;
  seen.set(key, (seen.get(key) ?? 0) + 1);
}
const repeated = [...seen.entries()].filter(([, c]) => c > 1);
```

- Each repeated key scores `0.55 + 0.12 * (count - 1)`.
- Narrative keywords `reentran`, `re-entran` or `reentrancy` floor the score at
  `0.72`.
- More than one value-bearing node - `isValueTransfer` or a `(value=N)` in
  `raw` - floors it at `0.60`.

**Evidence emitted.** `Trace shows <Contract>::<fn> invoked <n> times within a
single transaction`, `Root cause narrative references <keywords>`, and
`<k> value-bearing calls observed in the exploit transaction`.

**Confidence floors.** 0.67 for a two-call repeat (`0.55 + 0.12 * 1`), rising by
0.12 per extra call; 0.60 for multiple value-bearing calls; 0.72 for a narrative
keyword. The maximum wins.

**Narrative dependency.** Yes. The word "reentrancy" in
`artifact.rootCause` or in any step description produces a finding at 0.72 with
no trace support.

**False positives.** A legitimate function called twice in one transaction
(claim plus restake), batch payouts that emit several value-bearing calls, or a
proxy where the same implementation selector appears twice.

**False negatives.** Re-entry through a different selector (a callback rather
than the original entry point), frames the parser cannot name (no
`contractName`/`fn`), or re-entrancy where `--decode-internal` does not surface
the inner frame.

---

## det-flash-loan - Flash Loan

| Field | Value |
| --- | --- |
| id | `det-flash-loan` |
| vectorId | `flash-loan` |
| base severity | `critical` (default from `baseSeverity`) |
| confidence cap | `0.97` |

**Signal.**

```ts
const hits = has(ctx, 'flashloan', 'flash loan', 'flashloanpool');   // 0.80
const bigTransfer = ctx.nodes.find((n) => {
  const m = n.raw.match(/value=(\d{10,})/);
  return m && Number(m[1]) > 1e15;
});                                                                  // 0.72
const loanStep = steps.find((s) =>
  /flash|loan|borrow/i.test(`${s.title} ${s.description}`));         // 0.85
```

**Evidence emitted.** `Trace and artifact reference an atomic flash-borrow
primitive (<keywords>)`, `Atomic value transfer of <wei> wei inside the exploit
transaction`, and `Attack step <n>: <title>`.

**Confidence floors.** 0.72 for a transfer above `1e15` wei (0.001 ETH) with at
least ten digits after `value=`; 0.80 for a keyword; 0.85 for a matching step.

**Narrative dependency.** Yes. "flash loan" in the root cause, or a step whose
title or description contains "borrow", is sufficient on its own.

**False positives.** Ordinary borrowing in a multi-step artifact hits the
`borrow` step rule at 0.85. Any transfer above 0.001 ETH hits the transfer rule
at 0.72, so most value-moving exploits carry at least a weak flash-loan signal.

**False negatives.** Flash loans whose step text avoids flash/loan/borrow, and
transfers printed without a `value=` field (internal calls, delegatecall
value), or values below 0.001 ETH.

---

## det-oracle - Oracle Manipulation

| Field | Value |
| --- | --- |
| id | `det-oracle` |
| vectorId | `oracle-manipulation` |
| base severity | `critical` (default from `baseSeverity`) |
| confidence cap | `0.97` |

**Signal.**

```ts
const hits = has(ctx, 'oracle', 'price feed', 'price oracle',
                 'spot price', 'twap', 'reserve ratio');                    // 0.78
const priceSlot = (ctx.artifact?.storageWrites ?? []).find((w) =>
  /price|reserve|rate|oracle/i.test(w.label));                               // 0.88
if (ctx.artifact?.steps.some((s) =>
  /manipulat|push.*price|skew/i.test(`${s.title} ${s.description}`)))        // 0.90
```

**Evidence emitted.** `Oracle or price-source dependency identified
(<keywords>)`, `Price-bearing storage slot mutated during the exploit: <label>
(<slot>)`, and `Attack sequence explicitly manipulates a quoted price before
the extraction step`.

**Confidence floors.** 0.78 keywords, 0.88 price-labelled slot, 0.90
manipulation step.

**Narrative dependency.** Yes, on two of the three signals: the keyword list
and the step regex read the artifact narrative. Only the storage-slot rule
looks at evidence outside the text.

**False positives.** The storage rule does not check `changed`; an untouched
slot labelled `interest rate` still scores 0.88. Words like "oracle" or "TWAP"
in a root cause score 0.78 on their own.

**False negatives.** Manipulation of a DEX reserve through a slot labelled
`slot0` (no price/reserve/rate/oracle substring), and price moves described as
"swap" rather than "manipulate", "push ... price" or "skew".

---

## det-access-control - Access Control Failure

| Field | Value |
| --- | --- |
| id | `det-access-control` |
| vectorId | `access-control` |
| base severity | `high` (also returned explicitly) |
| confidence cap | `0.97` |

**Signal.**

```ts
const hits = has(ctx, 'onlyowner', 'access control', 'unauthorized',
                 'missing modifier', 'owner slot', 'admin');                  // 0.70
const adminSlot = (ctx.artifact?.storageWrites ?? []).find((w) =>
  /owner|admin|authority|role|guardian/i.test(w.label));                      // 0.90
const privileged = ctx.nodes.find((n) =>
  /emergency|mint|admin|owner|upgrade|setOwner|destroy/i
    .test(`${n.fn} ${n.contractName}`));                                      // 0.82
```

**Evidence emitted.** `Privilege boundary referenced in the exploit
(<keywords>)`, `Authority slot rewritten: <label> <slot> <before> -> <after>`,
and `Privileged entry point reached: <Contract>.<fn>`.

**Confidence floors.** 0.70 keywords, 0.82 privileged entry point, 0.90
authority slot.

**Narrative dependency.** The keyword signal is narrative-driven. The slot rule
still does not check `changed`, so the evidence line can say "rewritten" when
the before and after values are equal.

**False positives.** Any trace frame whose function or contract name contains
`mint`, `admin`, `owner`, `upgrade`, `destroy` or `emergency` scores 0.82, even
when the call was authorised. A standard `Ownable` deployment carries an
`owner` slot entry at 0.90.

**False negatives.** Unauthorised calls into a function with none of those
names (`setFee`, `sweep`), and privilege bugs that live in role grants not
labelled owner/admin/authority/role/guardian.

---

## det-delegatecall - Delegate Call Injection

| Field | Value |
| --- | --- |
| id | `det-delegatecall` |
| vectorId | `delegatecall-injection` |
| base severity | `critical` (default from `baseSeverity`) |
| confidence cap | `0.98` |

**Signal.**

```ts
const hits = has(ctx, 'delegatecall', 'delegate call');               // 0.88
const inj = ctx.nodes.filter((n) => /delegatecall/i.test(n.raw));
inj.forEach((n) => evidence.push(`Delegatecall frame: ${n.raw.trim()}`));
if (ctx.artifact?.steps.some((s) =>
  /delegatecall|implementation/i.test(`${s.title} ${s.description}`)))  // 0.93
```

**Evidence emitted.** `delegatecall observed in the execution trace
(<keywords>)`, one `Delegatecall frame: <raw line>` per matching node, and
`Attack sequence installs a caller-supplied implementation`.

**Confidence floors.** 0.88 keyword, 0.93 implementation step. Matching frames
add evidence but do not raise confidence on their own unless the text corpus
contains the word.

**Narrative dependency.** Yes for the 0.88 floor, because the shared corpus
includes `rootCause` and step text; the frame scan is the only trace-native
part.

**False positives.** Any legitimate proxy (EIP-1967, Diamond) produces
delegatecall frames and will score at least 0.88.

**False negatives.** Delegatecall frames whose printed line does not contain the
literal word `delegatecall` and whose narrative does not mention it. Foundry's
`-vvvv` rendering often names the callee instead of printing the opcode, which
is why the artifact step text carries most of this signal.

---

## det-selfdestruct - Self Destruct / Forced Transfer

| Field | Value |
| --- | --- |
| id | `det-selfdestruct` |
| vectorId | `self-destruct` |
| base severity | `high` (default from `baseSeverity`) |
| confidence cap | `0.97` |

**Signal.**

```ts
const hits = has(ctx, 'selfdestruct', 'self destruct', 'destroy');    // 0.85
if (ctx.nodes.some((n) => /selfdestruct|suicide/i.test(n.raw)))       // 0.92
const forced = ctx.artifact?.balances.find((b) =>
  b.beforeWei !== b.afterWei && /victim|vault|pool/i.test(b.label));
if (forced && hits.length)                                            // 0.90
```

**Evidence emitted.** `Contract destruction path exercised (<keywords>)`,
`Trace contains a SELFDESTRUCT opcode path`, and `Victim balance moved from
<before> to <after> wei during destruction`.

**Confidence floors.** 0.85 keywords, 0.92 trace opcode, 0.90 forced balance
(requires a keyword hit as well).

**Narrative dependency.** Yes for the 0.85 floor. The word "destroy" appears in
ordinary prose ("destroyed the vault", "emergency destroy path"), so a
narrative alone can carry the finding.

**False positives.** Admin-only destroy functions that were never executed, and
any step description that uses "destroy".

**False negatives.** Post-Cancun (`EIP-6780`) self-destruct semantics, where the
opcode only moves the balance when the contract was created in the same
transaction. The trace may also show the call without printing the opcode name,
and the balance rule needs a label containing victim, vault or pool.

---

## det-arithmetic - Arithmetic / Precision Fault

| Field | Value |
| --- | --- |
| id | `det-arithmetic` |
| vectorId | `arithmetic-overflow` |
| base severity | `high` (default from `baseSeverity`) |
| confidence cap | `0.95` |

**Signal.**

```ts
const hits = has(ctx, 'overflow', 'underflow', 'truncat', 'precision',
                 'panic 0x11', 'panic code 0x11');                    // 0.80
if (/panic/i.test(ctx.traceText))                                    // 0.70
const flag = (ctx.artifact?.storageWrites ?? []).find((w) =>
  w.kind === 'flag' || /count|supply|shares|amount/i.test(w.label));
if (flag && hits.length)                                             // 0.85
```

**Evidence emitted.** `Arithmetic fault signature matched (<keywords>)`,
`Execution trace contains an arithmetic panic`, and `Accounting slot <label>
mutated to <after> during the exploit`.

**Confidence floors.** 0.70 trace panic, 0.80 keywords, 0.85 accounting slot
(requires a keyword hit as well).

**Narrative dependency.** Yes for the 0.80 and 0.85 floors: both require the
keyword corpus. Only the bare `/panic/i` scan is independent of the narrative.

**False positives.** Any panic - an out-of-bounds array access or a failed
`assert` - scores 0.70 even when arithmetic is not the cause. The word
"precision" in a remediation note is enough for 0.80.

**False negatives.** Silent truncation and rounding errors, which do not panic
by definition. On Solidity 0.8 a genuine overflow reverts the transaction, so a
successful exploit rarely produces the arithmetic panic this detector looks
for. Treat this rule as a low-recall heuristic.

---

## det-front-running - Ordering / Front Running

| Field | Value |
| --- | --- |
| id | `det-front-running` |
| vectorId | `front-running` |
| base severity | `medium` (also returned explicitly) |
| confidence cap | `0.93` |

**Signal.**

```ts
const hits = has(ctx, 'front-run', 'frontrun', 'sandwich',
                 'same block', 'ordering');                            // 0.78
const steps = ctx.artifact?.steps ?? [];
if (steps.length >= 2)                                                 // 0.55
```

**Evidence emitted.** `Transaction-ordering manipulation referenced
(<keywords>)` and `Attack sequence is multi-step (<n> steps), consistent with
an ordering-dependent extraction`.

**Confidence floors.** 0.55 for any artifact with two or more steps; 0.78 for a
keyword.

**Narrative dependency.** The 0.78 floor is entirely narrative.

**False positives.** This is the widest rule in the set: **every** multi-step
scenario emits a 0.55 finding, because the step count alone is treated as
consistent with ordering dependence. Any scenario whose artifact records two or
more steps will show this finding.

**False negatives.** A single-transaction local simulation cannot observe
mempool ordering or block position at all. Genuine front-running is not
representable in this trace model; the detector infers it, it does not detect
it. Treat the finding as a hypothesis that requires external transaction-order
evidence.

---

## det-bridge - Bridge / Cross-Chain Verification Failure

| Field | Value |
| --- | --- |
| id | `det-bridge` |
| vectorId | `bridge-exploit` |
| base severity | `critical` (default from `baseSeverity`) |
| confidence cap | `0.95` |

**Signal.**

```ts
const hits = has(ctx, 'bridge', 'cross-chain', 'crosschain', 'relayer',
                 'guardian set', 'merkle root', 'domain separator');    // 0.72
if (/domain separator|chain id|chainid/i.test(ctx.traceText))          // 0.82
```

**Evidence emitted.** `Cross-chain verification surface referenced
(<keywords>)` and `Chain/domain binding check present in the trace but
circumvented by the attacker`.

**Confidence floors.** 0.72 keywords, 0.82 trace mention of a domain separator,
chain id or `chainid`.

**Narrative dependency.** The 0.72 floor is narrative. The 0.82 floor scans
`traceText` only, which is evidence-native but still textual.

**False positives.** A root cause that mentions "bridge" in passing, or a test
name such as `BridgeExploit`, scores 0.72.

**False negatives.** Cross-chain bugs described without these terms. None of
the six shipped lab scenarios involves a bridge, so in the current lab this
detector only fires when an incident narrative mentions one - it is not
exercised by `runAllSimulations()`.

---

## det-logic - Invariant / Logic Error

| Field | Value |
| --- | --- |
| id | `det-logic` |
| vectorId | `logic-error` |
| base severity | `high` (default from `baseSeverity`) |
| confidence cap | none applied - the maximum reachable score is 0.70 |

**Signal.**

```ts
const hits = has(ctx, 'invariant', 'logic error', 'should never',
                 'intended', 'assum');                                    // 0.70
const victim = ctx.artifact?.balances.find((b) =>
  /victim|vault|pool|treasury/i.test(b.label));
if (victim && victim.beforeWei !== victim.afterWei)                       // 0.50
if (confidence < 0.6) return { confidence: 0, evidence: [] };
```

**Evidence emitted.** `Broken design invariant referenced (<keywords>)` and
`Victim balance moved <before> -> <after> wei`.

**Confidence floors.** 0.70 keywords. The balance signal is 0.50, which falls
below the `0.6` gate and therefore never produces a finding on its own.

**Narrative dependency.** Effectively total. The code comment calls this a
"residual detector", but the arithmetic prevents the residual signal from
firing: without a keyword hit, confidence stays at 0.50 and the detector
returns nothing. A logic error is reported only when the narrative uses one of
those five substrings.

**False positives.** Words like "intended" or "assum(e)" appear in ordinary
prose, so a benign narrative can produce a 0.70 logic-error finding.

**False negatives.** Every logic error whose description does not use those
words, including ones with a clear victim balance movement. This is the
detector's main weakness; read it together with `det-front-running` as a
residual pair, not as primary evidence.

---

## Cross-cutting notes

**The Mermaid diagram is per artifact, not per detector.** `runDetectors()`
calls `stepsMermaid(artifact)` for every finding, so all findings from the same
run share one diagram: `Attacker -> Step 1 -> ... -> Finding -> Loss to
attacker`, where the finding label is the first 48 characters of the artifact
root cause (or `exploit confirmed`). It visualises the attack sequence, not the
individual rule.

**Severity overrides.** `det-reentrancy`, `det-access-control` and
`det-front-running` return a `severity` explicitly, which equals their base
severity. The rest inherit `baseSeverity`. `buildReport()` then promotes the
report to the highest finding severity.

**Why several rules share a corpus.** Every detector reads `traceText` plus the
artifact narrative. That is a deliberate tradeoff: the artifact is authored
alongside the exploit and names the mechanism, so keyword matching gives useful
trips for a hackathon-scale lab. The cost is that a misleading narrative can
raise a score. The evidence array is the part of a finding you should trust,
and it is rendered verbatim in section 5 of the report.

**What the detectors are not.** They are heuristics over a single transaction.
They do not read bytecode, do not symbolically execute, and cannot observe
mempool ordering. A finding is a triage hypothesis with attached evidence, not
a proof of mechanism.
