import type { AttackVectorId, PatternDetection, SimulationArtifact, TraceNode } from '@helix/core';
import { runDetectors } from './detectors.js';
import { flattenTrace } from './trace-parser.js';

/** The artifact the long-session PoC writes: normal schema plus session meta. */
export interface SessionArtifact extends SimulationArtifact {
  txCount?: number;
  attackTxIndex?: number;
}

/** One top-level call made by the test contract, with its subtree. */
export interface Transaction {
  index: number;
  contractName: string;
  fn: string;
  address: string;
  gasUsed: number;
  valueWei: string;
  depth: number;
  childCalls: number;
  raw: string;
  node: TraceNode;
}

export interface SuspiciousTransaction {
  index: number;
  reasons: string[];
  confidence: number;
  vectorId?: AttackVectorId;
  label?: string;
}

export interface SessionSignals {
  repeatedCalls: { transactionIndex: number; pair: string; count: number }[];
  valueOut: { transactionIndex: number; victim: string; recipient: string; amountWei: string }[];
  slotMutations: { slot: string; label: string; kind: string; changed: boolean }[];
  oracleReads: { transactionIndex: number; contract: string; fn: string; reason: string }[];
}

export interface SessionAnalysis {
  transactions: Transaction[];
  suspicious: SuspiciousTransaction[];
  cleanCount: number;
  signals: SessionSignals;
  /** Present when the artifact declares where the attack was planted. */
  attackTxIndex?: number;
}

/** Confidence below which a per-transaction pattern finding is noise. */
export const CONFIDENCE_FLOOR = 0.6;

const VALUE_RE = /value:\s*(\d+)/;
const ETHER_RE = /\[\s*([\d.]+)\s*ether\s*\]/;

function weiFromEther(decimal: string): string {
  const [whole, frac = ''] = decimal.split('.');
  const padded = (frac + '0'.repeat(18)).slice(0, 18);
  return (BigInt(whole || '0') * 10n ** 18n + BigInt(padded || '0')).toString();
}

/** Best-effort value of a trace node, in wei, as a decimal string. */
export function nodeValueWei(node: TraceNode): string {
  const direct = node.raw.match(VALUE_RE);
  if (direct) return direct[1];
  const ether = node.raw.match(ETHER_RE);
  if (ether) return weiFromEther(ether[1]);
  return '0';
}

function isCheatcode(node: TraceNode): boolean {
  return node.contractName === 'VM' || node.contractName === 'Vm';
}

/**
 * Splits a forge trace into the top-level transactions the test contract made.
 * The root node is the test function; its direct children are the calls. Forge
 * renders harness frames (`VM::*` cheatcodes, return markers) among them, so
 * those are filtered out — they are not transactions.
 */
export function segmentTransactions(trace: TraceNode | null): Transaction[] {
  if (!trace) return [];
  const out: Transaction[] = [];
  for (const child of trace.children) {
    if (isCheatcode(child)) continue;
    if (!child.fn && !child.contractName && !child.address) continue;
    out.push({
      index: out.length,
      contractName: child.contractName,
      fn: child.fn,
      address: child.address,
      gasUsed: child.gasUsed,
      valueWei: nodeValueWei(child),
      depth: child.depth,
      childCalls: flattenTrace(child).length - 1,
      raw: child.raw,
      node: child,
    });
  }
  return out;
}

interface RepeatedPair {
  pair: string;
  count: number;
}

function repeatedPairs(nodes: TraceNode[]): RepeatedPair[] {
  const seen = new Map<string, number>();
  for (const n of nodes) {
    if (isCheatcode(n)) continue;
    if (!n.contractName || !n.fn) continue;
    const key = `${n.contractName}::${n.fn}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([pair, count]) => ({ pair, count }))
    .sort((a, b) => b.count - a.count);
}

interface ValueOut {
  victim: string;
  recipient: string;
  address: string;
  amountWei: string;
}

/**
 * Finds values that left the victim contract. A call that carries value is
 * attributed to its parent frame, so a `Vault::withdraw` whose child is
 * `Attacker::receive{value: ...}` is a value-out from the vault.
 */
function valueOutOf(nodes: TraceNode[], parentOf: Map<TraceNode, TraceNode>, victims: Set<string>): ValueOut[] {
  const out: ValueOut[] = [];
  for (const n of nodes) {
    const wei = nodeValueWei(n);
    if (wei === '0') continue;
    const parent = parentOf.get(n);
    if (!parent) continue;
    if (!victims.has(parent.contractName)) continue;
    if (parent.contractName === n.contractName) continue;
    out.push({
      victim: parent.contractName,
      recipient: n.contractName || n.address || 'unknown',
      address: n.address,
      amountWei: wei,
    });
  }
  return out;
}

function parentMap(root: TraceNode): Map<TraceNode, TraceNode> {
  const map = new Map<TraceNode, TraceNode>();
  const walk = (node: TraceNode) => {
    for (const child of node.children) {
      map.set(child, node);
      walk(child);
    }
  };
  walk(root);
  return map;
}

function fmtEth(wei: string): string {
  const value = BigInt(wei);
  const whole = value / 10n ** 18n;
  const frac = (value % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return `${whole}${frac ? `.${frac}` : ''} ETH`;
}

/**
 * Per-transaction triage. Each transaction is scored from three independent
 * signals: the engine's pattern detectors run over just that subtree, a
 * repeated (contract, function) pair nested inside the transaction, and value
 * leaving the victim contract to the contract that initiated the transaction.
 */
export function analyseSession(trace: TraceNode | null, artifact: SimulationArtifact | null): SessionAnalysis {
  const session = artifact as SessionArtifact | null;
  const transactions = segmentTransactions(trace);
  const victimNames = new Set<string>();
  if (artifact?.contractName) victimNames.add(artifact.contractName);
  const attackerAddress = (artifact?.attacker ?? '').toLowerCase();

  const suspicious: SuspiciousTransaction[] = [];
  const signals: SessionSignals = {
    repeatedCalls: [],
    valueOut: [],
    slotMutations: [],
    oracleReads: [],
  };

  for (const w of artifact?.storageWrites ?? []) {
    signals.slotMutations.push({ slot: w.slot, label: w.label, kind: w.kind, changed: w.before !== w.after });
  }

  for (const tx of transactions) {
    const nodes = flattenTrace(tx.node);
    const parentOf = parentMap(tx.node);
    const rawLines = nodes.map((n) => n.raw);
    const traceText = rawLines.join('\n');

    // Contract labels are identity, not behaviour. Leaving them in the text
    // would let a victim named "ReentrancyVault" satisfy the keyword detector
    // on every benign call, so the per-transaction HEURISTIC text is redacted.
    const labels = [...new Set(nodes.map((n) => n.contractName).filter(Boolean))];
    const redact = (value: string): string =>
      labels.reduce((acc, label) => acc.split(label).join('[contract]'), value);

    const findings: PatternDetection[] = runDetectors({
      artifact: null,
      nodes,
      rawLines: rawLines.map(redact),
      traceText: redact(traceText),
    });

    const reasons: string[] = [];
    let confidence = 0;
    let vectorId: AttackVectorId | undefined;
    let label: string | undefined;

    const top = findings.find((f) => f.confidence >= CONFIDENCE_FLOOR);
    if (top) {
      confidence = Math.max(confidence, top.confidence);
      vectorId = top.vectorId;
      label = top.label;
      reasons.push(`${top.label} pattern at ${Math.round(top.confidence * 100)}% confidence`);
      if (top.evidence[0]) reasons.push(top.evidence[0]);
    }

    const repeats = repeatedPairs(nodes);
    for (const repeat of repeats) {
      signals.repeatedCalls.push({ transactionIndex: tx.index, pair: repeat.pair, count: repeat.count });
    }
    if (repeats.length) {
      const strongest = repeats[0];
      const repeatConfidence = Math.min(0.94, 0.62 + 0.04 * (strongest.count - 1));
      confidence = Math.max(confidence, repeatConfidence);
      vectorId = vectorId ?? 'reentrancy';
      label = label ?? 'Repeated call';
      reasons.push(`Repeated ${strongest.pair} x${strongest.count} inside one transaction`);
    }

    const valuesOut = valueOutOf(nodes, parentOf, victimNames);
    for (const v of valuesOut) {
      signals.valueOut.push({
        transactionIndex: tx.index,
        victim: v.victim,
        recipient: v.recipient,
        amountWei: v.amountWei,
      });
      const toInitiator = v.recipient === tx.contractName;
      const toAttacker = Boolean(attackerAddress) && v.address.toLowerCase() === attackerAddress;
      if (toInitiator || toAttacker) {
        confidence = Math.max(confidence, 0.68);
        vectorId = vectorId ?? 'reentrancy';
        label = label ?? 'Value out';
        reasons.push(`${v.victim} paid ${fmtEth(v.amountWei)} to ${v.recipient} inside the transaction`);
      }
    }

    for (const n of nodes) {
      if (/oracle|price|twap|quote/i.test(`${n.contractName} ${n.fn}`)) {
        signals.oracleReads.push({
          transactionIndex: tx.index,
          contract: n.contractName,
          fn: n.fn,
          reason: 'price-bearing call in the transaction subtree',
        });
      }
    }

    if (confidence >= CONFIDENCE_FLOOR && reasons.length) {
      suspicious.push({
        index: tx.index,
        reasons: [...new Set(reasons)],
        confidence: Number(confidence.toFixed(2)),
        vectorId,
        label,
      });
    }
  }

  return {
    transactions,
    suspicious,
    cleanCount: transactions.length - suspicious.length,
    signals,
    attackTxIndex: session?.attackTxIndex,
  };
}

export interface IsolationCheck {
  ok: boolean;
  detail: string;
  expectedIndex?: number;
  suspiciousIndex?: number;
}

/**
 * Self-check for the long-session claim: a session of N transactions that
 * contains exactly one attack must isolate exactly that transaction.
 */
export function verifyIsolation(analysis: SessionAnalysis, expectedIndex?: number): IsolationCheck {
  const expected = expectedIndex ?? analysis.attackTxIndex;
  if (analysis.suspicious.length !== 1) {
    return {
      ok: false,
      detail: `expected 1 suspicious transaction, found ${analysis.suspicious.length}`,
      expectedIndex: expected,
      suspiciousIndex: analysis.suspicious[0]?.index,
    };
  }
  const found = analysis.suspicious[0].index;
  if (expected !== undefined && found !== expected) {
    return {
      ok: false,
      detail: `isolated transaction ${found} but the artifact planted the attack at ${expected}`,
      expectedIndex: expected,
      suspiciousIndex: found,
    };
  }
  return {
    ok: true,
    detail: `isolated transaction ${found} out of ${analysis.transactions.length}`,
    expectedIndex: expected,
    suspiciousIndex: found,
  };
}
