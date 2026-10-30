import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Incident } from '@helix/core';
import { ATTACK_VECTORS } from '@helix/core';
import { repoRoot } from './foundry.js';
import {
  HISTORICAL_DISCLAIMER,
  REPORT_SECTION_HEADINGS,
  type HistoricalFinding,
  type HistoricalIncidentAnalysis,
  type LocalDetectorEvidence,
} from './historical.js';
import { saveNarrative } from './report.js';

export type ReportGeneratedBy = 'minimax-code' | 'deterministic';

export interface ReportSection {
  heading: string;
  body: string;
}

export interface GeneratedIncidentReport {
  caseId: string;
  slug: string;
  title: string;
  generatedAt: string;
  generatedBy: ReportGeneratedBy;
  /** The model used when generatedBy is "minimax-code". */
  model: string | null;
  markdown: string;
  mermaid: string;
  sections: ReportSection[];
  analysis: HistoricalIncidentAnalysis;
  detection: LocalDetectorEvidence;
  /** Human-readable note on how the report was produced. */
  generationNote: string;
}

export interface ReportValidation {
  ok: boolean;
  missingSections: string[];
  hasMermaid: boolean;
  mermaid: string | null;
  errors: string[];
}

export const DEFAULT_AI_MODEL = 'minimax/MiniMax-M3.1-Flash';
export const DEFAULT_AI_EFFORT = 'high';

/**
 * Mirrors `REMEDIATION` in packages/forensic-engine/src/report.ts. It is
 * duplicated rather than imported because that module does not export it and
 * the shared file is owned by another agent; the wording is kept identical.
 */
const REMEDIATION: Record<string, string> = {
  reentrancy:
    'Apply the checks-effects-interactions ordering: update the user balance before the external call, or guard the function with a reentrancy mutex (OpenZeppelin ReentrancyGuard).',
  'flash-loan':
    'Do not derive a protocol price or solvency ratio from the pool that the same transaction can move. Use a time-weighted oracle with a meaningful window, or apply per-block borrow caps.',
  'oracle-manipulation':
    'Consume external prices from a manipulation-resistant source (chainlink / TWAP over many blocks) and sanity-check the returned value against a deviation bound.',
  'access-control':
    'Apply the access-control modifier to every state-changing privileged path and add invariant tests that assert unauthorised callers revert on each of them.',
  'delegatecall-injection':
    'Never delegatecall to a caller-supplied address. Keep an immutable implementation registry and validate the implementation against it before any delegatecall.',
  'self-destruct':
    'Remove the destruction path entirely, or gate it behind a timelock and a multisig. Modern EVM deprecates SELFDESTRUCT — migrate the accounting model instead.',
  'arithmetic-overflow':
    'Use checked arithmetic (Solidity >=0.8) and standardise on 18-decimal fixed-point maths with explicit rounding rules.',
  'front-running':
    'Add slippage bounds to user-facing parameters and consider private order flow for high-value operations.',
  'bridge-exploit':
    'Bind every cross-chain message to its origin chain and a unique message id, and enforce a domain separator check on the destination chain.',
  'logic-error':
    'Encode the intended invariant as an explicit check in every state-changing path, and add a fuzzing target that attempts to violate it.',
};

const FALLBACK_REMEDIATION =
  'Review the affected contract paths and add invariant tests that assert the recorded preconditions cannot hold in production.';

/* ────────────────────────────── Formatting ────────────────────────────── */

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function usd(value: number): string {
  return USD.format(value);
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function mermaidSafe(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/["']/g, '')
    .replace(/[<>{}[\]()|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72);
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function lossLine(analysis: HistoricalIncidentAnalysis): string {
  const amount =
    analysis.lossAmount && analysis.lossAsset
      ? `${analysis.lossAmount} ${analysis.lossAsset}`
      : 'amount not recorded in a native asset';
  return `${usd(analysis.lossUsd)} (${amount})`;
}

export function caseIdFor(slug: string): string {
  return `incident-${slug}`;
}

export function aiReportsDir(): string {
  return path.join(repoRoot(), 'data', 'ai-reports');
}

export function aiReportPath(slug: string): string {
  return path.join(aiReportsDir(), `${caseIdFor(slug)}.json`);
}

/* ─────────────────────────── Mermaid generation ─────────────────────────── */

export function deterministicMermaid(
  analysis: HistoricalIncidentAnalysis,
  incident: Incident,
): string {
  const primary = analysis.findings[0];
  const pattern = primary?.biblePattern ?? 'Unclassified';
  const vector = primary?.vectorLabel ?? 'Unknown vector';
  const root = mermaidSafe(incident.rootCause.split(/[.;]/)[0] ?? incident.rootCause);
  const target = mermaidSafe(analysis.target);
  const loss = mermaidSafe(`${usd(analysis.lossUsd)} reported`);
  const family = mermaidSafe(primary?.bibleFamily ?? 'Unclassified');
  const reproduced = analysis.reproducible
    ? `Local reproduction: ${analysis.scenarioId}`
    : 'No local reproduction';

  return [
    'flowchart TD',
    `  A["Attacker"] -->|"${vector}"| B["Victim: ${target}"]`,
    `  B --> C["${root}"]`,
    `  C --> D["Bible pattern: ${pattern}"]`,
    `  D --> E["${loss}"]`,
    `  E --> F["${reproduced}"]`,
    `  F --> G["Family: ${family}"]`,
  ].join('\n');
}

/* ─────────────────────────── Deterministic report ─────────────────────────── */

function deterministicAttackSequence(
  analysis: HistoricalIncidentAnalysis,
  incident: Incident,
): string {
  const steps = sentences(incident.summary);
  const root = sentences(incident.rootCause);
  const lines: string[] = [];
  let index = 1;

  if (root[0]) {
    lines.push(`${index}. Setup as published — ${root[0]}`);
    index += 1;
  }
  for (const step of steps) {
    lines.push(`${index}. ${step}`);
    index += 1;
  }
  if (steps.length < 2 && root[1]) {
    lines.push(`${index}. Mechanism — ${root.slice(1).join(' ')}`);
    index += 1;
  }
  lines.push(
    `${index}. Extraction — the public record reports a loss of ${lossLine(analysis)} at disclosure.`,
  );
  index += 1;
  lines.push(
    analysis.reproducible && analysis.scenarioId
      ? `${index}. Local reproduction — the Mayall lab executes scenario \`${analysis.scenarioId}\`, which reproduces the attack vector rather than the historic transaction.`
      : `${index}. Local reproduction — none. No Foundry scenario reproduces this incident, so the mechanism is not re-executed locally.`,
  );

  return lines.join('\n');
}

function deterministicDetectionSection(
  analysis: HistoricalIncidentAnalysis,
  detection: LocalDetectorEvidence,
): string {
  const lines: string[] = [];
  lines.push(`**Local evidence source:** ${detection.source ?? 'none'}`);
  lines.push('');
  lines.push(detection.note);
  lines.push('');

  if (detection.detections.length) {
    lines.push('Detectors that fire on the local reproduction, mapped to the Bible signals that would prove the pattern:');
    lines.push('');
    for (const finding of detection.detections) {
      const confidence = Math.round(finding.confidence * 100);
      lines.push(
        `- **${finding.label}** — ${confidence}% confidence, severity ${finding.severity}, vector \`${finding.vectorId}\`.`,
      );
      lines.push(`  - Rationale: ${finding.rationale}`);
      if (finding.evidence.length) {
        for (const item of finding.evidence) lines.push(`  - Evidence: ${item}`);
      }
      const mapping = analysis.findings.find((item) => item.vector === finding.vectorId);
      if (mapping) {
        const signals = mapping.bibleSignals.map((signal) => `\`${signal.name}\` (${signal.status})`).join(', ');
        lines.push(`  - Bible pattern \`${mapping.biblePattern}\`; signals: ${signals}`);
      }
      const limitation = analysis.findings.find((item) => item.vector === finding.vectorId)?.limitations;
      if (limitation) lines.push(`  - Detector limitation, quoted: "${limitation}"`);
      lines.push('');
    }
  } else {
    lines.push(
      'No Mayall detector fired for this incident because no local artifact was executed. The classification below is a retrospective mapping only.',
    );
    lines.push('');
  }

  lines.push('Bible signal status for each classified vector:');
  lines.push('');
  for (const finding of analysis.findings) {
    const observed = finding.bibleSignals.filter((signal) => signal.status === 'observed').length;
    const expected = finding.bibleSignals.filter((signal) => signal.status === 'expected').length;
    const notApplicable = finding.bibleSignals.filter((signal) => signal.status === 'notApplicable').length;
    lines.push(
      `- \`${finding.vector}\` → \`${finding.biblePattern}\` (${finding.bibleFamily}): ${observed} observed in the record, ${expected} expected from a full trace, ${notApplicable} not applicable.`,
    );
    lines.push(`  - Limitation: "${finding.limitations}"`);
  }

  return lines.join('\n');
}

function deterministicRemediation(analysis: HistoricalIncidentAnalysis): string {
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const finding of analysis.findings) {
    if (seen.has(finding.vector)) continue;
    seen.add(finding.vector);
    const remediation = REMEDIATION[finding.vector] ?? FALLBACK_REMEDIATION;
    lines.push(`- **${finding.vectorLabel}** — ${remediation}`);
  }

  if (analysis.findings.length) {
    lines.push('');
    lines.push('Bible linkage for the control review:');
    lines.push('');
    for (const finding of analysis.findings) {
      const signals = finding.bibleSignals.map((signal) => signal.name).join(', ');
      lines.push(
        `- \`${finding.biblePattern}\` (${finding.bibleFamily}) — the Bible requires: ${signals || 'no mapped signals'}.`,
      );
    }
  }

  return lines.join('\n');
}

function deterministicActionPlan(analysis: HistoricalIncidentAnalysis): string {
  const pattern = analysis.findings[0]?.biblePattern ?? 'the recorded pattern';
  return [
    '**First 24 hours**',
    '',
    '1. Preserve the evidence set: export the recorded transaction hashes, actor addresses and the references listed in the case header before any remediation changes state.',
    '2. Contain the exposure: pause the affected contract paths or revoke the privileged keys named in the record, using the multisig or timelock that controls them.',
    `3. Scope the loss: reconcile the reported figure (${usd(analysis.lossUsd)}) against the protocol ledger and publish a single number with its source.`,
    '4. Open an incident channel and notify the counterparties whose funds or keys are implicated.',
    '',
    '**First week**',
    '',
    '5. Reproduce the mechanism in a local Foundry harness, or state plainly that no reproduction exists and why.',
    '6. Walk the contract against the Bible signals for this pattern and record which ones the protocol can actually emit.',
    `7. Fix the root cause for ${pattern}, then add invariant tests that fail on the original code.`,
    '8. Rotate every key or signer that touched the compromised path and confirm the new custody arrangement in writing.',
    '',
    '**First month**',
    '',
    '9. Commission an independent review of the affected family of contracts, not only the single function that failed.',
    '10. Publish a post-incident report that separates what was proven locally from what is only asserted by the public record.',
    '11. Add monitoring for the Bible signals that would have fired, with a named owner and a tested alert path.',
  ].join('\n');
}

export function buildDeterministicReport(
  analysis: HistoricalIncidentAnalysis,
  incident: Incident,
  detection: LocalDetectorEvidence,
  generatedAt = new Date().toISOString(),
): GeneratedIncidentReport {
  const mermaid = deterministicMermaid(analysis, incident);
  const caseId = caseIdFor(analysis.slug);
  const actors = incident.actors
    .map((actor) => `\`${actor.address}\` — ${actor.label} (${actor.role})`)
    .join('\n');
  const txRefs = incident.txs.length
    ? incident.txs.map((tx) => `\`${tx}\``).join('\n')
    : 'No transaction hash was published in the registry.';
  const references = incident.references.length
    ? incident.references.map((reference) => `- ${reference.label} — ${reference.url}`).join('\n')
    : 'No public references were recorded.';
  const vectors = analysis.findings
    .map((finding) => `- **${finding.vectorLabel}** (\`${finding.vector}\`) → ${finding.biblePattern}`)
    .join('\n');

  const markdown = [
    `# ${analysis.name} — Forensic Report`,
    '',
    `**Case reference:** ${caseId}  `,
    `**Generated:** ${generatedAt}  `,
    `**Generated by:** Mayall deterministic report writer (no model was used)  `,
    `**Chain:** ${analysis.chain}  `,
    `**Date of incident:** ${analysis.date}  `,
    `**Severity:** ${analysis.severity.toUpperCase()}  `,
    `**Analysis method:** retrospective classification over public records`,
    '',
    '## 1. Case header',
    '',
    `- **Incident:** ${analysis.name}`,
    `- **Target:** ${analysis.target}`,
    `- **Chain:** ${analysis.chain}`,
    `- **Date:** ${analysis.date}`,
    `- **Reported loss:** ${lossLine(analysis)}`,
    `- **Recovered:** ${analysis.recovered ? 'yes, per the public record' : 'no recovery reported in the registry'}`,
    `- **Attack vectors (registry):** ${analysis.findings.map((finding) => `\`${finding.vector}\``).join(', ')}`,
    `- **Classification:** ${analysis.findings.map((finding) => finding.biblePattern).join('; ')}`,
    `- **Local reproduction:** ${analysis.reproducible ? `\`${analysis.scenarioId}\`` : 'none'}`,
    '',
    'Actors recorded in the registry:',
    '',
    actors || 'No actor addresses were recorded.',
    '',
    'Transaction references:',
    '',
    txRefs,
    '',
    'References:',
    '',
    references,
    '',
    '## 2. Executive summary',
    '',
    `${analysis.name} lost ${lossLine(analysis)} on ${analysis.date} on ${analysis.chain}. ` +
      `The registry records the target as ${analysis.target} and the mechanism as ${analysis.findings
        .map((finding) => finding.vectorLabel.toLowerCase())
        .join(' plus ')}. ` +
      `${sentences(incident.rootCause)[0] ?? incident.rootCause} ` +
      `${analysis.reproducible
        ? `Mayall holds a local Foundry reproduction (scenario \`${analysis.scenarioId}\`) that re-executes the attack vector and produces a trace; it does not replay the historic transaction.`
        : 'Mayall holds no local Foundry reproduction, so the mechanism is not re-executed and the case rests on the public record.'} ` +
      `This report is retrospective classification, not a mainnet trace analysis.`,
    '',
    '## 3. Attack sequence',
    '',
    deterministicAttackSequence(analysis, incident),
    '',
    '### Attack flow',
    '',
    '```mermaid',
    mermaid,
    '```',
    '',
    '## 4. Evidence reconstruction',
    '',
    '| Claim | Status | Basis |',
    '| --- | --- | --- |',
    `| Attack classification | retrospective | Registry vector list and the published root-cause narrative. |`,
    `| Reported loss | published | ${escapeTable(lossLine(analysis))} at disclosure. |`,
    `| Transaction references | ${incident.txs.length ? 'recorded' : 'not recorded'} | ${escapeTable(
      incident.txs.length ? `${incident.txs.length} hash(es) in the registry.` : 'No hash was published.',
    )} |`,
    `| Actor addresses | ${incident.actors.length ? 'recorded' : 'not recorded'} | ${incident.actors.length} address(es) in the registry. |`,
    `| Mainnet call trace | not available | The registry holds no \`call_traces_raw\`; no mainnet trace was analysed. |`,
    `| Local reproduction | ${analysis.reproducible ? 'reproduced' : 'not reproduced'} | ${
      analysis.reproducible
        ? `Foundry scenario \`${analysis.scenarioId}\` re-executes the same vector locally.`
        : 'No scenario is registered for this incident.'
    } |`,
    `| Bible signal confirmation | partial | ${analysis.signalCounts.observed} observed in the record, ${analysis.signalCounts.expected} expected from a full trace, ${analysis.signalCounts.notApplicable} not applicable. |`,
    '',
    'What the local reproduction proves: the attack vector is executable against the harness and the detectors fire on the resulting artifact. What it does not prove: that the historic attacker took the same call path, used the same addresses, or moved the reported amount. The reproduction is a mechanism test, not a replay.',
    '',
    '## 5. Detection analysis',
    '',
    deterministicDetectionSection(analysis, detection),
    '',
    '## 6. Remediation',
    '',
    deterministicRemediation(analysis),
    '',
    '## 7. Client action plan',
    '',
    deterministicActionPlan(analysis),
    '',
    '---',
    '',
    `_${HISTORICAL_DISCLAIMER}_`,
    '',
  ].join('\n');

  return {
    caseId,
    slug: analysis.slug,
    title: `${analysis.name} — Forensic Report`,
    generatedAt,
    generatedBy: 'deterministic',
    model: null,
    markdown,
    mermaid,
    sections: parseSections(markdown),
    analysis,
    detection,
    generationNote:
      'Generated by the deterministic report writer. No model was used, and the report is labelled accordingly.',
  };
}

/* ────────────────────────────── AI prompt ────────────────────────────── */

function signalList(finding: HistoricalFinding): string {
  return finding.bibleSignals
    .map((signal) => `${signal.name} [${signal.status}]${signal.family ? ` (${signal.family})` : ''}`)
    .join(', ');
}

export function buildReportPrompt(
  analysis: HistoricalIncidentAnalysis,
  incident: Incident,
  detection: LocalDetectorEvidence,
): string {
  const data = {
    incident: {
      id: incident.id,
      slug: incident.slug,
      name: incident.name,
      chain: incident.chain,
      date: incident.date,
      target: incident.target,
      lossUsd: incident.lossUsd,
      lossAmount: incident.lossAmount ?? null,
      lossAsset: incident.lossAsset ?? null,
      recovered: Boolean(incident.recovered),
      reproducible: incident.reproducible,
      scenarioId: incident.scenarioId ?? null,
      vectors: incident.vectors,
      rootCause: incident.rootCause,
      summary: incident.summary,
      actors: incident.actors,
      txs: incident.txs,
      references: incident.references,
    },
    classification: {
      method: analysis.method,
      severity: analysis.severity,
      topConfidence: analysis.topConfidence,
      findings: analysis.findings.map((finding) => ({
        vector: finding.vector,
        vectorLabel: finding.vectorLabel,
        confidence: finding.confidence,
        severity: finding.severity,
        biblePattern: finding.biblePattern,
        bibleFamily: finding.bibleFamily,
        bibleSignals: finding.bibleSignals.map((signal) => ({
          name: signal.name,
          status: signal.status,
          family: signal.family,
          weight: signal.weight,
          note: signal.note,
        })),
        reproduction: finding.reproduction,
        limitations: finding.limitations,
        evidenceRefs: finding.evidenceRefs,
      })),
      signalCounts: analysis.signalCounts,
    },
    localDetection: {
      scenarioId: detection.scenarioId,
      available: detection.available,
      source: detection.source,
      note: detection.note,
      detections: detection.detections.map((item) => ({
        id: item.id,
        vectorId: item.vectorId,
        label: item.label,
        confidence: item.confidence,
        severity: item.severity,
        rationale: item.rationale,
        evidence: item.evidence,
      })),
    },
  };

  return [
    "You are the forensic analyst for Mayall, a Web3 exploit forensics tool. Write a client-ready forensic report for ONE historical incident.",
    '',
    'NON-NEGOTIABLE RULES:',
    '1. Use ONLY facts in the DATA block below. Do not invent a transaction hash, address, date, loss figure, actor, or on-chain observation. If a fact is absent, say it is absent.',
    '2. This is RETROSPECTIVE CLASSIFICATION over public records, not a mainnet trace analysis. Say so in the executive summary and in the evidence section.',
    '3. Detector results describe the LOCAL Foundry reproduction of the same attack vector, not the historic transaction. State that distinction explicitly.',
    '4. Quote each detector limitation from the DATA block verbatim when you discuss that detector.',
    '5. Never claim a Bible signal was observed on-chain. Use the statuses exactly as given: observed means the published narrative names the mechanism; expected means a full trace would be needed; notApplicable means the record does not describe that variant.',
    '6. Do not infer a transfer, sale, dispersion or extraction that the record does not state. If the record only says tokens were minted, say the disposition is not recorded; do not assert where they went.',
    '7. Do NOT create, write, edit or delete any file, and do not use any tool. Return the report only as your final chat message.',
    '8. Return ONLY the markdown report. No preamble, no apology, no explanation outside the report, no file list, no attachment tags, and do NOT wrap the whole document in a code fence.',
    '',
    'REQUIRED STRUCTURE — use these exact H2 headings, in this order:',
    ...REPORT_SECTION_HEADINGS.map((heading) => `## ${heading}`),
    '',
    'Section requirements:',
    '- 1. Case header: incident, chain, date, reported loss (USD and native asset), target, actors, vectors, classification, local reproduction. Use a compact markdown table or bullet list.',
    '- 2. Executive summary: 3 to 5 sentences covering the money and the mechanism. No bullet list.',
    '- 3. Attack sequence: a numbered narrative of the exploit, derived only from the published root cause and summary. Then add the subheading "### Attack flow" followed by exactly one ```mermaid fenced block.',
    '- 4. Evidence reconstruction: a markdown table with Claim | Status | Basis. Separate what the local reproduction proves from what it cannot prove.',
    '- 5. Detection analysis: which Mayall detectors fire on the local scenario, their confidence and evidence, the Bible signal names that would prove the pattern, and the detectors\' own limitations quoted verbatim. If no detector fired, say why.',
    '- 6. Remediation: specific controls per attack vector. Tie each control to the Bible pattern.',
    '- 7. Client action plan: a numbered, time-boxed plan split into "First 24 hours", "First week", "First month".',
    '',
    'MERMAID RULES:',
    '- The diagram must be valid Mermaid. Prefer `flowchart TD` with double-quoted node labels. A `sequenceDiagram` is acceptable for funds flow.',
    '- Keep labels under 60 characters. Escape or remove quotes, brackets and parentheses from labels.',
    '- The diagram must show the attack flow from attacker to victim to extraction, and mark where the local reproduction stops.',
    '',
    'DATA:',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
    '',
    'Write the report now. Begin with the H1 title and then section 1.',
  ].join('\n');
}

export function buildRepairPrompt(markdown: string, missingSections: string[]): string {
  return [
    'The markdown report below is malformed for Mayall.',
    `Missing required H2 headings: ${missingSections.join(', ') || 'none'}`,
    'Rewrite the FULL report so that it contains every required H2 heading exactly once, in order, plus exactly one ```mermaid fenced block.',
    'Keep every fact identical; do not add new numbers, addresses or observations. Return only markdown, with no outer code fence and no commentary.',
    '',
    'Required headings, in order:',
    ...REPORT_SECTION_HEADINGS.map((heading) => `## ${heading}`),
    '',
    'CURRENT REPORT:',
    '````markdown',
    markdown,
    '````',
  ].join('\n');
}

/* ──────────────────────────── Parsing + checks ──────────────────────────── */

const MERMAID_RE = /```mermaid\s*\r?\n([\s\S]*?)```/i;

export function extractMermaid(markdown: string): string | null {
  const match = markdown.match(MERMAID_RE);
  return match ? match[1].trim() : null;
}

export function stripOuterFence(markdown: string): string {
  const trimmed = markdown.replace(/^\uFEFF/, '').trim();
  if (!/^```(?:markdown|md)?\s*\r?\n/i.test(trimmed)) return trimmed;
  const body = trimmed.replace(/^```(?:markdown|md)?\s*\r?\n/i, '');
  if (!body.trimEnd().endsWith('```')) return trimmed;
  return body.trimEnd().slice(0, -3).trimEnd();
}

/**
 * Removes the transport noise the CLI can append to a model answer: delivered
 * asset tags and the `File: …` line mcode prints when a model writes a file.
 */
export function cleanModelMarkdown(raw: string): string {
  let markdown = raw.replace(/^\uFEFF/, '').trim();
  markdown = markdown.replace(/<deliver-assets>[\s\S]*?<\/deliver-assets>/gi, '').trim();
  markdown = markdown.replace(/^\s*File:\s.*$/gim, '').trim();
  markdown = markdown.replace(/^\s*<deliver-assets>[\s\S]*$/i, '').trim();
  return stripOuterFence(markdown);
}

export function parseSections(markdown: string): ReportSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: ReportSection[] = [];
  let heading: string | null = null;
  let body: string[] = [];

  const flush = () => {
    if (heading !== null) sections.push({ heading, body: body.join('\n').trim() });
  };

  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      flush();
      heading = match[1];
      body = [];
    } else if (heading !== null) {
      body.push(line);
    }
  }
  flush();
  return sections;
}

export function validateReportMarkdown(markdown: string): ReportValidation {
  const errors: string[] = [];
  const missingSections = REPORT_SECTION_HEADINGS.filter(
    (heading) => !new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(markdown),
  );
  const mermaid = extractMermaid(markdown);

  if (missingSections.length) errors.push(`Missing sections: ${missingSections.join(', ')}`);
  if (!mermaid) errors.push('No ```mermaid fenced block found.');
  else if (!/^(flowchart|graph|sequenceDiagram)\b/.test(mermaid)) {
    errors.push('The mermaid block does not start with flowchart, graph or sequenceDiagram.');
  }
  if (markdown.trim().length < 600) errors.push('Report is implausibly short.');

  return {
    ok: errors.length === 0,
    missingSections,
    hasMermaid: Boolean(mermaid),
    mermaid,
    errors,
  };
}

/** Converts a validated model response into the stored report shape. */
export function assembleAiReport(
  rawMarkdown: string,
  analysis: HistoricalIncidentAnalysis,
  incident: Incident,
  detection: LocalDetectorEvidence,
  model: string,
  generatedAt = new Date().toISOString(),
): GeneratedIncidentReport {
  const markdown = cleanModelMarkdown(rawMarkdown);
  const mermaid = extractMermaid(markdown) ?? deterministicMermaid(analysis, incident);

  return {
    caseId: caseIdFor(analysis.slug),
    slug: analysis.slug,
    title: `${analysis.name} — Forensic Report`,
    generatedAt,
    generatedBy: 'minimax-code',
    model,
    markdown,
    mermaid,
    sections: parseSections(markdown),
    analysis,
    detection,
    generationNote: `Authored by ${model} through the local MiniMax Code CLI.`,
  };
}

/* ──────────────────────────────── Storage ──────────────────────────────── */

export interface StoredReportPaths {
  markdownPath: string;
  jsonPath: string;
}

export function writeGeneratedReport(report: GeneratedIncidentReport): StoredReportPaths {
  // saveNarrative owns the on-disk naming convention (`caseId.md`), so the
  // existing narrative loader picks the report up unchanged.
  const markdownPath = saveNarrative(report.caseId, report.markdown);

  mkdirSync(aiReportsDir(), { recursive: true });
  const jsonPath = aiReportPath(report.slug);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  return { markdownPath, jsonPath };
}

export function readStoredReport(slug: string): GeneratedIncidentReport | null {
  const jsonPath = aiReportPath(slug);
  if (!existsSync(jsonPath)) return null;
  try {
    return JSON.parse(readFileSync(jsonPath, 'utf-8')) as GeneratedIncidentReport;
  } catch {
    return null;
  }
}

export function reportsPublishedFor(slug: string): { markdown: boolean; json: boolean } {
  return {
    json: existsSync(aiReportPath(slug)),
    markdown: existsSync(
      path.join(repoRoot(), 'data', 'narratives', `${caseIdFor(slug).replace(/[^a-z0-9_-]/gi, '_')}.md`),
    ),
  };
}
