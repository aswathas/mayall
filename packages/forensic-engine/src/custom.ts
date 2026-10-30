import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type {
  AttackVectorId,
  ForensicReport,
  GasFlameNode,
  PatternDetection,
  SimulationArtifact,
  SimulationResult,
  TraceNode,
} from '@helix/core';
import { ATTACK_VECTORS, resolveAttackVectorId } from '@helix/core';
import { foundryAvailable, foundryTool, repoRoot, runTool, type RunResult } from './foundry.js';
import { parseForgeTrace, flattenTrace } from './trace-parser.js';
import { runDetectors } from './detectors.js';
import { buildReport, reportToMarkdown } from './report.js';
import { buildForensicBundle } from './bundle.js';
import { artifactsDir, contractsDir, extractTraceText } from './simulator.js';

/**
 * The Custom Attack Lab engine.
 *
 * One Solidity test (`contracts/test/CustomAttack.t.sol`) is parameterised by
 * environment variables, so the same compiled test binary can reproduce every
 * family. This module plans the forge invocation, finalises the run through the
 * EXISTING trace parser / detectors / report / bundle builders, and persists the
 * result so the API can serve a report and a bundle by case id.
 *
 * Everything here is a LOCAL Foundry simulation. Nothing touches mainnet state.
 */

export type CustomVectorId =
  | 'reentrancy'
  | 'access-control'
  | 'oracle-manipulation'
  | 'flash-loan'
  | 'delegatecall'
  | 'selfdestruct';

export interface CustomVectorSpec {
  id: CustomVectorId;
  /** Human label rendered in the UI. */
  label: string;
  /** Family grouping used by the catalogue and the design contract. */
  family: string;
  /** Canonical vector in the core taxonomy. */
  vectorId: AttackVectorId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  /** What value the family removes from the target. */
  drains: string;
  /** The trust assumption the family breaks. */
  assumption: string;
  defaultTxs: number;
  defaultAmountEth: number;
}

/**
 * Catalogue consumed by both `/api/custom/options` and the UI.
 *
 * Labels and signatures come from `ATTACK_VECTORS` in `@helix/core`; the
 * family framing follows the "04 Attack Pattern Catalog" sheet of
 * `data/bible/forensic-bible.json` (Reentrancy, Access Control, Oracle
 * Manipulation, Flash Loan, Delegatecall, Infrastructure).
 */
export const CUSTOM_VECTORS: CustomVectorSpec[] = [
  {
    id: 'reentrancy',
    label: ATTACK_VECTORS.reentrancy.label,
    family: 'Logic & Math',
    vectorId: 'reentrancy',
    severity: 'critical',
    description:
      'A re-entrant receiver calls withdraw() while the caller balance is still full, so the vault pays the same deposit repeatedly inside one transaction.',
    drains: 'The shared ETH vault balance, re-paid per nested call',
    assumption: 'withdraw() sends ETH before zeroing balances, so receive() can re-enter',
    defaultTxs: 3,
    defaultAmountEth: 6,
  },
  {
    id: 'access-control',
    label: ATTACK_VECTORS['access-control'].label,
    family: 'Access & Control',
    vectorId: 'access-control',
    severity: 'high',
    description:
      'setOwner() carries no authorisation and drain() trusts a tx.origin owner check, so an untrusted caller reaches the privileged payout path.',
    drains: 'The vault balance through the privileged drain()',
    assumption: 'The owner slot is writable by anyone and drain() trusts tx.origin',
    defaultTxs: 3,
    defaultAmountEth: 6,
  },
  {
    id: 'oracle-manipulation',
    label: ATTACK_VECTORS['oracle-manipulation'].label,
    family: 'Oracle & Market',
    vectorId: 'oracle-manipulation',
    severity: 'critical',
    description:
      'Collateral is valued from the pool\'s own spot reserves. A plain ETH pump moves the quote, and the borrow limit grows with it inside the same transaction.',
    drains: 'The lending pool ETH lent against manipulated collateral',
    assumption: 'Collateral price is a spot reserve ratio with no TWAP or deviation bound',
    defaultTxs: 3,
    defaultAmountEth: 6,
  },
  {
    id: 'flash-loan',
    label: ATTACK_VECTORS['flash-loan'].label,
    family: 'Value Extraction',
    vectorId: 'flash-loan',
    severity: 'high',
    description:
      'The pool hands the borrower its balance and settles without checking that the principal came back. There is no repayment assertion.',
    drains: 'The pool balance handed out by an unsettled flash loan',
    assumption: 'flashLoan() never verifies settlement or applies an economic check',
    defaultTxs: 3,
    defaultAmountEth: 6,
  },
  {
    id: 'delegatecall',
    label: ATTACK_VECTORS['delegatecall-injection'].label,
    family: 'Access & Control',
    vectorId: 'delegatecall-injection',
    severity: 'critical',
    description:
      'execute() delegatecalls an implementation installed by an unauthenticated upgradeTo(), so attacker code runs in the host context and sweeps its balance.',
    drains: 'The host vault balance swept by the injected implementation',
    assumption: 'The implementation address is caller-supplied and never validated',
    defaultTxs: 3,
    defaultAmountEth: 6,
  },
  {
    id: 'selfdestruct',
    label: ATTACK_VECTORS['self-destruct'].label,
    family: 'Infrastructure',
    vectorId: 'self-destruct',
    severity: 'high',
    description:
      'After the unguarded owner takeover, destroy() executes SELFDESTRUCT and force-transfers the escrow balance to the caller-chosen recipient.',
    drains: 'The entire escrow balance, forwarded by SELFDESTRUCT',
    assumption: 'destroy() is reachable once the owner slot is rewritten',
    defaultTxs: 3,
    defaultAmountEth: 6,
  },
];

export const CUSTOM_VECTOR_BY_ID = new Map(CUSTOM_VECTORS.map((v) => [v.id, v]));

export const CUSTOM_LIMITS = {
  txs: { min: 1, max: 12, default: 3 },
  amountEth: { min: 0.000001, max: 1000, default: 6 },
  seed: { min: 0, max: 2_147_483_647, default: 1 },
} as const;

export const CUSTOM_TEST_FILE = 'test/CustomAttack.t.sol';
export const CUSTOM_TEST_NAME = 'testCustomAttack';

const CASE_ID_RE = /^custom-[a-z0-9-]+$/i;

export class CustomAttackError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'CustomAttackError';
    this.status = status;
  }
}

export function isCustomVector(value: string | undefined | null): value is CustomVectorId {
  return Boolean(value && CUSTOM_VECTOR_BY_ID.has(value as CustomVectorId));
}

export interface CustomAttackRequest {
  vector: CustomVectorId;
  /** 1..12 attacker transactions. */
  txs: number;
  /** Total wei to drain. */
  amountWei: bigint;
  seed?: number;
}

/** Loose input accepted at the API/CLI boundary. */
export interface CustomAttackInput {
  vector?: string | CustomVectorId;
  txs?: number | string;
  amountWei?: bigint | string | number;
  seed?: number | string;
}

export interface NormalisedCustomRequest {
  vector: CustomVectorId;
  txs: number;
  amountWei: bigint;
  seed: number;
}

export interface CustomTraceSummary {
  nodes: number;
  maxDepth: number;
  totalGas: number;
  valueTransfers: number;
  repeatedFrames: { label: string; count: number }[];
}

export interface CustomAttackResult {
  caseId: string;
  vector: CustomVectorId;
  vectorLabel: string;
  startedAt: string;
  durationMs: number;
  ok: boolean;
  command: string;
  request: { vector: CustomVectorId; txs: number; amountWei: string; seed: number };
  artifact: SimulationArtifact | null;
  trace: TraceNode | null;
  flame: GasFlameNode[];
  detections: PatternDetection[];
  report: ForensicReport;
  traceSummary: CustomTraceSummary;
  /** Absolute paths on disk. */
  artifactPath: string;
  reportPath: string;
  tracePath: string;
  bundlePath: string | null;
  bundleUrl: string;
  reportUrl: string;
  /** Last lines of forge output, for the console. */
  stdoutTail: string;
  traceText: string;
  stdout: string;
  stderr: string;
  sim: SimulationResult;
}

export function customDir(): string {
  return path.join(artifactsDir(), 'custom');
}

export function customArtifactPath(caseId: string): string {
  return path.join(customDir(), `${caseId}.json`);
}

export function customRunPath(caseId: string): string {
  return path.join(customDir(), `${caseId}.run.json`);
}

export function customReportPath(caseId: string): string {
  return path.join(customDir(), `${caseId}.report.json`);
}

export function customTracePath(caseId: string): string {
  return path.join(customDir(), `${caseId}.trace.txt`);
}

export function customBundlePath(caseId: string): string {
  return path.join(customDir(), `${caseId}-forensic-bundle.zip`);
}

export function customReportUrl(caseId: string): string {
  return `/api/custom/report/${encodeURIComponent(caseId)}`;
}

export function customBundleUrl(caseId: string): string {
  return `/api/custom/bundle/${encodeURIComponent(caseId)}`;
}

export function normaliseCustomRequest(input: CustomAttackInput): NormalisedCustomRequest {
  const rawVector = typeof input.vector === 'string' ? input.vector.trim().toLowerCase() : '';
  if (!isCustomVector(rawVector)) {
    throw new CustomAttackError(
      `Unknown attack family "${String(input.vector ?? '')}". Choose one of: ${CUSTOM_VECTORS.map((v) => v.id).join(', ')}.`,
    );
  }

  const spec = CUSTOM_VECTOR_BY_ID.get(rawVector) as CustomVectorSpec;

  const txsRaw = Number(input.txs ?? spec.defaultTxs);
  if (!Number.isFinite(txsRaw)) {
    throw new CustomAttackError('txs must be an integer between 1 and 12.');
  }
  const txs = Math.min(CUSTOM_LIMITS.txs.max, Math.max(CUSTOM_LIMITS.txs.min, Math.round(txsRaw)));

  let amountWei: bigint;
  try {
    amountWei = BigInt(input.amountWei ?? BigInt(Math.round(spec.defaultAmountEth * 1e6)) * 10n ** 12n);
  } catch {
    throw new CustomAttackError('amountWei must be an integer number of wei.');
  }
  if (amountWei <= 0n) {
    throw new CustomAttackError('amountWei must be greater than zero.');
  }
  const maxWei = BigInt(CUSTOM_LIMITS.amountEth.max) * 10n ** 18n;
  if (amountWei > maxWei) {
    throw new CustomAttackError(`amountWei must be at most ${CUSTOM_LIMITS.amountEth.max} ETH.`);
  }

  const seedRaw = Number(input.seed ?? CUSTOM_LIMITS.seed.default);
  const seed = Number.isFinite(seedRaw)
    ? Math.min(CUSTOM_LIMITS.seed.max, Math.max(CUSTOM_LIMITS.seed.min, Math.round(seedRaw)))
    : CUSTOM_LIMITS.seed.default;

  return { vector: rawVector, txs, amountWei, seed };
}

export interface CustomForgePlan {
  caseId: string;
  request: NormalisedCustomRequest;
  cwd: string;
  args: string[];
  env: Record<string, string>;
  artifactPath: string;
  startedAt: string;
  startedMs: number;
}

/** Prepares a forge invocation without executing it (used by the SSE route). */
export function planCustomRun(input: CustomAttackInput): CustomForgePlan {
  const request = normaliseCustomRequest(input);
  const startedMs = Date.now();
  const caseId = `custom-${request.vector}-${startedMs}`;

  mkdirSync(customDir(), { recursive: true });

  return {
    caseId,
    request,
    cwd: contractsDir(),
    args: ['test', '--match-path', CUSTOM_TEST_FILE, '--match-test', CUSTOM_TEST_NAME, '-vvvv'],
    env: {
      HELIX_ARTIFACT_DIR: customDir(),
      MAYALL_VECTOR: request.vector,
      MAYALL_TXS: String(request.txs),
      MAYALL_AMOUNT: request.amountWei.toString(),
      MAYALL_SEED: String(request.seed),
      MAYALL_ARTIFACT: caseId,
    },
    artifactPath: customArtifactPath(caseId),
    startedAt: new Date(startedMs).toISOString(),
    startedMs,
  };
}

/** Runs the planned forge invocation to completion. */
export async function runCustomAttack(
  input: CustomAttackInput,
  opts: { timeoutMs?: number; buildBundle?: boolean } = {},
): Promise<CustomAttackResult> {
  const plan = planCustomRun(input);

  if (!foundryAvailable()) {
    throw new CustomAttackError(
      'Foundry not found — expected the toolchain under .tools/foundry. Run `npm run setup:foundry`, then run the attack again.',
      503,
    );
  }

  const result = await runTool('forge', plan.args, {
    cwd: plan.cwd,
    env: plan.env,
    timeoutMs: opts.timeoutMs ?? 240_000,
  });

  return finalizeCustomRun(plan, result, opts);
}

/**
 * Turns raw forge output into the structured result. Shared by the POST route
 * and the SSE stream so both produce exactly the same evidence.
 */
export async function finalizeCustomRun(
  plan: CustomForgePlan,
  result: RunResult,
  opts: { buildBundle?: boolean } = {},
): Promise<CustomAttackResult> {
  const traceText = extractTraceText(result.stdout);
  const parsed = parseForgeTrace(traceText);

  let artifact: SimulationArtifact | null = null;
  const logs: string[] = [];

  if (existsSync(plan.artifactPath)) {
    try {
      const fresh = statSync(plan.artifactPath).mtimeMs >= plan.startedMs - 5_000;
      if (fresh) {
        artifact = JSON.parse(readFileSync(plan.artifactPath, 'utf-8')) as SimulationArtifact;
      } else {
        logs.push('Artifact file existed but was not written by this run.');
      }
    } catch (error) {
      logs.push(`Failed to parse artifact ${plan.artifactPath}: ${(error as Error).message}`);
    }
  } else {
    logs.push(`No artifact written to ${plan.artifactPath}`);
  }

  const passed = /\[PASS\]/.test(result.stdout) && !/\[FAIL/.test(result.stdout);
  const ok = result.code === 0 && passed && Boolean(artifact);

  /**
   * Harness cheatcode frames are noise for the detectors: `VM::envOr` echoes a
   * default literal (`"reentrancy"`) even when the env var selects another
   * family, and `VM::writeFile` echoes the whole artifact. The detectors already
   * skip `VM` trace nodes by design, so the same exclusion is applied to the
   * text they scan. The full trace is still stored for the evidence bundle.
   */
  const isHarnessLine = (line: string) => /\bVM::/.test(line);
  const detectorTraceText = traceText
    .split(/\r?\n/)
    .filter((line) => !isHarnessLine(line))
    .join('\n');

  const detections = runDetectors({
    artifact,
    nodes: parsed.nodes.filter((node) => node.contractName !== 'VM'),
    rawLines: parsed.rawLines.filter((line) => !isHarnessLine(line)),
    traceText: detectorTraceText,
  });

  const spec = CUSTOM_VECTOR_BY_ID.get(plan.request.vector) as CustomVectorSpec;
  const attackVector = resolveAttackVectorId(artifact?.attackVector ?? spec.vectorId);

  const sim: SimulationResult = {
    id: plan.caseId,
    scenario: artifact?.scenario ?? `custom-${plan.request.vector}`,
    attackVector,
    startedAt: plan.startedAt,
    durationMs: result.durationMs,
    ok,
    command: result.command,
    stdout: result.stdout,
    stderr: result.stderr,
    artifact,
    trace: parsed.root,
    flame: parsed.flame,
    detections,
    traceText,
    logs,
  };

  const report = buildReport(plan.caseId, sim, null);

  mkdirSync(customDir(), { recursive: true });
  writeFileSync(customTracePath(plan.caseId), traceText || 'No trace captured.', 'utf-8');
  writeFileSync(customReportPath(plan.caseId), JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(customRunPath(plan.caseId), JSON.stringify(serialiseRun(plan, result, sim, report), null, 2), 'utf-8');
  writeFileSync(path.join(customDir(), `${plan.caseId}.report.md`), reportToMarkdown(report), 'utf-8');

  let bundlePath: string | null = null;
  if (opts.buildBundle !== false) {
    try {
      const bundle = await buildForensicBundle(report, sim);
      bundlePath = customBundlePath(plan.caseId);
      writeFileSync(bundlePath, bundle.buffer);
    } catch (error) {
      logs.push(`Bundle build failed: ${(error as Error).message}`);
      bundlePath = null;
    }
  }

  const traceSummary = summariseTrace(parsed.root ?? null, parsed.flame);

  return {
    caseId: plan.caseId,
    vector: plan.request.vector,
    vectorLabel: spec.label,
    startedAt: plan.startedAt,
    durationMs: result.durationMs,
    ok,
    command: result.command,
    request: {
      vector: plan.request.vector,
      txs: plan.request.txs,
      amountWei: plan.request.amountWei.toString(),
      seed: plan.request.seed,
    },
    artifact,
    trace: parsed.root,
    flame: parsed.flame,
    detections,
    report,
    traceSummary,
    artifactPath: plan.artifactPath,
    reportPath: customReportPath(plan.caseId),
    tracePath: customTracePath(plan.caseId),
    bundlePath,
    bundleUrl: customBundleUrl(plan.caseId),
    reportUrl: customReportUrl(plan.caseId),
    stdoutTail: tail(result.stdout, 120),
    traceText,
    stdout: result.stdout,
    stderr: result.stderr,
    sim,
  };
}

function summariseTrace(root: TraceNode | null, flame: GasFlameNode[]): CustomTraceSummary {
  const nodes = flattenTrace(root);
  const counts = new Map<string, number>();
  for (const node of nodes) {
    if (!node.contractName || !node.fn || node.contractName === 'VM') continue;
    const key = `${node.contractName}::${node.fn}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const repeatedFrames = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));

  return {
    nodes: nodes.length,
    maxDepth: nodes.reduce((max, node) => Math.max(max, node.depth), 0),
    totalGas: flame.reduce((sum, node) => sum + node.gasUsed, 0),
    valueTransfers: nodes.filter((node) => node.isValueTransfer).length,
    repeatedFrames,
  };
}

function tail(text: string, lines: number): string {
  if (!text) return '';
  return text.split(/\r?\n/).slice(-lines).join('\n');
}

interface SerialisedRun {
  version: 1;
  caseId: string;
  vector: CustomVectorId;
  startedAt: string;
  durationMs: number;
  ok: boolean;
  command: string;
  request: { vector: CustomVectorId; txs: number; amountWei: string; seed: number };
  artifact: SimulationArtifact | null;
  detections: PatternDetection[];
  report: ForensicReport;
  traceText: string;
  stdout: string;
  stderr: string;
}

function serialiseRun(
  plan: CustomForgePlan,
  result: RunResult,
  sim: SimulationResult,
  report: ForensicReport,
): SerialisedRun {
  return {
    version: 1,
    caseId: plan.caseId,
    vector: plan.request.vector,
    startedAt: plan.startedAt,
    durationMs: result.durationMs,
    ok: sim.ok,
    command: result.command,
    request: {
      vector: plan.request.vector,
      txs: plan.request.txs,
      amountWei: plan.request.amountWei.toString(),
      seed: plan.request.seed,
    },
    artifact: sim.artifact,
    detections: sim.detections,
    report,
    traceText: sim.traceText,
    stdout: sim.stdout,
    stderr: sim.stderr,
  };
}

/** True when a persisted run exists for the case id. */
export function customRunExists(caseId: string): boolean {
  return CASE_ID_RE.test(caseId) && existsSync(customRunPath(caseId));
}

function readRun(caseId: string): SerialisedRun | null {
  if (!CASE_ID_RE.test(caseId)) return null;
  const file = customRunPath(caseId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as SerialisedRun;
  } catch {
    return null;
  }
}

/** Loads the persisted report for a case id. */
export function loadCustomReport(caseId: string): ForensicReport | null {
  const run = readRun(caseId);
  return run?.report ?? null;
}

/**
 * Rebuilds the SimulationResult needed by the bundle builder from the persisted
 * run. The trace itself is re-parsed from the stored forge output so the bundle
 * embeds the same evidence the live run showed.
 */
export function loadCustomSimulation(caseId: string): SimulationResult | null {
  const run = readRun(caseId);
  if (!run) return null;

  const parsed = parseForgeTrace(run.traceText);
  const spec = CUSTOM_VECTOR_BY_ID.get(run.vector);

  return {
    id: run.caseId,
    scenario: run.artifact?.scenario ?? `custom-${run.vector}`,
    attackVector: resolveAttackVectorId(run.artifact?.attackVector ?? spec?.vectorId ?? 'logic-error'),
    startedAt: run.startedAt,
    durationMs: run.durationMs,
    ok: run.ok,
    command: run.command,
    stdout: run.stdout,
    stderr: run.stderr,
    artifact: run.artifact,
    trace: parsed.root,
    flame: parsed.flame,
    detections: run.detections,
    traceText: run.traceText,
    logs: [],
  };
}

export interface CustomResultPayload {
  caseId: string;
  ok: boolean;
  vector: CustomVectorId;
  vectorLabel: string;
  startedAt: string;
  durationMs: number;
  command: string;
  request: { vector: CustomVectorId; txs: number; amountWei: string; seed: number };
  artifact: SimulationArtifact | null;
  trace: TraceNode | null;
  flame: GasFlameNode[];
  detections: PatternDetection[];
  report: ForensicReport;
  traceSummary: CustomTraceSummary;
  bundleUrl: string;
  reportUrl: string;
  stdoutTail: string;
  stderr: string;
}

/** Rehydrates a completed run for the case view (no forge invocation). */
export function loadCustomResult(caseId: string): CustomResultPayload | null {
  const run = readRun(caseId);
  if (!run) return null;

  const parsed = parseForgeTrace(run.traceText);
  const spec = CUSTOM_VECTOR_BY_ID.get(run.vector);
  const artifact = run.artifact;
  const attackVector = resolveAttackVectorId(artifact?.attackVector ?? spec?.vectorId ?? 'logic-error');

  // The run record stores the detection pass; rebuild the flame/summary from
  // the stored trace so the case view matches the live run exactly.
  const flame = parsed.flame;
  const nodes = flattenTrace(parsed.root);
  const counts = new Map<string, number>();
  for (const node of nodes) {
    if (!node.contractName || !node.fn || node.contractName === 'VM') continue;
    const key = `${node.contractName}::${node.fn}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return {
    caseId: run.caseId,
    ok: run.ok,
    vector: run.vector,
    vectorLabel: spec?.label ?? attackVector,
    startedAt: run.startedAt,
    durationMs: run.durationMs,
    command: run.command,
    request: run.request,
    artifact,
    trace: parsed.root,
    flame,
    detections: run.detections,
    report: run.report,
    traceSummary: {
      nodes: nodes.length,
      maxDepth: nodes.reduce((max, node) => Math.max(max, node.depth), 0),
      totalGas: flame.reduce((sum, node) => sum + node.gasUsed, 0),
      valueTransfers: nodes.filter((node) => node.isValueTransfer).length,
      repeatedFrames: [...counts.entries()]
        .filter(([, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, count]) => ({ label, count })),
    },
    bundleUrl: customBundleUrl(run.caseId),
    reportUrl: customReportUrl(run.caseId),
    stdoutTail: tail(run.stdout, 120),
    stderr: run.stderr,
  };
}

export interface CustomToolchainStatus {
  foundry: boolean;
  forgePath: string;
  contractsDir: string;
  testFile: string;
  testPresent: boolean;
}

export function customToolchain(): CustomToolchainStatus {
  const testPath = path.join(contractsDir(), CUSTOM_TEST_FILE);
  return {
    foundry: foundryAvailable(),
    forgePath: foundryTool('forge'),
    contractsDir: contractsDir(),
    testFile: CUSTOM_TEST_FILE,
    testPresent: existsSync(testPath),
  };
}

export function customOptions(): {
  vectors: CustomVectorSpec[];
  limits: typeof CUSTOM_LIMITS;
  toolchain: CustomToolchainStatus;
  repoRoot: string;
} {
  return {
    vectors: CUSTOM_VECTORS,
    limits: CUSTOM_LIMITS,
    toolchain: customToolchain(),
    repoRoot: repoRoot(),
  };
}
