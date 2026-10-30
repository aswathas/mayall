/**
 * End-to-end pipeline check.
 *
 *   npx tsx scripts/verify-pipeline.ts
 *
 * Runs every Foundry scenario through the real forensic engine, then builds
 * the report and the forensic bundle for each one. Exits non-zero if any
 * scenario fails to produce a passing simulation with evidence attached.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  SCENARIOS,
  runAllSimulations,
  buildReport,
  buildForensicBundle,
  repoRoot,
} from '../packages/forensic-engine/src/index.js';
import { INCIDENT_BY_SLUG } from '../packages/core/src/incidents.js';

const root = repoRoot();
const outDir = path.join(root, 'artifacts', 'bundles');
mkdirSync(outDir, { recursive: true });

interface Row {
  scenario: string;
  ok: boolean;
  passed: boolean;
  ms: number;
  lossEth: string;
  steps: number;
  storage: number;
  changed: number;
  balances: number;
  traceNodes: number;
  detections: number;
  topDetection: string;
  confidence: number;
}

async function main(): Promise<void> {
  console.log('Mayall pipeline verification');
  console.log('root:', root);
  console.log('');

  const { results, totalMs } = await runAllSimulations();
  const rows: Row[] = [];

  for (const sim of results) {
    const art = sim.artifact;
    const changed = (art?.storageWrites ?? []).filter((w) => w.before !== w.after).length;
    const report = buildReport(`lab-${sim.scenario}`, sim, null);
    const bundle = await buildForensicBundle(report, sim);
    writeFileSync(path.join(outDir, bundle.filename), bundle.buffer);

    rows.push({
      scenario: sim.scenario,
      ok: sim.ok,
      passed: /\[PASS\]/.test(sim.stdout),
      ms: sim.durationMs,
      lossEth: art?.lossEth ?? '0',
      steps: art?.steps.length ?? 0,
      storage: art?.storageWrites.length ?? 0,
      changed,
      balances: art?.balances.length ?? 0,
      traceNodes: sim.flame.length,
      detections: sim.detections.length,
      topDetection: sim.detections[0]?.label ?? '-',
      confidence: sim.detections[0]?.confidence ?? 0,
    });

    if (!sim.ok) {
      console.error(`\n--- ${sim.scenario} FAILED ---`);
      console.error(sim.stderr.slice(0, 2000));
      console.error(sim.stdout.slice(-4000));
    }
  }

  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
  console.log(
    `${pad('SCENARIO', 22)}${pad('OK', 5)}${pad('LOSS ETH', 12)}${pad('STEPS', 7)}${pad('STORE', 7)}${pad('CHG', 5)}${pad('TRACE', 7)}${pad('DET', 5)}TOP DETECTION`,
  );
  console.log('-'.repeat(104));
  for (const r of rows) {
    console.log(
      `${pad(r.scenario, 22)}${pad(r.ok ? 'yes' : 'NO', 5)}${pad(r.lossEth, 12)}${pad(String(r.steps), 7)}${pad(String(r.storage), 7)}${pad(String(r.changed), 5)}${pad(String(r.traceNodes), 7)}${pad(String(r.detections), 5)}${r.topDetection} (${Math.round(r.confidence * 100)}%)`,
    );
  }
  console.log('');
  console.log(`total suite time: ${totalMs} ms`);
  console.log(`bundles written to ${outDir}`);

  writeFileSync(
    path.join(root, 'artifacts', 'summary.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2),
  );

  // Sanity: every reproducible incident must map to a scenario that exists.
  const missing = [...INCIDENT_BY_SLUG.values()]
    .filter((i) => i.reproducible && !SCENARIOS.some((s) => s.id === i.scenarioId))
    .map((i) => i.slug);
  if (missing.length) {
    console.error(`\nIncidents referencing unknown scenarios: ${missing.join(', ')}`);
  }

  const failed = rows.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`\nFAILED scenarios: ${failed.map((f) => f.scenario).join(', ')}`);
    process.exit(1);
  }
  console.log('\nAll scenarios green.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
