import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import type {
  AttackVectorId,
  ForensicReport,
  Incident,
  SimulationArtifact,
  SimulationResult,
} from '@helix/core';

/**
 * The engine and core packages are authored as TypeScript ESM using `.js`
 * specifiers for sibling imports. Next's webpack resolver only rewrites those
 * to `.ts` when `experimental.extensionAlias` is set, which this package does
 * not own. Loading the engine through tsx's require hook keeps the route
 * handlers working without duplicating or forking the engine.
 */
type Engine = typeof import('@helix/forensic-engine');

let engineCache: Engine | null = null;

export function engine(): Engine {
  if (engineCache) return engineCache;
  const anchor: string = path.join(process.cwd(), 'package.json');
  const nativeRequire = process.getBuiltinModule('module').createRequire(anchor);
  nativeRequire('tsx/cjs');
  const specifier = '@helix/forensic-engine';
  engineCache = nativeRequire(specifier) as Engine;
  return engineCache;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function artifactPath(scenarioId: string): string {
  return path.join(engine().artifactsDir(), `${scenarioId}.json`);
}

/**
 * An artifact is reusable when it exists and is at least as new as the
 * scenario's Foundry test file. When the test file cannot be located we still
 * reuse the artifact, since re-running forge is the expensive fallback.
 */
export function artifactIsFresh(scenarioId: string): boolean {
  const artifact = artifactPath(scenarioId);
  if (!existsSync(artifact)) return false;

  const spec = engine().SCENARIO_BY_ID.get(scenarioId);
  if (!spec) return false;

  const testFile = path.join(engine().contractsDir(), spec.testFile);
  if (!existsSync(testFile)) return true;

  try {
    return statSync(artifact).mtimeMs >= statSync(testFile).mtimeMs;
  } catch {
    return false;
  }
}

/** Rebuilds a SimulationResult from an artifact already on disk. */
export function resultFromArtifact(scenarioId: string, artifact: SimulationArtifact): SimulationResult {
  const result: SimulationResult = {
    id: `artifact-${scenarioId}`,
    scenario: scenarioId,
    attackVector: artifact.attackVector,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    ok: true,
    command: `reused artifacts/${scenarioId}.json`,
    stdout: '',
    stderr: '',
    artifact,
    trace: null,
    flame: [],
    detections: [],
    traceText: '',
    logs: ['Reused the existing artifact; forge was not re-run.'],
  };
  result.detections = engine().runDetectors({ artifact, nodes: [], rawLines: [], traceText: '' });
  return result;
}

export function readArtifact(scenarioId: string): SimulationArtifact | null {
  const p = artifactPath(scenarioId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as SimulationArtifact;
  } catch {
    return null;
  }
}

/** Runs the scenario, reusing a fresh artifact on disk when possible. */
export async function loadSimulation(scenarioId: string): Promise<SimulationResult> {
  if (artifactIsFresh(scenarioId)) {
    const artifact = readArtifact(scenarioId);
    if (artifact) return resultFromArtifact(scenarioId, artifact);
  }
  return engine().runSimulation(scenarioId);
}

/**
 * Resolves the scenario for a case id: an explicit query param wins, then a
 * `lab-<scenario>` case id, then the incident's linked scenario.
 * A scenario param that is not in the lab is a client error.
 */
export function resolveScenarioId(caseId: string, requested: string | null): string | null {
  const { SCENARIO_BY_ID, INCIDENT_BY_SLUG } = engine();

  if (requested) {
    if (!SCENARIO_BY_ID.has(requested)) {
      throw new ApiError('Unknown scenario', 400);
    }
    return requested;
  }

  if (caseId.startsWith('lab-')) {
    const id = caseId.slice(4);
    if (SCENARIO_BY_ID.has(id)) return id;
  }

  const incident = INCIDENT_BY_SLUG.get(caseId);
  if (incident?.scenarioId && SCENARIO_BY_ID.has(incident.scenarioId)) {
    return incident.scenarioId;
  }

  return null;
}

/** A stand-in simulation for report requests that have no runnable scenario. */
export function emptySimulation(caseId: string): SimulationResult {
  return {
    id: `empty-${caseId}`,
    scenario: caseId,
    attackVector: 'logic-error',
    startedAt: new Date().toISOString(),
    durationMs: 0,
    ok: false,
    command: '',
    stdout: '',
    stderr: 'No scenario was supplied for this case.',
    artifact: null,
    trace: null,
    flame: [],
    detections: [],
    traceText: '',
    logs: ['No scenario was supplied; the report uses incident metadata only.'],
  };
}

export interface CaseReport {
  report: ForensicReport;
  sim: SimulationResult;
  incident: Incident | null;
  scenarioId: string | null;
}

/**
 * Foundry artifacts currently store the attack vector as its human label
 * ("Reentrancy") rather than the taxonomy id ("reentrancy"). buildReport
 * indexes ATTACK_VECTORS by id, so normalise both the root and artifact value.
 */
function normalizeSimulation(sim: SimulationResult, scenarioId: string | null): SimulationResult {
  const { ATTACK_VECTORS, SCENARIO_BY_ID } = engine();
  const catalog = ATTACK_VECTORS as Record<string, { id: AttackVectorId; label: string }>;
  const spec = scenarioId ? SCENARIO_BY_ID.get(scenarioId) : undefined;
  const fallback: AttackVectorId = spec?.vectorId ?? 'logic-error';
  const raw = String(sim.attackVector);

  let attackVector: AttackVectorId = fallback;
  if (catalog[raw]) {
    attackVector = catalog[raw].id;
  } else {
    const match = Object.values(catalog).find(
      (v) => v.label.toLowerCase() === raw.toLowerCase(),
    );
    if (match) attackVector = match.id;
  }

  return {
    ...sim,
    attackVector,
    artifact: sim.artifact ? { ...sim.artifact, attackVector } : null,
  };
}

/** Shared report assembly for the report, markdown and bundle routes. */
export async function buildCaseReport(caseId: string, requestedScenario: string | null): Promise<CaseReport> {
  const { INCIDENT_BY_SLUG, buildReport } = engine();
  const incident = INCIDENT_BY_SLUG.get(caseId) ?? null;
  const scenarioId = resolveScenarioId(caseId, requestedScenario);
  const rawSim = scenarioId ? await loadSimulation(scenarioId) : emptySimulation(caseId);
  const sim = normalizeSimulation(rawSim, scenarioId);
  return { report: buildReport(caseId, sim, incident), sim, incident, scenarioId };
}

export function errorResponse(error: unknown): NextResponse {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : 'Internal server error';
  return NextResponse.json({ error: message }, { status });
}
