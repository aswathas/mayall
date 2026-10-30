import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import type { ForensicReport, SimulationArtifact, SimulationResult, TraceNode } from '@helix/core';
import { resolveAttackVectorId } from '@helix/core';
import {
  buildForensicBundle,
  buildFlame,
  contractsDir,
  flattenTrace,
  repoRoot,
  reportToMarkdown,
  renderReportHtml,
  runDetectors,
  runTool,
  sha256,
  type ClientPlan,
  type IsolationCheck,
  type SessionAnalysis,
} from '@helix/forensic-engine';

export interface NarrativeFile {
  text: string;
  author: string;
  method: string;
  note: string;
}

export interface RunFolderInput {
  folder: string;
  sim: SimulationResult;
  analysis: SessionAnalysis;
  report: ForensicReport;
  plan: ClientPlan;
  remediation: string;
  narrative: NarrativeFile;
  scenarioId: string;
  txCount?: number;
  isolation?: IsolationCheck;
  reproduce: string[];
  /** Re-analysis: leave the raw/ evidence untouched. */
  skipRaw?: boolean;
}

export interface FileEntry {
  path: string;
  bytes: number;
  sha256: string;
}

export function utcStamp(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function write(folder: string, rel: string, content: string): void {
  const p = path.join(folder, rel);
  ensureDir(path.dirname(p));
  writeFileSync(p, content, 'utf-8');
}

function listFiles(dir: string, root = dir): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, root));
    else out.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return out.sort();
}

/** Index of every file in the folder, except the manifest and the bundle itself. */
export function indexFolder(folder: string): FileEntry[] {
  return listFiles(folder)
    .filter((rel) => rel !== 'MANIFEST.md' && !rel.startsWith('bundle/'))
    .map((rel) => {
      const buf = readFileSync(path.join(folder, rel));
      return { path: rel, bytes: buf.byteLength, sha256: createHash('sha256').update(buf).digest('hex') };
    });
}

const FILE_NOTES: { test: RegExp; note: string }[] = [
  { test: /^report\/report\.md$/, note: 'Written forensic report (Markdown).' },
  { test: /^report\/report\.json$/, note: 'Machine-readable forensic report.' },
  { test: /^report\/report\.html$/, note: 'Print-ready, self-contained HTML report (A4).' },
  { test: /^raw\/forge-stdout\.txt$/, note: 'Exact forge stdout from the simulation.' },
  { test: /^raw\/forge-stderr\.txt$/, note: 'Exact forge stderr from the simulation.' },
  { test: /^raw\/trace\.txt$/, note: 'Raw call tree as text (the evidence).' },
  { test: /^raw\/trace\.json$/, note: 'Parsed call tree: nodes, gas, depth.' },
  { test: /^raw\/artifact\.json$/, note: 'Structured artifact written by the PoC.' },
  { test: /^raw\/environment\.json$/, note: 'Forge, solc, node, OS and cwd at run time.' },
  { test: /^derived\/storage-diff\.csv$/, note: 'Storage slots the attack mutated, before vs after.' },
  { test: /^derived\/balance-timeline\.csv$/, note: 'Balance movements for the measured actors.' },
  { test: /^derived\/transaction-timeline\.csv$/, note: 'One row per segmented transaction.' },
  { test: /^derived\/gas-flame\.json$/, note: 'Gas flame derived from the trace.' },
  { test: /^derived\/signals\.json$/, note: 'Derived signals the heuristics read.' },
  { test: /^derived\/patterns\.json$/, note: 'Heuristic pattern findings.' },
  { test: /^narrative\/executive-summary\.md$/, note: 'Executive summary (LLM-authored where available).' },
  { test: /^plan\/client-plan\.md$/, note: 'Where the flaw was and what to do Monday morning.' },
  { test: /^plan\/remediation\.md$/, note: 'Code-level remediation for the attack vector.' },
];

function noteFor(rel: string): string {
  return FILE_NOTES.find((f) => f.test.test(rel))?.note ?? '';
}

function transactionTimelineCsv(analysis: SessionAnalysis): string {
  const rows = ['index,contract,function,address,gasUsed,valueWei,childCalls,suspicious,confidence,reasons'];
  const byIndex = new Map(analysis.suspicious.map((s) => [s.index, s]));
  for (const tx of analysis.transactions) {
    const s = byIndex.get(tx.index);
    rows.push(
      [
        tx.index,
        tx.contractName,
        tx.fn,
        tx.address,
        tx.gasUsed,
        tx.valueWei,
        tx.childCalls,
        s ? 'yes' : 'no',
        s ? s.confidence : '',
        s ? s.reasons.join('; ') : '',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return rows.join('\n');
}

export function storageDiffCsv(artifact: SimulationArtifact | null): string {
  const rows = ['contract,contractName,slot,label,kind,before,after,changed'];
  for (const w of artifact?.storageWrites ?? []) {
    rows.push(
      [w.contract, w.contractName, w.slot, w.label, w.kind, w.before, w.after, w.before !== w.after]
        .map(csvCell)
        .join(','),
    );
  }
  return rows.join('\n');
}

export function balanceTimelineCsv(artifact: SimulationArtifact | null): string {
  const rows = ['address,label,beforeWei,afterWei,deltaWei'];
  for (const b of artifact?.balances ?? []) {
    rows.push([b.address, b.label, b.beforeWei, b.afterWei, b.deltaWei].map(csvCell).join(','));
  }
  return rows.join('\n');
}

export function stepTimelineCsv(artifact: SimulationArtifact | null): string {
  const rows = ['step,title,description,txHash,gasUsed,valueWei'];
  for (const s of artifact?.steps ?? []) {
    rows.push([s.n, s.title, s.description, s.txHash, s.gasUsed, s.valueWei].map(csvCell).join(','));
  }
  return rows.join('\n');
}

export async function collectEnvironment(command: string): Promise<Record<string, unknown>> {
  const res = await runTool('forge', ['--version'], { cwd: repoRoot(), timeoutMs: 30_000 });
  let solc = 'unknown';
  try {
    const toml = readFileSync(path.join(contractsDir(), 'foundry.toml'), 'utf-8');
    const m = toml.match(/^\s*solc\s*=\s*"([^"]+)"/m);
    if (m) solc = m[1];
  } catch {
    /* keep unknown */
  }
  return {
    generatedAt: new Date().toISOString(),
    command,
    forge: res.stdout.trim() || res.stderr.trim() || 'unknown',
    solc,
    node: process.version,
    os: `${os.platform()} ${os.release()}`,
    arch: process.arch,
    cwd: repoRoot(),
  };
}

function traceJson(sim: SimulationResult): string {
  const nodes = flattenTrace(sim.trace).map((n) => ({
    id: n.id,
    depth: n.depth,
    address: n.address,
    contractName: n.contractName,
    fn: n.fn,
    gasUsed: n.gasUsed,
    isExternalCall: n.isExternalCall,
    isValueTransfer: n.isValueTransfer,
    children: n.children.length,
    raw: n.raw,
  }));
  return JSON.stringify(
    {
      scenario: sim.scenario,
      nodeCount: nodes.length,
      root: sim.trace,
      nodes,
      flame: sim.flame,
    },
    null,
    2,
  );
}

function renderManifest(input: RunFolderInput, files: FileEntry[], environment: Record<string, unknown>): string {
  const { report, plan, analysis, narrative, isolation, sim } = input;
  const suspicious = analysis.suspicious;
  const out: string[] = [];
  out.push(`# MANIFEST — ${report.caseRef}`);
  out.push('');
  out.push(`**Scenario:** ${input.scenarioId}  `);
  out.push(`**Generated:** ${new Date().toISOString()}  `);
  out.push(`**Simulation status:** ${sim.ok ? 'PASS' : 'FAILED'}  `);
  out.push(`**Attack vector:** ${plan.vectorLabel}  `);
  out.push(`**Severity:** ${report.severity.toUpperCase()}  `);
  out.push(`**Transactions analysed:** ${analysis.transactions.length}  `);
  out.push(`**Suspicious transactions:** ${suspicious.length}${suspicious.length ? ` (index ${suspicious.map((s) => s.index).join(', ')})` : ''}  `);
  out.push(`**Executive summary author:** ${narrative.author}`);
  out.push('');

  out.push('## What this folder is');
  out.push('');
  out.push(
    'A complete forensic run for one exploit scenario. `raw/` holds the evidence exactly as the Foundry simulation produced it. `derived/` holds only conclusions that can be recomputed from `raw/`: transaction segmentation, signals, heuristic findings, storage diffs, balance movements and the gas flame. `report/`, `narrative/` and `plan/` are the client-facing deliverables.',
  );
  out.push('');

  out.push('## Exactly how it was produced');
  out.push('');
  out.push(`1. Ran \`${sim.command || '(command not recorded)'}\` from \`contracts/\`, with \`HELIX_ARTIFACT_DIR\` pointing at the artifacts directory.`);
  if (input.txCount) out.push(`2. The session was driven with \`HELIX_TX_COUNT=${input.txCount}\`; the PoC planted the attack at transaction index ${analysis.attackTxIndex ?? 'unknown'}.`);
  else out.push('2. The PoC wrote its structured artifact to `$HELIX_ARTIFACT_DIR/<scenario>.json`.');
  out.push('3. Parsed the forge call tree into a rooted node tree with gas and depth (`raw/trace.json`).');
  out.push('4. Segmented the root\'s top-level calls into transactions, filtering `VM::` cheatcode frames (`derived/transaction-timeline.csv`).');
  out.push('5. Re-ran the pattern detectors per transaction and scored each one from three signals: pattern findings, repeated `(contract, function)` pairs, and value leaving the victim (`derived/signals.json`, `derived/patterns.json`).');
  out.push('6. Built the report, the client plan and the remediation from the same evidence, then wrote the narrative and the bundle.');
  out.push('');

  out.push('## Reproduce');
  out.push('');
  out.push('```bash');
  for (const command of input.reproduce) out.push(command);
  out.push('```');
  out.push('');

  out.push('## Verification');
  out.push('');
  if (isolation) {
    out.push(`- Transaction isolation self-check: **${isolation.ok ? 'PASS' : 'FAIL'}** — ${isolation.detail}.`);
  } else {
    out.push(`- Segmentation: ${analysis.transactions.length} top-level transactions, ${suspicious.length} suspicious.`);
  }
  out.push(`- Detector findings: ${report.findings.length} (top: ${report.findings[0]?.label ?? 'none'}, ${Math.round((report.findings[0]?.confidence ?? 0) * 100)}%).`);
  out.push(`- Narrative: ${narrative.note}`);
  out.push('');

  out.push('## Environment');
  out.push('');
  for (const [k, v] of Object.entries(environment)) {
    out.push(`- **${k}:** ${String(v).replace(/\r?\n/g, ' · ')}`);
  }
  out.push('');

  out.push('## File index');
  out.push('');
  out.push('| path | bytes | sha256 | what |');
  out.push('| --- | ---: | --- | --- |');
  for (const f of files) {
    out.push(`| \`${f.path}\` | ${f.bytes} | \`${f.sha256.slice(0, 16)}…\` | ${noteFor(f.path)} |`);
  }
  out.push('');
  out.push('_MANIFEST.md is this file and is not listed. Hashes are SHA-256 of the file on disk._');
  return out.join('\n');
}

/**
 * Writes a complete run folder. Raw evidence is written on a fresh run and
 * left untouched when re-analysing an existing folder.
 */
export async function writeRunFolder(input: RunFolderInput): Promise<FileEntry[]> {
  const { folder, sim, analysis, report, plan, remediation, narrative } = input;
  ensureDir(folder);

  const envPath = path.join(folder, 'raw', 'environment.json');
  let environment: Record<string, unknown>;
  if (input.skipRaw && existsSync(envPath)) {
    try {
      environment = JSON.parse(readFileSync(envPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      environment = await collectEnvironment(sim.command);
    }
  } else {
    environment = await collectEnvironment(sim.command);
    write(folder, 'raw/environment.json', JSON.stringify(environment, null, 2));
  }

  if (!input.skipRaw) {
    write(folder, 'raw/forge-stdout.txt', sim.stdout || '');
    write(folder, 'raw/forge-stderr.txt', sim.stderr || '');
    write(folder, 'raw/trace.txt', sim.traceText || 'No trace captured.');
    write(folder, 'raw/trace.json', traceJson(sim));
    write(
      folder,
      'raw/artifact.json',
      JSON.stringify(
        sim.artifact ?? { note: 'No structured artifact was produced by the simulation.' },
        null,
        2,
      ),
    );
  }

  write(folder, 'derived/storage-diff.csv', storageDiffCsv(sim.artifact));
  write(folder, 'derived/balance-timeline.csv', balanceTimelineCsv(sim.artifact));
  write(folder, 'derived/transaction-timeline.csv', transactionTimelineCsv(analysis));
  write(folder, 'derived/gas-flame.json', JSON.stringify(sim.flame, null, 2));
  write(
    folder,
    'derived/signals.json',
    JSON.stringify(
      {
        transactions: analysis.transactions.length,
        suspicious: analysis.suspicious.length,
        clean: analysis.cleanCount,
        attackTxIndex: analysis.attackTxIndex ?? null,
        ...analysis.signals,
      },
      null,
      2,
    ),
  );
  write(folder, 'derived/patterns.json', JSON.stringify(sim.detections, null, 2));

  write(folder, 'report/report.md', reportToMarkdown(report));
  write(folder, 'report/report.json', JSON.stringify(report, null, 2));
  write(folder, 'report/report.html', renderReportHtml(report));

  write(folder, 'narrative/executive-summary.md', narrative.text);
  write(folder, 'plan/client-plan.md', plan.markdown);
  write(folder, 'plan/remediation.md', remediation);

  const files = indexFolder(folder);
  write(folder, 'MANIFEST.md', renderManifest(input, files, environment));
  return indexFolder(folder);
}

/** Rebuilds the forensic bundle and adds the new artefacts to the engine bundle. */
export async function writeBundle(folder: string, sim: SimulationResult, report: ForensicReport): Promise<string> {
  const base = await buildForensicBundle(report, sim);
  const zip = await JSZip.loadAsync(base.buffer);
  const extras = [
    'MANIFEST.md',
    'report/report.html',
    'derived/transaction-timeline.csv',
    'derived/signals.json',
    'derived/storage-diff.csv',
    'derived/balance-timeline.csv',
    'narrative/executive-summary.md',
    'plan/client-plan.md',
    'plan/remediation.md',
  ];
  for (const rel of extras) {
    const p = path.join(folder, rel);
    if (existsSync(p)) zip.file(rel, readFileSync(p, 'utf-8'));
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const outDir = path.join(folder, 'bundle');
  ensureDir(outDir);
  const out = path.join(outDir, base.filename);
  writeFileSync(out, buffer);
  return out;
}

export interface LoadedRun {
  folder: string;
  caseRef: string;
  scenario: string;
  sim: SimulationResult;
  artifact: SimulationArtifact | null;
  trace: TraceNode | null;
}

function readText(p: string): string {
  try {
    return readFileSync(p, 'utf-8');
  } catch {
    return '';
  }
}

/** Loads an existing run folder back into the engine's runtime shapes. */
export function loadRun(folder: string): LoadedRun {
  const abs = path.resolve(folder);
  if (!existsSync(abs)) throw new Error(`Run folder not found: ${abs}`);
  const caseRef = path.basename(abs);

  let artifact: SimulationArtifact | null = null;
  const artifactPath = path.join(abs, 'raw', 'artifact.json');
  if (existsSync(artifactPath)) {
    try {
      const parsed = JSON.parse(readFileSync(artifactPath, 'utf-8')) as SimulationArtifact & { note?: string };
      if (!parsed.note) artifact = parsed;
    } catch {
      artifact = null;
    }
  }

  let trace: TraceNode | null = null;
  const tracePath = path.join(abs, 'raw', 'trace.json');
  if (existsSync(tracePath)) {
    try {
      const parsed = JSON.parse(readFileSync(tracePath, 'utf-8')) as { root?: TraceNode };
      trace = parsed.root ?? null;
    } catch {
      trace = null;
    }
  }

  let environment: { command?: string } = {};
  const envPath = path.join(abs, 'raw', 'environment.json');
  if (existsSync(envPath)) {
    try {
      environment = JSON.parse(readFileSync(envPath, 'utf-8')) as { command?: string };
    } catch {
      environment = {};
    }
  }

  const traceText = readText(path.join(abs, 'raw', 'trace.txt'));
  const stdout = readText(path.join(abs, 'raw', 'forge-stdout.txt'));
  const stderr = readText(path.join(abs, 'raw', 'forge-stderr.txt'));
  const nodes = flattenTrace(trace);
  const rawLines = nodes.map((n) => n.raw);

  const sim: SimulationResult = {
    id: `reanalysis-${caseRef}`,
    scenario: artifact?.scenario ?? caseRef,
    attackVector: resolveAttackVectorId(artifact?.attackVector ?? 'logic-error'),
    startedAt: statSync(abs).mtime.toISOString(),
    durationMs: 0,
    ok: !!artifact && trace !== null,
    command: environment.command ?? '',
    stdout,
    stderr,
    artifact,
    trace,
    flame: buildFlame(trace),
    detections: runDetectors({ artifact, nodes, rawLines, traceText }),
    traceText,
    logs: ['Re-analysed from the raw evidence in this folder.'],
  };

  return { folder: abs, caseRef, scenario: sim.scenario, sim, artifact, trace };
}
