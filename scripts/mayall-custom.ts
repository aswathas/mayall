#!/usr/bin/env tsx
/**
 * Mayall — Custom Attack Lab CLI.
 *
 * Runs the same engine path as the web API: plan the parameterised forge test,
 * parse the trace with the shared parser, run the shared detectors, build the
 * shared report and ZIP bundle, then copy the deliverables to --out.
 *
 * Usage:
 *   npx tsx scripts/mayall-custom.ts --vector reentrancy --txs 3 --amount 6 \
 *     --seed 1 --out artifacts/custom
 */

import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runCustomAttack } from '../packages/forensic-engine/src/custom.js';
import { reportToMarkdown } from '../packages/forensic-engine/src/report.js';

interface CliArgs {
  vector: string;
  txs: string;
  amount: string;
  seed: string;
  out: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { vector: 'reentrancy', txs: '3', amount: '6', seed: '1', out: 'artifacts/custom' };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    }
    if (!token.startsWith('--')) continue;
    const key = token.slice(2) as keyof CliArgs;
    if (!(key in args)) continue;
    if (next === undefined || next.startsWith('--')) {
      throw new Error(`Missing value for ${token}`);
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function printHelp(): void {
  const lines = [
    'Mayall — Custom Attack Lab',
    '',
    '  --vector   reentrancy | access-control | oracle-manipulation |',
    '             flash-loan | delegatecall | selfdestruct   (default: reentrancy)',
    '  --txs      attacker transactions, 1..12               (default: 3)',
    '  --amount   total ETH to drain                         (default: 6)',
    '  --seed     noise seed                                 (default: 1)',
    '  --out      output directory                           (default: artifacts/custom)',
    '',
    'Local Foundry simulation. Not mainnet evidence.',
  ];
  for (const line of lines) console.log(line);
}

function ethToWei(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`--amount must be a positive decimal ETH value, received "${value}"`);
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const padded = (fraction + '0'.repeat(18)).slice(0, 18);
  return BigInt(whole || '0') * 10n ** 18n + BigInt(padded || '0');
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value + ' '.repeat(width - value.length);
}

function padLeft(value: string, width: number): string {
  return value.length >= width ? value : ' '.repeat(width - value.length) + value;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const amountWei = ethToWei(args.amount);
  const outDir = path.resolve(process.cwd(), args.out);

  console.log('Mayall — Custom Attack Lab');
  console.log(`  vector  ${args.vector}`);
  console.log(`  txs     ${args.txs}`);
  console.log(`  amount  ${args.amount} ETH (${amountWei.toString()} wei)`);
  console.log(`  seed    ${args.seed}`);
  console.log('  running forge…');
  console.log('');

  const result = await runCustomAttack({
    vector: args.vector,
    txs: args.txs,
    amountWei,
    seed: args.seed,
  });

  const totalGas = result.flame.reduce((sum, node) => sum + node.gasUsed, 0);

  console.log(`caseId     ${result.caseId}`);
  console.log(`vector     ${result.vectorLabel} · ${result.vector}`);
  console.log(`verdict    ${result.ok ? 'PASS' : 'FAIL'} · ${(result.durationMs / 1000).toFixed(2)} s`);
  console.log(`drain      ${result.artifact?.lossEth ?? '0'} ETH requested · attacker gain ${result.request.amountWei} wei`);
  console.log(
    `trace      ${result.traceSummary.nodes} nodes · depth ${result.traceSummary.maxDepth} · ${result.traceSummary.valueTransfers} value transfers · ${totalGas} gas`,
  );
  if (result.traceSummary.repeatedFrames.length) {
    const repeated = result.traceSummary.repeatedFrames
      .map((frame) => `${frame.label} ×${frame.count}`)
      .join(', ');
    console.log(`repeated   ${repeated}`);
  }
  console.log('');

  if (!result.detections.length) {
    console.log('FINDINGS   none crossed the confidence threshold');
  } else {
    console.log('FINDINGS');
    console.log(`  ${pad('SEVERITY', 10)}${padLeft('CONF', 6)}  ${pad('PATTERN', 34)}${padLeft('EVIDENCE', 9)}`);
    for (const finding of result.detections) {
      console.log(
        `  ${pad(finding.severity.toUpperCase(), 10)}${padLeft(`${Math.round(finding.confidence * 100)}%`, 6)}  ${pad(
          finding.label,
          34,
        )}${padLeft(String(finding.evidence.length), 9)}`,
      );
      for (const evidence of finding.evidence.slice(0, 2)) {
        console.log(`      - ${evidence}`);
      }
    }
  }
  console.log('');

  mkdirSync(outDir, { recursive: true });

  const reportMarkdown = reportToMarkdown(result.report);
  const reportPath = path.join(outDir, `${result.caseId}-report.md`);
  writeFileSync(reportPath, reportMarkdown, 'utf-8');

  const reportJsonPath = path.join(outDir, `${result.caseId}-report.json`);
  writeFileSync(reportJsonPath, JSON.stringify(result.report, null, 2), 'utf-8');

  const artifactPath = path.join(outDir, `${result.caseId}-artifact.json`);
  writeFileSync(artifactPath, JSON.stringify(result.artifact, null, 2), 'utf-8');

  let bundlePath: string | null = null;
  if (result.bundlePath && existsSync(result.bundlePath)) {
    const target = path.join(outDir, path.basename(result.bundlePath));
    if (path.resolve(result.bundlePath) !== path.resolve(target)) {
      copyFileSync(result.bundlePath, target);
    }
    bundlePath = target;
  }

  console.log(`ARTIFACT   ${artifactPath} (${statSync(artifactPath).size} bytes)`);
  console.log(`REPORT     ${reportPath} (${statSync(reportPath).size} bytes)`);
  console.log(`REPORT JSN ${reportJsonPath}`);
  console.log(`BUNDLE     ${bundlePath ?? '(bundle build failed — see report logs)'}`);
  if (bundlePath && existsSync(bundlePath)) {
    console.log(`           ${statSync(bundlePath).size} bytes`);
  }
  console.log('');
  console.log('Local Foundry simulation. Not mainnet evidence.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`mayall-custom: ${message}`);
  process.exit(1);
});
