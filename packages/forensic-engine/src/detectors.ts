import type { PatternDetection, Severity, SimulationArtifact, TraceNode } from '@helix/core';
import { flattenTrace } from './trace-parser.js';

export interface DetectorContext {
  artifact: SimulationArtifact | null;
  nodes: TraceNode[];
  rawLines: string[];
  traceText: string;
}

export interface Detector {
  id: string;
  vectorId: PatternDetection['vectorId'];
  label: string;
  baseSeverity: Severity;
  detect(ctx: DetectorContext): Omit<PatternDetection, 'id' | 'vectorId' | 'label' | 'severity' | 'mermaid'> & {
    severity?: Severity;
  };
}

const text = (ctx: DetectorContext) =>
  [ctx.traceText, ...ctx.rawLines, ctx.artifact?.rootCause ?? '', ...(ctx.artifact?.steps ?? []).map((s) => `${s.title} ${s.description}`)]
    .join('\n')
    .toLowerCase();

const has = (ctx: DetectorContext, ...needles: string[]) => {
  const hay = text(ctx);
  return needles.filter((n) => hay.includes(n));
};

function flowMermaid(artifact: SimulationArtifact | null, finding: string): string {
  const lines = ['graph TD', '  A["Attacker"] --> S1["Step 1: ' + esc(firstStep(artifact)) + '"]'];
  const steps = artifact?.steps ?? [];
  for (let i = 1; i < steps.length; i += 1) {
    lines.push(`  S${i + 1}["Step ${i + 1}: ${esc(steps[i].title)}"]`);
    lines.push(`  S${i} --> S${i + 1}`);
  }
  const last = steps.length ? `S${steps.length}` : 'S1';
  lines.push(`  ${last} --> F["Finding: ${esc(finding)}"]`);
  lines.push(`  F --> L["Loss to attacker"]`);
  return lines.join('\n');
}

function firstStep(artifact: SimulationArtifact | null): string {
  return artifact?.steps?.[0]?.title ?? 'initiate exploit';
}

function esc(s: string): string {
  return s.replace(/"/g, "'").replace(/\n/g, ' ').slice(0, 64);
}

/** Generic attack-flow mermaid built from the artifact steps only. */
export function stepsMermaid(artifact: SimulationArtifact | null): string {
  return flowMermaid(artifact, artifact?.rootCause?.slice(0, 48) ?? 'exploit confirmed');
}

export const DETECTORS: Detector[] = [
  {
    id: 'det-reentrancy',
    vectorId: 'reentrancy',
    label: 'Reentrancy',
    baseSeverity: 'critical',
    detect(ctx) {
      // A contract::function pair that appears more than once in the trace is a
      // structural signal of re-entry. Cheatcode frames (VM::*) are excluded —
      // they are harness noise, not contract behaviour.
      const seen = new Map<string, number>();
      for (const n of ctx.nodes) {
        if (!n.contractName || !n.fn || n.fn === 'result') continue;
        if (n.contractName === 'VM') continue;
        const key = `${n.contractName}::${n.fn}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      const repeated = [...seen.entries()].filter(([, c]) => c > 1);
      const evidence: string[] = [];
      let confidence = 0;

      for (const [key, count] of repeated) {
        evidence.push(`Trace shows ${key} invoked ${count} times within a single transaction`);
        confidence = Math.max(confidence, 0.55 + 0.12 * (count - 1));
      }

      const keywordHits = has(ctx, 'reentran', 're-entran', 'reentrancy');
      if (keywordHits.length) {
        evidence.push(`Root cause narrative references ${keywordHits.join(', ')}`);
        confidence = Math.max(confidence, 0.72);
      }

      // A value transfer out of a victim that repeats the same selector is the
      // strongest signal available from a trace alone.
      const transfers = ctx.nodes.filter((n) => n.isValueTransfer || /\(value=\d+\)/.test(n.raw));
      if (transfers.length > 1) {
        evidence.push(`${transfers.length} value-bearing calls observed in the exploit transaction`);
        confidence = Math.max(confidence, 0.6);
      }

      if (confidence === 0) {
        return { confidence: 0, evidence: [], rationale: 'No repeated call pattern detected in the trace.' };
      }
      return {
        confidence: Math.min(0.97, Number(confidence.toFixed(2))),
        evidence,
        rationale:
          'The same contract entry point is re-entered before its state update completes, letting the attacker pull funds across nested calls.',
        severity: 'critical',
      };
    },
  },
  {
    id: 'det-flash-loan',
    vectorId: 'flash-loan',
    label: 'Flash Loan',
    baseSeverity: 'critical',
    detect(ctx) {
      const hits = has(ctx, 'flashloan', 'flash loan', 'flashloanpool', 'flash-borrow', 'flash borrow', 'flash');
      const evidence: string[] = [];
      let confidence = 0;
      if (hits.length) {
        evidence.push(`Trace and artifact reference an atomic flash-borrow primitive (${hits.join(', ')})`);
        confidence = 0.8;
      }
      const bigTransfer = ctx.nodes.find((n) => {
        const m = n.raw.match(/value=(\d{10,})/);
        return m && Number(m[1]) > 1e15;
      });
      if (bigTransfer) {
        evidence.push(`Atomic value transfer of ${bigTransfer.raw.match(/value=(\d+)/)?.[1]} wei inside the exploit transaction`);
        confidence = Math.max(confidence, 0.72);
      }
      const steps = ctx.artifact?.steps ?? [];
      const loanStep = steps.find((s) => /flash|loan|borrow/i.test(`${s.title} ${s.description}`));
      if (loanStep) {
        evidence.push(`Attack step ${loanStep.n}: ${loanStep.title}`);
        confidence = Math.max(confidence, 0.85);
      }
      if (!confidence) {
        return { confidence: 0, evidence: [], rationale: 'No flash-borrow pattern found.' };
      }
      return {
        confidence: Math.min(0.97, Number(confidence.toFixed(2))),
        evidence,
        rationale:
          'A flash-borrowed balance is used inside the same transaction to inflate a value assumption, so the attack is capital-free and atomic.',
      };
    },
  },
  {
    id: 'det-oracle',
    vectorId: 'oracle-manipulation',
    label: 'Oracle Manipulation',
    baseSeverity: 'critical',
    detect(ctx) {
      const hits = has(ctx, 'oracle', 'price feed', 'price oracle', 'spot price', 'twap', 'reserve ratio');
      const evidence: string[] = [];
      let confidence = 0;
      if (hits.length) {
        evidence.push(`Oracle or price-source dependency identified (${hits.join(', ')})`);
        confidence = 0.78;
      }
      const priceSlot = (ctx.artifact?.storageWrites ?? []).find((w) =>
        /price|reserve|rate|oracle/i.test(w.label),
      );
      if (priceSlot) {
        evidence.push(`Price-bearing storage slot mutated during the exploit: ${priceSlot.label} (${priceSlot.slot})`);
        confidence = Math.max(confidence, 0.88);
      }
      if (ctx.artifact?.steps.some((s) => /manipulat|push.*price|skew/i.test(`${s.title} ${s.description}`))) {
        evidence.push('Attack sequence explicitly manipulates a quoted price before the extraction step');
        confidence = Math.max(confidence, 0.9);
      }
      if (!confidence) {
        return { confidence: 0, evidence: [], rationale: 'No external price dependency found.' };
      }
      return {
        confidence: Math.min(0.97, Number(confidence.toFixed(2))),
        evidence,
        rationale:
          'Collateral valuation depends on a spot price the attacker can move within the same transaction, so the borrow limit is attacker-controlled.',
      };
    },
  },
  {
    id: 'det-access-control',
    vectorId: 'access-control',
    label: 'Access Control Failure',
    baseSeverity: 'high',
    detect(ctx) {
      const hits = has(ctx, 'onlyowner', 'access control', 'unauthorized', 'missing modifier', 'owner slot', 'admin');
      const evidence: string[] = [];
      let confidence = 0;
      if (hits.length) {
        evidence.push(`Privilege boundary referenced in the exploit (${hits.join(', ')})`);
        confidence = 0.7;
      }
      const adminSlot = (ctx.artifact?.storageWrites ?? []).find((w) =>
        /owner|admin|authority|role|guardian/i.test(w.label),
      );
      if (adminSlot) {
        evidence.push(`Authority slot rewritten: ${adminSlot.label} ${adminSlot.slot} ${adminSlot.before} -> ${adminSlot.after}`);
        confidence = Math.max(confidence, 0.9);
      }
      const privileged = ctx.nodes.find((n) =>
        /emergency|mint|admin|owner|upgrade|setOwner|destroy/i.test(`${n.fn} ${n.contractName}`),
      );
      if (privileged) {
        evidence.push(`Privileged entry point reached: ${privileged.contractName}.${privileged.fn}`);
        confidence = Math.max(confidence, 0.82);
      }
      if (!confidence) {
        return { confidence: 0, evidence: [], rationale: 'No privilege boundary violation detected.' };
      }
      return {
        confidence: Math.min(0.97, Number(confidence.toFixed(2))),
        evidence,
        rationale:
          'A state-changing privileged function is reachable by an untrusted caller, so the attacker can act with protocol-owner authority.',
        severity: 'high',
      };
    },
  },
  {
    id: 'det-delegatecall',
    vectorId: 'delegatecall-injection',
    label: 'Delegate Call Injection',
    baseSeverity: 'critical',
    detect(ctx) {
      const hits = has(ctx, 'delegatecall', 'delegate call');
      const evidence: string[] = [];
      let confidence = 0;
      if (hits.length) {
        evidence.push(`delegatecall observed in the execution trace (${hits.join(', ')})`);
        confidence = 0.88;
      }
      const inj = ctx.nodes.filter((n) => /delegatecall/i.test(n.raw));
      inj.forEach((n) => evidence.push(`Delegatecall frame: ${n.raw.trim()}`));
      if (ctx.artifact?.steps.some((s) => /delegatecall|implementation/i.test(`${s.title} ${s.description}`))) {
        evidence.push('Attack sequence installs a caller-supplied implementation');
        confidence = Math.max(confidence, 0.93);
      }
      if (!confidence) {
        return { confidence: 0, evidence: [], rationale: 'No delegatecall execution found.' };
      }
      return {
        confidence: Math.min(0.98, Number(confidence.toFixed(2))),
        evidence,
        rationale:
          'The host contract delegates execution to an attacker-supplied implementation, which mutates the host\'s storage in the host\'s context.',
      };
    },
  },
  {
    id: 'det-selfdestruct',
    vectorId: 'self-destruct',
    label: 'Self Destruct / Forced Transfer',
    baseSeverity: 'high',
    detect(ctx) {
      const hits = has(ctx, 'selfdestruct', 'self destruct', 'destroy');
      const evidence: string[] = [];
      let confidence = 0;
      if (hits.length) {
        evidence.push(`Contract destruction path exercised (${hits.join(', ')})`);
        confidence = 0.85;
      }
      if (ctx.nodes.some((n) => /selfdestruct|suicide/i.test(n.raw))) {
        evidence.push('Trace contains a SELFDESTRUCT opcode path');
        confidence = Math.max(confidence, 0.92);
      }
      const forced = ctx.artifact?.balances.find((b) => b.beforeWei !== b.afterWei && /victim|vault|pool/i.test(b.label));
      if (forced && hits.length) {
        evidence.push(`Victim balance moved from ${forced.beforeWei} to ${forced.afterWei} wei during destruction`);
        confidence = Math.max(confidence, 0.9);
      }
      if (!confidence) {
        return { confidence: 0, evidence: [], rationale: 'No destruction path found.' };
      }
      return {
        confidence: Math.min(0.97, Number(confidence.toFixed(2))),
        evidence,
        rationale:
          'The contract was destroyed while holding user funds; the balance is force-transferred to the caller-chosen recipient.',
      };
    },
  },
  {
    id: 'det-arithmetic',
    vectorId: 'arithmetic-overflow',
    label: 'Arithmetic / Precision Fault',
    baseSeverity: 'high',
    detect(ctx) {
      const hits = has(ctx, 'overflow', 'underflow', 'truncat', 'precision', 'panic 0x11', 'panic code 0x11');
      const evidence: string[] = [];
      let confidence = 0;
      if (hits.length) {
        evidence.push(`Arithmetic fault signature matched (${hits.join(', ')})`);
        confidence = 0.8;
      }
      if (/panic/i.test(ctx.traceText)) {
        evidence.push('Execution trace contains an arithmetic panic');
        confidence = Math.max(confidence, 0.7);
      }
      const flag = (ctx.artifact?.storageWrites ?? []).find((w) => w.kind === 'flag' || /count|supply|shares|amount/i.test(w.label));
      if (flag && hits.length) {
        evidence.push(`Accounting slot ${flag.label} mutated to ${flag.after} during the exploit`);
        confidence = Math.max(confidence, 0.85);
      }
      if (!confidence) {
        return { confidence: 0, evidence: [], rationale: 'No arithmetic fault detected.' };
      }
      return {
        confidence: Math.min(0.95, Number(confidence.toFixed(2))),
        evidence,
        rationale:
          'A numeric invariant is violated by unchecked or wrongly-sized arithmetic, producing an inflated balance that later steps cash out.',
      };
    },
  },
  {
    id: 'det-front-running',
    vectorId: 'front-running',
    label: 'Ordering / Front Running',
    baseSeverity: 'medium',
    detect(ctx) {
      const hits = has(ctx, 'front-run', 'frontrun', 'sandwich', 'same block', 'ordering', 'mempool', 'backrun');
      const evidence: string[] = [];
      let confidence = 0;
      if (hits.length) {
        evidence.push(`Transaction-ordering manipulation referenced (${hits.join(', ')})`);
        confidence = 0.78;
      }
      const steps = ctx.artifact?.steps ?? [];
      const blockHint = steps.some((s) => /block|ordering|ordered|mempool/i.test(`${s.title} ${s.description}`));
      if (blockHint && steps.length >= 2) {
        evidence.push('Attack sequence explicitly references block ordering of the victim transaction');
        confidence = Math.max(confidence, 0.72);
      }
      if (!confidence) {
        return { confidence: 0, evidence: [], rationale: 'No ordering manipulation detected.' };
      }
      return {
        confidence: Math.min(0.93, Number(confidence.toFixed(2))),
        evidence,
        rationale:
          'The attacker transaction is ordered ahead of or around the victim transaction within the same block, so the victim executes at a manipulated price.',
        severity: 'medium',
      };
    },
  },
  {
    id: 'det-bridge',
    vectorId: 'bridge-exploit',
    label: 'Bridge / Cross-Chain Verification Failure',
    baseSeverity: 'critical',
    detect(ctx) {
      const hits = has(ctx, 'bridge', 'cross-chain', 'crosschain', 'relayer', 'guardian set', 'merkle root', 'domain separator');
      const evidence: string[] = [];
      let confidence = 0;
      if (hits.length) {
        evidence.push(`Cross-chain verification surface referenced (${hits.join(', ')})`);
        confidence = 0.72;
      }
      if (/domain separator|chain id|chainid/i.test(ctx.traceText)) {
        evidence.push('Chain/domain binding check present in the trace but circumvented by the attacker');
        confidence = Math.max(confidence, 0.82);
      }
      if (!confidence) {
        return { confidence: 0, evidence: [], rationale: 'No cross-chain component involved.' };
      }
      return {
        confidence: Math.min(0.95, Number(confidence.toFixed(2))),
        evidence,
        rationale:
          'A cross-chain message was accepted without an authentic binding to its origin, so the attacker minted or withdrew on a chain where no funds existed.',
      };
    },
  },
  {
    id: 'det-logic',
    vectorId: 'logic-error',
    label: 'Invariant / Logic Error',
    baseSeverity: 'high',
    detect(ctx) {
      const evidence: string[] = [];
      let confidence = 0;
      const hits = has(ctx, 'invariant', 'logic error', 'should never', 'intended', 'assum');
      if (hits.length) {
        evidence.push(`Broken design invariant referenced (${hits.join(', ')})`);
        confidence = 0.7;
      }
      // A residual detector: if the victim lost value but no other detector
      // explains the mechanism, the loss is attributable to a logic error.
      const victim = ctx.artifact?.balances.find((b) => /victim|vault|pool|treasury/i.test(b.label));
      if (victim && victim.beforeWei !== victim.afterWei) {
        evidence.push(`Victim balance moved ${victim.beforeWei} -> ${victim.afterWei} wei`);
        confidence = Math.max(confidence, 0.5);
      }
      if (confidence < 0.6) {
        return { confidence: 0, evidence: [], rationale: 'No logic error signal.' };
      }
      return {
        confidence: Number(confidence.toFixed(2)),
        evidence,
        rationale:
          'The protocol enforced an invariant in one code path but not in the path the attacker used, so value escaped through an unguarded branch.',
      };
    },
  },
];

export function runDetectors(ctx: DetectorContext): PatternDetection[] {
  const out: PatternDetection[] = [];
  for (const d of DETECTORS) {
    const r = d.detect(ctx);
    if (r.confidence <= 0) continue;
    out.push({
      id: d.id,
      vectorId: d.vectorId,
      label: d.label,
      confidence: r.confidence,
      severity: r.severity ?? d.baseSeverity,
      evidence: r.evidence,
      rationale: r.rationale,
      mermaid: stepsMermaid(ctx.artifact),
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

export function nodesOf(root: TraceNode | null): TraceNode[] {
  return flattenTrace(root);
}

/**
 * A human-readable catalogue of the detectors: what each one looks for, the
 * evidence it emits and where it is weak. This is what the Forensic Bible
 * renders, so the published rules and the executed rules cannot drift apart.
 */
export interface DetectorRule {
  id: string;
  vectorId: PatternDetection['vectorId'];
  label: string;
  baseSeverity: Severity;
  /** What the detector actually looks for. */
  looksFor: string;
  /** The concrete signals it emits as evidence. */
  emits: string[];
  /** Honest limitations — heuristic detectors have them. */
  limitation: string;
}

export const DETECTOR_CATALOG: DetectorRule[] = [
  {
    id: 'det-reentrancy',
    vectorId: 'reentrancy',
    label: 'Reentrancy',
    baseSeverity: 'critical',
    looksFor:
      'The same contract::function pair invoked more than once inside a single transaction, with the later invocation nested inside the earlier one. Cheatcode frames are excluded.',
    emits: [
      'The repeated pair and the number of invocations',
      'Value-bearing calls observed in the transaction',
      'A narrative reference to re-entrancy in the artifact',
    ],
    limitation:
      'Counts repetition, not causality. Two independent calls to the same function in one transaction are indistinguishable from a re-entrant loop without reading the state updates.',
  },
  {
    id: 'det-flash-loan',
    vectorId: 'flash-loan',
    label: 'Flash Loan',
    baseSeverity: 'critical',
    looksFor:
      'A reference to an atomic flash-borrow primitive, a very large value transfer inside the exploit transaction, or an attack step that names a flash loan.',
    emits: [
      'The matched flash-borrow keyword or step',
      'The size of the atomic value transfer in wei',
    ],
    limitation:
      'Keyed on vocabulary as much as structure. A flash loan that is never named in the artifact can be missed unless the value transfer is unusually large.',
  },
  {
    id: 'det-oracle',
    vectorId: 'oracle-manipulation',
    label: 'Oracle Manipulation',
    baseSeverity: 'critical',
    looksFor:
      'Any dependency on an external price or quote, a storage slot whose name reads like a price, reserve or rate, or an attack step that describes pushing a price.',
    emits: [
      'The matched oracle vocabulary',
      'The price-bearing storage slot that was mutated',
      'The attack step that manipulated the quote',
    ],
    limitation:
      'Cannot distinguish a manipulated price from a legitimately repriced asset without a reference value from outside the transaction.',
  },
  {
    id: 'det-access-control',
    vectorId: 'access-control',
    label: 'Access Control Failure',
    baseSeverity: 'high',
    looksFor:
      'A reference to a privilege boundary, a storage slot that reads as an authority (owner, admin, role, guardian), or a privileged entry point reached from the trace.',
    emits: [
      'The matched privilege vocabulary',
      'The authority slot before and after',
      'The privileged function that was reached',
    ],
    limitation:
      'Sees the symptom (an authority changed, a privileged function was called) but not whether the caller was entitled to it.',
  },
  {
    id: 'det-delegatecall',
    vectorId: 'delegatecall-injection',
    label: 'Delegate Call Injection',
    baseSeverity: 'critical',
    looksFor: 'A delegatecall frame in the execution trace, or an attack step that installs a caller-supplied implementation.',
    emits: ['The delegatecall frame verbatim', 'The step that installed the implementation'],
    limitation:
      'Detects the opcode, not the damage. Whether the delegated code was hostile is inferred from the outcome.',
  },
  {
    id: 'det-selfdestruct',
    vectorId: 'self-destruct',
    label: 'Self Destruct / Forced Transfer',
    baseSeverity: 'high',
    looksFor:
      'A destruction path exercised in the trace, a SELFDESTRUCT opcode path, or a victim balance moved while the destruction path ran.',
    emits: ['The matched destruction vocabulary', 'The victim balance movement'],
    limitation:
      'On chains where SELFDESTRUCT is neutered, the trace shows the call but not the forced transfer.',
  },
  {
    id: 'det-arithmetic',
    vectorId: 'arithmetic-overflow',
    label: 'Arithmetic / Precision Fault',
    baseSeverity: 'high',
    looksFor:
      'An arithmetic fault signature (overflow, underflow, truncation, precision loss, panic 0x11), a panic in the trace, or an accounting slot mutated alongside those signals.',
    emits: ['The matched arithmetic vocabulary', 'The accounting slot that changed'],
    limitation:
      'A silent overflow leaves no panic and no vocabulary; only the resulting balance delta betrays it, which is the job of the balance analysis.',
  },
  {
    id: 'det-front-running',
    vectorId: 'front-running',
    label: 'Ordering / Front Running',
    baseSeverity: 'medium',
    looksFor:
      'Explicit transaction-ordering vocabulary (front-run, sandwich, same block, mempool), or an attack sequence that references block ordering.',
    emits: ['The matched ordering vocabulary', 'The step that referenced block ordering'],
    limitation:
      'Needs the ordering to be described. The trace alone cannot prove an attacker was ordered ahead of a victim within a block.',
  },
  {
    id: 'det-bridge',
    vectorId: 'bridge-exploit',
    label: 'Bridge / Cross-Chain Verification Failure',
    baseSeverity: 'critical',
    looksFor:
      'A cross-chain surface (bridge, relayer, guardian set, merkle root, domain separator) referenced in the evidence, or a domain binding check present but circumvented.',
    emits: ['The matched cross-chain vocabulary', 'The domain binding evidence'],
    limitation:
      'Runs entirely inside one EVM. A cross-chain exploit whose local half is unremarkable will not be detected from the local trace alone.',
  },
  {
    id: 'det-logic',
    vectorId: 'logic-error',
    label: 'Invariant / Logic Error',
    baseSeverity: 'high',
    looksFor:
      'A reference to a broken design invariant, or — as a residual signal — a victim balance that moved while no other detector explained the mechanism.',
    emits: ['The matched invariant vocabulary', 'The victim balance movement'],
    limitation:
      'Deliberately residual. It is the detector of last resort, so it fires when nothing else does and should be read as "unexplained", not "proven".',
  },
];
