/**
 * Generates the historical forensic reports.
 *
 *   npx tsx scripts/generate-historical-reports.ts
 *
 * The narrative layer is authored by the local MiniMax Code CLI. Every report
 * is validated for the seven required sections and a mermaid block; if the
 * model is unavailable or returns a malformed document, the deterministic
 * writer is used and the report is labelled `generatedBy: "deterministic"`.
 * The script is re-runnable: existing reports are skipped unless --force.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Incident } from '@helix/core';
import { INCIDENTS } from '@helix/core/incidents';
import {
  DEFAULT_AI_EFFORT,
  DEFAULT_AI_MODEL,
  aiReportPath,
  analyzeIncident,
  assembleAiReport,
  buildDeterministicReport,
  buildHistoricalAnalysis,
  buildRepairPrompt,
  buildReportPrompt,
  caseIdFor,
  cleanModelMarkdown,
  localDetectionsFor,
  readStoredReport,
  repoRoot,
  reportsPublishedFor,
  validateReportMarkdown,
  writeGeneratedReport,
  type GeneratedIncidentReport,
} from '@helix/forensic-engine';

interface Options {
  force: boolean;
  dryRun: boolean;
  noAi: boolean;
  only: string[];
  limit: number | null;
  model: string;
  effort: string;
  timeoutMs: number;
}

interface McodeResult {
  ok: boolean;
  answer: string;
  stderr: string;
  timedOut: boolean;
  detail: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    force: false,
    dryRun: false,
    noAi: false,
    only: [],
    limit: null,
    model: DEFAULT_AI_MODEL,
    effort: DEFAULT_AI_EFFORT,
    timeoutMs: 180_000,
  };

  for (const arg of argv) {
    if (arg === '--force') options.force = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--no-ai' || arg === '--deterministic') options.noAi = true;
    else if (arg.startsWith('--only=')) {
      options.only.push(
        ...arg
          .slice('--only='.length)
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
      );
    } else if (arg.startsWith('--limit=')) {
      const value = Number(arg.slice('--limit='.length));
      if (Number.isFinite(value) && value > 0) options.limit = Math.floor(value);
    } else if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length);
    } else if (arg.startsWith('--effort=')) {
      options.effort = arg.slice('--effort='.length);
    } else if (arg.startsWith('--timeout=')) {
      const seconds = Number(arg.slice('--timeout='.length));
      if (Number.isFinite(seconds) && seconds >= 30) options.timeoutMs = Math.floor(seconds * 1000);
    }
  }

  return options;
}

function mcodePath(): string {
  const home = process.env.USERPROFILE ?? os.homedir();
  return path.join(home, '.minimax-code', 'mcode.ps1');
}

/**
 * Runs one mcode prompt. The prompt is attached as a file so long reports do
 * not hit the Windows command-line limit, and the final message is written to
 * a file so PowerShell progress noise on stderr cannot contaminate it.
 */
function runMcode(prompt: string, options: Options): Promise<McodeResult> {
  const script = mcodePath();
  if (!existsSync(script)) {
    return Promise.resolve({
      ok: false,
      answer: '',
      stderr: `mcode CLI not found at ${script}`,
      timedOut: false,
      detail: 'mcode CLI unavailable',
    });
  }

  const workDir = mkdtempSync(path.join(os.tmpdir(), 'mayall-mcode-'));
  const promptPath = path.join(workDir, 'prompt.md');
  const answerPath = path.join(workDir, 'answer.md');
  writeFileSync(promptPath, prompt, 'utf-8');

  const root = repoRoot();
  const runTimeoutSeconds = Math.max(30, Math.floor(options.timeoutMs / 1000) - 15);
  const args = [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    script,
    'exec',
    '--cwd',
    root,
    '--model',
    options.model,
    '--effort',
    options.effort,
    '--prompt-mode',
    'work',
    '--permission',
    'off',
    '--timeout',
    `${runTimeoutSeconds}s`,
    '--file',
    promptPath,
    '--output-format',
    'text',
    '-o',
    answerPath,
  ];

  return new Promise((resolve) => {
    let stderr = '';
    let timedOut = false;
    const child = spawn('powershell.exe', args, {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      // stdout is not used for the answer; the -o file is authoritative.
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        answer: '',
        stderr: `${stderr}\n${error.message}`.trim(),
        timedOut,
        detail: `spawn failed: ${error.message}`,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      let answer = '';
      if (existsSync(answerPath)) {
        try {
          answer = readFileSync(answerPath, 'utf-8');
        } catch {
          answer = '';
        }
      }
      const ok = code === 0 && !timedOut && answer.trim().length > 0;
      resolve({
        ok,
        answer,
        stderr: stderr.trim(),
        timedOut,
        detail: timedOut
          ? `timed out after ${options.timeoutMs} ms`
          : code === 0
            ? answer.trim().length > 0
              ? 'ok'
              : 'mcode returned an empty answer'
            : `mcode exited with code ${code}`,
      });
    });
  });
}

function indent(text: string): string {
  return text
    .split(/\r?\n/)
    .slice(-8)
    .map((line) => `        ${line}`)
    .join('\n');
}

async function generateOne(
  incident: Incident,
  options: Options,
): Promise<{ report: GeneratedIncidentReport; source: string; note: string }> {
  const analysis = analyzeIncident(incident);
  const detection = localDetectionsFor(incident);

  if (options.noAi) {
    const report = buildDeterministicReport(analysis, incident, detection);
    report.generationNote =
      'Generated by the deterministic report writer because --no-ai was requested. No model was used.';
    return { report, source: 'deterministic', note: '--no-ai requested' };
  }

  const prompt = buildReportPrompt(analysis, incident, detection);
  let result = await runMcode(prompt, options);
  let validation = result.ok ? validateReportMarkdown(cleanModelMarkdown(result.answer)) : null;
  let repairNote = '';

  if (result.ok && validation && !validation.ok && validation.missingSections.length) {
    const repairPrompt = buildRepairPrompt(cleanModelMarkdown(result.answer), validation.missingSections);
    const repaired = await runMcode(repairPrompt, options);
    if (repaired.ok) {
      const repairedValidation = validateReportMarkdown(cleanModelMarkdown(repaired.answer));
      if (repairedValidation.ok) {
        result = repaired;
        validation = repairedValidation;
        repairNote = ' (repaired once)';
      } else {
        repairNote = ` (repair failed: ${repairedValidation.errors.join('; ')})`;
      }
    } else {
      repairNote = ` (repair ${repaired.detail})`;
    }
  }

  if (result.ok && validation?.ok) {
    const report = assembleAiReport(result.answer, analysis, incident, detection, options.model);
    return {
      report,
      source: 'minimax-code',
      note: `${options.model}${repairNote}`,
    };
  }

  const report = buildDeterministicReport(analysis, incident, detection);
  const reason = !result.ok
    ? result.detail
    : validation && !validation.ok
      ? validation.errors.join('; ')
      : 'unknown validation failure';
  report.generationNote = `Generated by the deterministic report writer because the MiniMax Code report was not usable: ${reason}${repairNote}. No model-authored text was kept.`;
  return {
    report,
    source: 'deterministic',
    note: `fallback: ${reason}${result.stderr ? ` | ${result.stderr.split(/\r?\n/)[0]}` : ''}${repairNote}`,
  };
}

function selectedIncidents(options: Options): Incident[] {
  let incidents = [...INCIDENTS].sort((a, b) => b.lossUsd - a.lossUsd);
  if (options.only.length) {
    const wanted = new Set(options.only);
    incidents = incidents.filter((incident) => wanted.has(incident.slug) || wanted.has(incident.id));
  }
  if (options.limit !== null) incidents = incidents.slice(0, options.limit);
  return incidents;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.dryRun) {
    const analysis = buildHistoricalAnalysis();
    console.log('Historical analysis (dry run)');
    console.log(`  incidents:        ${analysis.totals.incidents}`);
    console.log(`  findings:         ${analysis.totals.findings}`);
    console.log(`  reproducible:     ${analysis.totals.reproducible}`);
    console.log(`  retrospective:    ${analysis.totals.retrospectiveOnly}`);
    console.log(`  tracked loss:     ${formatUsd(analysis.totals.lossUsd)}`);
    console.log(
      `  signal statuses:  ${analysis.totals.signalsObserved} observed / ${analysis.totals.signalsExpected} expected / ${analysis.totals.signalsNotApplicable} n/a`,
    );
    console.log('');
    for (const incident of analysis.incidents) {
      const top = incident.findings[0];
      console.log(
        `  ${incident.slug.padEnd(38)} ${incident.reproducible ? 'repro' : 'retro'}  ${String(
          incident.findings.length,
        ).padStart(2)} findings  top=${incident.topConfidence.toFixed(2)}  ${top?.biblePattern ?? '—'}`,
      );
    }
    return;
  }

  const incidents = selectedIncidents(options);
  if (!incidents.length) {
    console.error('No incidents matched the selection.');
    process.exitCode = 1;
    return;
  }

  console.log(`Mayall historical reports · ${incidents.length} incident(s)`);
  console.log(`  model: ${options.noAi ? '(deterministic only)' : options.model}`);
  console.log(`  force: ${options.force} · timeout: ${Math.round(options.timeoutMs / 1000)}s`);
  console.log('');

  mkdirSync(path.dirname(aiReportPath('__probe__')), { recursive: true });

  const rows: string[][] = [];
  let aiCount = 0;
  let deterministicCount = 0;
  let skipped = 0;

  for (const incident of incidents) {
    const published = reportsPublishedFor(incident.slug);
    const complete = published.json && published.markdown && existsSync(aiReportPath(incident.slug));

    if (complete && !options.force) {
      skipped += 1;
      const stored = readStoredReport(incident.slug);
      const storedValidation = stored ? validateReportMarkdown(stored.markdown) : null;
      rows.push([
        incident.slug,
        stored?.generatedBy ?? 'existing',
        stored?.model ?? '—',
        `${stored?.sections.length ?? 0}/7`,
        storedValidation?.hasMermaid ? 'yes' : 'no',
        '—',
        'existing report',
      ]);
      console.log(
        `  skip  ${incident.slug} (${stored?.generatedBy ?? 'present'} · ${stored?.sections.length ?? 0} sections · mermaid ${
          storedValidation?.hasMermaid ? 'yes' : 'no'
        })`,
      );
      continue;
    }

    const started = Date.now();
    try {
      const { report, source, note } = await generateOne(incident, options);
      const paths = writeGeneratedReport(report);
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      const validation = validateReportMarkdown(report.markdown);
      if (source === 'minimax-code') aiCount += 1;
      else deterministicCount += 1;

      rows.push([
        incident.slug,
        source,
        report.model ?? '—',
        `${report.sections.length}/7`,
        validation.hasMermaid ? 'yes' : 'no',
        `${elapsed}s`,
        note,
      ]);

      console.log(
        `  ${source === 'minimax-code' ? 'ai  ' : 'det '}  ${incident.slug} · ${report.sections.length} sections · mermaid ${
          validation.hasMermaid ? 'yes' : 'no'
        } · ${elapsed}s${note && source === 'deterministic' ? ` · ${note}` : ''}`,
      );
      console.log(`        -> ${paths.markdownPath}`);
      console.log(`        -> ${paths.jsonPath}`);
      if (!validation.ok) {
        for (const error of validation.errors) console.log(`        !! ${error}`);
      }
    } catch (error) {
      deterministicCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      rows.push([incident.slug, 'failed', '—', '0/7', 'no', '—', message]);
      console.log(`  FAIL  ${incident.slug} · ${message}`);
      if (error instanceof Error && error.stack) console.log(indent(error.stack));
    }
  }

  const analysis = buildHistoricalAnalysis();
  const width = Math.max(...rows.map((row) => row[0].length), 10);

  console.log('');
  console.log('Summary');
  console.log(
    `${'slug'.padEnd(width)}  ${'source'.padEnd(13)}  ${'model'.padEnd(26)}  sections  mermaid  time      note`,
  );
  console.log(`${'-'.repeat(width)}  ${'-'.repeat(13)}  ${'-'.repeat(26)}  --------  -------  --------  ----`);
  for (const row of rows) {
    const [slug, source, model, sections, mermaid, elapsed, note] = row;
    console.log(
      `${slug.padEnd(width)}  ${source.padEnd(13)}  ${model.padEnd(26)}  ${sections.padEnd(8)}  ${mermaid.padEnd(
        7,
      )}  ${elapsed.padEnd(8)}  ${note}`,
    );
  }

  console.log('');
  console.log(
    `Generated: ${aiCount} AI (minimax-code) · ${deterministicCount} deterministic · ${skipped} skipped`,
  );
  console.log(
    `Coverage: ${analysis.coverage.reproducible}/${analysis.coverage.incidents} incidents have a local reproduction; ` +
      `${analysis.totals.findings} findings across ${analysis.byVector.length} vectors and ${analysis.byFamily.length} Bible families.`,
  );
  console.log(
    `Stored in data/narratives/${caseIdFor('<slug>')}.md and data/ai-reports/${caseIdFor('<slug>')}.json.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
