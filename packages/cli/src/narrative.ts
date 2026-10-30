import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ForensicReport, SimulationArtifact } from '@helix/core';
import { ATTACK_VECTORS, resolveAttackVectorId, repoRoot } from '@helix/forensic-engine';
import type { SessionAnalysis } from '@helix/forensic-engine';
import { mcodeAvailable, runMcode, MCODE_EFFORT, MCODE_MODEL_PRIMARY } from './mcode.js';

const CMDC_ENTRY = path.join(
  process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'),
  'npm',
  'node_modules',
  'command-code',
  'dist',
  'index.mjs',
);
const CMDC_MODEL = 'deepseek/deepseek-v4.1-flash';
const OLLAMA_MODEL = 'qwen2.5:3b';

export type NarrativeMethod = 'minimax-code' | 'cmdc' | 'ollama' | 'deterministic';
export type NarrativeKind = 'summary' | 'full';

export interface NarrativeInput {
  report: ForensicReport;
  analysis: SessionAnalysis;
  artifact: SimulationArtifact | null;
  scenario: string;
  caseId: string;
  /** Deterministic summary used when no LLM is reachable. */
  fallback: string;
}

export interface NarrativeOptions {
  /** Provider order. Defaults to every provider; the custom CLI uses mcode only. */
  providers?: NarrativeMethod[];
  /** "summary" is an executive paragraph, "full" is the sectioned report body. */
  kind?: NarrativeKind;
  minChars?: number;
}

export interface NarrativeResult {
  text: string;
  author: string;
  method: NarrativeMethod;
  note: string;
  /** Exact provenance line written into report/narrative.md. */
  generatedBy: string;
  model?: string;
  durationMs?: number;
  attempts?: { model: string; effort: string; code: number | null; durationMs: number; note: string }[];
}

interface ProcResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runProcess(file: string, args: string[], timeoutMs: number): Promise<ProcResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { cwd: repoRoot(), timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === 'number'
            ? (err as { code: number }).code
            : err
              ? 1
              : 0;
        resolve({ code, stdout: stdout ?? '', stderr: stderr ?? '' });
      },
    );
  });
}

function cleanNarrative(text: string): string {
  let out = text.replace(/\r\n/g, '\n').trim();
  out = out.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  out = out.replace(/^(here is|here's|below is)[^\n]*\n+/i, '').trim();
  return out;
}

function eth(value: string): string {
  return `${value} ETH`;
}

function evidenceLines(input: NarrativeInput, limit = 6): string[] {
  const art = input.artifact;
  const lines: string[] = [];
  lines.push(`Case reference: ${input.caseId}`);
  lines.push(`Scenario executed in the local lab: ${input.scenario}`);
  lines.push(`Case title: ${input.report.title}`);
  lines.push(`Measured loss: ${eth(input.report.lossEth)} (${input.report.findings[0]?.label ?? 'unclassified'})`);
  lines.push(`Severity: ${input.report.severity}; detector confidence: ${Math.round(input.report.confidence * 100)}%`);
  lines.push(`Chain: ${input.report.chain}`);
  if (art) {
    lines.push(`Target contract: ${art.contractName} at ${art.target}`);
    lines.push(`Attacker contract: ${art.attacker}`);
    lines.push(`Measured loss in wei: ${art.lossWei}`);
    lines.push(`Root cause asserted by the PoC: ${art.rootCause}`);
    lines.push('Attack steps:');
    for (const step of art.steps) {
      lines.push(`  ${step.n}. ${step.title} — ${step.description} (gas ${step.gasUsed}, value ${step.valueWei} wei)`);
    }
    lines.push('Balance movement:');
    for (const b of art.balances) {
      lines.push(`  ${b.label} ${b.address}: ${b.beforeWei} -> ${b.afterWei} wei (delta ${b.deltaWei})`);
    }
    const changed = art.storageWrites.filter((w) => w.before !== w.after);
    if (changed.length) {
      lines.push('Storage slots mutated:');
      for (const w of changed.slice(0, limit)) {
        lines.push(`  ${w.contractName}.${w.label} (${w.slot}): ${w.before} -> ${w.after}`);
      }
    }
  }
  lines.push(
    `Transactions segmented from the trace: ${input.analysis.transactions.length}; suspicious: ${input.analysis.suspicious.length}`,
  );
  for (const s of input.analysis.suspicious.slice(0, 4)) {
    lines.push(`  Transaction ${s.index} at ${Math.round(s.confidence * 100)}%: ${s.reasons.join('; ')}`);
  }
  lines.push('Detector findings (heuristic):');
  for (const f of input.report.findings) {
    lines.push(`  ${f.label} (${f.vectorId}) at ${Math.round(f.confidence * 100)}% — ${f.rationale}`);
    for (const e of f.evidence.slice(0, limit)) lines.push(`    - ${e}`);
  }
  return lines;
}

function vectorOf(input: NarrativeInput) {
  const vectorId = resolveAttackVectorId(
    input.artifact?.attackVector ?? input.report.findings[0]?.vectorId ?? 'logic-error',
  );
  return ATTACK_VECTORS[vectorId];
}

const HONESTY_LINES = [
  'This report was produced from a LOCAL Foundry simulation. The contracts are real Solidity and the execution is a real EVM, but the chain state is local: this is not mainnet evidence and it does not prove the live deployment was exploited.',
  'The detectors are heuristics over one execution trace. Confidence is a triage score, not proof; every finding lists the evidence it rests on so it can be challenged.',
];

export function buildSummaryPrompt(input: NarrativeInput): string {
  const vector = vectorOf(input);
  const lines: string[] = [];
  lines.push('Write the executive summary for a Web3 exploit forensic report.');
  lines.push('');
  lines.push('WRITING BRIEF');
  lines.push('- Write 3 or 4 short paragraphs, at most 230 words, in plain English for protocol founders and their engineers.');
  lines.push('- Start directly with the summary. No title, headings, bullet lists, markdown fences, or preamble such as "here is".');
  lines.push('- Cover, in this order: what happened; where the flaw is (contract and function); why it was possible; what value moved; the single most urgent action.');
  lines.push('- Be precise about numbers that appear in the evidence. Do not invent anything that is not in the evidence.');
  lines.push('- Treat this as a local reproduction: do not claim the live deployment was exploited.');
  lines.push('');
  lines.push('EVIDENCE');
  lines.push(`Attack vector: ${vector.label} (${vector.id}) — ${vector.signature}`);
  lines.push(...evidenceLines(input));
  lines.push('');
  lines.push('Respond with the executive summary only.');
  return lines.join('\n');
}

export function buildFullPrompt(input: NarrativeInput): string {
  const vector = vectorOf(input);
  const lines: string[] = [];
  lines.push('You are writing the forensic narrative for Mayall, a Web3 exploit forensics tool.');
  lines.push('');
  lines.push('TASK');
  lines.push(
    'Write a complete markdown narrative from the evidence below. Use exactly these level-2 headings, in this order:',
  );
  lines.push('  ## Executive summary');
  lines.push('  ## Attack sequence');
  lines.push('  ## Evidence reconstruction');
  lines.push('  ## Detection analysis');
  lines.push('  ## Remediation');
  lines.push('  ## Client action plan');
  lines.push('');
  lines.push('REQUIREMENTS');
  lines.push('- Ground every sentence in the evidence. If a number is not in the evidence, do not state it.');
  lines.push(
    `- The measured loss is exactly ${input.report.lossEth} ETH. Do not round it up and do not claim the victim lost its entire starting balance — compare the before/after balances in the evidence.`,
  );
  lines.push('- Quote addresses and wei values exactly as given.');
  lines.push('- Keep it tight: 550-800 words total. Prose and short bullet lists, no filler.');
  lines.push('- Executive summary: 2 short paragraphs for a non-technical founder.');
  lines.push('- Attack sequence: numbered steps of what the attacker did, each tied to contract and function.');
  lines.push('- Evidence reconstruction: the measured balance movement, the mutated storage slots, the trace shape (nodes, depth, gas). Explain what each proves.');
  lines.push('- Detection analysis: name the detectors that fired, their confidence, and quote the strongest evidence lines. Say plainly that these are heuristics over one trace.');
  lines.push('- Remediation: the concrete code-level fix for this vector, with the corrected ordering or guard.');
  lines.push('- Client action plan: bullet points grouped by "First 24 hours", "First week", "First month".');
  lines.push('- Include ONE fenced ```mermaid block: a `sequenceDiagram` of the funds flow (victim, target, attacker) or a `flowchart TD` of the attack. Place it inside "Attack sequence".');
  lines.push('- End with one line: "Local Foundry simulation — not mainnet evidence."');
  lines.push('- Do not read files, do not run commands, do not add a preamble. Return only the markdown document.');
  lines.push('');
  lines.push('EVIDENCE');
  lines.push(`Case id: ${input.caseId}`);
  lines.push(`Attack vector: ${vector.label} (${vector.id}) — ${vector.signature}`);
  lines.push(...evidenceLines(input));
  lines.push('');
  lines.push(...HONESTY_LINES);
  return lines.join('\n');
}

export function buildPrompt(input: NarrativeInput, kind: NarrativeKind = 'summary'): string {
  return kind === 'full' ? buildFullPrompt(input) : buildSummaryPrompt(input);
}

async function viaMcode(prompt: string, minChars: number): Promise<NarrativeResult | null> {
  if (!mcodeAvailable()) {
    if (process.env.MAYALL_DEBUG) console.error('[narrative] mcode launcher not found');
    return null;
  }
  const result = await runMcode(prompt, { minChars });
  if (!result.ok) {
    if (process.env.MAYALL_DEBUG) {
      console.error(
        `[narrative] mcode failed: ${result.reason ?? 'unknown'} · attempts: ${JSON.stringify(result.attempts)}`,
      );
    }
    return null;
  }
  return {
    text: cleanNarrative(result.text),
    author: `MiniMax Code (${result.model})`,
    method: 'minimax-code',
    note: `Authored by the local mcode CLI (${result.model}, effort ${result.effort}) from the run evidence.`,
    generatedBy: `minimax-code | model: ${result.model}`,
    model: result.model,
    durationMs: result.durationMs,
    attempts: result.attempts,
  };
}

async function viaCommandCode(prompt: string): Promise<NarrativeResult | null> {
  if (!existsSync(CMDC_ENTRY)) return null;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mayall-narrative-'));
  const file = path.join(dir, 'prompt.md');
  try {
    writeFileSync(file, prompt, 'utf-8');
    const res = await runProcess(
      process.execPath,
      [
        CMDC_ENTRY,
        '-p',
        `@${file}`,
        '--model',
        CMDC_MODEL,
        '--yolo',
        '--tools-all',
        '--no-session',
        '--skip-onboarding',
        '--max-turns',
        '20',
      ],
      240_000,
    );
    const text = cleanNarrative(res.stdout);
    if (res.code === 0 && text.length >= 200) {
      return {
        text,
        author: `Command Code (${CMDC_MODEL})`,
        method: 'cmdc',
        note: 'Authored by Command Code from the run evidence.',
        generatedBy: `command-code | model: ${CMDC_MODEL}`,
        model: CMDC_MODEL,
      };
    }
    return null;
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup failures */
    }
  }
}

async function viaOllama(prompt: string): Promise<NarrativeResult | null> {
  const res = await runProcess('ollama', ['run', OLLAMA_MODEL, prompt], 180_000);
  const text = cleanNarrative(res.stdout);
  if (res.code === 0 && text.length >= 200) {
    return {
      text,
      author: `Ollama (${OLLAMA_MODEL})`,
      method: 'ollama',
      note: 'Authored by a local Ollama model from the run evidence.',
      generatedBy: `ollama | model: ${OLLAMA_MODEL}`,
      model: OLLAMA_MODEL,
    };
  }
  return null;
}

/**
 * Authors the narrative. Tries mcode first (the headline pairing), then Command
 * Code, then a local Ollama model, then the deterministic generator. A template
 * is never presented as an AI report: every result carries `generatedBy`.
 */
export async function authorNarrative(
  input: NarrativeInput,
  opts: NarrativeOptions = {},
): Promise<NarrativeResult> {
  const kind = opts.kind ?? 'summary';
  const providers = opts.providers ?? ['minimax-code', 'cmdc', 'ollama', 'deterministic'];
  const prompt = buildPrompt(input, kind);
  const minChars = opts.minChars ?? (kind === 'full' ? 400 : 200);

  for (const provider of providers) {
    if (provider === 'minimax-code') {
      const result = await viaMcode(prompt, minChars);
      if (result) return result;
    } else if (provider === 'cmdc') {
      const result = await viaCommandCode(prompt);
      if (result) return result;
    } else if (provider === 'ollama') {
      const result = await viaOllama(prompt);
      if (result) return result;
    }
  }

  return {
    text: kind === 'full' ? deterministicFullNarrative(input) : input.fallback,
    author: 'deterministic generator (no LLM available)',
    method: 'deterministic',
    note:
      providers.includes('minimax-code')
        ? 'mcode was unavailable or failed, so this document is the deterministic generator output.'
        : 'No LLM provider was requested, so this document is the deterministic generator output.',
    generatedBy: 'deterministic',
  };
}

/** Full document authored without an LLM. Clearly labelled as deterministic. */
export function deterministicFullNarrative(input: NarrativeInput): string {
  const vector = vectorOf(input);
  const art = input.artifact;
  const suspicious = input.analysis.suspicious;
  const top = input.report.findings[0];
  const out: string[] = [];

  out.push(`# ${input.report.title}`);
  out.push('');
  out.push('## Executive summary');
  out.push('');
  out.push(
    `A local Foundry reproduction of a ${vector.label.toLowerCase()} attack drained ${eth(
      input.report.lossEth,
    )} from ${art?.contractName ?? 'the target contract'} in the Mayall lab. The PoC asserts the loss as a measured balance delta, not an estimate.`,
  );
  out.push('');
  out.push(
    top
      ? `The ${top.label} detector fired at ${Math.round(top.confidence * 100)}% confidence. ${top.rationale}`
      : 'No detector crossed the confidence threshold; the loss is still measured in the artifact.',
  );
  out.push('');
  out.push(`Root cause asserted by the PoC: ${art?.rootCause ?? 'not recorded.'}`);
  out.push('');

  out.push('## Attack sequence');
  out.push('');
  if (art?.steps.length) {
    for (const step of art.steps) {
      out.push(`${step.n}. **${step.title}.** ${step.description}`);
    }
  } else {
    out.push('No structured attack steps were recorded by the simulation.');
  }
  out.push('');
  out.push('```mermaid');
  out.push(...deterministicSequence(art).split('\n'));
  out.push('```');
  out.push('');

  out.push('## Evidence reconstruction');
  out.push('');
  out.push(
    `The trace contains ${input.analysis.transactions.length} segmented transactions. ${
      suspicious.length
        ? `${suspicious.length} crossed the heuristic confidence floor (index ${suspicious.map((s) => s.index).join(', ')}).`
        : 'None crossed the heuristic confidence floor.'
    }`,
  );
  out.push('');
  if (art?.balances.length) {
    out.push('Balance movement measured inside the test:');
    out.push('');
    for (const b of art.balances) {
      out.push(`- **${b.label}** \`${b.address}\`: ${b.beforeWei} → ${b.afterWei} wei (delta ${b.deltaWei}).`);
    }
    out.push('');
  }
  const changed = art?.storageWrites.filter((w) => w.before !== w.after) ?? [];
  if (changed.length) {
    out.push('Storage slots mutated during the attack window:');
    out.push('');
    for (const w of changed) {
      out.push(`- \`${w.contractName}.${w.label}\` (${w.slot}): ${w.before} → ${w.after}.`);
    }
    out.push('');
  }

  out.push('## Detection analysis');
  out.push('');
  if (input.report.findings.length) {
    for (const f of input.report.findings) {
      out.push(
        `- **${f.label}** — ${Math.round(f.confidence * 100)}% confidence, ${f.severity}. ${f.rationale}`,
      );
      for (const e of f.evidence.slice(0, 3)) out.push(`  - ${e}`);
    }
  } else {
    out.push('- No detector produced a finding above zero confidence.');
  }
  out.push('');
  out.push('These detectors are heuristics over a single execution trace. They count structure and vocabulary, not intent.');
  out.push('');

  out.push('## Remediation');
  out.push('');
  out.push(remediationFor(vector.id));
  out.push('');

  out.push('## Client action plan');
  out.push('');
  out.push('**First 24 hours**');
  out.push('');
  out.push('- Pause the affected entry point and move the remaining balance out of the at-risk contract.');
  out.push('- Snapshot balances and storage for the affected accounts before any further state changes.');
  out.push('');
  out.push('**First week**');
  out.push('');
  out.push('- Ship the code fix below behind a regression test that reproduces this exact attack.');
  out.push('- Reconcile historical events for the affected entry point and quantify real exposure.');
  out.push('');
  out.push('**First month**');
  out.push('');
  out.push('- Add invariant and fuzz tests for every value-moving path, and run the detector suite in CI.');
  out.push('- Commission an independent review of the neighbouring trust assumptions.');
  out.push('');
  out.push('Local Foundry simulation — not mainnet evidence.');
  return out.join('\n');
}

function remediationFor(vectorId: string): string {
  const map: Record<string, string> = {
    reentrancy:
      'Zero the caller balance before the external call (checks-effects-interactions) and add a reentrancy guard to every value-moving entry point. Add a test whose receiver re-enters and assert the vault balance does not move.',
    'access-control':
      'Restore the authorisation modifier on the privileged path and replace tx.origin checks with msg.sender role checks. Add a negative test for every privileged function.',
    'oracle-manipulation':
      'Read prices from a manipulation-resistant source (Chainlink or a multi-block TWAP) and reject quotes that deviate beyond a bound. Never price collateral from the pool the borrower can move.',
    'flash-loan':
      'Assert settlement inside the callback and apply per-block borrow caps so a single transaction cannot extract the pool balance.',
    'delegatecall-injection':
      'Delegatecall only to implementations from an immutable registry, and validate the target before the call. Remove any caller-supplied implementation address.',
    'self-destruct':
      'Remove SELFDESTRUCT and migrate to an accounting sweep guarded by a timelock and multisig. Gate ownership changes behind the same controls.',
  };
  return map[vectorId] ?? 'Encode the intended invariant as an explicit check in every state-changing path, and add a regression test that attempts to violate it.';
}

/** Deterministic mermaid sequence diagram of the funds flow. */
export function deterministicSequence(artifact: SimulationArtifact | null): string {
  const lines = ['sequenceDiagram', '  autonumber', '  participant V as Victim'];
  const target = artifact?.contractName ?? 'Target';
  lines.push(`  participant T as ${target}`);
  lines.push('  participant A as Attacker');
  if (artifact?.steps.length) {
    for (const step of artifact.steps.slice(0, 8)) {
      const label = step.title.replace(/"/g, "'").slice(0, 48);
      if (/walk|proceeds|gain/i.test(step.title)) {
        lines.push(`  T-->>A: ${label}`);
      } else if (/victim|fund|deposit/i.test(step.title)) {
        lines.push(`  V->>T: ${label}`);
      } else {
        lines.push(`  A->>T: ${label}`);
        lines.push('  T-->>A: value');
      }
    }
  } else {
    lines.push('  A->>T: exploit transaction');
    lines.push('  T-->>A: value');
  }
  return lines.join('\n');
}
