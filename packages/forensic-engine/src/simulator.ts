import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { SimulationArtifact, SimulationResult } from '@helix/core';
import { resolveAttackVectorId } from '@helix/core';
import { foundryAvailable, repoRoot, runTool } from './foundry.js';
import { parseForgeTrace } from './trace-parser.js';
import { runDetectors } from './detectors.js';
import { SCENARIOS, SCENARIO_BY_ID } from './scenarios.js';

export function contractsDir(): string {
  return path.join(repoRoot(), 'contracts');
}

export function artifactsDir(): string {
  return path.join(repoRoot(), 'artifacts');
}

export interface SimulationOptions {
  /** Keep the previous artifact file instead of requiring a fresh one. */
  allowStaleArtifact?: boolean;
  timeoutMs?: number;
}

/**
 * Executes a Foundry exploit scenario end to end:
 *   1. runs the PoC test with full verbosity so the call tree is emitted
 *   2. reads the structured artifact the test wrote
 *   3. parses the trace, derives a gas flame, runs the pattern detectors
 */
export async function runSimulation(
  scenarioId: string,
  opts: SimulationOptions = {},
): Promise<SimulationResult> {
  const spec = SCENARIO_BY_ID.get(scenarioId);
  const started = new Date();
  const id = `sim-${Date.now()}-${scenarioId}`;

  if (!spec) {
    return {
      id,
      scenario: scenarioId,
      attackVector: 'logic-error',
      startedAt: started.toISOString(),
      durationMs: 0,
      ok: false,
      command: '',
      stdout: '',
      stderr: `Unknown scenario "${scenarioId}"`,
      artifact: null,
      trace: null,
      flame: [],
      detections: [],
      traceText: '',
      logs: [`Unknown scenario "${scenarioId}"`],
    };
  }

  if (!foundryAvailable()) {
    return {
      id,
      scenario: scenarioId,
      attackVector: spec.vectorId,
      startedAt: started.toISOString(),
      durationMs: 0,
      ok: false,
      command: '',
      stdout: '',
      stderr: 'Foundry toolchain not found',
      artifact: null,
      trace: null,
      flame: [],
      detections: [],
      traceText: '',
      logs: [
        'Foundry (forge) was not found on this machine.',
        'Expected the binaries under <repo>/.tools/foundry. Run the setup script to install them.',
      ],
    };
  }

  const outDir = artifactsDir();
  const artifactPath = path.join(outDir, `${scenarioId}.json`);
  const before = existsSync(artifactPath) ? statSync(artifactPath).mtimeMs : 0;

  const res = await runTool(
    'forge',
    [
      'test',
      '--match-path',
      spec.testFile,
      '--match-test',
      'testExploit',
      '-vvvv',
    ],
    {
      cwd: contractsDir(),
      env: { HELIX_ARTIFACT_DIR: outDir },
      timeoutMs: opts.timeoutMs ?? 240_000,
    },
  );

  const traceText = extractTraceText(res.stdout);
  const parsed = parseForgeTrace(traceText);

  let artifact: SimulationArtifact | null = null;
  const logs: string[] = [];

  if (existsSync(artifactPath)) {
    const after = statSync(artifactPath).mtimeMs;
    if (opts.allowStaleArtifact || after >= before) {
      try {
        artifact = JSON.parse(readFileSync(artifactPath, 'utf-8')) as SimulationArtifact;
      } catch (e) {
        logs.push(`Failed to parse artifact ${artifactPath}: ${(e as Error).message}`);
      }
    } else {
      logs.push('Artifact file was not refreshed by this run.');
    }
  } else {
    logs.push(`No artifact written to ${artifactPath}`);
  }

  const passed = /\[PASS\]/.test(res.stdout) && !/\[FAIL/.test(res.stdout);

  const detections = runDetectors({
    artifact,
    nodes: parsed.nodes,
    rawLines: parsed.rawLines,
    traceText,
  });

  return {
    id,
    scenario: scenarioId,
    attackVector: resolveAttackVectorId(artifact?.attackVector ?? spec.vectorId),
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

/** Runs every scenario in the lab, in order. Used by the live demo. */
export async function runAllSimulations(
  opts: SimulationOptions = {},
): Promise<{ results: SimulationResult[]; totalMs: number }> {
  const started = Date.now();
  const results: SimulationResult[] = [];
  for (const spec of SCENARIOS) {
    results.push(await runSimulation(spec.id, opts));
  }
  return { results, totalMs: Date.now() - started };
}

/**
 * `forge test --json` wraps the human trace inside a JSON string, and the
 * trace itself may be plain text. This pulls the trace section out of
 * whatever shape forge produced.
 */
export function extractTraceText(stdout: string): string {
  if (!stdout) return '';

  // forge --json wraps stdout in a JSON document whose stdout field holds the
  // original human output.
  try {
    const doc = JSON.parse(stdout) as { stdout?: string; output?: string };
    const inner = doc.stdout ?? doc.output;
    if (typeof inner === 'string' && inner.length) {
      return isolateTraceSection(inner);
    }
  } catch {
    /* not JSON — fall through */
  }
  return isolateTraceSection(stdout);
}

function isolateTraceSection(text: string): string {
  const start = text.search(/Traces:/);
  if (start === -1) return text;
  const rest = text.slice(start);
  const end = rest.search(/\n(Ran \d+ test|Suite result:|Encountered a total of)/);
  return end === -1 ? rest : rest.slice(0, end);
}
