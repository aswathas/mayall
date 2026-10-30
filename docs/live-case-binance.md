# Live case — The Binance $6.3B breach

**Case ID:** `binance-7702` · **Registry slug:** `binance-7702-breach` · **Chain:** Ethereum
**First signalled:** 2026-10-29 · **Publicly disclosed:** 2026-10-30
**Status:** active investigation, recovery in progress — about $3 billion frozen
**Mayall classification:** `access-control` (primary) · `delegatecall-injection` (contributing amplifier)

This is a retrospective analysis of a publicly reported incident. Mayall did not replay the
Binance transactions, holds no incident trace, and publishes no invented transaction hash,
wallet address, block number, contract name or victim count. The only local Foundry execution
in this case is the **closest analogue**, the delegatecall scenario — not a reproduction of the
breach.

---

## 1. What happened, as reported

On 29 October 2026 a blockchain researcher warned that a Binance-linked wallet faced a possible
exploit. On 30 October Binance disclosed a **$6.3 billion loss**, reported as the largest hack in
cryptocurrency history. Binance and Blockaid's CEO attributed the loss to a **compromised DevOps
engineer's laptop** and **private-key misuse**, not a smart-contract exploit. Security experts said
the Ethereum **EIP-7702** upgrade **did not cause** the hack — the wallets could have been drained
without it — but **may have amplified the losses** by helping bypass withdrawal safeguards.

Investigators linked the theft to **North Korea's TraderTraitor**; TRM Labs said it has **high
confidence** in the attribution. ZachXBT identified stolen funds from the Binance and Bitget hacks
converging at the same address. About **$3 billion** was frozen by Binance and its partners, the
**FBI and Secret Service** joined the response, and Binance pledged to cover all losses, setting
aside more than **$6.34 billion** and holding **$5 billion in matching tokens** for its next
proof-of-reserves report.

| Date | Event |
| --- | --- |
| 2026-10-29 | Onchain alert: a researcher warns a Binance-linked wallet faces a possible exploit. |
| 2026-10-30 | Binance publicly discloses a $6.3B loss, reported as the largest hack in crypto history. |
| 2026-10-30 | Root cause named: compromised DevOps laptop and private-key misuse, not a contract exploit. |
| 2026-10-30 | EIP-7702 assessed: did not cause the hack, may have amplified the losses. |
| 2026-10-30 | Attribution: North Korea's TraderTraitor; TRM Labs says high confidence. ZachXBT links Binance and Bitget funds. |
| 2026-10-30 | About $3B frozen by Binance and its partners. |
| 2026-10-30 | FBI and Secret Service join; US agencies investigate and trace assets. |
| 2026-10-30 | Attacker holdings reported: 18,270 BTC and more than 500,000 ETH. |
| 2026-10-30 | Binance pledges to cover losses: more than $6.34B set aside, $5B matching tokens. |
| 2026-10-30 | Market impact: BNB about -8%, BTC near $77,000, about $1.6B liquidations, crypto equities sell off. |
| 2026-10-30 | Reporters note investigators uncovered additional breaches. |

The coverage gives dates, not clock times. No clock time is invented anywhere in this case.

---

## 2. Verified facts and sources

| Fact | Value | Sources |
| --- | --- | --- |
| Reported loss | $6.3 billion; largest hack in cryptocurrency history | ct-alert, ct-live, ct-recap |
| Root cause | Compromised DevOps engineer's laptop; private-key misuse, not a smart-contract exploit | ct-blockaid, ct-live |
| EIP-7702 role | Did not cause the hack; may have amplified losses by helping bypass withdrawal safeguards | ct-7702 |
| Attribution | North Korea's TraderTraitor; TRM Labs: high confidence | ct-attribution, ct-live |
| Cross-case link | ZachXBT: Binance and Bitget funds converged at the same address | ct-attribution, ct-live |
| Recovery | About $3 billion frozen by Binance and partners | ct-fbi, ct-live |
| Loss cover | More than $6.34 billion set aside; $5 billion in matching tokens for the next proof-of-reserves | ct-5b, ct-live |
| Law enforcement | FBI and Secret Service joined; US agencies investigating and tracing | ct-fbi |
| Attacker holdings | 18,270 BTC — more than Coinbase's reported corporate treasury — and more than 500,000 ETH | ct-btc, ct-live |
| Market impact | BNB about -8%; Bitcoin near $77,000; about $1.6B liquidations; Circle, Strategy and Coinbase sold off | ct-live, ct-recap |
| Secondary finding | Investigators uncovered additional breaches | ct-live |

### Sources

| ID | Publisher | Date | URL |
| --- | --- | --- | --- |
| ct-alert | Cointelegraph | 2026-10-29 | https://cointelegraph.com/news/binance-linked-wallet-faces-possible-exploit-blockchain-researcher-warns |
| ct-live | Cointelegraph | 2026-10-30 | https://cointelegraph.com/news/live-updates-binance-63b-hack-linked-to-north-koreas-tradertraitor |
| ct-7702 | Cointelegraph | 2026-10-30 | https://cointelegraph.com/news/binance-hack-security-ethereum-eip-7702-role |
| ct-blockaid | Cointelegraph | 2026-10-30 | https://cointelegraph.com/news/binance-hack-may-involve-private-key-misuse-not-theft-blockaid-ceo |
| ct-attribution | Cointelegraph | 2026-10-30 | https://cointelegraph.com/news/north-korea-linked-to-63b-binance-hack-by-crypto-investigators |
| ct-fbi | Cointelegraph | 2026-10-30 | https://cointelegraph.com/news/binance-fbi-recover-assets-hack |
| ct-5b | Cointelegraph | 2026-10-30 | https://cointelegraph.com/news/binance-5-billion-replacement-crypto-in-custody |
| ct-btc | Cointelegraph | 2026-10-30 | https://cointelegraph.com/news/binance-hacker-bitcoin-holdings-exceed-coinbase-btc-treasury |
| ct-recap | Cointelegraph | 2026-10-30 | https://cointelegraph.com/news/recap-binances-record-63b-hack-unfolded |

**Prior context, not part of this incident:** the earlier Bitget hack (same actor family per
ZachXBT) and THORChain laundering routes seen in the Bybit and Bitget cases. They are recorded as
prior context for tracing, never as verified facts of this incident.

---

## 3. Mayall's classification

Both ids are normalised through `resolveAttackVectorId()`: `access-control` is already canonical,
and the free-form `delegatecall` resolves to `delegatecall-injection`.

| Vector | Role | Confidence | Mechanism | Bible pattern |
| --- | --- | --- | --- | --- |
| `access-control` | primary | 0.93 | Compromised DevOps laptop → private-key misuse → unauthorised signing | Ownership Hijack + Drain |
| `delegatecall-injection` | contributing amplifier | 0.45 | EIP-7702 delegation designator on an externally owned account | Delegatecall Privilege Escalation |

The honest primary classification is access control: the trust boundary that broke was the
signing key, not a contract, and the record explicitly describes key misuse rather than a
smart-contract exploit. `delegatecall-injection` is assigned only through the EIP-7702
delegation-designator mechanism, and only as an amplifier. Security experts said the upgrade did
not cause the hack, so it is never presented as the root cause. Its confidence is deliberately low
because the record is hedged ("may have amplified").

---

## 4. Forensic Bible mapping

Patterns and signals below are read from the Forensic Bible at runtime — sheet 04 (attack pattern
catalog) and sheet 03 (detection signals). The threshold text and weights are quoted verbatim.

### Pattern thresholds

| Pattern | Family | Role | Attack type | Bible threshold | Met? |
| --- | --- | --- | --- | --- | --- |
| Ownership Hijack + Drain | Access Control | primary | Type A / Single Tx | Min 2 signals · Threshold: ≥6 weight | No |
| Delegatecall Privilege Escalation | Access Control | contributing | Type A / Single Tx | Min 2 signals · Threshold: ≥6 weight | No |
| Address Clustering | Graph / Attribution | context | Type C / Multi Address | Min 2 signals · Threshold: ≥4 weight | No |

No pattern threshold is met on the verified record. That is the point: the patterns are
classifications from public reporting, not detections from a trace.

### Signal statuses

Statuses: **observed** means the published record names the mechanism; **expected** means a full
trace would be needed to confirm the signal; **notApplicable** means the record does not describe
that variant. No signal is claimed as an on-chain log observation.

| Signal | Pattern | Family | Weight | Bible threshold | Status |
| --- | --- | --- | --- | --- | --- |
| `ownership_transfer_then_drain` | Ownership Hijack + Drain | Sequence | W3 | OwnershipTransferred in event_sequence AND drain_ratio_exceeded in same tx_hash | expected |
| `event_order_violation` | Ownership Hijack + Drain | Sequence | W2 | event_sequence: Withdrawn.log_index < Deposited.log_index for same user | expected |
| `drain_ratio_exceeded` | Ownership Hijack + Drain | Value | W3 | total_out_eth / contract_balance_before > 0.80 | expected |
| `delegatecall_storage_write` | Delegatecall Privilege Escalation | Structural | W3 | internal_calls.type = DELEGATECALL AND storage_mutations.contract = calling_contract | expected |
| `proxy_implementation_change` | Delegatecall Privilege Escalation | Structural | W3 | storage_mutations.slot = 0x360894…implementation_slot AND value_before != value_after | notApplicable |
| `ownership_transfer_then_drain` | Delegatecall Privilege Escalation | Sequence | W3 | OwnershipTransferred in event_sequence AND drain_ratio_exceeded in same tx_hash | expected |
| `address_cluster_identified` | Address Clustering | Graph | W2 | fund_hop_chains common source OR contract_creator_graph same deployer OR tx timing correlation < 2 blocks | observed |
| `contract_creator_linked` | Address Clustering | Graph | W3 | contract_creator_graph: deployer_address matches across 2+ contracts in same attack | notApplicable |
| `address_funded_before_attack` | Address Clustering | Behavioural | W2 | address_first_contact.first_contact_block >= (deploy_block - 50) AND prior_balance = 0 | notApplicable |

**Signal counts (unique names):** 1 observed · 4 expected · 3 not applicable.

`address_cluster_identified` is observed at the record level because ZachXBT reports that funds
from the Binance and Bitget hacks converged at the same address. That is an attribution statement,
not a log observation. `drain_ratio_exceeded` stays **expected** even though a $6.3B drain is not in
dispute: the Bible's >80% per-contract ratio is not published, and Mayall does not upgrade a
threshold it cannot see.

---

## 5. Detector coverage matrix

All ten Mayall detectors are listed. Most cannot fire because there is no contract bug to find.
The detector's own limitation is quoted verbatim from `DETECTOR_CATALOG`.

| Detector | Status | Why | Limitation (quoted) |
| --- | --- | --- | --- |
| Reentrancy | not fired | No contract re-entry is described. The attacker signed with a compromised key; there is no repeated call depth to count. | "Counts repetition, not causality. Two independent calls to the same function in one transaction are indistinguishable from a re-entrant loop without reading the state updates." |
| Flash Loan | not fired | No flash-borrow, atomic capital or in-transaction repayment appears in the record. | "Keyed on vocabulary as much as structure. A flash loan that is never named in the artifact can be missed unless the value transfer is unusually large." |
| Oracle Manipulation | not fired | No price source, oracle read or collateral valuation is implicated. | "Cannot distinguish a manipulated price from a legitimately repriced asset without a reference value from outside the transaction." |
| Access Control Failure | out of scope | The boundary was a person's laptop and a signing key used off-chain, so no authority slot ever appears in a trace Mayall can read. | "Sees the symptom (an authority changed, a privileged function was called) but not whether the caller was entitled to it." |
| Delegate Call Injection | out of scope | No incident call trace is published. The detector does fire on the local analogue at 93%, but that is not this incident. | "Detects the opcode, not the damage. Whether the delegated code was hostile is inferred from the outcome." |
| Self Destruct / Forced Transfer | not fired | No contract destruction or forced balance transfer is described. | "On chains where SELFDESTRUCT is neutered, the trace shows the call but not the forced transfer." |
| Arithmetic / Precision Fault | not fired | No overflow, truncation, precision fault or accounting panic is described. | "A silent overflow leaves no panic and no vocabulary; only the resulting balance delta betrays it, which is the job of the balance analysis." |
| Ordering / Front Running | not fired | No ordering, mempool or sandwich manipulation is described. | "Needs the ordering to be described. The trace alone cannot prove an attacker was ordered ahead of a victim within a block." |
| Bridge / Cross-Chain Verification Failure | not fired | No bridge, relayer or cross-chain message verification is implicated. Bitget and THORChain are prior context. | "Runs entirely inside one EVM. A cross-chain exploit whose local half is unremarkable will not be detected from the local trace alone." |
| Invariant / Logic Error | out of scope | Deliberately residual. The loss is explained by key misuse, so using it would relabel a known cause as "unexplained". | "Deliberately residual. It is the detector of last resort, so it fires when nothing else does and should be read as \"unexplained\", not \"proven\"." |

**Result:** 0 fired · 7 not fired · 3 out of scope.

The honest reading: a forensics tool that knows what it cannot see. The failure was not in a
contract, so no contract-level detector is entitled to a verdict. The two detectors closest to the
mechanism — access control and delegatecall — are out of scope rather than clean.

---

## 6. The local analogue, measured

`delegatecall` scenario (`artifacts/delegatecall.json`):

- **Loss:** 50 ETH
- **Detector:** `det-delegatecall` — Delegate Call Injection
- **Confidence:** 93%

**What it reproduces:** a contract delegating execution to an attacker-controlled implementation
that writes the host's storage and sweeps the host balance. Under `delegatecall`, `address(this)`
is the host, so the implementation acts with the host's identity and balance. This is the closest
local analogue to an EOA delegating to attacker code under EIP-7702.

**What it does not reproduce:**

- the off-chain compromise of a DevOps engineer's laptop;
- the misuse of a live Binance signing key;
- EIP-7702 delegation-designator behaviour on an EOA — the lab target is a contract that uses
  `delegatecall`, not an EIP-7702 account;
- the $6.3B scale, the multi-wallet withdrawal path, or any incident address or hash.

The custom attack lab exposes the same family in `contracts/src/CustomTarget.sol` with
`MAYALL_VECTOR=delegatecall`. It is the same line: local delegatecall mechanics, not the incident.

Run it at `/lab?scenario=delegatecall`.

---

## 7. Honest limits

- No mainnet call trace of the incident is in the public record, so none was analysed.
- No incident transaction hash, block number, wallet address or victim count is published here.
  Every figure in this document is a published figure or a count derived from the case model.
- The Bible signal statuses are record-level. `observed` does not mean "seen in a log".
- The classification is retrospective. It is not a mainnet detection.
- The EIP-7702 role is hedged in the record and is classified as an amplifier, not a cause.
- The local delegatecall run is an analogue. It is never a reproduction of the breach.

---

## 8. Client action plan

### First 24 hours

1. Freeze and reconcile: confirm the roughly $3B frozen figure with the counterparties holding it,
   and publish one reconciled loss number with its source.
2. Rotate every signing key and session credential that touched the compromised DevOps estate.
   Assume the laptop carried more than one key.
3. Move signing to hardware-backed custody with a quorum (HSM or MPC): no single laptop, session
   or engineer may produce a withdrawal signature.
4. Revoke or re-point EIP-7702 delegation designators on affected EOAs, and allow only audited
   implementations.
5. Preserve evidence before rotation destroys it: signing-service logs, endpoint telemetry,
   withdrawal approvals and the DevOps access trail.
6. Notify the FBI and Secret Service, share the attacker address set, and retain a tracing firm.

### First week

1. Delegatecall and delegation-designator monitoring: alert on any new EIP-7702 authorization to a
   non-allowlisted implementation, and diff account code on a schedule.
2. Withdrawal rate limits and address allowlisting: per-asset caps, velocity limits, and a 24-hour
   cool-down for new destinations.
3. Proof-of-reserves: include the more than $6.34B cover and the $5B in matching tokens, with a
   published methodology rather than a headline figure.
4. Hunt the TraderTraitor pattern: endpoint IOCs, DevOps credential access, signed-binary abuse and
   CI/CD trust paths across the laptop fleet.
5. Trace the THORChain and Bitget routes as prior-context laundering patterns; feed address clusters
   to exchanges and the tracing firm.

### First month

1. Commission an independent review of key custody and DevOps access, covering the signing path end
   to end rather than the single wallet that was hit.
2. Deploy withdrawal anomaly detection (velocity, geography, new device, unusual approver) with a
   tested paging path and a named owner.
3. Run a tabletop exercise for signing-key compromise, including law-enforcement liaison, public
   disclosure cadence and customer communication.
4. Publish a post-incident report separating confirmed facts, analyst attribution and the EIP-7702
   amplifier question.

---

## 9. How the case is produced

**Code**

- `packages/core/src/live-case.ts` — the typed case model: facts, timeline, assets, responders,
  sources, analysis shapes.
- `packages/core/src/incidents.ts` — the registry entry `inc-0017` / `binance-7702-breach`. It is
  marked not reproducible: the delegatecall scenario is an analogue, not this incident.
- `packages/forensic-engine/src/live-case.ts` — classification, Bible mapping, detector coverage,
  the measured analogue, the action plan, the deterministic report writer, the mcode prompt and
  the stored-report loader.
- `packages/web/app/api/live/route.ts` — `GET /api/live`.
- `packages/web/app/api/live/report/route.ts` — `GET /api/live/report`, with
  `?format=markdown` for the raw narrative.
- `packages/web/app/live/page.tsx` and `packages/web/components/LiveCase*.tsx` — the live-case page.

**Report generation**

```
npx tsx scripts/generate-binance-case.ts
```

The script builds the prompt from the verified facts and the analysis, then runs the local MiniMax
Code CLI. The brief's canonical invocation is tried first. This CLI build rejects `--effort on`
(the model's valid levels are default/low/medium/high/xhigh/max) and cannot receive the full prompt
on the child command line, so the script retries with `--effort high` and attaches the prompt as a
file, writing the final message with `-o`. stdout and stderr are captured separately; the child is
killed after ~240 seconds; a rejected model name is retried once with `minimax/MiniMax-M3`.

If mcode fails or returns a document missing one of the seven sections or a mermaid block, the
deterministic writer produces the report and labels it `generatedBy: "deterministic"`. A template
is never presented as an AI report.

**Observed output for this build:** `generatedBy: minimax-code` with
`model: minimax/MiniMax-M3.1-Flash`, 7 sections and 2 mermaid diagrams.

**Stored artefacts**

- `data/narratives/binance-7702.md` — the report markdown (`loadNarrative`-compatible).
- `data/ai-reports/binance-7702.json` — the machine-readable report plus its analysis.

**Routes**

- `/api/live` — case, timeline, analysis, coverage matrix, sources.
- `/api/live/report` — the seven-section report with mermaid blocks and `generatedBy`.
- `/live` — the live-case dossier.
