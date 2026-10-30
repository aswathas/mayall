import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import type { ForensicReport } from '@helix/core';
import { reportToMarkdown, type SessionAnalysis } from '@helix/forensic-engine';
import type { CustomAttackResult } from '../../forensic-engine/src/custom.js';
import { balanceTimelineCsv, storageDiffCsv, stepTimelineCsv } from './folder.js';

export interface ProvenanceDoc {
  text: string;
  generatedBy: string;
  author: string;
  note: string;
}

export interface CustomFolderInput {
  folder: string;
  result: CustomAttackResult;
  analysis: SessionAnalysis;
  report: ForensicReport;
  narrative: ProvenanceDoc;
  plan: ProvenanceDoc;
  diagram: { text: string; source: string };
  reproduce: string[];
  bundle: boolean;
}

export interface CustomFolderOutput {
  folder: string;
  files: { path: string; bytes: number; sha256: string }[];
  bundlePath: string | null;
  missing: string[];
  bytes: number;
}

const REQUIRED = [
  'report/report.md',
  'report/report.json',
  'report/narrative.md',
  'report/plan.md',
  'report/diagram.mmd',
  'evidence/artifact.json',
  'evidence/trace.txt',
  'evidence/foundry-stdout.txt',
  'evidence/foundry-stderr.txt',
  'evidence/storage-diff.csv',
  'evidence/balance-timeline.csv',
  'evidence/timeline.csv',
  'evidence/patterns.json',
  'evidence/gas-flame.json',
  'evidence/chain-of-custody.json',
  'evidence/bundle.zip',
  'README.md',
];

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function write(folder: string, rel: string, content: string): void {
  const target = path.join(folder, rel);
  ensureDir(path.dirname(target));
  writeFileSync(target, content, 'utf-8');
}

function listFiles(dir: string, root = dir): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, root));
    else out.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return out.sort();
}

function hashFile(file: string): { bytes: number; sha256: string } {
  const buffer = readFileSync(file);
  return { bytes: buffer.byteLength, sha256: createHash('sha256').update(buffer).digest('hex') };
}

function headerLine(doc: ProvenanceDoc): string {
  return `<!-- generatedBy: ${doc.generatedBy} -->`;
}

/** User-facing output says Mayall; the engine's internal namespace says HELIX. */
function brand(text: string): string {
  return text.replace(/HELIX/g, 'Mayall');
}

function provenance(provenanceDoc: ProvenanceDoc): Record<string, unknown> {
  return {
    generatedBy: provenanceDoc.generatedBy,
    author: provenanceDoc.author,
    note: provenanceDoc.note,
  };
}

function renderReadme(input: CustomFolderInput): string {
  const { result, analysis, report, narrative, plan, diagram } = input;
  const artifact = result.artifact;
  const out: string[] = [];
  out.push(`# Mayall case folder — ${result.caseId}`);
  out.push('');
  out.push(
    `**Attack vector:** ${result.vectorLabel} (\`${result.vector}\`)  `,
    `**Severity:** ${report.severity.toUpperCase()}  `,
    `**Measured loss:** ${report.lossEth} ETH  `,
    `**Transactions:** ${analysis.transactions.length} segmented, ${analysis.suspicious.length} suspicious  `,
    `**Simulation:** ${result.ok ? 'PASS' : 'FAILED'} in ${result.durationMs} ms  `,
    `**Generated:** ${report.generatedAt}`,
  );
  out.push('');
  out.push('## What this folder is');
  out.push('');
  out.push(
    'One complete forensic run of the Mayall Custom Attack Lab. The evidence in `evidence/` is exactly what the local Foundry simulation produced: the raw forge output, the decoded call trace, the structured artifact the proof-of-concept wrote, and the derived tables. The documents in `report/` are what a client receives.',
  );
  out.push('');
  out.push('## How it was produced');
  out.push('');
  out.push('```bash');
  for (const command of input.reproduce) out.push(command);
  out.push('```');
  out.push('');
  out.push(
    `1. Ran the parameterised Foundry test with \`MAYALL_VECTOR=${result.vector}\`, \`MAYALL_TXS=${result.request.txs}\`, \`MAYALL_AMOUNT=${result.request.amountWei}\` and \`MAYALL_SEED=${result.request.seed}\`.`,
  );
  out.push('2. Parsed the forge call tree into a rooted node tree with gas and depth.');
  out.push('3. Ran the detector suite over the trace and the artifact; each finding carries its evidence.');
  out.push(`4. Built the forensic report from the measured artifact (loss ${report.lossEth} ETH, ${report.findings.length} finding${report.findings.length === 1 ? '' : 's'}).`);
  out.push(`5. Authored the narrative with \`${narrative.generatedBy}\` and the client plan with \`${plan.generatedBy}\`.`);
  out.push(`6. Wrote the mermaid diagram (${diagram.source}) and sealed the folder with a SHA-256 chain of custody.`);
  out.push('');
  out.push('## Layout');
  out.push('');
  out.push('| path | what |');
  out.push('| --- | --- |');
  const notes: Record<string, string> = {
    'report/report.md': 'Written forensic report (Markdown).',
    'report/report.json': 'Machine-readable report plus provenance.',
    'report/narrative.md': 'Executive narrative (MiniMax Code where available).',
    'report/plan.md': 'Client action plan: first 24 hours, first week, first month.',
    'report/diagram.mmd': 'Mermaid attack / funds-flow diagram.',
    'evidence/artifact.json': 'Structured evidence written by the PoC.',
    'evidence/trace.txt': 'Raw call tree as text.',
    'evidence/foundry-stdout.txt': 'Exact forge stdout.',
    'evidence/foundry-stderr.txt': 'Exact forge stderr.',
    'evidence/storage-diff.csv': 'Storage slots the attack mutated, before vs after.',
    'evidence/balance-timeline.csv': 'Measured balance movement per actor.',
    'evidence/timeline.csv': 'One row per recorded attack step.',
    'evidence/patterns.json': 'Detector findings with confidence and evidence.',
    'evidence/gas-flame.json': 'Gas flame derived from the trace.',
    'evidence/chain-of-custody.json': 'SHA-256 manifest for every file in this folder.',
    'evidence/bundle.zip': 'The same evidence sealed as a ZIP archive.',
  };
  for (const rel of REQUIRED) {
    if (rel === 'README.md') continue;
    out.push(`| \`${rel}\` | ${notes[rel] ?? ''} |`);
  }
  out.push('');
  out.push('## Honesty');
  out.push('');
  out.push(
    '- **This is a local Foundry simulation.** The contracts are real Solidity and the execution is a real EVM, but the chain state is local. It is not mainnet evidence and it does not prove a live deployment was exploited.',
  );
  out.push('- **The detectors are heuristics** over one execution trace. Confidence is a triage score, not proof.');
  out.push(
    `- **The narrative is ${narrative.generatedBy}.** ${
      narrative.generatedBy === 'deterministic'
        ? 'It was produced by the deterministic generator, not by a language model.'
        : 'It was produced by MiniMax Code from the evidence in this folder.'
    }`,
  );
  out.push('');
  out.push('## Case facts');
  out.push('');
  out.push(`- Target: \`${artifact?.contractName ?? 'unknown'}\` at \`${artifact?.target ?? 'n/a'}\`.`);
  out.push(`- Attacker: \`${artifact?.attacker ?? 'n/a'}\`.`);
  out.push(`- Loss measured in wei: \`${artifact?.lossWei ?? '0'}\`.`);
  out.push(`- Root cause asserted by the PoC: ${artifact?.rootCause ?? 'not recorded'}`);
  out.push('');
  out.push('_Generated by Mayall — local Foundry simulation, not mainnet evidence._');
  return out.join('\n');
}

function renderCustody(input: CustomFolderInput, files: { path: string; bytes: number; sha256: string }[]): string {
  return JSON.stringify(
    {
      caseRef: input.result.caseId,
      generatedAt: new Date().toISOString(),
      algorithm: 'sha256',
      scope:
        'Every file in this folder except evidence/chain-of-custody.json (this manifest) and evidence/bundle.zip (written after the manifest).',
      simulation: {
        command: input.result.command,
        startedAt: input.result.startedAt,
        durationMs: input.result.durationMs,
        ok: input.result.ok,
        vector: input.result.vector,
        request: input.result.request,
      },
      narrative: provenance(input.narrative),
      plan: provenance(input.plan),
      diagram: { source: input.diagram.source },
      files,
    },
    null,
    2,
  );
}

/** Writes the required custom case folder and returns a manifest of it. */
export async function writeCustomFolder(input: CustomFolderInput): Promise<CustomFolderOutput> {
  const { folder, result, analysis, report } = input;
  ensureDir(folder);

  const artifact = result.artifact;

  write(folder, 'evidence/artifact.json', JSON.stringify(artifact, null, 2));
  write(folder, 'evidence/trace.txt', result.traceText || 'No trace captured.');
  write(folder, 'evidence/foundry-stdout.txt', result.stdout || '');
  write(folder, 'evidence/foundry-stderr.txt', result.stderr || '');
  write(folder, 'evidence/storage-diff.csv', storageDiffCsv(artifact));
  write(folder, 'evidence/balance-timeline.csv', balanceTimelineCsv(artifact));
  write(folder, 'evidence/timeline.csv', stepTimelineCsv(artifact));
  write(folder, 'evidence/patterns.json', JSON.stringify(result.detections, null, 2));
  write(folder, 'evidence/gas-flame.json', JSON.stringify(result.flame, null, 2));

  write(folder, 'report/report.md', brand(reportToMarkdown(report)));
  write(
    folder,
    'report/report.json',
    JSON.stringify(
      {
        ...report,
        provenance: {
          narrative: provenance(input.narrative),
          plan: provenance(input.plan),
          diagram: { source: input.diagram.source },
          simulation: {
            command: result.command,
            startedAt: result.startedAt,
            durationMs: result.durationMs,
            ok: result.ok,
            vector: result.vector,
            request: result.request,
          },
          honesty: [
            'Local Foundry simulation, not mainnet evidence.',
            'Detectors are heuristics over a single execution trace.',
          ],
        },
      },
      null,
      2,
    ),
  );
  write(folder, 'report/narrative.md', `${headerLine(input.narrative)}\n\n${input.narrative.text}\n`);
  write(folder, 'report/plan.md', `${headerLine(input.plan)}\n\n${input.plan.text}\n`);
  write(folder, 'report/diagram.mmd', `${input.diagram.text}\n`);

  write(folder, 'README.md', renderReadme(input));

  const custodyFiles = listFiles(folder)
    .filter((rel) => rel !== 'evidence/chain-of-custody.json' && rel !== 'evidence/bundle.zip')
    .map((rel) => {
      const hash = hashFile(path.join(folder, rel));
      return { path: rel, bytes: hash.bytes, sha256: hash.sha256 };
    });

  write(folder, 'evidence/chain-of-custody.json', renderCustody(input, custodyFiles));

  let bundlePath: string | null = null;
  if (input.bundle) {
    const zip = new JSZip();
    for (const rel of listFiles(folder)) {
      if (rel === 'evidence/bundle.zip') continue;
      zip.file(rel, readFileSync(path.join(folder, rel)));
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    bundlePath = path.join(folder, 'evidence', 'bundle.zip');
    writeFileSync(bundlePath, buffer);
  }

  const files = listFiles(folder).map((rel) => {
    const hash = hashFile(path.join(folder, rel));
    return { path: rel, bytes: hash.bytes, sha256: hash.sha256 };
  });

  const required = input.bundle ? REQUIRED : REQUIRED.filter((rel) => rel !== 'evidence/bundle.zip');
  const missing = required.filter((rel) => !existsSync(path.join(folder, rel)));
  const total = files.reduce((sum, f) => sum + f.bytes, 0);

  return { folder, files, bundlePath, missing, bytes: total };
}

export { REQUIRED as CUSTOM_REQUIRED_FILES };
