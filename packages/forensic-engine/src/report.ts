import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ForensicReport, Incident, PatternDetection, Severity, SimulationResult } from '@helix/core';
import { ATTACK_VECTORS, resolveAttackVectorId } from '@helix/core';
import { repoRoot } from './foundry.js';

const REMEDIATION: Record<string, string> = {
  reentrancy:
    'Apply the checks-effects-interactions ordering: update the user balance before the external call, or guard the function with a reentrancy mutex (OpenZeppelin ReentrancyGuard).',
  'flash-loan':
    'Do not derive a protocol price or solvency ratio from the pool that the same transaction can move. Use a time-weighted oracle with a meaningful window, or apply per-block borrow caps.',
  'oracle-manipulation':
    'Consume external prices from a manipulation-resistant source (chainlink / TWAP over many blocks) and sanity-check the returned value against a deviation bound.',
  'access-control':
    'Apply the access-control modifier to every state-changing privileged path and add invariant tests that assert unauthorised callers revert on each of them.',
  'delegatecall-injection':
    'Never delegatecall to a caller-supplied address. Keep an immutable implementation registry and validate the implementation against it before any delegatecall.',
  'self-destruct':
    'Remove the destruction path entirely, or gate it behind a timelock and a multisig. Modern EVM deprecates SELFDESTRUCT — migrate the accounting model instead.',
  'arithmetic-overflow':
    'Use checked arithmetic (Solidity >=0.8) and standardise on 18-decimal fixed-point maths with explicit rounding rules.',
  'front-running':
    'Add slippage bounds to user-facing parameters and consider private order flow for high-value operations.',
  'bridge-exploit':
    'Bind every cross-chain message to its origin chain and a unique message id, and enforce a domain separator check on the destination chain.',
  'logic-error':
    'Encode the intended invariant as an explicit check in every state-changing path, and add a fuzzing target that attempts to violate it.',
};

export function narrativesDir(): string {
  return path.join(repoRoot(), 'data', 'narratives');
}

function narrativePath(caseId: string): string {
  return path.join(narrativesDir(), `${caseId.replace(/[^a-z0-9_-]/gi, '_')}.md`);
}

/** Stores a narrative authored by MiniMax Code for use as the report summary. */
export function saveNarrative(caseId: string, text: string): string {
  mkdirSync(narrativesDir(), { recursive: true });
  const p = narrativePath(caseId);
  writeFileSync(p, text, 'utf-8');
  return p;
}

export function loadNarrative(caseId: string): string | null {
  const p = narrativePath(caseId);
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

function deterministicSummary(sim: SimulationResult, incident: Incident | null): string {
  const art = sim.artifact;
  const vec = ATTACK_VECTORS[resolveAttackVectorId(art?.attackVector ?? sim.attackVector)];
  const loss = art?.lossEth ? `${art.lossEth} ETH` : 'an unrecovered balance';
  const lines: string[] = [];

  if (incident) {
    lines.push(
      `On ${incident.date}, the ${incident.target} protocol on ${incident.chain} lost approximately ${loss} to a ${vec.label.toLowerCase()} attack.`,
    );
    lines.push(incident.summary);
  } else {
    lines.push(
      `A local Foundry reproduction of a ${vec.label.toLowerCase()} attack drained ${loss} from the target contract in a single transaction.`,
    );
  }

  if (art?.rootCause) lines.push(`Root cause: ${art.rootCause}`);
  if (sim.detections.length) {
    const top = sim.detections[0];
    lines.push(
      `The trace was classified as ${top.label} with ${Math.round(top.confidence * 100)}% confidence based on ${top.evidence.length} piece(s) of evidence.`,
    );
  }
  if (sim.detections.length) {
    const other = sim.detections.slice(1, 3).map((d) => d.label);
    if (other.length) lines.push(`Secondary signals: ${other.join(', ')}.`);
  }
  lines.push(
    'This summary was produced from the simulated execution evidence; the same slot can be filled with a MiniMax Code authored narrative.',
  );
  return lines.join('\n\n');
}

function severityOf(detections: PatternDetection[], fallback: Severity): Severity {
  if (!detections.length) return fallback;
  if (detections.some((d) => d.severity === 'critical')) return 'critical';
  if (detections.some((d) => d.severity === 'high')) return 'high';
  if (detections.some((d) => d.severity === 'medium')) return 'medium';
  return 'low';
}

export function buildReport(
  caseId: string,
  sim: SimulationResult,
  incident: Incident | null,
): ForensicReport {
  const art = sim.artifact;
  const vectorId = resolveAttackVectorId(art?.attackVector ?? sim.attackVector);
  const narrative = loadNarrative(caseId);
  const sections = [];

  sections.push({
    heading: '1. Scope',
    body: [
      `Case reference: ${caseId}`,
      `Scenario executed: ${sim.scenario}`,
      `Attack vector under investigation: ${ATTACK_VECTORS[resolveAttackVectorId(art?.attackVector ?? sim.attackVector)].label}`,
      `Chain: ${art?.chain ?? incident?.chain ?? 'Ethereum'}`,
      `Target contract: ${art?.contractName ?? incident?.target ?? 'unknown'} (${art?.target ?? incident?.actors.find((a) => a.role === 'victim')?.address ?? 'n/a'})`,
      `Execution: ${sim.command}`,
      `Executed at: ${sim.startedAt} (${sim.durationMs} ms)`,
    ].join('\n'),
  });

  sections.push({
    heading: '2. Attack sequence',
    body:
      (art?.steps ?? [])
        .map((s) => `Step ${s.n} — ${s.title}\n${s.description}\n  gas: ${s.gasUsed} | value: ${s.valueWei} wei | tx: ${s.txHash}`)
        .join('\n\n') || 'No structured steps recorded.',
  });

  sections.push({
    heading: '3. State mutations (storage diff)',
    body:
      (art?.storageWrites ?? [])
        .map(
          (w) =>
            `${w.contractName} ${w.label} (${w.slot}) [${w.kind}]\n  before: ${w.before}\n  after:  ${w.after}`,
        )
        .join('\n\n') || 'No storage mutations captured.',
  });

  sections.push({
    heading: '4. Balance movements',
    body:
      (art?.balances ?? [])
        .map((b) => `${b.label} ${b.address}\n  before: ${b.beforeWei} wei\n  after:  ${b.afterWei} wei\n  delta:  ${b.deltaWei} wei`)
        .join('\n\n') || 'No balance deltas captured.',
  });

  sections.push({
    heading: '5. Pattern findings',
    body:
      sim.detections
        .map(
          (d, i) =>
            `${i + 1}. ${d.label} — confidence ${Math.round(d.confidence * 100)}%, severity ${d.severity}\n   ${d.rationale}\n   Evidence:\n${d.evidence
              .map((e) => `     - ${e}`)
              .join('\n')}`,
        )
        .join('\n\n') || 'No pattern crossed the detection threshold.',
  });

  const rec = REMEDIATION[art?.attackVector ?? sim.attackVector] ?? 'Review the affected contract paths and add invariant tests.';
  sections.push({
    heading: '6. Root cause and remediation',
    body: `${art?.rootCause ?? 'Root cause not asserted by the simulation.'}\n\nRecommended remediation: ${rec}`,
  });

  sections.push({
    heading: '7. Evidence index',
    body: [
      `Artifact: artifacts/${sim.scenario}.json`,
      `Trace: stored with the case, ${sim.traceText.split('\n').length} lines`,
      `Gas flame nodes: ${sim.flame.length}`,
      `Pattern detections: ${sim.detections.length}`,
      `Reporter: HELIX forensic engine (Foundry ${sim.command.includes('forge') ? 'simulation' : 'run'})`,
    ].join('\n'),
  });

  const topConfidence = sim.detections.length ? sim.detections[0].confidence : 0.5;

  return {
    id: caseId,
    title: incident ? `${incident.name} — Forensic Report` : `${sim.scenario} — Forensic Report`,
    generatedAt: new Date().toISOString(),
    caseRef: caseId,
    severity: severityOf(sim.detections, art?.severity ?? 'high'),
    executiveSummary: narrative ?? deterministicSummary(sim, incident),
    sections,
    findings: sim.detections,
    lossUsd: incident?.lossUsd ?? 0,
    lossEth: art?.lossEth ?? '0',
    confidence: Number(topConfidence.toFixed(2)),
    chain: art?.chain ?? incident?.chain ?? 'Ethereum',
    evidenceCount:
      (art?.storageWrites?.length ?? 0) +
      (art?.balances?.length ?? 0) +
      (art?.steps?.length ?? 0) +
      sim.detections.length,
  };
}

export function reportToMarkdown(report: ForensicReport): string {
  const out: string[] = [];
  out.push(`# ${report.title}`);
  out.push('');
  out.push(
    `**Case reference:** ${report.caseRef}  `,
    `**Generated:** ${report.generatedAt}  `,
    `**Chain:** ${report.chain}  `,
    `**Severity:** ${report.severity.toUpperCase()}  `,
    `**Confidence:** ${Math.round(report.confidence * 100)}%  `,
    `**Evidence items:** ${report.evidenceCount}`,
  );
  out.push('');
  out.push('## Executive summary');
  out.push('');
  out.push(report.executiveSummary);
  out.push('');
  for (const s of report.sections) {
    out.push(`## ${s.heading}`);
    out.push('');
    out.push(s.body);
    out.push('');
  }
  out.push('---');
  out.push('');
  out.push(`_Generated by HELIX — Web3 Exploit Forensics._`);
  return out.join('\n');
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
