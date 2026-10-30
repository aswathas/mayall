import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoRoot } from '@helix/forensic-engine';

/**
 * MiniMax Code (`mcode`) client.
 *
 * The narrative and the client action plan are authored by the local mcode
 * CLI. This module owns the process plumbing only: it builds a PowerShell
 * invocation whose prompt travels as base64 (so quotes, newlines and markdown
 * survive the shell), captures stdout and stderr separately, enforces a hard
 * timeout, and kills the whole child tree on timeout.
 *
 * Two facts about the local installation, verified against the binary:
 *   - `--effort on` is rejected by the runtime. It lists the valid levels as
 *     default | low | medium | high | xhigh | max. We use `high`, and if a
 *     future runtime rejects it we parse the advertised levels and retry with
 *     the strongest one.
 *   - `minimax/MiniMax-M3.1-Flash` is the preferred model. If it is not
 *     available we retry once with `minimax/MiniMax-M3`.
 */

export const MCODE_MODEL_PRIMARY = process.env.MAYALL_MCODE_MODEL ?? 'minimax/MiniMax-M3.1-Flash';
export const MCODE_MODEL_FALLBACK = 'minimax/MiniMax-M3';
export const MCODE_EFFORT = process.env.MAYALL_MCODE_EFFORT ?? 'high';
export const MCODE_TIMEOUT_MS = 240_000;

export function mcodeLauncher(): string {
  const home = process.env.USERPROFILE ?? os.homedir();
  return path.join(home, '.minimax-code', 'mcode.ps1');
}

export function mcodeAvailable(): boolean {
  return existsSync(mcodeLauncher());
}

function debug(...parts: unknown[]): void {
  if (process.env.MAYALL_DEBUG) console.error('[mcode]', ...parts);
}

export interface McodeAttempt {
  model: string;
  effort: string;
  code: number | null;
  durationMs: number;
  timedOut: boolean;
  note: string;
}

export interface McodeResult {
  ok: boolean;
  text: string;
  stderr: string;
  model: string;
  effort: string;
  durationMs: number;
  attempts: McodeAttempt[];
  reason?: string;
}

interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function killTree(pid: number | undefined): void {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch {
    /* the process may already be gone */
  }
}

function runPowershell(script: string, timeoutMs: number): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killGuard);
      resolve({ code, stdout, stderr, timedOut, durationMs: Date.now() - started });
    };

    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      cwd: repoRoot(),
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let killGuard: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
      killGuard = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        finish(null);
      }, 5_000);
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    child.on('error', (error) => {
      stderr += `\n${String(error)}`;
      finish(null);
    });
    child.on('close', (code) => finish(code));
  });
}

/** Strips an outer markdown fence and any leading conversational preamble. */
export function cleanModelText(text: string): string {
  let out = text.replace(/\r\n/g, '\n').trim();
  const fenced = out.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  if (fenced) out = fenced[1].trim();
  out = out.replace(/^(here is|here's|below is|sure[,!]?)[^\n]*\n+/i, '').trim();
  return out;
}

function effortLevelsFrom(message: string): string[] {
  const match = message.match(/Available levels:\s*([^\n.]+)/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function modelRejected(message: string): boolean {
  return /--model\s+\S+\s+is not available|unknown model|model .* (?:not found|not available)|no access to .*model|select .*model/i.test(
    message,
  );
}

const BRIEF_INSTRUCTION = 'Follow every instruction in the attached brief. Return only the document it asks for.';

async function attempt(
  briefPath: string,
  model: string,
  effort: string,
  timeoutMs: number,
): Promise<ProcessResult & { effort: string }> {
  // The brief travels as an attached file, never on the command line:
  // PowerShell 5.1 does not escape embedded double quotes when it forwards
  // arguments to a native process, so a prompt containing `"` is split into
  // extra argv entries ("too many arguments for 'exec'"). A file sidesteps the
  // whole class of quoting bugs, and the fixed instruction below has none.
  const args = [
    'exec',
    '--cwd',
    repoRoot(),
    '--model',
    model,
    '--effort',
    effort,
    '--output-format',
    'text',
    '--permission',
    'smart',
    '--max-steps',
    '8',
    '--timeout',
    '200s',
    '--file',
    briefPath,
    BRIEF_INSTRUCTION,
  ];
  const invocation = `& ${[mcodeLauncher(), ...args].map(psQuote).join(' ')}`;
  const script = `$ErrorActionPreference = 'Stop'; ${invocation}`;

  const result = await runPowershell(script, timeoutMs);
  debug(
    `attempt model=${model} effort=${effort} code=${result.code} timedOut=${result.timedOut} ${Math.round(result.durationMs / 1000)}s stdout=${result.stdout.length}ch stderr=${result.stderr.length}ch brief=${briefPath}`,
  );
  if (process.env.MAYALL_DEBUG && result.code !== 0) {
    debug('stdout head:', result.stdout.slice(0, 600));
    debug('stderr head:', result.stderr.slice(0, 900));
  }
  return { ...result, effort };
}

/**
 * Runs one prompt through mcode. Returns `ok: false` with a reason when the
 * launcher is missing, the process fails, times out, or returns nothing usable.
 * A failure here is never fatal: the caller labels its deterministic fallback.
 */
export async function runMcode(
  prompt: string,
  opts: { timeoutMs?: number; minChars?: number } = {},
): Promise<McodeResult> {
  const attempts: McodeAttempt[] = [];
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? MCODE_TIMEOUT_MS;
  const minChars = opts.minChars ?? 120;

  if (!mcodeAvailable()) {
    return {
      ok: false,
      text: '',
      stderr: '',
      model: MCODE_MODEL_PRIMARY,
      effort: MCODE_EFFORT,
      durationMs: 0,
      attempts,
      reason: `mcode launcher not found at ${mcodeLauncher()}`,
    };
  }

  const dir = mkdtempSync(path.join(os.tmpdir(), 'mayall-mcode-'));
  const briefPath = path.join(dir, 'brief.md');
  writeFileSync(briefPath, prompt, 'utf-8');
  let lastStderr = '';

  try {
    for (const model of [MCODE_MODEL_PRIMARY, MCODE_MODEL_FALLBACK]) {
      let effort = MCODE_EFFORT;
      let res = await attempt(briefPath, model, effort, timeoutMs);
      lastStderr = res.stderr;
      const combined = `${res.stderr}\n${res.stdout}`;

      const levels = effortLevelsFrom(combined);
      if (levels.length && !levels.includes(effort)) {
        const next = levels[levels.length - 1];
        attempts.push({
          model,
          effort,
          code: res.code,
          durationMs: res.durationMs,
          timedOut: res.timedOut,
          note: `effort "${effort}" rejected; retried with "${next}"`,
        });
        effort = next;
        res = await attempt(briefPath, model, effort, timeoutMs);
        lastStderr = res.stderr;
      }

      const text = cleanModelText(res.stdout);
      const usable = res.code === 0 && !res.timedOut && text.length >= minChars;
      attempts.push({
        model,
        effort,
        code: res.code,
        durationMs: res.durationMs,
        timedOut: res.timedOut,
        note: usable ? 'accepted' : res.timedOut ? 'timed out' : `exit ${res.code}`,
      });

      if (usable) {
        return {
          ok: true,
          text,
          stderr: res.stderr,
          model,
          effort,
          durationMs: Date.now() - started,
          attempts,
        };
      }

      const combinedAfter = `${res.stderr}\n${res.stdout}`;
      if (!modelRejected(combinedAfter) && !/--model/i.test(combinedAfter)) break;
    }
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup failures */
    }
  }

  const last = attempts[attempts.length - 1];
  return {
    ok: false,
    text: '',
    stderr: lastStderr,
    model: last?.model ?? MCODE_MODEL_PRIMARY,
    effort: last?.effort ?? MCODE_EFFORT,
    durationMs: Date.now() - started,
    attempts,
    reason: last
      ? `mcode ${last.note} after ${Math.round(last.durationMs / 1000)}s (${last.model})${
          lastStderr ? `: ${lastStderr.replace(/\s+/g, ' ').slice(0, 160)}` : ''
        }`
      : 'mcode did not run',
  };
}

export interface McodeProbe {
  available: boolean;
  launcher: string;
  version: string | null;
  detail: string;
}

/** Cheap reachability probe used by `mayall verify` and the help screen. */
export async function probeMcode(timeoutMs = 45_000, live = false): Promise<McodeProbe> {
  const launcher = mcodeLauncher();
  if (!existsSync(launcher)) {
    return { available: false, launcher, version: null, detail: 'launcher not found' };
  }
  if (!live) {
    return { available: true, launcher, version: null, detail: 'launcher present' };
  }

  const b64 = Buffer.from('Reply with exactly: OK', 'utf-8').toString('base64');
  const args = ['exec', '--cwd', repoRoot(), '--model', MCODE_MODEL_PRIMARY, '--effort', MCODE_EFFORT, '--output-format', 'text'];
  const invocation = `& ${[launcher, ...args].map(psQuote).join(' ')} $prompt`;
  const script = `$prompt = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}')); ${invocation}`;
  const res = await runPowershell(script, timeoutMs);
  const text = cleanModelText(res.stdout);
  const available = res.code === 0 && !res.timedOut && text.length > 0;
  return {
    available,
    launcher,
    version: text || null,
    detail: available
      ? `responded in ${(res.durationMs / 1000).toFixed(1)}s`
      : res.timedOut
        ? `no response in ${Math.round(timeoutMs / 1000)}s`
        : `exit ${res.code}`,
  };
}
