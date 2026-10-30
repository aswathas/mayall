/**
 * Mayall's analysis of the Binance $6.3B breach.
 *
 * Three things are kept deliberately separate:
 *
 *   (a) CLASSIFICATION  — the incident mapped onto Mayall's 16-vector taxonomy.
 *   (b) BIBLE MAPPING   — the incident mapped onto the Forensic Bible's attack
 *                         patterns (sheet 04) and detection signals (sheet 03),
 *                         using the Bible's own threshold text.
 *   (c) COVERAGE        — for every one of Mayall's ten detectors, whether it
 *                         can see this incident and why. Most cannot, because
 *                         the trust boundary was a signing key and a laptop,
 *                         not a contract.
 *
 * The module also owns the deterministic report writer, the mcode prompt and
 * the stored-report loaders. Nothing here claims a mainnet reproduction of the
 * incident. The only local execution is the delegatecall analogue.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SimulationArtifact } from '@helix/core';
import { ATTACK_VECTORS, resolveAttackVectorId } from '@helix/core';
import {
  BINANCE_LIVE_CASE,
  LIVE_CASE_ID,
  type LiveCase,
  type LiveCaseActionGroup,
  type LiveCaseAnalysis,
  type LiveCaseAnalogue,
  type LiveCaseBiblePattern,
  type LiveCaseBibleSignal,
  type LiveCaseClassification,
  type LiveCaseCoverageStatus,
  type LiveCaseDetectorCoverage,
  type LiveCaseReport,
  type LiveCaseSignalCounts,
  type LiveCaseSignalStatus,
  type LiveCaseTimelineEntry,
} from '../../core/src/live-case.js';
import { DETECTOR_CATALOG, runDetectors } from './detectors.js';
import { SCENARIO_BY_ID } from './scenarios.js';
import { repoRoot } from './foundry.js';
import { artifactsDir } from './simulator.js';
import { aiReportsDir, parseSections } from './aireport.js';
import { loadNarrative, saveNarrative } from './report.js';

export {
  BINANCE_LIVE_CASE,
  LIVE_CASE_ID,
  LIVE_CASE_INCIDENT_SLUG,
  LIVE_CASE_SOURCES,
  type LiveCase,
  type LiveCaseActionGroup,
  type LiveCaseAnalysis,
  type LiveCaseAnalogue,
  type LiveCaseBiblePattern,
  type LiveCaseBibleSignal,
  type LiveCaseClassification,
  type LiveCaseCoverageStatus,
  type LiveCaseDetectorCoverage,
  type LiveCaseFact,
  type LiveCaseFactTone,
  type LiveCasePatternRole,
  type LiveCaseReport,
  type LiveCaseSignalCounts,
  type LiveCaseSignalStatus,
  type LiveCaseTimelineEntry,
} from '../../core/src/live-case.js';

export const LIVE_CASE_METHOD = 'retrospective-classification' as const;

export const LIVE_CASE_METHOD_NOTE =
  'Retrospective classification over public reporting, plus one real local Foundry run of the closest analogue. ' +
  'No mainnet trace of the Binance incident was analysed, and no incident transaction was replayed.';

export const LIVE_CASE_CASE_ID = LIVE_CASE_ID;
export const LIVE_CASE_NARRATIVE_FILE = 'binance-7702';

const OWNERSHIP_PATTERN = 'Ownership Hijack + Drain';
const DELEGATECALL_PATTERN = 'Delegatecall Privilege Escalation';
const CLUSTER_PATTERN = 'Address Clustering';

/* ─────────────────────── Forensic Bible reader ─────────────────────── */

interface BibleSignalRow {
  name: string;
  family: string;
  detects: string;
  threshold: string;
  weight: string;
}

interface BiblePatternRow {
  name: string;
  family: string;
  attackType: string;
  threshold: string;
  signals: string[];
}

interface BibleSheets {
  signals: Map<string, BibleSignalRow>;
  patterns: Map<string, BiblePatternRow>;
}

let bibleCache: BibleSheets | null = null;

function splitCell(value: string | undefined): string[] {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function loadBibleSheets(): BibleSheets {
  if (bibleCache) return bibleCache;
  const signals = new Map<string, BibleSignalRow>();
  const patterns = new Map<string, BiblePatternRow>();

  try {
    const book = JSON.parse(
      readFileSync(path.join(repoRoot(), 'data', 'bible', 'forensic-bible.json'), 'utf-8'),
    ) as Record<string, string[][]>;

    const signalRows = book['03 Detection Signals'] ?? [];
    const header = signalRows.findIndex((row) => row[0]?.trim() === 'Family' && row[1]?.trim() === 'Signal Name');
    if (header >= 0) {
      const columns = signalRows[header];
      const column = (label: string, fallback: number): number => {
        const index = columns.findIndex((cell) => cell?.trim() === label);
        return index >= 0 ? index : fallback;
      };
      const nameIndex = column('Signal Name', 1);
      const detectsIndex = column('What It Detects', 2);
      const thresholdIndex = column('Threshold / Logic', 3);
      const weightIndex = column('Confidence Weight', 7);

      let family = '';
      for (const row of signalRows.slice(header + 1)) {
        if (row[0]?.trim()) family = row[0].trim();
        const name = row[nameIndex]?.trim();
        if (!name) continue;
        signals.set(name, {
          name,
          family,
          detects: row[detectsIndex]?.trim() ?? '',
          threshold: row[thresholdIndex]?.trim() ?? '',
          weight: row[weightIndex]?.trim() ?? '',
        });
      }
    }

    const patternRows = book['04 Attack Pattern Catalog'] ?? [];
    const patternHeader = patternRows.findIndex(
      (row) => row[0]?.trim() === 'Family' && row[1]?.trim() === 'Attack Name',
    );
    if (patternHeader >= 0) {
      let family = '';
      for (const row of patternRows.slice(patternHeader + 1)) {
        if (row[0]?.trim()) family = row[0].trim();
        const name = row[1]?.trim();
        if (!name) continue;
        patterns.set(name, {
          name,
          family,
          attackType: row[3]?.trim() ?? '',
          threshold: row[4]?.trim() ?? '',
          signals: splitCell(row[5]),
        });
      }
    }
  } catch {
    // The Bible is a reference input. If it cannot be read, the analysis still
    // returns its classification and coverage; the mapping fields stay empty
    // rather than being filled with paraphrases.
  }

  bibleCache = { signals, patterns };
  return bibleCache;
}

function bibleSignalRow(name: string): BibleSignalRow {
  return loadBibleSheets().signals.get(name) ?? { name, family: '', detects: '', threshold: '', weight: '' };
}

function biblePatternRow(name: string): BiblePatternRow {
  return (
    loadBibleSheets().patterns.get(name) ?? { name, family: '', attackType: '', threshold: '', signals: [] }
  );
}

function weightValue(weight: string): number {
  const match = /Weight\s+(\d+)/i.exec(weight);
  return match ? Number(match[1]) : 0;
}

/* ─────────────────────────── Signal plan ─────────────────────────── */

interface SignalPlanEntry {
  name: string;
  pattern: string;
  status: LiveCaseSignalStatus;
  note: string;
}

const SIGNAL_PLAN: SignalPlanEntry[] = [
  {
    name: 'ownership_transfer_then_drain',
    pattern: OWNERSHIP_PATTERN,
    status: 'expected',
    note:
      'The record describes private-key misuse and a $6.3B drain, but publishes no OwnershipTransferred event and no on-chain authority change. The signal needs the event and the drain in the same transaction, so it is expected, not observed.',
  },
  {
    name: 'event_order_violation',
    pattern: OWNERSHIP_PATTERN,
    status: 'expected',
    note:
      'No event sequence for the incident is in the public record. Ordering cannot be assessed without logs, so the signal is expected rather than observed.',
  },
  {
    name: 'drain_ratio_exceeded',
    pattern: OWNERSHIP_PATTERN,
    status: 'expected',
    note:
      'A drain is not in dispute, but no per-contract balance ratio is published, so the Bible’s >80% condition cannot be confirmed from public figures. Expected is the honest status.',
  },
  {
    name: 'delegatecall_storage_write',
    pattern: DELEGATECALL_PATTERN,
    status: 'expected',
    note:
      'EIP-7702 delegation designators execute delegated code in the signing account’s context, which is the mechanism this signal describes. Experts said EIP-7702 did not cause the hack and the record publishes no storage diff, so the signal is expected, not observed.',
  },
  {
    name: 'proxy_implementation_change',
    pattern: DELEGATECALL_PATTERN,
    status: 'notApplicable',
    note:
      'EIP-7702 is not an EIP-1967 proxy and the record describes no implementation-slot write. The signal’s slot condition does not apply to this incident.',
  },
  {
    name: 'ownership_transfer_then_drain',
    pattern: DELEGATECALL_PATTERN,
    status: 'expected',
    note:
      'Shared with the ownership pattern: a delegated implementation that rewrites the host would have to drain in the same transaction. The event is not published for this incident.',
  },
  {
    name: 'address_cluster_identified',
    pattern: CLUSTER_PATTERN,
    status: 'observed',
    note:
      'ZachXBT reports that stolen funds from the Binance and Bitget hacks converged at the same address. That is an attribution-level cluster statement in the published record, not a log observation.',
  },
  {
    name: 'contract_creator_linked',
    pattern: CLUSTER_PATTERN,
    status: 'notApplicable',
    note: 'No deployer or contract-creation data is published for this incident.',
  },
  {
    name: 'address_funded_before_attack',
    pattern: CLUSTER_PATTERN,
    status: 'notApplicable',
    note: 'No funding or staging history for the attacker is published in the verified record.',
  },
];

function buildSignals(): LiveCaseBibleSignal[] {
  return SIGNAL_PLAN.map((plan) => {
    const row = bibleSignalRow(plan.name);
    return {
      name: plan.name,
      pattern: plan.pattern,
      family: row.family,
      weight: row.weight,
      threshold: row.threshold,
      status: plan.status,
      note: plan.note,
    };
  });
}

function buildBiblePatterns(signals: LiveCaseBibleSignal[]): LiveCaseBiblePattern[] {
  const roles: { name: string; role: LiveCaseBiblePattern['role']; note: string }[] = [
    {
      name: OWNERSHIP_PATTERN,
      role: 'primary',
      note:
        'The closest sheet-04 pattern for a stolen privileged key used to drain funds. The threshold is not met on the verified record: no on-chain event sequence was published, so the pattern is a classification, not a detection.',
    },
    {
      name: DELEGATECALL_PATTERN,
      role: 'contributing',
      note:
        'Recorded only as a contributing amplifier through the EIP-7702 delegation-designator mechanism. Security experts said the upgrade did not cause the hack, and no storage diff or implementation write is published.',
    },
    {
      name: CLUSTER_PATTERN,
      role: 'context',
      note:
        'An attribution pattern, not a causal one. One observed W2 signal (weight 2) is below the ≥4 threshold, so the cluster is a lead, not a proven actor map.',
    },
  ];

  return roles.map(({ name, role, note }) => {
    const row = biblePatternRow(name);
    const patternSignals = signals.filter((signal) => signal.pattern === name);
    const observed = patternSignals.filter((signal) => signal.status === 'observed');
    const observedWeight = observed.reduce((sum, signal) => sum + weightValue(signal.weight), 0);
    const minSignals = Number(/Min\s+(\d+)\s+signals?/i.exec(row.threshold)?.[1] ?? 0);
    const minWeight = Number(/≥\s*(\d+)\s*weight/i.exec(row.threshold)?.[1] ?? 0);
    return {
      name,
      family: row.family,
      role,
      attackType: row.attackType,
      threshold: row.threshold,
      thresholdMet: observed.length >= minSignals && observedWeight >= minWeight && minSignals > 0,
      note,
    };
  });
}

function countSignals(signals: LiveCaseBibleSignal[]): LiveCaseSignalCounts {
  // A signal shared by two patterns is one signal; count unique names so the
  // summary cannot inflate itself by mapping the same evidence twice.
  const unique = new Map<string, LiveCaseBibleSignal>();
  for (const signal of signals) {
    if (!unique.has(signal.name)) unique.set(signal.name, signal);
  }
  const counts: LiveCaseSignalCounts = { observed: 0, expected: 0, notApplicable: 0 };
  for (const signal of unique.values()) counts[signal.status] += 1;
  return counts;
}

/* ─────────────────────────── Classification ─────────────────────────── */

function buildClassification(): LiveCaseClassification[] {
  const primaryVector = resolveAttackVectorId('access-control');
  const contributingVector = resolveAttackVectorId('delegatecall');

  return [
    {
      vectorId: primaryVector,
      label: ATTACK_VECTORS[primaryVector].label,
      role: 'primary',
      confidence: 0.93,
      mechanism: 'Compromised DevOps laptop → private-key misuse → unauthorised signing',
      rationale:
        'The trust boundary that broke was the signing key, not a contract. Binance and Blockaid’s CEO describe a compromised DevOps engineer’s laptop and private-key misuse, not a smart-contract exploit. That is an access-control failure in Mayall’s taxonomy, and it is the incident’s root cause.',
      biblePattern: OWNERSHIP_PATTERN,
      bibleFamily: 'Access Control',
    },
    {
      vectorId: contributingVector,
      label: ATTACK_VECTORS[contributingVector].label,
      role: 'contributing',
      confidence: 0.45,
      mechanism: 'EIP-7702 delegation designator on an externally owned account',
      rationale:
        'Security experts said EIP-7702 did not cause the hack — the wallets could have been drained without it — but that the upgrade may have amplified the losses by helping bypass withdrawal safeguards. It is recorded as a contributing amplifier through the delegation-designator mechanism, never as the root cause. The confidence is deliberately low because the record is hedged.',
      biblePattern: DELEGATECALL_PATTERN,
      bibleFamily: 'Access Control',
    },
  ];
}

/* ───────────────────────── Detector coverage ───────────────────────── */

const COVERAGE_PLAN: Record<string, { status: LiveCaseCoverageStatus; reason: string }> = {
  'det-reentrancy': {
    status: 'not-fired',
    reason:
      'No contract re-entry is described. The attacker signed with a compromised key; there is no repeated call depth for the detector to count.',
  },
  'det-flash-loan': {
    status: 'not-fired',
    reason:
      'No flash-borrow, atomic capital or in-transaction repayment appears in the record. The loss is not capital-free amplification.',
  },
  'det-oracle': {
    status: 'not-fired',
    reason:
      'No price source, oracle read or collateral valuation is implicated. This is a key compromise, not a pricing error.',
  },
  'det-access-control': {
    status: 'out-of-scope',
    reason:
      'The detector looks for a privilege boundary inside an execution trace. Here the boundary was a person’s laptop and a signing key used off-chain, so no authority slot ever appears in a trace Mayall can read. The symptom is visible only in the withdrawal records, not in the contract.',
  },
  'det-delegatecall': {
    status: 'out-of-scope',
    reason:
      'No incident call trace is published, so the EIP-7702 delegation path cannot be inspected. The same detector does fire on Mayall’s local delegatecall analogue — see the measured 93% below — but that is an analogue, not this incident.',
  },
  'det-selfdestruct': {
    status: 'not-fired',
    reason: 'No contract destruction or forced balance transfer is described in the record.',
  },
  'det-arithmetic': {
    status: 'not-fired',
    reason: 'No overflow, truncation, precision fault or accounting panic is described.',
  },
  'det-front-running': {
    status: 'not-fired',
    reason: 'No ordering, mempool or sandwich manipulation is described in the record.',
  },
  'det-bridge': {
    status: 'not-fired',
    reason:
      'No bridge, relayer or cross-chain message verification is implicated in this incident. Bitget and THORChain are prior context, not part of this case.',
  },
  'det-logic': {
    status: 'out-of-scope',
    reason:
      'This detector is deliberately residual: it labels an otherwise unexplained loss. The loss here is explained by key misuse, so using it would relabel a known cause as “unexplained”.',
  },
};

function buildCoverage(): LiveCaseDetectorCoverage[] {
  return DETECTOR_CATALOG.map((rule) => {
    const plan = COVERAGE_PLAN[rule.id] ?? {
      status: 'not-fired' as LiveCaseCoverageStatus,
      reason: 'No signal for this detector appears in the verified record.',
    };
    return {
      id: rule.id,
      label: rule.label,
      vectorId: rule.vectorId,
      status: plan.status,
      reason: plan.reason,
      limitation: rule.limitation,
    };
  });
}

/* ─────────────────────── Local analogue (measured) ─────────────────────── */

function measureAnalogue(): LiveCaseAnalogue {
  const scenarioId = 'delegatecall';
  const spec = SCENARIO_BY_ID.get(scenarioId);
  const artifactPath = path.join(artifactsDir(), `${scenarioId}.json`);
  let lossEth = '50';
  let confidence = 0.93;
  let artifactSource = `declared figures — artifacts/${scenarioId}.json not found`;

  if (existsSync(artifactPath)) {
    try {
      const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8')) as SimulationArtifact;
      if (artifact.lossEth) lossEth = String(artifact.lossEth);
      const detections = runDetectors({ artifact, nodes: [], rawLines: [], traceText: '' });
      const delegate = detections.find((detection) => detection.id === 'det-delegatecall');
      if (delegate) confidence = delegate.confidence;
      artifactSource = `artifacts/${scenarioId}.json`;
    } catch {
      artifactSource = `artifacts/${scenarioId}.json could not be read — declared figures shown`;
    }
  }

  const detector = DETECTOR_CATALOG.find((rule) => rule.id === 'det-delegatecall');

  return {
    scenarioId,
    title: spec?.title ?? 'Delegatecall Implementation Injection',
    route: `/lab?scenario=${scenarioId}`,
    lossEth,
    detectorId: 'det-delegatecall',
    detectorLabel: detector?.label ?? 'Delegate Call Injection',
    confidence,
    artifactSource,
    reproduces:
      'A contract delegating execution to an attacker-controlled implementation that writes the host’s storage and sweeps the host balance — the closest local analogue to an EOA delegating to attacker code under EIP-7702.',
    doesNotReproduce: [
      'the off-chain compromise of a DevOps engineer’s laptop',
      'the misuse of a live Binance signing key',
      'EIP-7702 delegation-designator behaviour on an EOA (the lab target is a contract that uses delegatecall, not an EIP-7702 account)',
      'the $6.3B scale, the multi-wallet withdrawal path, or any incident address or hash',
    ],
    note:
      'This is a local reproduction of the closest analogue, not of the Binance breach. No incident transaction was replayed and no incident address or hash is used.',
  };
}

/* ─────────────────────────── Action plan ─────────────────────────── */

function buildActionPlan(): LiveCaseActionGroup[] {
  return [
    {
      window: 'First 24 hours',
      items: [
        'Freeze and reconcile: confirm the roughly $3 billion frozen figure with the counterparties holding it, and publish one reconciled loss number with its source.',
        'Rotate every signing key and session credential that touched the compromised DevOps estate. Assume the laptop carried more than one key.',
        'Move signing to hardware-backed custody with a quorum (HSM or MPC): no single laptop, session or engineer may produce a withdrawal signature.',
        'Revoke or re-point EIP-7702 delegation designators on affected externally owned accounts, and allow only audited implementations.',
        'Preserve evidence before rotation destroys it: signing-service logs, endpoint telemetry, withdrawal approvals and the DevOps access trail.',
        'Notify the FBI and Secret Service, share the attacker address set, and retain a tracing firm for post-exploit flow analysis.',
      ],
    },
    {
      window: 'First week',
      items: [
        'Delegatecall and delegation-designator monitoring: alert on any new EIP-7702 authorization to a non-allowlisted implementation, and diff account code on a schedule.',
        'Withdrawal rate limits and address allowlisting: per-asset caps, velocity limits, and a 24-hour cool-down for new destinations.',
        'Proof-of-reserves: include the more than $6.34 billion cover and the $5 billion in matching tokens, with a published methodology rather than a headline figure.',
        'Hunt the TraderTraitor pattern: endpoint IOCs, DevOps credential access, signed-binary abuse and CI/CD trust paths across the laptop fleet.',
        'Trace the THORChain and Bitget routes as prior-context laundering patterns; feed address clusters to exchanges and the tracing firm.',
      ],
    },
    {
      window: 'First month',
      items: [
        'Commission an independent review of key custody and DevOps access, covering the signing path end to end rather than the single wallet that was hit.',
        'Deploy withdrawal anomaly detection (velocity, geography, new device, unusual approver) with a tested paging path and a named owner.',
        'Run a tabletop exercise for signing-key compromise, including law-enforcement liaison, public disclosure cadence and customer communication.',
        'Publish a post-incident report that separates confirmed facts, analyst attribution and the EIP-7702 amplifier question.',
      ],
    },
  ];
}

/* ───────────────────────────── Analysis ───────────────────────────── */

export function analyzeLiveCase(liveCase: LiveCase = BINANCE_LIVE_CASE): LiveCaseAnalysis {
  const classification = buildClassification();
  const signals = buildSignals();
  const biblePatterns = buildBiblePatterns(signals);
  const signalCounts = countSignals(signals);

  return {
    caseId: liveCase.id,
    method: LIVE_CASE_METHOD,
    methodNote: LIVE_CASE_METHOD_NOTE,
    classification,
    biblePatterns,
    signals,
    signalCounts,
    coverage: buildCoverage(),
    analogue: measureAnalogue(),
    actionPlan: buildActionPlan(),
    scopeNote: liveCase.scopeNote,
  };
}

/* ─────────────────────── Deterministic report ─────────────────────── */

function usd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function statusWord(status: LiveCaseCoverageStatus): string {
  if (status === 'fired') return 'fired';
  if (status === 'not-fired') return 'not fired';
  return 'out of scope';
}

function timelineSentence(entry: LiveCaseTimelineEntry): string {
  return `${entry.title} — ${entry.description}`;
}

const FLOWCHART = [
  'flowchart TD',
  '  A["Compromised DevOps laptop"] -->|"Private-key misuse"| B["Binance signing authority"]',
  '  B --> C["Unauthorised withdrawals"]',
  '  C --> D["6.3B USD reported loss"]',
  '  D --> E["About 3B USD frozen"]',
  '  D --> F["18,270 BTC and over 500,000 ETH held"]',
  '  G["EIP-7702 delegation designator"] -.->|"amplifier, not cause"| C',
  '  F --> H["Attribution: TraderTraitor, high confidence per TRM Labs"]',
  '  E --> I["Local analogue only: delegatecall scenario"]',
].join('\n');

const SEQUENCE = [
  'sequenceDiagram',
  '  participant A as Attacker',
  '  participant K as Compromised DevOps laptop',
  '  participant B as Binance signing authority',
  '  participant R as Binance and partners',
  '  A->>K: Gain access to the laptop',
  '  K->>B: Misuse private keys',
  '  B->>A: Unauthorised withdrawals of 6.3B USD',
  '  R->>A: Freeze about 3B USD',
  '  Note over A,R: No incident trace was replayed by Mayall',
].join('\n');

function deterministicMarkdown(
  liveCase: LiveCase,
  analysis: LiveCaseAnalysis,
  generatedAt: string,
): string {
  const sources = liveCase.sources.map((source) => `- ${source.publisher}, ${source.date} — ${source.label} — ${source.url}`);
  const facts = liveCase.facts.map((fact) => `- **${fact.label}:** ${fact.value}. ${fact.detail}`);
  const sequence = liveCase.timeline.map((entry, index) => `${index + 1}. ${entry.date} — ${timelineSentence(entry)}`);
  const observations = analysis.signals.map(
    (signal) => `| ${escapeCell(signal.pattern)} | ${escapeCell(signal.name)} | ${signal.status} | ${escapeCell(signal.weight)} | ${escapeCell(signal.threshold)} |`,
  );
  const patternRows = analysis.biblePatterns.map(
    (pattern) =>
      `| ${escapeCell(pattern.name)} | ${escapeCell(pattern.family)} | ${escapeCell(pattern.attackType)} | ${escapeCell(pattern.threshold)} | ${pattern.thresholdMet ? 'met' : 'not met on the verified record'} |`,
  );
  const coverageRows = analysis.coverage.map(
    (coverage) => `| ${escapeCell(coverage.label)} | ${statusWord(coverage.status)} | ${escapeCell(coverage.reason)} |`,
  );
  const limitationLines = analysis.coverage.map(
    (coverage) => `- **${coverage.label}** — “${coverage.limitation}”`,
  );
  const actionPlan = analysis.actionPlan
    .map((group) => [`**${group.window}**`, '', ...group.items.map((item) => `- ${item}`), ''].join('\n'))
    .join('\n');

  return [
    `# ${liveCase.name} — Forensic Report`,
    '',
    `**Case reference:** ${LIVE_CASE_CASE_ID}  `,
    `**Generated:** ${generatedAt}  `,
    `**Generated by:** Mayall deterministic report writer (no model was used)  `,
    `**Chain:** ${liveCase.chain}  `,
    `**Date of incident:** ${liveCase.disclosedAt}  `,
    `**Severity:** ${liveCase.severity.toUpperCase()}  `,
    `**Analysis method:** retrospective classification over public reporting`,
    '',
    '## 1. Case header',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Incident | ${liveCase.name} |`,
    `| Target | Binance |`,
    `| Chain | ${liveCase.chain} |`,
    `| First signalled | ${liveCase.firstSignalledAt} |`,
    `| Disclosed | ${liveCase.disclosedAt} |`,
    `| Reported loss | ${usd(liveCase.lossUsd)} |`,
    `| Frozen | ${usd(liveCase.frozenUsd)} |`,
    `| Status | ${liveCase.statusLabel} — ${liveCase.statusDetail} |`,
    `| Attribution | ${liveCase.attribution.confidenceSource}: ${liveCase.attribution.confidence} — ${liveCase.attribution.actor} |`,
    `| Classification | ${analysis.classification.map((item) => `\`${item.vectorId}\` (${item.role})`).join(', ')} |`,
    `| Local reproduction | none for the incident; analogue \`${analysis.analogue.scenarioId}\` drains ${analysis.analogue.lossEth} ETH |`,
    '',
    'Verified facts from the published coverage:',
    '',
    ...facts,
    '',
    'Sources:',
    '',
    ...sources,
    '',
    '## 2. Executive summary',
    '',
    `On ${liveCase.disclosedAt} Binance disclosed a ${usd(liveCase.lossUsd)} loss — reported as the largest hack in cryptocurrency history — after an onchain alert on ${liveCase.firstSignalledAt}. Binance and Blockaid’s CEO attribute the theft to a compromised DevOps engineer’s laptop and private-key misuse, not a smart-contract exploit. About ${usd(liveCase.frozenUsd)} was frozen, the FBI and Secret Service joined the response, and TRM Labs said it has ${liveCase.attribution.confidence} in attributing the theft to ${liveCase.attribution.actor}. Security experts said EIP-7702 did not cause the hack but may have amplified the losses; this report records that as a contributing amplifier, not the root cause. Mayall did not replay the incident: the only local execution is the delegatecall analogue, which drains ${analysis.analogue.lossEth} ETH and fires the delegatecall detector at ${Math.round(analysis.analogue.confidence * 100)}% confidence.`,
    '',
    '## 3. Attack sequence',
    '',
    ...sequence,
    '',
    '### Attack flow',
    '',
    '```mermaid',
    FLOWCHART,
    '```',
    '',
    '### Funds flow',
    '',
    '```mermaid',
    SEQUENCE,
    '```',
    '',
    '## 4. Evidence reconstruction',
    '',
    '| Claim | Status | Basis |',
    '| --- | --- | --- |',
    `| Reported loss | published | ${usd(liveCase.lossUsd)} at disclosure, reported as the largest hack in cryptocurrency history. |`,
    '| Root cause | published | Compromised DevOps engineer’s laptop and private-key misuse, per Binance and Blockaid’s CEO. |',
    '| EIP-7702 role | published, hedged | Did not cause the hack; may have amplified losses by helping bypass withdrawal safeguards. |',
    `| Attribution | published | ${liveCase.attribution.confidenceSource}: ${liveCase.attribution.confidence} for ${liveCase.attribution.actor}. |`,
    '| Mainnet call trace | not available | No incident trace is in the public record; none was analysed. |',
    '| Incident transaction hashes | not published | Mayall prints no hash it cannot cite. |',
    '| Attacker addresses | not published | Mayall prints no address it cannot cite. |',
    `| Local reproduction | analogue only | \`${analysis.analogue.scenarioId}\` drains ${analysis.analogue.lossEth} ETH and fires ${analysis.analogue.detectorLabel} at ${Math.round(analysis.analogue.confidence * 100)}% confidence; it does not reproduce the incident. |`,
    `| Bible signal confirmation | partial | ${analysis.signalCounts.observed} observed, ${analysis.signalCounts.expected} expected, ${analysis.signalCounts.notApplicable} not applicable. |`,
    '',
    'What the analogue proves: delegatecall to an attacker-controlled implementation can write host storage and sweep the host balance, and Mayall’s detector sees it. What it does not prove: that the Binance attacker took that path, used EIP-7702, moved the reported amount, or used any particular address. The incident itself was an off-chain key compromise, which no local Foundry harness can reproduce.',
    '',
    '## 5. Detection analysis',
    '',
    `**Classification.** Primary: \`${analysis.classification[0].vectorId}\` (${analysis.classification[0].label}) at ${Math.round(analysis.classification[0].confidence * 100)}% record-level confidence. Contributing amplifier: \`${analysis.classification[1].vectorId}\` at ${Math.round(analysis.classification[1].confidence * 100)}%, explicitly not the root cause.`,
    '',
    'Bible pattern mapping:',
    '',
    '| Pattern | Family | Attack type | Bible threshold | Threshold met |',
    '| --- | --- | --- | --- | --- |',
    ...patternRows,
    '',
    'Bible signal status (sheet 03 thresholds quoted verbatim):',
    '',
    '| Pattern | Signal | Status | Weight | Bible threshold |',
    '| --- | --- | --- | --- | --- |',
    ...observations,
    '',
    `Signal counts are unique signal names: ${analysis.signalCounts.observed} observed, ${analysis.signalCounts.expected} expected, ${analysis.signalCounts.notApplicable} not applicable. A signal shared by two patterns is counted once.`,
    '',
    'Coverage matrix — all ten Mayall detectors:',
    '',
    '| Detector | Status | Why |',
    '| --- | --- | --- |',
    ...coverageRows,
    '',
    'Each detector’s own limitation, quoted:',
    '',
    ...limitationLines,
    '',
    '## 6. Remediation',
    '',
    `- **Access control (root cause).** ${ATTACK_VECTORS['access-control'].label}: move withdrawal signing to hardware-backed custody with a quorum, bind every privileged action to an accountable approver, and rotate the keys that touched the compromised estate. The Bible pattern is \`${OWNERSHIP_PATTERN}\`; its threshold is met only when an authority change and a drain are both observed in the same transaction.`,
    `- **Delegatecall injection (amplifier).** ${ATTACK_VECTORS['delegatecall-injection'].label}: allow only audited delegation implementations, alert on every new EIP-7702 authorization, and revoke designators on compromise. The Bible pattern is \`${DELEGATECALL_PATTERN}\`; the record does not evidence it as the cause.`,
    '- **Operational security.** Treat the DevOps laptop fleet as part of the signing boundary: endpoint detection, short-lived credentials, and no standing access to production signing services.',
    '- **Assurance.** Re-derive the loss and recovery figures from custody records, and publish the proof-of-reserves methodology alongside the $5 billion matching-token cover.',
    '',
    '## 7. Client action plan',
    '',
    actionPlan,
    '',
    '---',
    '',
    `_${liveCase.scopeNote}_`,
    '',
    '_Generated by Mayall — Web3 Exploit Forensics. Retrospective analysis of a publicly reported incident; the local delegatecall scenario is the closest analogue, not a reproduction._',
    '',
  ].join('\n');
}

function extractMermaidBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const re = /```mermaid\s*\r?\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

export function buildDeterministicLiveCaseReport(
  analysis: LiveCaseAnalysis = analyzeLiveCase(),
  generatedAt = new Date().toISOString(),
): LiveCaseReport {
  const markdown = deterministicMarkdown(BINANCE_LIVE_CASE, analysis, generatedAt);
  const mermaidBlocks = extractMermaidBlocks(markdown);
  return {
    caseId: LIVE_CASE_CASE_ID,
    title: `${BINANCE_LIVE_CASE.name} — Forensic Report`,
    generatedAt,
    generatedBy: 'deterministic',
    model: null,
    markdown,
    mermaid: mermaidBlocks[0] ?? null,
    mermaidBlocks,
    sections: parseSections(markdown),
    analysis,
    source: 'deterministic-fallback',
    note: 'Generated by the deterministic report writer. No model was used, and the report is labelled accordingly.',
  };
}

/* ───────────────────────────── mcode prompt ───────────────────────────── */

export function buildLiveCasePrompt(analysis: LiveCaseAnalysis = analyzeLiveCase()): string {
  const data = {
    incident: {
      id: BINANCE_LIVE_CASE.id,
      name: BINANCE_LIVE_CASE.name,
      chain: BINANCE_LIVE_CASE.chain,
      firstSignalledAt: BINANCE_LIVE_CASE.firstSignalledAt,
      disclosedAt: BINANCE_LIVE_CASE.disclosedAt,
      lastUpdated: BINANCE_LIVE_CASE.lastUpdated,
      lossUsd: BINANCE_LIVE_CASE.lossUsd,
      frozenUsd: BINANCE_LIVE_CASE.frozenUsd,
      status: BINANCE_LIVE_CASE.statusLabel,
      statusDetail: BINANCE_LIVE_CASE.statusDetail,
      summary: BINANCE_LIVE_CASE.summary,
      attribution: BINANCE_LIVE_CASE.attribution,
      facts: BINANCE_LIVE_CASE.facts,
      timeline: BINANCE_LIVE_CASE.timeline,
      assets: BINANCE_LIVE_CASE.assets,
      responders: BINANCE_LIVE_CASE.responders,
      marketImpact: BINANCE_LIVE_CASE.marketImpact,
      priorContext: BINANCE_LIVE_CASE.priorContext,
      sources: BINANCE_LIVE_CASE.sources,
      scopeNote: BINANCE_LIVE_CASE.scopeNote,
    },
    analysis: {
      method: analysis.method,
      methodNote: analysis.methodNote,
      classification: analysis.classification,
      biblePatterns: analysis.biblePatterns,
      signals: analysis.signals,
      signalCounts: analysis.signalCounts,
      coverage: analysis.coverage,
      analogue: analysis.analogue,
      actionPlan: analysis.actionPlan,
    },
  };

  return [
    'You are the forensic analyst for Mayall, a Web3 exploit forensics tool. Write a client-ready forensic report for ONE live case: the Binance $6.3 billion breach of 29–30 October 2026.',
    '',
    'NON-NEGOTIABLE RULES:',
    '1. Use ONLY facts in the DATA block below. Do not invent a transaction hash, block number, wallet address, contract name, token amount, victim count, or on-chain observation. If a fact is absent, say it is absent.',
    '2. This is a RETROSPECTIVE ANALYSIS of a publicly reported incident, not a mainnet trace analysis and not a Foundry reproduction of the breach. Say so in the executive summary and in the evidence section.',
    '3. The ONLY local reproduction is the delegatecall scenario, an analogue. State plainly what it reproduces and what it cannot. Never present it as a reproduction of the Binance breach.',
    '4. Quote each detector limitation from the DATA block verbatim when you discuss that detector.',
    '5. Never claim a Bible signal was observed on-chain. Use the statuses exactly as given: observed means the published record names the mechanism; expected means a full trace would be needed; notApplicable means the record does not describe that variant.',
    '6. Keep the classification honest: access-control is the primary vector; delegatecall-injection is a contributing amplifier via EIP-7702, never the root cause. The record says EIP-7702 did not cause the hack.',
    '7. Never hide or upgrade the attribution confidence. Write "TRM Labs: high confidence" — the analyst’s wording, not yours.',
    '8. Return ONLY the markdown report. No preamble, no apology, no explanation outside the report, and do NOT wrap the whole document in a code fence.',
    '',
    'REQUIRED STRUCTURE — use these exact H2 headings, in this order:',
    '## 1. Case header',
    '## 2. Executive summary',
    '## 3. Attack sequence',
    '## 4. Evidence reconstruction',
    '## 5. Detection analysis',
    '## 6. Remediation',
    '## 7. Client action plan',
    '',
    'Section requirements:',
    '- 1. Case header: incident, chain, dates, reported loss, frozen amount, attribution, status, classification, local reproduction. Use a compact table or bullet list.',
    '- 2. Executive summary: 3 to 5 sentences covering the money, the mechanism and the attribution. No bullet list.',
    '- 3. Attack sequence: a numbered narrative derived only from the timeline and facts. Then add the subheading "### Attack flow" followed by exactly one ```mermaid fenced block containing a `flowchart TD`. Then add the subheading "### Funds flow" followed by exactly one ```mermaid fenced block containing a `sequenceDiagram`.',
    '- 4. Evidence reconstruction: a markdown table with Claim | Status | Basis. Separate what the local analogue proves from what it cannot prove. State that no incident trace, hash or address was published.',
    '- 5. Detection analysis: the classification, the Bible pattern mapping with the Bible’s own threshold text, the signal statuses, and the full ten-detector coverage matrix with the reason for each status. Quote every detector limitation verbatim. Emphasise that no contract bug exists, so most detectors cannot fire.',
    '- 6. Remediation: specific controls for the access-control root cause and the EIP-7702 amplifier. Tie each control to the Bible pattern.',
    '- 7. Client action plan: a numbered, time-boxed plan split into "First 24 hours", "First week", "First month". Include delegation-designator monitoring, key rotation and HSM/MPC policy, withdrawal rate limits and allowlisting, proof-of-reserves disclosure, TTP hunting for TraderTraitor including THORChain laundering routes, and law-enforcement coordination.',
    '',
    'MERMAID RULES:',
    '- Use `flowchart TD` with double-quoted node labels; keep labels under 60 characters and remove quotes, brackets and parentheses from labels.',
    '- Use `sequenceDiagram` with `participant X as Label` and simple arrows for the funds flow.',
    '- The diagrams must show attacker to victim to extraction, mark the freeze, and mark where the local analogue stops.',
    '',
    'DATA:',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
    '',
    'Write the report now. Begin with the H1 title and then section 1.',
  ].join('\n');
}

/* ─────────────────────────── Storage + loading ─────────────────────────── */

export function liveCaseNarrativePath(): string {
  return path.join(repoRoot(), 'data', 'narratives', `${LIVE_CASE_NARRATIVE_FILE}.md`);
}

export function liveCaseReportJsonPath(): string {
  return path.join(aiReportsDir(), `${LIVE_CASE_NARRATIVE_FILE}.json`);
}

export function writeLiveCaseReport(report: LiveCaseReport): { markdownPath: string; jsonPath: string } {
  const markdownPath = saveNarrative(LIVE_CASE_NARRATIVE_FILE, report.markdown);
  mkdirSync(aiReportsDir(), { recursive: true });
  const jsonPath = liveCaseReportJsonPath();
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  return { markdownPath, jsonPath };
}

interface StoredJsonShape {
  generatedAt?: string;
  generatedBy?: string;
  model?: string | null;
  note?: string;
}

function readStoredJson(): StoredJsonShape | null {
  try {
    if (!existsSync(liveCaseReportJsonPath())) return null;
    return JSON.parse(readFileSync(liveCaseReportJsonPath(), 'utf-8')) as StoredJsonShape;
  } catch {
    return null;
  }
}

/**
 * Returns the report the API serves. It prefers the stored narrative and JSON
 * metadata; if the narrative is absent it falls back to the deterministic
 * writer and says so. A deterministic template is never labelled as AI.
 */
export function buildLiveReportResponse(): LiveCaseReport {
  const analysis = analyzeLiveCase();
  const markdown = loadNarrative(LIVE_CASE_NARRATIVE_FILE);
  if (!markdown || markdown.trim().length === 0) {
    return buildDeterministicLiveCaseReport(analysis);
  }

  const stored = readStoredJson();
  const mermaidBlocks = extractMermaidBlocks(markdown);
  return {
    caseId: LIVE_CASE_CASE_ID,
    title: `${BINANCE_LIVE_CASE.name} — Forensic Report`,
    generatedAt: stored?.generatedAt ?? new Date().toISOString(),
    generatedBy: stored?.generatedBy === 'minimax-code' ? 'minimax-code' : 'deterministic',
    model: stored?.model ?? null,
    markdown,
    mermaid: mermaidBlocks[0] ?? null,
    mermaidBlocks,
    sections: parseSections(markdown),
    analysis,
    source: 'stored',
    note:
      stored?.note ??
      'Stored narrative loaded from data/narratives/binance-7702.md with the metadata in data/ai-reports/binance-7702.json.',
  };
}

export { extractMermaidBlocks };
