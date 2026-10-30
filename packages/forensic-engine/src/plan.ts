import { existsSync } from 'node:fs';
import path from 'node:path';
import type { AttackVectorId, ForensicReport } from '@helix/core';
import { ATTACK_VECTORS, resolveAttackVectorId } from '@helix/core';
import { repoRoot } from './foundry.js';
import type { SessionAnalysis, SessionArtifact } from './session.js';

export interface PlanEvidence {
  artifact?: SessionArtifact | null;
  scenario?: string;
  /** True when the report came from a simulated session rather than a live chain. */
  simulated?: boolean;
}

export interface ClientPlanAction {
  order: number;
  title: string;
  detail: string;
}

export interface ClientPlan {
  caseRef: string;
  scenario: string;
  vectorId: AttackVectorId;
  vectorLabel: string;
  severity: string;
  whereFlaw: {
    contract: string;
    function: string;
    file: string;
    behaviour: string;
    rootCause: string;
  };
  whyExploitable: string;
  cost: {
    lossEth: string;
    lossUsd: number | null;
    asset: string;
    note: string;
  };
  actions: ClientPlanAction[];
  unknowns: string[];
  transaction?: {
    index: number;
    confidence: number;
    reasons: string[];
  };
  markdown: string;
}

interface VectorGuidance {
  fn: string;
  behaviour: string;
  precondition: string;
  containment: string;
  fix: string;
  verify: string;
  logCheck: string;
}

const GUIDANCE: Record<string, VectorGuidance> = {
  reentrancy: {
    fn: 'withdraw',
    behaviour:
      'the state update that zeroes the caller balance happens after the external value transfer, so the balance is still intact when the receiver re-enters',
    precondition:
      'the vault sends ETH to a caller-controlled contract before it records the withdrawal, and that receiver can call withdraw() again while the first call is still open',
    containment:
      'Pause the withdrawal path (guarded pause modifier or a temporary guardian transaction) and move the remaining balance out of the at-risk contract.',
    fix:
      'Zero the caller balance before the external call (checks-effects-interactions), and add a reentrancy guard to every value-moving entry point as defence in depth.',
    verify:
      'Add a Foundry test with an attacker contract whose receive() re-enters withdraw(); assert that the vault balance is unchanged and the second withdraw() reverts.',
    logCheck:
      'Search Withdrawal events for the same sender emitting more than once under one transaction hash, then reconcile each affected balance against the ledger.',
  },
  'oracle-manipulation': {
    fn: 'push',
    behaviour:
      'the price the protocol trusts is read from a value that an unauthenticated caller can overwrite in the same transaction',
    precondition:
      'collateral is valued with a spot price that the attacker can move before borrowing, so the borrow limit is attacker-controlled',
    containment:
      'Freeze new borrows and liquidations, then re-price all open positions with the last trusted oracle value.',
    fix:
      'Read prices from a manipulation-resistant source (Chainlink or a multi-block TWAP) and reject quotes that deviate beyond a bound.',
    verify:
      'Add a test that pushes the oracle and asserts that the borrow limit does not increase beyond the pre-manipulation value.',
    logCheck:
      'Compare borrow events against oracle update events in the same block; a borrow immediately after a price write is the exposure signature.',
  },
  'access-control': {
    fn: 'emergencyWithdraw',
    behaviour:
      'a fund-moving privileged function is missing its authorisation modifier, so any address can call it',
    precondition:
      'the entry point that moves value has no owner/role check, and the caller can name an arbitrary recipient',
    containment:
      'Remove or pause the unguarded entry point, and rotate any authority that could have been used while it was open.',
    fix:
      'Apply the existing onlyOwner/role modifier to the fund-moving path and add a negative test for every privileged function.',
    verify:
      'Add a test that calls each privileged function from a non-owner address and asserts a revert.',
    logCheck:
      'Filter for calls to the unguarded selector from addresses that never held the role, then trace the recipient balances.',
  },
  'flash-loan': {
    fn: 'flashLoan',
    behaviour:
      'solvency is derived from a balance that a flash loan can inflate inside the same transaction',
    precondition:
      'the protocol trusts an atomic, same-transaction balance instead of a time-weighted or capped measure',
    containment:
      'Disable borrowing against the affected market and cap exposure per block.',
    fix:
      'Use a TWAP with a meaningful window for pricing, or enforce per-block borrow caps that a single transaction cannot exceed.',
    verify:
      'Add a test that flash-borrows, manipulates the pool, and asserts the borrow limit stays bounded.',
    logCheck:
      'Look for a large atomic borrow followed by a price move and a second borrow in the same transaction.',
  },
  'delegatecall-injection': {
    fn: 'execute',
    behaviour:
      'the contract delegatecalls an implementation address supplied by the caller, so the callee writes into the host storage',
    precondition:
      'the implementation is not validated against an immutable registry before delegatecall',
    containment:
      'Freeze upgrades and the execute path, and snapshot current storage for comparison.',
    fix:
      'Delegatecall only to implementations from an immutable registry, and validate the target before the call.',
    verify:
      'Add a test that executes a malicious implementation and asserts the host storage is untouched.',
    logCheck:
      'Find delegatecall frames whose target is not in the registry, then diff storage slots written during those calls.',
  },
  'self-destruct': {
    fn: 'destroy',
    behaviour:
      'the destruction path trusts a mutable owner slot that an unauthorised caller can rewrite',
    precondition:
      'ownership can be reassigned without a timelock, and destruction force-transfers the whole balance',
    containment:
      'Move remaining funds out of the contract and remove the destroy path from the deployed bytecode.',
    fix:
      'Gate ownership changes behind a timelock and a multisig, and remove SELFDESTRUCT in favour of an accounting migration.',
    verify:
      'Add a test that attempts to rewrite ownership from a non-owner and asserts a revert.',
    logCheck:
      'Search for ownership-change events followed by a destruction or balance sweep in the same block.',
  },
};

const DEFAULT_GUIDANCE: VectorGuidance = {
  fn: 'entry point',
  behaviour: 'a state-changing path reached by an untrusted caller violates the protocol invariant',
  precondition: 'the invariant is enforced on one path but not on the path the attacker used',
  containment: 'Pause the affected entry point and move remaining funds out of reach.',
  fix: 'Encode the invariant as an explicit check in every state-changing path.',
  verify: 'Add a test that attempts to violate the invariant and asserts a revert.',
  logCheck: 'Compare the affected events against the expected invariant for the same period.',
};

function guidanceFor(vectorId: AttackVectorId): VectorGuidance {
  return GUIDANCE[vectorId] ?? DEFAULT_GUIDANCE;
}

function contractFileFor(contract: string): string {
  if (!contract || contract === 'unknown') return 'not recorded in the trace (source path unavailable)';
  const rel = `contracts/src/${contract}.sol`;
  return existsSync(path.join(repoRoot(), rel))
    ? rel
    : `not recorded in the trace (expected at ${rel})`;
}

function topFinding(report: ForensicReport) {
  return report.findings[0];
}

function topSuspicious(analysis: SessionAnalysis) {
  return [...analysis.suspicious].sort((a, b) => b.confidence - a.confidence)[0];
}

function entryFunction(analysis: SessionAnalysis, vectorId: AttackVectorId, txIndex?: number): string {
  if (txIndex !== undefined) {
    const repeated = analysis.signals.repeatedCalls
      .filter((r) => r.transactionIndex === txIndex)
      .sort((a, b) => b.count - a.count)[0];
    if (repeated) return repeated.pair.split('::')[1] ?? guidanceFor(vectorId).fn;
  }
  return guidanceFor(vectorId).fn;
}

export function buildClientPlan(
  analysis: SessionAnalysis,
  report: ForensicReport,
  evidence: PlanEvidence = {},
): ClientPlan {
  const artifact = evidence.artifact ?? null;
  const vectorId = resolveAttackVectorId(artifact?.attackVector ?? report.findings[0]?.vectorId ?? 'logic-error');
  const vector = ATTACK_VECTORS[vectorId];
  const guidance = guidanceFor(vectorId);
  const suspicious = topSuspicious(analysis);
  const txIndex = suspicious?.index ?? analysis.attackTxIndex;
  const contract = artifact?.contractName ?? extractContract(report) ?? 'unknown';
  const fn = entryFunction(analysis, vectorId, txIndex);
  const lossEth = artifact?.lossEth ?? report.lossEth ?? '0';
  const lossUsd = report.lossUsd > 0 ? report.lossUsd : null;

  const actions: ClientPlanAction[] = [
    {
      order: 1,
      title: 'Contain',
      detail: guidance.containment,
    },
    {
      order: 2,
      title: 'Fix the code',
      detail: `${guidance.fix} The defect is in ${contract}.${fn}().`,
    },
    {
      order: 3,
      title: 'Prove the fix',
      detail: guidance.verify,
    },
    {
      order: 4,
      title: 'Measure historical exposure',
      detail: guidance.logCheck,
    },
  ];

  const unknowns = [
    'This is a local Foundry reproduction. It proves the flaw is exploitable; it does not prove the live deployment was exploited.',
    'The analysis works from the recorded call trace and structured artifact. The deployed bytecode may differ from the source audited here.',
    lossUsd === null
      ? 'No USD loss figure is attached to this case; the ETH figure is measured from the simulated state delta.'
      : 'The USD figure is the case estimate; the ETH figure is measured from the simulated state delta.',
  ];
  if (analysis.transactions.length > 1) {
    unknowns.push(
      `Transactions are segmented from the test contract's top-level calls (${analysis.transactions.length} in this run). Internal calls, gas refunds and validator ordering are not modelled.`,
    );
  }

  const plan: ClientPlan = {
    caseRef: report.caseRef,
    scenario: evidence.scenario ?? report.caseRef,
    vectorId,
    vectorLabel: vector.label,
    severity: report.severity,
    whereFlaw: {
      contract,
      function: fn,
      file: contractFileFor(contract),
      behaviour: artifact?.rootCause || guidance.behaviour,
      rootCause: topFinding(report)?.rationale ?? guidance.precondition,
    },
    whyExploitable: guidance.precondition,
    cost: {
      lossEth,
      lossUsd,
      asset: 'ETH',
      note:
        lossUsd === null
          ? 'Measured from the simulated balance delta; no USD valuation is attached.'
          : 'ETH measured from the simulated balance delta; USD from the incident record.',
    },
    actions,
    unknowns,
    transaction: suspicious
      ? { index: suspicious.index, confidence: suspicious.confidence, reasons: suspicious.reasons }
      : undefined,
    markdown: '',
  };

  plan.markdown = clientPlanToMarkdown(plan);
  return plan;
}

function extractContract(report: ForensicReport): string | null {
  const scope = report.sections.find((s) => /scope/i.test(s.heading));
  if (!scope) return null;
  const m = scope.body.match(/Target contract:\s*([A-Za-z0-9_$]+)/);
  return m ? m[1] : null;
}

export function clientPlanToMarkdown(plan: ClientPlan): string {
  const out: string[] = [];
  out.push(`# Client remediation plan — ${plan.caseRef}`);
  out.push('');
  out.push(
    `**Attack class:** ${plan.vectorLabel}  `,
    `**Severity:** ${plan.severity.toUpperCase()}  `,
    `**Target:** ${plan.whereFlaw.contract} (${plan.whereFlaw.file})`,
  );
  if (plan.transaction) {
    out.push(
      `**Transaction:** index ${plan.transaction.index} — ${Math.round(plan.transaction.confidence * 100)}% confidence`,
    );
  }
  out.push('');

  out.push('## Where the flaw was');
  out.push('');
  out.push(`**Contract:** \`${plan.whereFlaw.contract}\``);
  out.push('');
  out.push(`**Function:** \`${plan.whereFlaw.function}()\``);
  out.push('');
  out.push(`**File:** \`${plan.whereFlaw.file}\``);
  out.push('');
  out.push(`**What is wrong:** ${plan.whereFlaw.behaviour}`);
  out.push('');
  out.push(`**Why the detector fired:** ${plan.whereFlaw.rootCause}`);
  out.push('');

  out.push('## Why it was exploitable');
  out.push('');
  out.push(plan.whyExploitable.charAt(0).toUpperCase() + plan.whyExploitable.slice(1));
  out.push('');

  out.push('## What it cost');
  out.push('');
  out.push(`- **${plan.cost.lossEth} ETH** left the victim contract.`);
  if (plan.cost.lossUsd !== null) {
    out.push(`- Case estimate: **$${plan.cost.lossUsd.toLocaleString('en-US')}**.`);
    out.push('- The ETH figure is measured from the simulated balance delta; the USD figure comes from the incident record.');
  } else {
    out.push('- No USD valuation is attached to this case; the ETH figure is measured from the simulated balance delta.');
  }
  out.push('');

  out.push('## What to do Monday morning');
  out.push('');
  for (const action of plan.actions) {
    out.push(`${action.order}. **${action.title}.** ${action.detail}`);
    out.push('');
  }

  if (plan.transaction) {
    out.push('## Evidence the plan rests on');
    out.push('');
    for (const reason of plan.transaction.reasons) out.push(`- ${reason}`);
    out.push('');
  }

  out.push('## What is still unknown');
  out.push('');
  for (const unknown of plan.unknowns) out.push(`- ${unknown}`);
  out.push('');
  out.push('---');
  out.push('');
  out.push('_Generated by MAYALL — forensic pipeline. The client plan is derived from the raw trace and artifact in this run folder._');
  return out.join('\n');
}

interface RemediationSnippet {
  before: string;
  after: string;
  note: string;
}

function snippetFor(vectorId: AttackVectorId, contract: string, fn: string): RemediationSnippet {
  switch (vectorId) {
    case 'reentrancy':
      return {
        before: `function withdraw() external {\n    uint256 bal = balances[msg.sender];\n    require(bal > 0, "nothing to withdraw");\n\n    (bool ok,) = msg.sender.call{value: bal}("");\n    require(ok, "transfer failed");\n\n    balances[msg.sender] = 0;   // <-- too late\n}`,
        after: `function withdraw() external nonReentrant {\n    uint256 bal = balances[msg.sender];\n    require(bal > 0, "nothing to withdraw");\n\n    balances[msg.sender] = 0;   // effect first\n    totalWithdrawn += bal;\n\n    (bool ok,) = msg.sender.call{value: bal}("");\n    require(ok, "transfer failed");\n}`,
        note: 'Checks-effects-interactions plus an OpenZeppelin ReentrancyGuard on every value-moving function.',
      };
    case 'oracle-manipulation':
      return {
        before: `function valueOf(address who) public view returns (uint256) {\n    return units[who] * oracle.price() * LTV_BPS / 10000;\n}`,
        after: `function valueOf(address who) public view returns (uint256) {\n    uint256 p = twap.price();                 // manipulation-resistant\n    require(p <= lastGood * MAX_DEVIATION / 1e18, "price deviation");\n    return units[who] * p * LTV_BPS / 10000;\n}`,
        note: 'Price from a TWAP/Chainlink feed with a deviation bound; never from a spot value the caller can push.',
      };
    case 'access-control':
      return {
        before: `function emergencyWithdraw(address payable to, uint256 amount) external {\n    require(amount <= address(this).balance, "insufficient");\n    (bool ok,) = to.call{value: amount}("");\n    require(ok, "transfer failed");\n}`,
        after: `function emergencyWithdraw(address payable to, uint256 amount) external onlyOwner {\n    require(amount <= address(this).balance, "insufficient");\n    (bool ok,) = to.call{value: amount}("");\n    require(ok, "transfer failed");\n}`,
        note: `Restore the authorisation modifier on ${contract}.${fn}() and add a negative test per privileged path.`,
      };
    case 'delegatecall-injection':
      return {
        before: `function execute(address implementation, bytes calldata data) external {\n    (bool ok,) = implementation.delegatecall(data);\n    require(ok, "delegatecall failed");\n}`,
        after: `function execute(bytes calldata data) external {\n    address implementation = registry.current();\n    require(implementation != address(0), "no implementation");\n    (bool ok,) = implementation.delegatecall(data);\n    require(ok, "delegatecall failed");\n}`,
        note: 'Remove the caller-supplied implementation; resolve it from an immutable registry.',
      };
    case 'flash-loan':
      return {
        before: `function borrowLimit(address who) public view returns (uint256) {\n    return collateral[who] * poolBalanceRatio() / 1e18;\n}`,
        after: `function borrowLimit(address who) public view returns (uint256) {\n    uint256 ratio = oracle.twapRatio();              // not same-tx spot\n    uint256 limit = collateral[who] * ratio / 1e18;\n    return limit > blockCap ? blockCap : limit;       // per-block cap\n}`,
        note: 'Remove same-transaction balance dependence and impose a per-block cap.',
      };
    case 'self-destruct':
      return {
        before: `function destroy() external {\n    selfdestruct(payable(owner));\n}`,
        after: `function sweep(address payable to) external onlyOwner {\n    uint256 bal = address(this).balance;\n    (bool ok,) = to.call{value: bal}("");\n    require(ok, "transfer failed");\n}`,
        note: 'Remove SELFDESTRUCT; migrate to an explicit, guarded sweep or an accounting migration.',
      };
    default:
      return {
        before: `// ${contract}.${fn}() enforces the invariant on one path only`,
        after: `// Encode the invariant as an explicit require() in every state-changing path`,
        note: 'Add the missing invariant check and a regression test that attempts to violate it.',
      };
  }
}

/** Code-level remediation for the run, rendered as Markdown. */
export function buildRemediationMarkdown(
  analysis: SessionAnalysis,
  report: ForensicReport,
  evidence: PlanEvidence = {},
): string {
  const artifact = evidence.artifact ?? null;
  const vectorId = resolveAttackVectorId(artifact?.attackVector ?? report.findings[0]?.vectorId ?? 'logic-error');
  const vector = ATTACK_VECTORS[vectorId];
  const contract = artifact?.contractName ?? extractContract(report) ?? 'unknown';
  const suspicious = topSuspicious(analysis);
  const fn = entryFunction(analysis, vectorId, suspicious?.index);
  const snippet = snippetFor(vectorId, contract, fn);
  const file = contractFileFor(contract);

  const out: string[] = [];
  out.push(`# Remediation — ${vector.label}`);
  out.push('');
  out.push(
    `**Case:** ${report.caseRef}  `,
    `**Contract:** \`${contract}\`  `,
    `**File:** \`${file}\`  `,
    `**Entry point:** \`${fn}()\`  `,
    `**Severity:** ${report.severity.toUpperCase()}`,
  );
  out.push('');

  out.push('## The defect');
  out.push('');
  out.push(artifact?.rootCause ?? snippet.note);
  out.push('');

  out.push('## Patch');
  out.push('');
  out.push('Current behaviour:');
  out.push('');
  out.push('```solidity');
  out.push(snippet.before);
  out.push('```');
  out.push('');
  out.push('Corrected behaviour:');
  out.push('');
  out.push('```solidity');
  out.push(snippet.after);
  out.push('```');
  out.push('');
  out.push(snippet.note);
  out.push('');

  out.push('## Regression test');
  out.push('');
  out.push('```solidity');
  out.push(`function testCannotReenter() public {\n    // Deploy ${contract}, fund it, then attack from a contract receiver.\n    uint256 before = address(vault).balance;\n    attacker.attack(6);\n    assertEq(address(vault).balance, before, "vault balance must not move");\n}`);
  out.push('```');
  out.push('');

  out.push('## Detection after the fix');
  out.push('');
  out.push(`- Run \`forge test --match-path test/LongSession.t.sol\` and confirm the session reports zero suspicious transactions.`);
  out.push(`- Run \`forge lint\` and clear the \`reentrancy-eth\`, \`arbitrary-send-eth\` and \`missing-zero-check\` findings on \`${contract}\`.`);
  out.push('');
  out.push('---');
  out.push('');
  out.push('_Generated by MAYALL — see plan/client-plan.md for the client-facing actions._');
  return out.join('\n');
}
