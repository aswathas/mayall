import path from 'node:path';
import type { ForensicReport, ReportSection } from '@helix/core';
import {
  analyseSession,
  buildClientPlan,
  buildRemediationMarkdown,
  repoRoot,
  type ClientPlan,
  type SessionAnalysis,
} from '@helix/forensic-engine';
import {
  CustomAttackError,
  CUSTOM_VECTOR_BY_ID,
  CUSTOM_VECTORS,
  isCustomVector,
  runCustomAttack,
  type CustomAttackResult,
  type CustomVectorId,
} from '../../forensic-engine/src/custom.js';
import { authorClientPlan, deterministicPlan, type PlanDoc } from './client-plan.js';
import { resolveDiagram, type DiagramDoc } from './diagram.js';
import { authorNarrative, type NarrativeResult } from './narrative.js';
import { writeCustomFolder, type CustomFolderOutput } from './custom-folder.js';
import { bytes, heading, kv, pad, padLeft, rule, seconds, truncate } from './ui.js';

export interface CustomRunOptions {
  vector: string;
  txs: number;
  amountEth: string;
  seed: number;
  out?: string;
  /** Author the narrative and plan with mcode. False keeps everything deterministic. */
  llm: boolean;
  bundle: boolean;
}

const VECTOR_ALIASES: Record<string, CustomVectorId> = {
  'self-destruct': 'selfdestruct',
  selfdestruct: 'selfdestruct',
  'delegatecall-injection': 'delegatecall',
  delegatecall: 'delegatecall',
  oracle: 'oracle-manipulation',
  'oracle-manipulation': 'oracle-manipulation',
  'access-control': 'access-control',
  'flash-loan': 'flash-loan',
  reentrancy: 'reentrancy',
};

export function normaliseVector(value: string): CustomVectorId | null {
  const key = value.trim().toLowerCase();
  if (isCustomVector(key)) return key;
  return VECTOR_ALIASES[key] ?? null;
}

export function ethToWei(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new CustomAttackError(`--amount must be a positive decimal ETH value, received "${value}"`, 400);
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const padded = (fraction + '0'.repeat(18)).slice(0, 18);
  return BigInt(whole || '0') * 10n ** 18n + BigInt(padded || '0');
}

function executiveSummaryOf(document: string, fallback: string): string {
  const match = document.match(/##\s+Executive summary\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (match && match[1].trim().length > 40) return match[1].trim();
  const paragraphs = document.split(/\n{2,}/).filter((p) => p.trim());
  return (paragraphs.slice(0, 2).join('\n\n') || fallback).trim();
}

/**
 * The engine's report renders a generic remediation line when the artifact
 * carries a label instead of a vector id. Replace it with the vector-specific
 * fix the client plan already computed, so report.md and plan.md agree.
 */
function withVectorRemediation(sections: ReportSection[], plan: ClientPlan): ReportSection[] {
  const fix = plan.actions.find((action) => /fix/i.test(action.title)) ?? plan.actions[1] ?? plan.actions[0];
  if (!fix) return sections;
  return sections.map((section) =>
    /root cause/i.test(section.heading)
      ? {
          ...section,
          body: section.body.replace(/Recommended remediation:[^\n]*/i, `Recommended remediation: ${fix.detail}`),
        }
      : section,
  );
}

function targetMovement(artifact: CustomAttackResult['artifact']): { victim: string; attacker: string } {
  const balances = artifact?.balances ?? [];
  const victim = balances.find((b) => b.label === 'CustomTarget') ?? balances.find((b) => b.deltaWei.startsWith('-'));
  const attacker =
    balances.find((b) => b.label === 'CustomAttacker') ?? balances.find((b) => !b.deltaWei.startsWith('-') && b.deltaWei !== '0');
  return {
    victim: victim ? `${victim.label} ${victim.deltaWei} wei` : 'victim unchanged',
    attacker: attacker ? `${attacker.label} +${attacker.deltaWei.replace(/^\+/, '')} wei` : 'attacker unchanged',
  };
}

function reproduceCommands(opts: CustomRunOptions, amountWei: bigint, outRel: string): string[] {
  const forge = [
    `$env:MAYALL_VECTOR='${opts.vector}'; $env:MAYALL_TXS='${opts.txs}'; $env:MAYALL_AMOUNT='${amountWei.toString()}'; $env:MAYALL_SEED='${opts.seed}'; cd contracts; ..\\.tools\\foundry\\forge.exe test --match-path test/CustomAttack.t.sol --match-test testCustomAttack -vvvv`,
  ];
  const cli = [
    `cd .. && npx tsx scripts/mayall.mjs run --custom --vector ${opts.vector} --txs ${opts.txs} --amount ${opts.amountEth} --seed ${opts.seed} --out ${outRel}`,
  ];
  return [...forge, ...cli];
}

function printFindings(result: CustomAttackResult): void {
  const findings = result.detections;
  console.log(`  FINDINGS   ${findings.length ? `${findings.length} above threshold` : 'none above threshold'}`);
  if (!findings.length) return;
  const rows = findings.map((finding, index) => {
    const evidence = finding.evidence[0] ?? finding.rationale;
    const more = finding.evidence.length > 1 ? ` (+${finding.evidence.length - 1})` : '';
    return [
      String(index + 1),
      truncate(finding.label, 24),
      `${Math.round(finding.confidence * 100)}%`,
      finding.severity,
      truncate(`${evidence}${more}`, 64),
    ];
  });
  console.log(`  ${pad('#', 2)} ${pad('DETECTOR', 24)}  ${padLeft('CONF', 5)}  ${pad('SEVERITY', 9)}  MATCHED EVIDENCE`);
  console.log(`  ${'─'.repeat(2)} ${'─'.repeat(24)}  ${'─'.repeat(5)}  ${'─'.repeat(9)}  ${'─'.repeat(32)}`);
  for (const row of rows) {
    console.log(`  ${pad(row[0], 2)} ${pad(row[1], 24)}  ${padLeft(row[2], 5)}  ${pad(row[3], 9)}  ${row[4]}`);
  }
}

function printReadout(
  result: CustomAttackResult,
  analysis: SessionAnalysis,
  narrative: NarrativeResult,
  plan: PlanDoc,
  diagram: DiagramDoc,
  output: CustomFolderOutput,
): void {
  const money = targetMovement(result.artifact);
  const summary = result.traceSummary;
  console.log(rule());
  console.log(kv('case', result.caseId));
  console.log(
    kv(
      'vector',
      `${result.vectorLabel} · ${result.vector} · ${(result.artifact?.severity ?? 'high').toUpperCase()}`,
    ),
  );
  console.log(kv('request', `${result.request.txs} txs · ${result.request.amountWei} wei · seed ${result.request.seed}`));
  console.log(kv('simulation', `${result.ok ? 'PASS' : 'FAIL'} · ${seconds(result.durationMs)} · local Foundry EVM`));
  console.log(
    kv(
      'trace',
      `${summary.nodes} nodes · depth ${summary.maxDepth} · ${summary.valueTransfers} value transfers · ${summary.totalGas} gas`,
    ),
  );
  console.log(kv('transactions', `${analysis.transactions.length} segmented · ${analysis.suspicious.length} suspicious`));
  console.log(kv('money', `${money.victim} → ${money.attacker}`));
  console.log(kv('loss', `${result.artifact?.lossEth ?? '0'} ETH moved out of the target`));
  console.log(rule());
  printFindings(result);
  console.log(rule());
  const narrativeLabel =
    narrative.generatedBy === 'deterministic'
      ? 'deterministic (mcode unavailable)'
      : `${narrative.generatedBy}${narrative.durationMs ? ` · ${Math.round(narrative.durationMs / 1000)}s` : ''}`;
  const planLabel =
    plan.generatedBy === 'deterministic'
      ? 'deterministic (mcode unavailable)'
      : `${plan.generatedBy}${plan.durationMs ? ` · ${Math.round(plan.durationMs / 1000)}s` : ''}`;
  console.log(kv('narrative', narrativeLabel));
  if (narrative.generatedBy === 'deterministic') console.log(kv('note', truncate(narrative.note, 62)));
  console.log(kv('plan', planLabel));
  console.log(kv('diagram', `${diagram.source} · ${diagram.text.split('\n')[0]}`));
  console.log(kv('folder', output.folder));
  if (output.bundlePath) {
    const bundleBytes = output.files.find((f) => f.path === 'evidence/bundle.zip')?.bytes ?? 0;
    console.log(kv('bundle', `${output.bundlePath}  (${bytes(bundleBytes)})`));
  } else {
    console.log(kv('bundle', 'skipped (--no-bundle)'));
  }
  console.log(
    kv(
      'files',
      `${output.files.length} written · ${bytes(output.bytes)}${output.missing.length ? ` · MISSING ${output.missing.join(', ')}` : ' · complete'}`,
    ),
  );
  console.log(rule());
  console.log('  This was a LOCAL Foundry simulation, not mainnet evidence.');
  console.log('  Detectors are heuristics over one execution trace.');
  console.log('');
}

export async function customRunCommand(opts: CustomRunOptions): Promise<number> {
  const vector = normaliseVector(opts.vector);
  if (!vector) {
    console.error(`Unknown attack family "${opts.vector}".`);
    console.error(`Choose one of: ${CUSTOM_VECTORS.map((v) => v.id).join(', ')}.`);
    return 1;
  }
  if (!Number.isInteger(opts.txs) || opts.txs < 1 || opts.txs > 12) {
    console.error(`--txs must be an integer between 1 and 12 (received ${opts.txs}).`);
    return 1;
  }

  let amountWei: bigint;
  try {
    amountWei = ethToWei(opts.amountEth);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const spec = CUSTOM_VECTOR_BY_ID.get(vector);
  const outBase = path.resolve(repoRoot(), opts.out ?? path.join('artifacts', 'custom'));

  for (const line of heading('custom attack lab', 'one command → complete forensic folder')) console.log(line);
  console.log(kv('vector', `${spec?.label ?? vector} · ${vector}`));
  console.log(kv('drains', truncate(spec?.drains ?? 'target balance', 62)));
  console.log(kv('request', `${opts.txs} txs · ${opts.amountEth} ETH (${amountWei.toString()} wei) · seed ${opts.seed}`));
  console.log(kv('mode', opts.llm ? 'MiniMax Code authors narrative + plan' : 'deterministic documents (--no-llm)'));

  console.log('');
  console.log('  ▸ simulation   running the real Foundry PoC …');
  let result: CustomAttackResult;
  try {
    result = await runCustomAttack({ vector, txs: opts.txs, amountWei, seed: opts.seed });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('');
    console.error(`  simulation failed: ${message}`);
    return 1;
  }

  const analysis = analyseSession(result.trace, result.artifact);
  const baseReport = result.report;
  const planSeed: ClientPlan = buildClientPlan(analysis, baseReport, {
    artifact: result.artifact,
    scenario: result.sim.scenario,
  });
  const remediation = buildRemediationMarkdown(analysis, baseReport, {
    artifact: result.artifact,
    scenario: result.sim.scenario,
  });

  console.log(`  ▸ simulation   ${result.ok ? 'PASS' : 'FAIL'} · ${seconds(result.durationMs)}`);
  console.log(`  ▸ detectors    ${result.detections.length} finding(s) from 10 heuristic detectors`);

  let narrative: NarrativeResult;
  let plan: PlanDoc;

  if (opts.llm) {
    console.log('  ▸ narrative    asking MiniMax Code (mcode) …');
    narrative = await authorNarrative(
      {
        report: baseReport,
        analysis,
        artifact: result.artifact,
        scenario: result.sim.scenario,
        caseId: result.caseId,
        fallback: baseReport.executiveSummary,
      },
      { kind: 'full', providers: ['minimax-code'] },
    );
    console.log(`  ▸ narrative    ${narrative.generatedBy}`);

    const planInput = {
      caseId: result.caseId,
      report: baseReport,
      analysis,
      artifact: result.artifact,
      plan: planSeed,
      remediation,
    };
    console.log('  ▸ plan         asking MiniMax Code (mcode) …');
    plan = await authorClientPlan(planInput);
    console.log(`  ▸ plan         ${plan.generatedBy}`);
  } else {
    narrative = await authorNarrative(
      {
        report: baseReport,
        analysis,
        artifact: result.artifact,
        scenario: result.sim.scenario,
        caseId: result.caseId,
        fallback: baseReport.executiveSummary,
      },
      { kind: 'full', providers: [] },
    );
    plan = {
      text: deterministicPlan({
        caseId: result.caseId,
        report: baseReport,
        analysis,
        artifact: result.artifact,
        plan: planSeed,
        remediation,
      }),
      generatedBy: 'deterministic',
      author: 'deterministic generator',
      note: 'Generated without an LLM (--no-llm).',
    };
  }

  const report: ForensicReport = {
    ...baseReport,
    executiveSummary: executiveSummaryOf(narrative.text, baseReport.executiveSummary),
    sections: withVectorRemediation(baseReport.sections, planSeed),
  };
  const diagram = resolveDiagram(narrative.text, result.artifact, report, narrative.method);

  const outRel = path.relative(repoRoot(), outBase).split(path.sep).join('/') || 'artifacts/custom';
  const folder = path.join(outBase, result.caseId);

  console.log('  ▸ folder       writing the forensic folder …');
  const output = await writeCustomFolder({
    folder,
    result,
    analysis,
    report,
    narrative: {
      text: narrative.text,
      generatedBy: narrative.generatedBy,
      author: narrative.author,
      note: narrative.note,
    },
    plan: {
      text: plan.text,
      generatedBy: plan.generatedBy,
      author: plan.author,
      note: plan.note,
    },
    diagram,
    reproduce: reproduceCommands({ ...opts, vector }, amountWei, outRel),
    bundle: opts.bundle,
  });

  console.log(rule());
  printReadout(result, analysis, narrative, plan, diagram, output);

  return result.ok && output.missing.length === 0 ? 0 : 1;
}
