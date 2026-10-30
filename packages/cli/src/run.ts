import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SimulationResult } from '@helix/core';
import {
  INCIDENTS,
  SCENARIOS,
  SCENARIO_BY_ID,
  analyseSession,
  artifactsDir,
  buildClientPlan,
  buildRemediationMarkdown,
  buildReport,
  contractsDir,
  extractTraceText,
  loadNarrative,
  parseForgeTrace,
  repoRoot,
  runDetectors,
  runSimulation,
  runTool,
  saveNarrative,
  verifyIsolation,
  type SessionArtifact,
  type SessionAnalysis,
} from '@helix/forensic-engine';
import { authorNarrative, type NarrativeResult } from './narrative.js';
import { loadRun, utcStamp, writeBundle, writeRunFolder, type RunFolderInput } from './folder.js';

export const LONG_SESSION_ID = 'long-session';
const LONG_SESSION_TEST = 'test/LongSession.t.sol';
const DEFAULT_ATTACK_INDEX = 137;

export interface RunOptions {
  scenario: string;
  out?: string;
  tx: number;
  narrative: boolean;
  bundle: boolean;
}

function attackIndexFor(txCount: number): number {
  const count = Math.max(1, txCount);
  return Math.max(0, Math.min(DEFAULT_ATTACK_INDEX, count - 1));
}

async function executeLongSession(txCount: number): Promise<SimulationResult> {
  const started = new Date();
  const outDir = artifactsDir();
  const artifactPath = path.join(outDir, `${LONG_SESSION_ID}.json`);
  const before = existsSync(artifactPath) ? statSync(artifactPath).mtimeMs : 0;
  const attackIndex = attackIndexFor(txCount);

  const res = await runTool(
    'forge',
    ['test', '--match-path', LONG_SESSION_TEST, '--match-test', 'testExploit', '-vvvv'],
    {
      cwd: contractsDir(),
      env: {
        HELIX_ARTIFACT_DIR: outDir,
        HELIX_TX_COUNT: String(txCount),
        HELIX_ATTACK_INDEX: String(attackIndex),
      },
      timeoutMs: 240_000,
    },
  );

  const traceText = extractTraceText(res.stdout);
  const parsed = parseForgeTrace(traceText);

  let artifact: SessionArtifact | null = null;
  const logs: string[] = [];
  if (existsSync(artifactPath) && statSync(artifactPath).mtimeMs >= before) {
    try {
      artifact = JSON.parse(readFileSync(artifactPath, 'utf-8')) as SessionArtifact;
    } catch (e) {
      logs.push(`Failed to parse artifact: ${(e as Error).message}`);
    }
  } else {
    logs.push('Artifact file was not refreshed by this run.');
  }

  const passed = /\[PASS\]/.test(res.stdout) && !/\[FAIL/.test(res.stdout);
  const detections = runDetectors({
    artifact,
    nodes: parsed.nodes,
    rawLines: parsed.rawLines,
    traceText,
  });

  return {
    id: `mayall-${Date.now()}-${LONG_SESSION_ID}`,
    scenario: LONG_SESSION_ID,
    attackVector: 'reentrancy',
    startedAt: started.toISOString(),
    durationMs: res.durationMs,
    ok: res.code === 0 && passed && !!artifact,
    command: res.command,
    stdout: res.stdout,
    stderr: res.stderr,
    artifact,
    trace: parsed.root,
    flame: parsed.flame,
    detections,
    traceText,
    logs,
  };
}

function incidentFor(scenarioId: string) {
  return INCIDENTS.find((i) => i.scenarioId === scenarioId) ?? null;
}

function reproduceCommands(scenarioId: string, txCount: number, folder: string): string[] {
  const rel = path.relative(repoRoot(), folder).split(path.sep).join('/');
  if (scenarioId === LONG_SESSION_ID) {
    return [
      `cd contracts && ../.tools/foundry/forge.exe test --match-path ${LONG_SESSION_TEST} --match-test testExploit -vvvv`,
      `cd .. && npx tsx packages/cli/src/index.ts run --scenario ${LONG_SESSION_ID} --tx ${txCount} --out ${rel}`,
    ];
  }
  const spec = SCENARIO_BY_ID.get(scenarioId);
  return [
    `cd contracts && ../.tools/foundry/forge.exe test --match-path ${spec?.testFile ?? 'test'} --match-test testExploit -vvvv`,
    `cd .. && npx tsx packages/cli/src/index.ts run --scenario ${scenarioId} --out ${rel}`,
  ];
}

const REQUIRED_FILES = [
  'MANIFEST.md',
  'report/report.md',
  'report/report.json',
  'report/report.html',
  'raw/forge-stdout.txt',
  'raw/forge-stderr.txt',
  'raw/trace.txt',
  'raw/trace.json',
  'raw/artifact.json',
  'raw/environment.json',
  'derived/storage-diff.csv',
  'derived/balance-timeline.csv',
  'derived/transaction-timeline.csv',
  'derived/gas-flame.json',
  'derived/signals.json',
  'derived/patterns.json',
  'narrative/executive-summary.md',
  'plan/client-plan.md',
  'plan/remediation.md',
];

export interface ScenarioOutcome {
  scenarioId: string;
  folder: string;
  sim: SimulationResult;
  analysis: SessionAnalysis;
  narrative: NarrativeResult;
  isolation?: ReturnType<typeof verifyIsolation>;
  missing: string[];
}

function logHeader(scenarioId: string): void {
  console.log('');
  console.log(`━━ MAYALL · ${scenarioId} ${'━'.repeat(Math.max(0, 54 - scenarioId.length))}`);
}

async function runOne(
  scenarioId: string,
  folder: string,
  opts: RunOptions,
): Promise<ScenarioOutcome> {
  logHeader(scenarioId);
  const sim = scenarioId === LONG_SESSION_ID ? await executeLongSession(opts.tx) : await runSimulation(scenarioId);
  console.log(`  simulation    ${sim.ok ? 'PASS' : 'FAIL'} (${sim.durationMs} ms)`);
  if (!sim.ok) {
    if (sim.stderr) console.log(`  stderr        ${sim.stderr.split('\n')[0]}`);
    if (sim.logs.length) console.log(`  note          ${sim.logs.join('; ')}`);
  }

  const caseId = path.basename(folder);
  const analysis = analyseSession(sim.trace, sim.artifact);
  const incident = incidentFor(scenarioId);

  let report = buildReport(caseId, sim, incident);
  let narrative: NarrativeResult;

  if (opts.narrative) {
    narrative = await authorNarrative({
      report,
      analysis,
      artifact: sim.artifact,
      scenario: scenarioId,
      caseId,
      fallback: report.executiveSummary,
    });
    saveNarrative(caseId, narrative.text);
    report = buildReport(caseId, sim, incident);
  } else {
    narrative = {
      text: report.executiveSummary,
      author: 'deterministic summary (no LLM requested)',
      method: 'deterministic',
      note: 'No LLM was requested; the executive summary is the engine’s deterministic summary.',
      generatedBy: 'deterministic',
    };
  }

  const plan = buildClientPlan(analysis, report, { artifact: sim.artifact, scenario: scenarioId });
  const remediation = buildRemediationMarkdown(analysis, report, {
    artifact: sim.artifact,
    scenario: scenarioId,
  });

  const isolation =
    scenarioId === LONG_SESSION_ID && sim.artifact
      ? verifyIsolation(analysis, (sim.artifact as SessionArtifact).attackTxIndex)
      : undefined;

  const input: RunFolderInput = {
    folder,
    sim,
    analysis,
    report,
    plan,
    remediation,
    narrative,
    scenarioId,
    txCount: scenarioId === LONG_SESSION_ID ? opts.tx : undefined,
    isolation,
    reproduce: reproduceCommands(scenarioId, opts.tx, folder),
  };
  await writeRunFolder(input);

  if (opts.bundle && sim.artifact) {
    await writeBundle(folder, sim, report);
  }

  const missing = REQUIRED_FILES.filter((rel) => !existsSync(path.join(folder, rel)));

  const suspiciousList = analysis.suspicious
    .map((s) => `index ${s.index}, ${s.label ?? 'signal'}, ${Math.round(s.confidence * 100)}% confidence`)
    .join('; ');
  console.log(
    `  transactions  ${analysis.transactions.length} analysed, ${analysis.suspicious.length} suspicious${suspiciousList ? ` (${suspiciousList})` : ''}`,
  );
  for (const s of analysis.suspicious) {
    console.log(`    · tx ${s.index} — ${s.reasons.join(' | ')}`);
  }
  if (isolation) {
    console.log(`  isolation     ${isolation.ok ? 'PASS' : 'FAIL'} — ${isolation.detail}`);
  }
  if (analysis.transactions.length > 1 && !isolation) {
    console.log(`  clean         ${analysis.cleanCount} transactions below the confidence floor`);
  }
  console.log(`  narrative     ${narrative.author}`);
  console.log(`  plan          ${path.join(folder, 'plan', 'client-plan.md')}`);
  console.log(`  folder        ${folder}`);
  console.log(`  files         ${missing.length ? `MISSING ${missing.join(', ')}` : 'complete'}`);

  return { scenarioId, folder, sim, analysis, narrative, isolation, missing };
}

function resolveScenarioList(scenario: string): string[] {
  if (scenario === 'all') return [...SCENARIOS.map((s) => s.id), LONG_SESSION_ID];
  const known = SCENARIOS.some((s) => s.id === scenario) || scenario === LONG_SESSION_ID;
  if (!known) {
    throw new Error(
      `Unknown scenario "${scenario}". Run \`mayall list\` to see the available scenarios.`,
    );
  }
  return [scenario];
}

function writeAllIndex(parent: string, stamp: string, outcomes: ScenarioOutcome[]): void {
  mkdirSync(parent, { recursive: true });
  const lines: string[] = [];
  lines.push(`# MAYALL run — ${stamp}`);
  lines.push('');
  lines.push(`**Scenarios:** ${outcomes.length}  `);
  lines.push(`**Generated:** ${new Date().toISOString()}  `);
  lines.push('');
  lines.push('| scenario | simulation | transactions | suspicious | folder |');
  lines.push('| --- | --- | ---: | ---: | --- |');
  for (const o of outcomes) {
    lines.push(
      `| ${o.scenarioId} | ${o.sim.ok ? 'PASS' : 'FAIL'} | ${o.analysis.transactions.length} | ${o.analysis.suspicious.length} | \`${o.scenarioId}/\` |`,
    );
  }
  lines.push('');
  lines.push('Each subfolder is a complete run: raw evidence, derived signals, report, narrative, client plan and bundle.');
  writeFileSync(path.join(parent, 'MANIFEST.md'), lines.join('\n'), 'utf-8');
}

export async function runCommand(opts: RunOptions): Promise<number> {
  const list = resolveScenarioList(opts.scenario);
  const stamp = utcStamp();
  const repo = repoRoot();
  const baseOut = opts.out
    ? path.resolve(repo, opts.out)
    : path.join(repo, 'artifacts', 'runs', `${stamp}-${opts.scenario}`);

  if (list.length === 1) {
    const outcome = await runOne(list[0], baseOut, opts);
    console.log('');
    console.log(`  bundle        ${opts.bundle ? path.join(baseOut, 'bundle') : 'skipped (--no-bundle)'}`);
    return outcome.sim.ok && outcome.missing.length === 0 ? 0 : 1;
  }

  const outcomes: ScenarioOutcome[] = [];
  for (const scenarioId of list) {
    const folder = path.join(baseOut, scenarioId);
    outcomes.push(await runOne(scenarioId, folder, opts));
  }
  writeAllIndex(baseOut, stamp, outcomes);
  const failed = outcomes.filter((o) => !o.sim.ok || o.missing.length > 0);
  console.log('');
  console.log(`  index         ${path.join(baseOut, 'MANIFEST.md')}`);
  console.log(`  scenarios     ${outcomes.length - failed.length}/${outcomes.length} complete`);
  return failed.length ? 1 : 0;
}

export async function analyzeCommand(folderArg: string): Promise<number> {
  const folder = path.resolve(repoRoot(), folderArg);
  const loaded = loadRun(folder);
  const analysis = analyseSession(loaded.trace, loaded.artifact);
  const incident = incidentFor(loaded.scenario);
  const report = buildReport(loaded.caseRef, loaded.sim, incident);
  const plan = buildClientPlan(analysis, report, {
    artifact: loaded.artifact,
    scenario: loaded.scenario,
  });
  const remediation = buildRemediationMarkdown(analysis, report, {
    artifact: loaded.artifact,
    scenario: loaded.scenario,
  });

  const savedNarrative = loadNarrative(loaded.caseRef);
  const narrative: NarrativeResult = savedNarrative
    ? {
        text: savedNarrative,
        author: 'previously saved narrative',
        method: 'cmdc',
        note: 'Loaded the narrative stored in data/narratives for this case.',
        generatedBy: 'stored narrative',
      }
    : {
        text: report.executiveSummary,
        author: 'deterministic summary (no LLM available)',
        method: 'deterministic',
        note: 'No saved narrative was found; the executive summary is the engine’s deterministic summary.',
        generatedBy: 'deterministic',
      };

  const isolation =
    loaded.scenario === LONG_SESSION_ID && loaded.artifact
      ? verifyIsolation(analysis, (loaded.artifact as SessionArtifact).attackTxIndex)
      : undefined;

  await writeRunFolder({
    folder,
    sim: loaded.sim,
    analysis,
    report,
    plan,
    remediation,
    narrative,
    scenarioId: loaded.scenario,
    txCount: (loaded.artifact as SessionArtifact | null)?.txCount,
    isolation,
    reproduce: [loaded.sim.command || 'npx tsx packages/cli/src/index.ts run --scenario <id>'],
    skipRaw: true,
  });

  logHeader(`${loaded.scenario} (re-analysis)`);
  console.log(`  folder        ${folder}`);
  console.log(`  transactions  ${analysis.transactions.length} analysed, ${analysis.suspicious.length} suspicious`);
  for (const s of analysis.suspicious) {
    console.log(`    · tx ${s.index} — ${s.reasons.join(' | ')}`);
  }
  if (isolation) console.log(`  isolation     ${isolation.ok ? 'PASS' : 'FAIL'} — ${isolation.detail}`);
  console.log(`  narrative     ${narrative.author}`);
  console.log(`  report        ${path.join(folder, 'report', 'report.md')}`);
  return analysis.transactions.length ? 0 : 1;
}

export async function bundleCommand(folderArg: string): Promise<number> {
  const folder = path.resolve(repoRoot(), folderArg);
  const loaded = loadRun(folder);
  const report = buildReport(loaded.caseRef, loaded.sim, incidentFor(loaded.scenario));
  const out = await writeBundle(folder, loaded.sim, report);
  console.log(`bundle rebuilt: ${out}`);
  return 0;
}
