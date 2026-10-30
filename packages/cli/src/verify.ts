import { existsSync } from 'node:fs';
import path from 'node:path';
import { SCENARIOS, foundryAvailable, foundryTool, repoRoot, runSimulation } from '@helix/forensic-engine';
import { CUSTOM_TEST_FILE, CUSTOM_VECTORS, runCustomAttack } from '../../forensic-engine/src/custom.js';
import { loadBible, summariseBible } from './bible.js';
import { probeMcode } from './mcode.js';
import { heading, pad, rule, seconds, truncate } from './ui.js';

export interface VerifyOptions {
  /** Run a live mcode probe (adds ~90 s). */
  llm: boolean;
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

function contractsDir(): string {
  return path.join(repoRoot(), 'contracts');
}

function check(name: string, ok: boolean, detail: string): CheckResult {
  return { name, ok, detail };
}

function printRow(result: CheckResult): void {
  const status = result.ok ? 'PASS' : 'FAIL';
  console.log(`  ${pad(truncate(result.name, 30), 30)}${pad(status, 8)}${truncate(result.detail, 40)}`);
}

export async function verifyCommand(opts: VerifyOptions): Promise<number> {
  for (const line of heading('verification suite', 'real Foundry runs · every custom vector · knowledge base · mcode pairing')) console.log(line);
  console.log(`  ${pad('CHECK', 30)}${pad('RESULT', 8)}DETAIL`);
  console.log(`  ${'─'.repeat(30)}${'─'.repeat(8)}${'─'.repeat(40)}`);

  const results: CheckResult[] = [];

  const forge = foundryAvailable();
  const forgeResult = check(
    'foundry toolchain',
    forge,
    forge ? foundryTool('forge') : 'missing — run npm run setup:foundry',
  );
  results.push(forgeResult);
  printRow(forgeResult);

  const customTarget = path.join('src', 'CustomTarget.sol');
  const customTest = path.join(CUSTOM_TEST_FILE);
  const contractsOk =
    existsSync(path.join(contractsDir(), customTarget)) && existsSync(path.join(contractsDir(), customTest));
  const contractsResult = check(
    'contracts/custom lab',
    contractsOk,
    contractsOk ? `${customTarget} + ${customTest}` : 'CustomTarget.sol or CustomAttack.t.sol missing',
  );
  results.push(contractsResult);
  printRow(contractsResult);

  try {
    const summary = summariseBible(loadBible());
    const bibleResult = check(
      'forensic bible',
      summary.sheets > 0 && summary.attacks > 0,
      `${summary.sheets} sheets · ${summary.attacks} attacks · ${summary.signals} signals`,
    );
    results.push(bibleResult);
    printRow(bibleResult);
  } catch (error) {
    const bibleResult = check('forensic bible', false, (error as Error).message);
    results.push(bibleResult);
    printRow(bibleResult);
  }

  if (forge) {
    for (const scenario of SCENARIOS) {
      const sim = await runSimulation(scenario.id);
      const result = check(
        `scenario/${scenario.id}`,
        sim.ok,
        `${sim.ok ? 'PASS' : 'FAIL'} · ${seconds(sim.durationMs)} · ${sim.artifact?.lossEth ?? '0'} ETH · ${sim.detections.length} finding${sim.detections.length === 1 ? '' : 's'}`,
      );
      results.push(result);
      printRow(result);
    }

    for (const vector of CUSTOM_VECTORS) {
      const attack = await runCustomAttack(
        { vector: vector.id, txs: 2, amountWei: 1n * 10n ** 18n, seed: 7 },
        { buildBundle: false },
      );
      const result = check(
        `custom/${vector.id}`,
        attack.ok,
        `${attack.ok ? 'PASS' : 'FAIL'} · ${seconds(attack.durationMs)} · ${attack.artifact?.lossEth ?? '0'} ETH · ${attack.traceSummary.nodes} nodes`,
      );
      results.push(result);
      printRow(result);
    }
  }

  const probe = await probeMcode(45_000, opts.llm);
  const mcodeResult = check(
    'mcode pairing',
    probe.available,
    probe.available ? `${probe.detail}${opts.llm ? ' · live' : ' · use --llm for a live probe'}` : probe.detail,
  );
  results.push(mcodeResult);
  printRow(mcodeResult);

  const passed = results.filter((r) => r.ok).length;
  console.log(rule());
  console.log(`  SUMMARY  ${passed}/${results.length} checks passed${passed === results.length ? '' : ` · ${results.length - passed} FAILED`}`);
  if (passed !== results.length) {
    console.log('');
    for (const result of results.filter((r) => !r.ok)) {
      console.log(`  ! ${result.name}: ${result.detail}`);
    }
  }
  console.log('');
  console.log('  Every scenario above is a LOCAL Foundry simulation over a real EVM.');
  console.log('');
  return passed === results.length ? 0 : 1;
}
