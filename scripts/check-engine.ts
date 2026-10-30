/**
 * Single-scenario smoke test for the forensic engine.
 *
 *   npx tsx scripts/check-engine.ts reentrancy
 *
 * Runs one Foundry scenario through the real engine and prints the parsed
 * trace, the detected patterns and the generated report.
 */
import { runSimulation, buildReport, reportToMarkdown } from '../packages/forensic-engine/src/index.js';

const scenario = process.argv[2] ?? 'reentrancy';

async function main(): Promise<void> {
  const sim = await runSimulation(scenario);

console.log('='.repeat(78));
console.log(`scenario : ${sim.scenario}`);
console.log(`ok       : ${sim.ok}   (${sim.durationMs} ms)`);
console.log(`command  : ${sim.command}`);
console.log(`artifact : ${sim.artifact ? 'yes' : 'NO'}`);
if (sim.artifact) {
  console.log(`loss     : ${sim.artifact.lossEth} ETH  (${sim.artifact.lossWei} wei)`);
  console.log(`steps    : ${sim.artifact.steps.length}`);
  console.log(`balances : ${sim.artifact.balances.length}`);
  console.log(`storage  : ${sim.artifact.storageWrites.length} (${sim.artifact.storageWrites.filter((w) => w.before !== w.after).length} changed)`);
}
console.log(`trace    : ${sim.trace ? 'parsed' : 'NONE'}  nodes=${sim.flame.length}`);
console.log(`detectors: ${sim.detections.length}`);
for (const d of sim.detections) {
  console.log(`   - ${d.label} [${d.vectorId}] ${Math.round(d.confidence * 100)}% (${d.severity})`);
  for (const e of d.evidence) console.log(`       ${e}`);
}

console.log('\n--- trace tree (first 25 nodes) ---');
const print = (n: NonNullable<typeof sim.trace>, depth: number): void => {
  if (depth > 4) return;
  console.log(
    `${'  '.repeat(depth)}${n.contractName || n.address ? `${n.contractName || n.address}` : '(root)'}.${n.fn}  gas=${n.gasUsed}`,
  );
  n.children.forEach((c) => print(c, depth + 1));
};
if (sim.trace) print(sim.trace, 0);

console.log('\n--- report (first 60 lines) ---');
const report = buildReport(`lab-${sim.scenario}`, sim, null);
console.log(reportToMarkdown(report).split('\n').slice(0, 60).join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
