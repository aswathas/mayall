/**
 * Generates the Binance $6.3B live-case forensic report.
 *
 *   npx tsx scripts/generate-binance-case.ts [--no-ai] [--timeout=240]
 *
 * The narrative layer is authored by the local MiniMax Code CLI. The brief's
 * canonical invocation is tried first:
 *
 *   & "$env:USERPROFILE\.minimax-code\mcode.ps1" exec --cwd "<repo>" \
 *       --model minimax/MiniMax-M3.1-Flash --effort on "<PROMPT>"
 *
 * Two practical limits are handled without changing the intent:
 *   - this CLI build rejects `--effort on` (its valid levels include `high`),
 *     so the retry uses `--effort high`;
 *   - the full prompt is too long for the child's command line, so the retry
 *     attaches the prompt as a file and writes the final message with `-o`.
 *
 * stdout and stderr are captured separately, the child is killed after ~240
 * seconds, and a rejected model name is retried once with
 * `minimax/MiniMax-M3`. If mcode fails or returns a malformed document, the
 * deterministic writer produces the report and labels it
 * `generatedBy: "deterministic"`. The script is re-runnable and always prints
 * the observed `generatedBy` value.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  analyzeLiveCase,
  buildDeterministicLiveCaseReport,
  buildLiveCasePrompt,
  extractMermaidBlocks,
  writeLiveCaseReport,
  type LiveCaseAnalysis,
  type LiveCaseReport,
} from '../packages/forensic-engine/src/live-case.js';
import { parseSections, stripOuterFence, validateReportMarkdown } from '../packages/forensic-engine/src/aireport.js';
import { repoRoot } from '../packages/forensic-engine/src/foundry.js';

const PRIMARY_MODEL = 'minimax/MiniMax-M3.1-Flash';
const FALLBACK_MODEL = 'minimax/MiniMax-M3';
const DEFAULT_TIMEOUT_MS = 240_000;
const SHORT_INSTRUCTION =
  'Follow the forensic brief in the attached prompt file exactly. Return only the markdown report it requests.';

type McodeMode = 'pinned' | 'file';

interface Options {
  noAi: boolean;
  timeoutMs: number;
}

interface McodeResult {
  ok: boolean;
  answer: string;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  exitCode: number | null;
  mode: McodeMode;
  model: string;
  detail: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { noAi: false, timeoutMs: DEFAULT_TIMEOUT_MS };
  for (const arg of argv) {
    if (arg === '--no-ai' || arg === '--deterministic') options.noAi = true;
    else if (arg.startsWith('--timeout=')) {
      const seconds = Number(arg.slice('--timeout='.length));
      if (Number.isFinite(seconds) && seconds >= 30) options.timeoutMs = Math.floor(seconds * 1000);
    }
  }
  return options;
}

function mcodePath(): string {
  return path.join(process.env.USERPROFILE ?? os.homedir(), '.minimax-code', 'mcode.ps1');
}

function stripAnsi(raw: string): string {
  return raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

function cleanAnswer(raw: string): string {
  const withoutAnsi = stripAnsi(raw);
  // The CLI may print progress before the document. If an H1 is present, the
  // report starts there; otherwise keep the whole output.
  const h1 = withoutAnsi.search(/^#\s+\S/m);
  const sliced = h1 >= 0 ? withoutAnsi.slice(h1) : withoutAnsi;
  return stripOuterFence(sliced).trim();
}

function runMcode(
  prompt: string,
  model: string,
  mode: McodeMode,
  timeoutMs: number,
): Promise<McodeResult> {
  const script = mcodePath();
  if (!existsSync(script)) {
    return Promise.resolve({
      ok: false,
      answer: '',
      stdout: '',
      stderr: `mcode CLI not found at ${script}`,
      timedOut: false,
      exitCode: null,
      mode,
      model,
      detail: `mcode CLI unavailable (${script})`,
    });
  }

  const workDir = mkdtempSync(path.join(os.tmpdir(), 'mayall-binance-'));
  const promptPath = path.join(workDir, 'prompt.md');
  const answerPath = path.join(workDir, 'answer.md');
  writeFileSync(promptPath, prompt, 'utf-8');

  const root = repoRoot();
  const escapedPrompt = promptPath.replace(/'/g, "''");
  const escapedAnswer = answerPath.replace(/'/g, "''");

  const common = `--cwd "${root}" --model "${model}"`;
  const command =
    mode === 'pinned'
      ? `& "${script}" exec ${common} --effort on (Get-Content -Raw -LiteralPath '${escapedPrompt}')`
      : `& "${script}" exec ${common} --effort high --file "${promptPath}" -o "${answerPath}" --timeout 200s "${SHORT_INSTRUCTION}"`;

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      if (child.pid) {
        try {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
        } catch {
          /* ignore */
        }
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        answer: '',
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
        timedOut,
        exitCode: null,
        mode,
        model,
        detail: `spawn failed: ${error.message}`,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      let fileAnswer = '';
      if (mode === 'file' && existsSync(answerPath)) {
        try {
          fileAnswer = readFileSync(answerPath, 'utf-8');
        } catch {
          fileAnswer = '';
        }
      }
      const answer = cleanAnswer(fileAnswer || stdout);
      resolve({
        ok: code === 0 && !timedOut && answer.length > 0,
        answer,
        stdout,
        stderr: stripAnsi(stderr).trim(),
        timedOut,
        exitCode: code,
        mode,
        model,
        detail: timedOut
          ? `timed out after ${timeoutMs} ms (${mode})`
          : code === 0
            ? answer.length > 0
              ? `ok (${mode})`
              : `mcode returned an empty answer (${mode})`
            : `mcode exited with code ${code} (${mode})`,
      });
    });
  });
}

function modelWasRejected(result: McodeResult): boolean {
  const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
  return (
    /(unknown|invalid|unsupported|unavailable|not found|does not exist|failed to resolve|no such)\s+model/.test(text) ||
    /model\s+["'`]?[\w./-]+["'`]?\s+(is\s+)?(not found|unknown|invalid|unsupported|unavailable)/.test(text)
  );
}

function rejectionSummary(result: McodeResult): string {
  const line = `${result.stderr}\n${result.stdout}`
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry && /(error|failed|not available|too long|empty)/i.test(entry));
  return line ? line.slice(0, 240) : result.detail;
}

function assembleAiReport(
  raw: string,
  analysis: LiveCaseAnalysis,
  model: string,
  generatedAt: string,
): LiveCaseReport {
  const markdown = cleanAnswer(raw);
  const mermaidBlocks = extractMermaidBlocks(markdown);
  return {
    caseId: 'binance-7702',
    title: 'The Binance $6.3B breach — Forensic Report',
    generatedAt,
    generatedBy: 'minimax-code',
    model,
    markdown,
    mermaid: mermaidBlocks[0] ?? null,
    mermaidBlocks,
    sections: parseSections(markdown),
    analysis,
    source: 'stored',
    note: `Authored by ${model} through the local MiniMax Code CLI.`,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const analysis = analyzeLiveCase();
  const prompt = buildLiveCasePrompt(analysis);

  console.log('Mayall live case · Binance $6.3B breach');
  console.log(`  model: ${options.noAi ? '(deterministic only)' : PRIMARY_MODEL}`);
  console.log(`  timeout: ${Math.round(options.timeoutMs / 1000)}s`);
  console.log('');

  let report: LiveCaseReport | null = null;
  let fallbackReason = '';

  if (!options.noAi) {
    // 1. The brief's canonical invocation.
    let result = await runMcode(prompt, PRIMARY_MODEL, 'pinned', options.timeoutMs);
    console.log(`  mcode pinned attempt: ${result.detail}`);
    if (!result.ok) console.log(`    ${rejectionSummary(result)}`);

    // 2. A working invocation: attach the prompt as a file, use a valid effort.
    if (!result.ok) {
      const model = modelWasRejected(result) ? FALLBACK_MODEL : PRIMARY_MODEL;
      result = await runMcode(prompt, model, 'file', options.timeoutMs);
      console.log(`  mcode file attempt (${model}): ${result.detail}`);
      if (!result.ok) console.log(`    ${rejectionSummary(result)}`);

      if (!result.ok && modelWasRejected(result) && model !== FALLBACK_MODEL) {
        result = await runMcode(prompt, FALLBACK_MODEL, 'file', options.timeoutMs);
        console.log(`  model rejected; retried once with ${FALLBACK_MODEL}: ${result.detail}`);
        if (!result.ok) console.log(`    ${rejectionSummary(result)}`);
      }
    }

    if (result.ok) {
      const validation = validateReportMarkdown(result.answer);
      if (validation.ok) {
        report = assembleAiReport(result.answer, analysis, result.model, new Date().toISOString());
      } else {
        fallbackReason = `mcode output failed validation: ${validation.errors.join('; ')}`;
      }
    } else {
      fallbackReason = `${result.detail} | ${rejectionSummary(result)}`;
    }
  } else {
    fallbackReason = '--no-ai requested';
  }

  if (!report) {
    report = buildDeterministicLiveCaseReport(analysis);
    report.note = fallbackReason
      ? `Generated by the deterministic report writer. ${fallbackReason}`
      : report.note;
    console.log(`  fallback: ${fallbackReason || 'deterministic writer'}`);
  }

  const paths = writeLiveCaseReport(report);

  console.log('');
  console.log(`  generatedBy: ${report.generatedBy}${report.model ? ` (${report.model})` : ''}`);
  console.log(`  sections:    ${report.sections.length}/7`);
  console.log(`  mermaid:     ${report.mermaidBlocks.length} block(s)`);
  console.log(`  markdown:    ${paths.markdownPath}`);
  console.log(`  json:        ${paths.jsonPath}`);
  console.log('');
  console.log('First 5 lines of the narrative:');
  console.log(report.markdown.split(/\r?\n/).slice(0, 5).join('\n'));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
