#!/usr/bin/env node
/**
 * Mayall QA orchestrator.
 *
 *   1. Ensure the Next.js dev server is reachable on :3000 (start it if needed).
 *   2. Run the Playwright suite (smoke + a11y/axe + lab + theme) in packages/web.
 *   3. Read the machine-readable artefacts the specs leave in test-results/.
 *   4. Write test-results/qa-summary.md — the artefact a human reads.
 *   5. Stop the dev server, but only if this script started it.
 *   6. Exit non-zero when any test failed or the runner crashed.
 *
 * Usage: node scripts/qa/run-qa.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const WEB_DIR = path.join(REPO_ROOT, 'packages', 'web');
const RESULTS_DIR = path.join(REPO_ROOT, 'test-results');
const RESULTS_JSON = path.join(RESULTS_DIR, 'results.json');
const SUMMARY_MD = path.join(RESULTS_DIR, 'qa-summary.md');
const BASE_URL = 'http://localhost:3000';
const STATUS_URL = `${BASE_URL}/api/status`;
const STARTUP_TIMEOUT_MS = 90_000;
const CHROME_EXECUTABLE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function serverIsUp() {
  try {
    const response = await fetch(STATUS_URL, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Wait for our child server to answer. Returns 'up', 'exited' or 'timeout'.
 * A sibling process may bind :3000 between our probe and our spawn, in which
 * case our child dies with EADDRINUSE even though the port answers.
 */
async function waitForServerOrExit(child, timeoutMs) {
  let exited = false;
  child.once('exit', () => {
    exited = true;
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await serverIsUp()) return 'up';
    if (exited) return 'exited';
    await sleep(1000);
  }
  return 'timeout';
}

function startDevServer() {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const logPath = path.join(RESULTS_DIR, 'dev-server.log');
  const log = createWriteStream(logPath, { flags: 'a' });
  log.write(`\n--- dev server started by run-qa at ${new Date().toISOString()} ---\n`);

  const child = spawn('npm', ['run', 'dev', '--workspace', '@helix/web'], {
    cwd: REPO_ROOT,
    shell: true,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on('exit', (code) => {
    log.write(`\n--- dev server exited with code ${code} ---\n`);
    log.end();
  });

  return { child, logPath };
}

function stopDevServer(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      try {
        child.kill('SIGTERM');
      } catch {
        /* already gone */
      }
    }
  }
}

function runPlaywright(extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn('npx', ['--no-install', 'playwright', 'test'], {
      cwd: WEB_DIR,
      shell: true,
      env: {
        ...process.env,
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
        FORCE_COLOR: '0',
        CI: '',
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const relay = (stream, target) => {
      stream.on('data', (chunk) => {
        const text = chunk.toString();
        output += text;
        target.write(text);
      });
    };
    relay(child.stdout, process.stdout);
    relay(child.stderr, process.stderr);

    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

function readJsonIfPresent(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function flattenSpecs(report) {
  const specs = [];
  const walk = (suites) => {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        specs.push({ ...spec, file: spec.file ?? suite.file ?? 'unknown' });
      }
      walk(suite.suites);
    }
  };
  walk(report?.suites);
  return specs;
}

function specStatus(spec) {
  const results = (spec.tests ?? []).flatMap((test) => test.results ?? []);
  if (results.some((result) => result.status === 'failed' || result.status === 'timedOut')) {
    return 'failed';
  }
  if (results.length > 0 && results.every((result) => result.status === 'skipped')) {
    return 'skipped';
  }
  return spec.ok === false ? 'failed' : 'passed';
}

function specError(spec) {
  const results = (spec.tests ?? []).flatMap((test) => test.results ?? []);
  const failed = results.find((result) => result.status === 'failed' || result.status === 'timedOut');
  if (!failed) return '';
  const message = failed.error?.message ?? failed.errors?.map((e) => e.message).join('\n') ?? '';
  return message.trim();
}

function specDuration(spec) {
  return (spec.tests ?? [])
    .flatMap((test) => test.results ?? [])
    .reduce((sum, result) => sum + (result.duration ?? 0), 0);
}

function formatDuration(ms) {
  if (!ms) return '0.0s';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncate(text, max = 1500) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… (${text.length - max} more characters)`;
}

function buildSummary({ startedServer, serverStopped, runnerCode, specs, axe, consoleErrors, lab }) {
  const lines = [];
  const totals = specs.reduce(
    (acc, spec) => {
      const status = specStatus(spec);
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    },
    { passed: 0, failed: 0, skipped: 0 },
  );

  lines.push('# Mayall QA summary');
  lines.push('');
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push(`- Target: ${BASE_URL}`);
  lines.push(
    `- Dev server: ${
      startedServer
        ? serverStopped
          ? 'started by this run, stopped afterwards'
          : 'started by this run, still running (cleanup failed)'
        : 'already running — reused, left untouched'
    }`,
  );
  lines.push(`- Playwright exit code: ${runnerCode}`);
  lines.push(
    `- Tests: ${totals.passed} passed, ${totals.failed} failed, ${totals.skipped} skipped (${specs.length} total)`,
  );
  lines.push('');

  lines.push('## Results by spec');
  lines.push('');
  lines.push('| Status | Spec | Test | Duration |');
  lines.push('| --- | --- | --- | --- |');
  for (const spec of specs) {
    const status = specStatus(spec);
    const icon = status === 'passed' ? 'PASS' : status === 'skipped' ? 'SKIP' : 'FAIL';
    const file = path.basename(spec.file ?? 'unknown');
    lines.push(
      `| ${icon} | ${file} | ${String(spec.title ?? '').replace(/\|/g, '\\|')} | ${formatDuration(specDuration(spec))} |`,
    );
  }
  lines.push('');

  const failedSpecs = specs.filter((spec) => specStatus(spec) === 'failed');
  lines.push('## Failures');
  lines.push('');
  if (!failedSpecs.length) {
    lines.push('None.');
  } else {
    for (const spec of failedSpecs) {
      lines.push(`### FAIL — ${path.basename(spec.file ?? 'unknown')} › ${spec.title}`);
      lines.push('');
      lines.push('```text');
      lines.push(truncate(specError(spec) || '(no error message captured in results.json)'));
      lines.push('```');
      lines.push('');
    }
  }

  lines.push('## Axe violations (WCAG 2.1 A/AA; critical + serious fail the build)');
  lines.push('');
  const axeEntries = axe ? Object.entries(axe) : [];
  if (!axeEntries.length) {
    lines.push('No axe scan artefacts were produced.');
  } else {
    let axeCount = 0;
    for (const [route, violations] of axeEntries) {
      if (!Array.isArray(violations) || violations.length === 0) {
        lines.push(`- ${route}: clean`);
        continue;
      }
      axeCount += violations.length;
      lines.push(`- ${route}: ${violations.length} violation(s)`);
      for (const violation of violations) {
        const selectors = (violation.nodes ?? [])
          .map((node) => node.target)
          .slice(0, 4)
          .join(' | ');
        lines.push(`  - \`${violation.id}\` [${violation.impact}] ${violation.help}`);
        lines.push(`    - selector(s): ${selectors || '(none)'}`);
      }
    }
    if (axeCount === 0) lines.push('');
  }
  lines.push('');

  lines.push('## Console errors per route');
  lines.push('');
  const consoleEntries = consoleErrors ? Object.entries(consoleErrors) : [];
  if (!consoleEntries.length) {
    lines.push('No console-error artefacts were produced.');
  } else {
    for (const [route, errors] of consoleEntries) {
      if (!Array.isArray(errors) || errors.length === 0) {
        lines.push(`- ${route}: none`);
      } else {
        lines.push(`- ${route}: ${errors.length} error(s)`);
        for (const error of errors) lines.push(`  - ${String(error).replace(/\n/g, ' ')}`);
      }
    }
  }
  lines.push('');

  lines.push('## Live lab');
  lines.push('');
  if (lab && Object.keys(lab).length) {
    for (const [scenario, data] of Object.entries(lab)) {
      lines.push(`- ${scenario}: raw forge output captured (${String(data.rawOutputExcerpt ?? '').slice(0, 80)}…)`);
    }
  } else {
    lines.push('No lab artefact was produced (the lab spec did not reach a result).');
  }
  lines.push('');

  lines.push('## Artefacts');
  lines.push('');
  for (const name of [
    'results.json',
    'lab-run.png',
    'theme-dark.png',
    'theme-light.png',
    'axe-violations.json',
    'console-errors.json',
    'lab.json',
    'theme.json',
    'dev-server.log',
  ]) {
    const file = path.join(RESULTS_DIR, name);
    lines.push(`- ${existsSync(file) ? 'written' : 'missing'}: \`test-results/${name}\``);
  }
  lines.push('');

  return lines.join('\n');
}

async function main() {
  mkdirSync(RESULTS_DIR, { recursive: true });

  // Remove stale diagnostics so the summary never mixes runs.
  for (const name of ['results.json', 'axe-violations.json', 'console-errors.json', 'lab.json', 'theme.json']) {
    rmSync(path.join(RESULTS_DIR, name), { force: true });
  }

  let devServer = null;
  let startedServer = false;
  let serverStopped = false;

  console.log('Mayall QA — checking dev server at', BASE_URL);

  if (await serverIsUp()) {
    console.log('Dev server already running — reusing it (it will not be stopped).');
  } else {
    console.log('Dev server not reachable — starting `npm run dev --workspace @helix/web`…');
    devServer = startDevServer();
    startedServer = true;

    const state = await waitForServerOrExit(devServer.child, STARTUP_TIMEOUT_MS);

    if (state === 'up') {
      // Our child might have lost the port race and exited after another
      // process bound :3000 — in that case we reuse it and never stop it.
      await sleep(500);
      if (devServer.child.exitCode !== null) {
        startedServer = false;
        devServer = null;
        console.log('Another process bound :3000 first — reusing it (not stopping it).');
      } else {
        console.log('Dev server is up.');
      }
    } else if (state === 'exited' && (await serverIsUp())) {
      startedServer = false;
      devServer = null;
      console.log('Another process bound :3000 first — reusing it (not stopping it).');
    } else {
      stopDevServer(devServer.child);
      serverStopped = true;
      devServer = null;
      console.error(
        `\nFATAL: dev server did not answer ${STATUS_URL} within ${STARTUP_TIMEOUT_MS / 1000}s.`,
      );
      console.error(`See ${path.join(RESULTS_DIR, 'dev-server.log')} for output.`);
      process.exitCode = 1;
      return;
    }
  }

  try {
    console.log('\nRunning Playwright (packages/web)…\n');
    let run = await runPlaywright();

    // Automatic fallback: if the `chrome` channel is unavailable, retry once
    // with the local Chrome executable path.
    const channelFailed =
      run.code !== 0 &&
      !process.env.PLAYWRIGHT_CHROME_EXECUTABLE &&
      existsSync(CHROME_EXECUTABLE) &&
      /Chromium distribution ['"]chrome['"] is not found|Could not find (Google Chrome|Chrome)|chrome.*not found/i.test(
        run.output,
      );

    if (channelFailed) {
      console.log(
        '\nChrome channel unavailable — retrying with PLAYWRIGHT_CHROME_EXECUTABLE=' +
          CHROME_EXECUTABLE,
      );
      run = await runPlaywright({ PLAYWRIGHT_CHROME_EXECUTABLE: CHROME_EXECUTABLE });
    }

    const report = readJsonIfPresent(RESULTS_JSON);
    const specs = flattenSpecs(report);
    const axe = readJsonIfPresent(path.join(RESULTS_DIR, 'axe-violations.json'));
    const consoleErrors = readJsonIfPresent(path.join(RESULTS_DIR, 'console-errors.json'));
    const lab = readJsonIfPresent(path.join(RESULTS_DIR, 'lab.json'));

    const summary = buildSummary({
      startedServer,
      serverStopped,
      runnerCode: run.code,
      specs,
      axe,
      consoleErrors,
      lab,
    });

    // The summary is written before stopping the server so the note is accurate
    // only if cleanup succeeds; rewrite after cleanup if needed.
    writeFileSync(SUMMARY_MD, `${summary}\n`, 'utf8');

    const failed = specs.filter((spec) => specStatus(spec) === 'failed');
    const passed = specs.filter((spec) => specStatus(spec) === 'passed');

    console.log('\n================ QA REPORT ================');
    console.log(`Tests: ${passed.length} passed, ${failed.length} failed, ${specs.length} total`);
    for (const spec of failed) {
      console.log(`  FAIL ${path.basename(spec.file ?? 'unknown')} › ${spec.title}`);
      console.log(`       ${(specError(spec).split('\n')[0] ?? '').slice(0, 220)}`);
    }
    for (const route of Object.keys(axe ?? {})) {
      const violations = axe[route];
      if (Array.isArray(violations) && violations.length) {
        console.log(`  AXE  ${route}: ${violations.length} violation(s)`);
      }
    }
    for (const route of Object.keys(consoleErrors ?? {})) {
      const errors = consoleErrors[route];
      if (Array.isArray(errors) && errors.length) {
        console.log(`  CONSOLE ${route}: ${errors.length} error(s)`);
      }
    }
    console.log(`Summary: ${SUMMARY_MD}`);
    console.log('===========================================\n');

    if (!report) {
      console.error('FATAL: Playwright did not write results.json — the runner crashed.');
      process.exitCode = 1;
      return;
    }

    process.exitCode = run.code !== 0 || failed.length > 0 ? 1 : 0;
  } finally {
    if (startedServer && devServer) {
      console.log('Stopping the dev server this run started…');
      stopDevServer(devServer.child);
      serverStopped = true;
      await sleep(500);

      // Rewrite the summary with the final cleanup state.
      const report = readJsonIfPresent(RESULTS_JSON);
      if (report) {
        const summary = buildSummary({
          startedServer,
          serverStopped,
          runnerCode: process.exitCode ?? 0,
          specs: flattenSpecs(report),
          axe: readJsonIfPresent(path.join(RESULTS_DIR, 'axe-violations.json')),
          consoleErrors: readJsonIfPresent(path.join(RESULTS_DIR, 'console-errors.json')),
          lab: readJsonIfPresent(path.join(RESULTS_DIR, 'lab.json')),
        });
        writeFileSync(SUMMARY_MD, `${summary}\n`, 'utf8');
      }
    }
  }
}

main().catch((error) => {
  console.error('QA harness crashed:', error);
  process.exitCode = 1;
});
