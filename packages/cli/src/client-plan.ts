import type { ForensicReport, SimulationArtifact } from '@helix/core';
import { ATTACK_VECTORS, resolveAttackVectorId, type ClientPlan, type SessionAnalysis } from '@helix/forensic-engine';
import { mcodeAvailable, runMcode } from './mcode.js';
import { deterministicSequence } from './narrative.js';

export interface PlanDoc {
  text: string;
  generatedBy: string;
  author: string;
  note: string;
  model?: string;
  durationMs?: number;
}

export interface PlanDocInput {
  caseId: string;
  report: ForensicReport;
  analysis: SessionAnalysis;
  artifact: SimulationArtifact | null;
  plan: ClientPlan;
  remediation: string;
}

export function buildPlanPrompt(input: PlanDocInput): string {
  const { plan, report, artifact, analysis } = input;
  const vectorId = resolveAttackVectorId(artifact?.attackVector ?? report.findings[0]?.vectorId ?? 'logic-error');
  const vector = ATTACK_VECTORS[vectorId];
  const suspicious = analysis.suspicious;

  const lines: string[] = [];
  lines.push('You are writing the client action plan for a Web3 exploit forensic report.');
  lines.push('');
  lines.push('TASK');
  lines.push('Return a markdown document with exactly these level-2 headings, in this order:');
  lines.push('  ## First 24 hours');
  lines.push('  ## First week');
  lines.push('  ## First month');
  lines.push('');
  lines.push('REQUIREMENTS');
  lines.push('- Each phase holds 3 to 5 concrete, ordered actions written as bullet points.');
  lines.push('- Every action names an owner role in bold (for example **on-call engineer**, **protocol lead**, **security reviewer**) and, where useful, the proof that closes it.');
  lines.push('- Phase one is containment under time pressure. Phase two is the code fix and the regression test. Phase three is systemic hardening.');
  lines.push('- Be specific to THIS case: name the contract, the function and the attack class.');
  lines.push('- No preamble, no title, no closing section. Do not read files or run commands. Markdown only, at most 450 words.');
  lines.push('');
  lines.push('EVIDENCE');
  lines.push(`Case id: ${input.caseId}`);
  lines.push(`Attack class: ${vector.label} (${vectorId}) — ${vector.signature}`);
  lines.push(`Severity: ${report.severity.toUpperCase()}; measured loss ${report.lossEth} ETH`);
  lines.push(`Target contract: ${plan.whereFlaw.contract}; file ${plan.whereFlaw.file}; entry point ${plan.whereFlaw.function}()`);
  lines.push(`What is wrong: ${plan.whereFlaw.behaviour}`);
  lines.push(`Why exploitable: ${plan.whyExploitable}`);
  if (artifact?.rootCause) lines.push(`Root cause asserted by the PoC: ${artifact.rootCause}`);
  lines.push(`Suspicious transactions: ${suspicious.length}${suspicious.length ? ` (index ${suspicious.map((s) => s.index).join(', ')})` : ''}`);
  lines.push('Existing plan seed (rewrite, do not copy verbatim):');
  for (const action of plan.actions) {
    lines.push(`  ${action.order}. ${action.title}: ${action.detail}`);
  }
  lines.push('');
  lines.push(...HONESTY);
  return lines.join('\n');
}

const HONESTY = [
  'CONTEXT YOU MUST RESPECT',
  '- This is a LOCAL Foundry simulation, not mainnet evidence.',
  '- The detectors are heuristics; confidence is a triage score.',
];

/** Deterministic plan with the mandatory 24h / week / month structure. */
export function deterministicPlan(input: PlanDocInput): string {
  const { plan, report, artifact } = input;
  const out: string[] = [];
  out.push(`# Client action plan — ${input.caseId}`);
  out.push('');
  out.push(
    `**Attack class:** ${plan.vectorLabel}  `,
    `**Severity:** ${report.severity.toUpperCase()}  `,
    `**Measured loss:** ${report.lossEth} ETH  `,
    `**Where:** \`${plan.whereFlaw.contract}.${plan.whereFlaw.function}()\` (${plan.whereFlaw.file})`,
  );
  out.push('');
  out.push('## First 24 hours');
  out.push('');
  out.push(`- **On-call engineer** — ${plan.actions[0]?.detail ?? 'Pause the affected entry point.'}`);
  out.push(
    '- **On-call engineer** — Snapshot balances, storage slots and recent events for the affected accounts before any further state change; store the snapshot with this case folder.',
  );
  out.push(
    `- **Protocol lead** — Confirm whether the deployed bytecode matches the audited source for \`${plan.whereFlaw.contract}\`; if it differs, treat the finding as unconfirmed and escalate.`,
  );
  out.push('- **Comms lead** — Prepare a holder-facing note that states what is contained, what is still being verified, and when the next update lands.');
  out.push('');
  out.push('## First week');
  out.push('');
  out.push(`- **Protocol engineer** — ${plan.actions[1]?.detail ?? 'Ship the code fix.'}`);
  out.push(
    `- **Protocol engineer** — Add a regression test that reproduces this exact attack against \`${plan.whereFlaw.contract}\` and fails without the fix.`,
  );
  out.push('- **Security reviewer** — Re-run the Mayall detector suite against the patched build and confirm the affected finding no longer fires.');
  out.push(
    `- **Data analyst** — Reconcile historical events for \`${plan.whereFlaw.function}()\` and quantify real exposure versus the simulated ${report.lossEth} ETH.`,
  );
  out.push('');
  out.push('## First month');
  out.push('');
  out.push('- **Protocol engineer** — Encode the broken invariant as an explicit check in every state-changing path, not just the one the attacker used.');
  out.push('- **Security reviewer** — Add invariant and fuzz tests for each value-moving path and gate releases on them in CI.');
  out.push(`- **Protocol lead** — Commission an independent review of the trust assumptions around ${plan.vectorLabel.toLowerCase()}.`);
  out.push('- **Security reviewer** — Sweep the rest of the codebase for the same pattern and file each instance as its own case.');
  out.push('');
  if (artifact?.severity) {
    out.push(`_Severity ${artifact.severity} as recorded by the PoC artifact._`);
    out.push('');
  }
  out.push('Local Foundry simulation — not mainnet evidence. Detectors are heuristics.');
  return out.join('\n');
}

/** Authors the client plan with mcode, falling back to the deterministic plan. */
export async function authorClientPlan(input: PlanDocInput): Promise<PlanDoc> {
  const prompt = buildPlanPrompt(input);
  if (mcodeAvailable()) {
    const result = await runMcode(prompt, { minChars: 300 });
    if (result.ok && hasPhases(result.text)) {
      return {
        text: result.text.replace(/\r\n/g, '\n').trim(),
        generatedBy: `minimax-code | model: ${result.model}`,
        author: `MiniMax Code (${result.model})`,
        note: `Authored by the local mcode CLI (${result.model}, effort ${result.effort}).`,
        model: result.model,
        durationMs: result.durationMs,
      };
    }
  }
  return {
    text: deterministicPlan(input),
    generatedBy: 'deterministic',
    author: 'deterministic generator',
    note: mcodeAvailable()
      ? 'mcode did not return a usable plan, so this is the deterministic generator output.'
      : 'mcode was not available, so this is the deterministic generator output.',
  };
}

function hasPhases(text: string): boolean {
  return /first 24 hours/i.test(text) && /first week/i.test(text) && /first month/i.test(text);
}

/** Deterministic mermaid fallback for the attack/funds flow. */
export function deterministicDiagram(artifact: SimulationArtifact | null, report: ForensicReport): string {
  const lines: string[] = ['flowchart TD'];
  const target = artifact?.contractName ?? 'Target';
  lines.push(`  A["Attacker ${artifact ? artifact.attacker.slice(0, 10) : ''}…"]`);
  const steps = artifact?.steps ?? [];
  let prev = 'A';
  steps.forEach((step, index) => {
    const id = `S${index + 1}`;
    const label = `${step.n}. ${step.title}`.replace(/"/g, "'").slice(0, 64);
    lines.push(`  ${id}["${label}"]`);
    lines.push(`  ${prev} --> ${id}`);
    prev = id;
  });
  lines.push(`  L["Measured loss: ${report.lossEth} ETH"]`);
  lines.push(`  ${prev} --> L`);
  lines.push(`  L --> A`);
  lines.push(`  subgraph LAB["Local Foundry simulation"]`);
  lines.push(`    A`);
  for (let i = 0; i < steps.length; i += 1) lines.push(`    S${i + 1}`);
  lines.push(`  end`);
  return lines.join('\n');
}

export { deterministicSequence };
