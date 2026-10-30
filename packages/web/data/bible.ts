/**
 * The Forensic Bible — assembled content.
 *
 * Nothing here is retyped from the taxonomy: the vector set, the detector
 * catalogue and the scenario library are imported from the packages that the
 * engine actually executes. The only authored material is the explanatory
 * prose (mechanism, trace signature for vectors with no reproduction, and the
 * fix), plus the measured figures read from the local Foundry artifacts.
 *
 * This module is server-only: it reads the artifact files from disk so the
 * numbers printed by the Bible are the numbers the lab recorded.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ATTACK_VECTOR_LIST,
  ATTACK_VECTORS,
  type AttackVector,
  type AttackVectorId,
  type Severity,
} from '@helix/core';
import type { DetectorRule, ScenarioSpec } from '@helix/forensic-engine';

/* ────────────────────────── engine boundary ────────────────────────── */

/**
 * The engine is authored as TypeScript ESM with `.js` sibling specifiers, and
 * this package does not own next.config, so webpack cannot resolve it. The API
 * layer loads it through tsx's require hook; the Bible reads the same catalogue
 * the same way, so the published rules and the executed rules are one object.
 * See packages/web/app/api/_lib.ts.
 */
type EngineModule = typeof import('@helix/forensic-engine');

let engineCache: EngineModule | null = null;

function engine(): EngineModule {
  if (engineCache) return engineCache;
  const anchor = path.join(process.cwd(), 'package.json');
  const nativeRequire = process.getBuiltinModule('module').createRequire(anchor);
  nativeRequire('tsx/cjs');
  engineCache = nativeRequire('@helix/forensic-engine') as EngineModule;
  return engineCache;
}

/* ────────────────────────── artifact shapes ────────────────────────── */

interface ArtifactFile {
  scenario: string;
  contractName: string;
  lossWei: string;
  lossEth: string;
  severity: Severity;
}

interface SummaryRow {
  scenario: string;
  ok: boolean;
  passed: boolean;
  lossEth: string;
  detections: number;
  topDetection: string;
  confidence: number;
}

interface SummaryFile {
  generatedAt: string;
  rows: SummaryRow[];
}

function readJson<T>(fileName: string): T | null {
  try {
    return JSON.parse(readFileSync(path.join(engine().artifactsDir(), fileName), 'utf-8')) as T;
  } catch {
    return null;
  }
}

const SUMMARY = readJson<SummaryFile>('summary.json');
const SUMMARY_ROWS = new Map((SUMMARY?.rows ?? []).map((row) => [row.scenario, row]));
const { DETECTOR_CATALOG, SCENARIOS } = engine();

/* ────────────────────────── public shapes ────────────────────────── */

export type BibleCategory = AttackVector['category'];

export interface LiveEvidence {
  scenarioId: string;
  scenarioTitle: string;
  testFile: string;
  contractName: string;
  /** ETH figure recorded by the local Foundry run. */
  lossEth: string;
  lossWei: string;
  severity: Severity;
  /** Highest-confidence detector finding from that run. */
  topDetector: string | null;
  confidence: number | null;
  findings: number;
  /** When the summary that recorded these figures was generated. */
  measuredAt: string | null;
}

export interface BibleEntry {
  id: AttackVectorId;
  label: string;
  category: BibleCategory;
  signature: string;
  severityWeight: number;
  /** Every rule in the shipped catalogue that watches for this vector. */
  detectors: DetectorRule[];
  /** Local Foundry reproductions of this vector. */
  scenarios: ScenarioSpec[];
  /** True when at least one local reproduction exists for the vector. */
  live: boolean;
  /** The mechanism, in plain language. */
  mechanism: string;
  /** Concrete tells in a call tree. Scenario `lookFor` wins when one exists. */
  traceSignature: string[];
  /** Remediation written from the mechanism. */
  fix: string[];
  /** Measured figures from the local run, when one was recorded. */
  evidence: LiveEvidence | null;
}

/* ────────────────────────── authored prose ────────────────────────── */

interface AuthoredContent {
  mechanism: string;
  traceSignature: string[];
  fix: string[];
}

const VECTOR_CONTENT: Record<AttackVectorId, AuthoredContent> = {
  reentrancy: {
    mechanism:
      'The contract sends value or hands control to an external address before it records the effect of that call in its own storage. The recipient re-enters the same entry point while the first frame is still open, so the balance check it passes is still the pre-call value. The loop repeats until the contract is empty, and every withdrawal is individually plausible.',
    traceSignature: [],
    fix: [
      'Write the effect before the interaction: zero the caller balance before the value call (checks-effects-interactions).',
      'Guard every function that makes an external call with a storage re-entrancy lock set on entry and cleared on exit.',
      'Prefer a pull-payment ledger so the recipient withdraws in its own frame rather than being paid inside yours.',
    ],
  },
  'oracle-manipulation': {
    mechanism:
      'Collateral is valued from a number the contract can read on-chain right now: a pool reserve ratio or a spot pair quote. That number is a function of pool state, so anyone able to trade against the pool can move it inside the same transaction. The borrow is then evaluated against a collateral value the attacker chose a few frames earlier.',
    traceSignature: [],
    fix: [
      'Do not read a spot reserve or instantaneous pool price as a solvency input; use a time-weighted average over a window longer than one block.',
      'Cross-check each quote against an independent source and revert when the deviation exceeds a stated tolerance.',
      'Cap borrow power per account and per block so a single-transaction repricing cannot unlock the whole book.',
    ],
  },
  'access-control': {
    mechanism:
      "A privileged state change is reachable without proving the caller is entitled to it: the modifier is missing, the check reads a settable storage slot, or the guard validates tx.origin instead of msg.sender. The attacker reaches that function and acts with the contract's own authority, usually minting shares or moving escrow.",
    traceSignature: [],
    fix: [
      'Guard every privileged entry point with an explicit modifier that reverts on the negative case — do not rely on callers being well behaved.',
      'Read authority from an immutable owner or a role-based source (AccessControl), never from a slot that another path can write.',
      'Authorise on msg.sender, never tx.origin; add a test that calls each privileged function from an unprivileged address and expects a revert.',
    ],
  },
  'delegatecall-injection': {
    mechanism:
      "delegatecall executes another contract's bytecode in the caller's storage, address and balance context. When the target is caller-supplied and not allowlisted, the delegated code can read and write the host's slots directly, the balances mapping included. None of the host contract's own checks apply to code it did not author.",
    traceSignature: [],
    fix: [
      'Never delegatecall to a caller-supplied address; resolve the implementation from an owner-controlled, allowlisted slot.',
      'Bind the implementation to the proxy (a dedicated storage slot plus an upgrade authorisation check) and emit it on every change.',
      'Constrain dispatched selectors to an explicit table, and test that an arbitrary implementation cannot reach the vault balance slots.',
    ],
  },
  'flash-loan': {
    mechanism:
      'A flash loan lends a large balance that must be repaid in the same transaction, so the attacker posts no capital. That borrowed balance is used to move a price, a reserve ratio or a liquidity measure the protocol trusts. The loan is repaid out of the victim, and the attacker keeps the residual.',
    traceSignature: [],
    fix: [
      'Treat any balance that arrives and leaves within one transaction as hostile; value assets from a cumulative, block-delayed price rather than a live balance.',
      'Snapshot prices and reserves at the start of the transaction and settle the action against that snapshot.',
      'Require collateral and debt to be valued at the same observation, and reject transactions whose liquidity changed inside the call.',
    ],
  },
  'arithmetic-overflow': {
    mechanism:
      'A balance or price is computed with arithmetic that cannot represent the result — unchecked 0.7 math, or a width narrower than the value. The result wraps to a small number where a large one was expected, or the reverse, and a later step treats the corrupted value as an accounting fact. Nothing in the transaction is malformed; only the number is wrong.',
    traceSignature: [
      'A balance or supply slot written to a value the declared width cannot represent',
      'A panic 0x11 revert caught upstream and execution continuing on a fallback path',
      'The same multiplication performed at two different integer widths inside one call tree',
    ],
    fix: [
      'Compile with Solidity 0.8+ checked arithmetic, and never open an unchecked block unless the bound is proven and asserted.',
      'Use uint256 for intermediate products and downcast only after an explicit range check on the value.',
      'Assert terminal invariants (total supply equals the sum of balances; debt does not exceed collateral value) at the end of every value-moving function.',
    ],
  },
  'front-running': {
    mechanism:
      'The attacker reads a pending victim transaction in the mempool and submits their own with a higher fee so it executes first in the same block. The victim then executes against the state the attacker just created: a worse price, a sandwich, or a liquidation that should not have triggered. The victim transaction is valid; its ordering is what changed.',
    traceSignature: [
      'Two transactions from different senders in one block touching the same pool, the attacker ordered first',
      'The executed price differs from the quote the victim signed against, by more than the stated slippage',
      'No repeated internal call — the tell is transaction ordering, not call structure',
    ],
    fix: [
      'Require a minimum-output or maximum-input bound in the calldata and revert when the execution crosses it.',
      'Commit to trade parameters in an earlier block (commit-reveal) or route through a private orderflow channel.',
      'Use a short deadline so a transaction that waited in the mempool cannot execute at a stale quote.',
    ],
  },
  'self-destruct': {
    mechanism:
      'SELFDESTRUCT removes a contract and force-sends its whole balance to a recipient, bypassing the recipient code and any accounting it keeps. If the destroy path trusts a mutable authority slot, rewriting that slot is enough to make the contract destroy itself and push user funds to the attacker. The vault never runs a withdrawal; it simply ceases to exist.',
    traceSignature: [],
    fix: [
      'Remove SELFDESTRUCT from any contract that holds user funds; use an explicit withdrawal path instead.',
      'Bind the destroy recipient to an immutable address and require a timelocked, two-step authority change.',
      'Keep escrow balances outside the destroyable contract, or settle them through the same guarded path that credits users.',
    ],
  },
  'logic-error': {
    mechanism:
      'The contract enforces an invariant on one path and not on another: a fee exemption that also skips the accounting update, a partial-fill branch that credits before it debits. Value leaves through the branch the design assumed was equivalent or unreachable. The code is type-safe; the model of it is wrong.',
    traceSignature: [
      'Value leaves through a branch that does not perform the accounting its sibling branch performs',
      'An invariant true at transaction entry is false at exit, with no revert',
      'The call tree looks ordinary; the imbalance is visible only in the balance delta',
    ],
    fix: [
      'State the invariant once in an internal check and call it at the end of every path that moves value.',
      'Route all value movement through a single internal transfer primitive instead of repeating the accounting per branch.',
      'Add property tests over randomised call sequences, not just single-call unit tests that exercise the intended path.',
    ],
  },
  'bridge-exploit': {
    mechanism:
      'A cross-chain message is accepted because the verifier trusts something the attacker can influence: a signature threshold, a merkle root, a relayer identity, or a domain binding that is checked but not enforced. Once the message is accepted, the destination chain mints or releases funds that were never locked on the source. The local half of the exploit often looks unremarkable.',
    traceSignature: [
      'A message-acceptance function that never reads chainId or the verifying domain separator',
      'A mint or release on the destination chain with no matching lock event on the source',
      'Signature verification passing against a signer set the calling transaction can influence',
    ],
    fix: [
      'Bind every message to chainId and the verifying contract domain separator, and reject replays with a consumed-message set.',
      'Verify the full signer set and threshold against an immutable guardian configuration with an explicit rotation delay.',
      'Treat a locally valid proof as insufficient: attest the source-chain lock inside the same verification path.',
    ],
  },
  'signature-replay': {
    mechanism:
      'An authorisation is signed once and accepted more than once, or accepted on a chain or contract it was never meant for. If the signed payload carries no nonce, no chain id and no verifying-contract address, a valid signature is a bearer token: whoever sees it can present it again. The cryptographic check passes every time.',
    traceSignature: [
      'The same signature digest accepted in two separate transactions',
      'A nonce that never increments, or an ecrecover result checked without binding it to this chain',
      'Two identical event logs emitted from the same authorisation digest',
    ],
    fix: [
      'Include a per-signer nonce, the chain id and the verifying contract in the signed struct, and consume the nonce before acting.',
      'Use EIP-712 typed data so the domain separator is part of what the signer actually signed.',
      'Reject signatures past a deadline and bind them to the exact action: amount, recipient and selector.',
    ],
  },
  'price-impact': {
    mechanism:
      "One swap is large relative to the pool's depth, so the execution price walks along the curve as the order fills. The loss is not a defect in the pool: it is the pool charging the trader for consuming its liquidity. Protocols that then read the post-trade price as a valuation turn that slippage into a solvency error.",
    traceSignature: [
      'One swap whose execution price moves materially against the trader while pool reserves move in the same call',
      'A post-trade reserve or price read used as an input by a later step in the same transaction',
      'Loss proportional to trade size against thin liquidity, with no privileged function touched',
    ],
    fix: [
      'Return and enforce a minimum output computed from an independent quote, and revert on excessive price impact.',
      'Split large orders across blocks or venues, or price against real depth through an RFQ or aggregator path.',
      'Never read the post-swap price as a valuation; use a TWAP that excludes the current block.',
    ],
  },
  'integer-truncation': {
    mechanism:
      'EVM integer division discards the remainder, and a downcast discards the high bits. A share or fee computed as a / b rounds down silently, and repeated rounding can be farmed; a downcast can invert magnitude without a revert. The error is in the bits that were dropped, so there is no failed assertion to point at.',
    traceSignature: [
      'A division whose remainder is never accounted for, repeated across many small calls',
      'A downcast (uint256 to uint128) with no range check before the slot write',
      'Balances drifting by dust in the attacker favour across repeated calls',
    ],
    fix: [
      'Multiply before dividing, and round explicitly in the protocol favour: up for debt, down for credit.',
      'Use full-precision math (a mulDiv with a wide intermediate) and verify the result fits the target width before casting.',
      'Avoid width changes; when one is unavoidable, require the value to fit and test at the boundary.',
    ],
  },
  'unchecked-call': {
    mechanism:
      'A low-level call returns a success flag and data. Ignoring the flag means a failed transfer is treated as a successful one: the contract credits the recipient or advances its state while no value moved. The discrepancy only becomes visible later, when the ledger is reconciled against the balance.',
    traceSignature: [
      'A low-level call whose return flag is discarded before the state update',
      'The recipient balance unchanged while the contract ledger credited it',
      'No revert after the failed call — execution continues into the next state change',
    ],
    fix: [
      'Check the success flag of every low-level call and bubble the returned revert data when it is false.',
      'Prefer a token wrapper that reverts on failure (SafeERC20) over raw call or transfer.',
      'Assert that the recipient balance delta matches the amount before committing the state change.',
    ],
  },
  'gas-griefing': {
    mechanism:
      'A critical path charges gas to the caller for work an attacker can inflate: a recipient callback that burns gas, an unbounded array, or a refund that must be claimed before progress. The victim transaction reverts out of gas, so the operation is blocked without the attacker spending the value they are blocking.',
    traceSignature: [
      'A victim transaction reverting out of gas inside a loop or a recipient callback',
      'Gas consumed by an address the caller does not control',
      'Repeated attempts with rising gas limits failing at the same frame',
    ],
    fix: [
      'Bound loops by a caller-supplied limit and process the work in resumable batches.',
      'Do not push value to arbitrary recipients on a critical path; let them pull with their own gas.',
      'Use a pull-payment ledger and check the remaining gas before an external call that must complete.',
    ],
  },
  'liquidation-abuse': {
    mechanism:
      'Liquidation is priced from the same movable value the attacker can push, so a healthy position is made to look insolvent inside one transaction. The attacker liquidates at the manipulated price, takes the collateral and the bonus, and the borrower is seized although the true value of the position never fell. The liquidation logic is correct; its input was chosen by the liquidator.',
    traceSignature: [
      'A price move immediately before a liquidation call in the same transaction',
      'A position healthy at the previous block boundary and unhealthy at liquidation',
      'Collateral seized plus the bonus while the borrower true value did not fall',
    ],
    fix: [
      'Price liquidation from a delayed oracle (TWAP or a signed feed) and require the position to be unhealthy across that window.',
      'Add a liquidation delay or a health-factor buffer so a single-block price move cannot trigger seizure.',
      'Cap the liquidation bonus and require partial liquidation when the shortfall is small.',
    ],
  },
};

/* ────────────────────────── assembly ────────────────────────── */

function readArtifact(scenarioId: string): ArtifactFile | null {
  return readJson<ArtifactFile>(`${scenarioId}.json`);
}

function buildEvidence(scenario: ScenarioSpec): LiveEvidence | null {
  const artifact = readArtifact(scenario.id);
  const row = SUMMARY_ROWS.get(scenario.id);
  if (!artifact && !row) return null;

  return {
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    testFile: scenario.testFile,
    contractName: artifact?.contractName ?? scenario.contractName,
    lossEth: artifact?.lossEth ?? row?.lossEth ?? '0',
    lossWei: artifact?.lossWei ?? '0',
    severity: artifact?.severity ?? 'critical',
    topDetector: row?.topDetection ?? null,
    confidence: row?.confidence ?? null,
    findings: row?.detections ?? 0,
    measuredAt: SUMMARY?.generatedAt ?? null,
  };
}

export const BIBLE_ENTRIES: BibleEntry[] = ATTACK_VECTOR_LIST.map((vector) => {
  const scenarios = SCENARIOS.filter((scenario) => scenario.vectorId === vector.id);
  const scenario = scenarios[0] ?? null;
  const content = VECTOR_CONTENT[vector.id];

  return {
    id: vector.id,
    label: vector.label,
    category: vector.category,
    signature: vector.signature,
    severityWeight: vector.severityWeight,
    detectors: DETECTOR_CATALOG.filter((rule) => rule.vectorId === vector.id),
    scenarios,
    live: scenarios.length > 0,
    mechanism: content.mechanism,
    traceSignature: scenario ? scenario.lookFor : content.traceSignature,
    fix: content.fix,
    evidence: scenario ? buildEvidence(scenario) : null,
  };
});

const ENTRY_BY_ID = new Map(BIBLE_ENTRIES.map((entry) => [entry.id, entry]));

export function getEntry(vectorId: string): BibleEntry | undefined {
  if (!(vectorId in ATTACK_VECTORS)) return undefined;
  return ENTRY_BY_ID.get(vectorId as AttackVectorId);
}

/** Category order used by the published index. */
export const BIBLE_CATEGORY_ORDER: BibleCategory[] = [
  'Value Extraction',
  'Access & Control',
  'Oracle & Market',
  'Logic & Math',
  'Infrastructure',
];

export const BIBLE_STATS = {
  vectors: ATTACK_VECTOR_LIST.length,
  detectors: DETECTOR_CATALOG.length,
  scenarios: SCENARIOS.length,
  reproducedVectors: BIBLE_ENTRIES.filter((entry) => entry.live).length,
} as const;
