import path from 'node:path';
import { defineConfig, devices } from 'playwright/test';

/**
 * All QA artefacts (JSON report, screenshots, per-route diagnostics) live in
 * <repo>/test-results so scripts/qa/run-qa.mjs and humans find them in one place.
 */
const RESULTS_DIR = path.resolve(__dirname, '../../test-results');

/**
 * Chromium is not downloaded in this environment. Use the system Chrome via the
 * `chrome` channel. If that channel is unavailable, run with
 * PLAYWRIGHT_CHROME_EXECUTABLE=C:/Program Files/Google/Chrome/Application/chrome.exe
 * (scripts/qa/run-qa.mjs does this retry automatically).
 */
const chromeExecutable = process.env.PLAYWRIGHT_CHROME_EXECUTABLE;
const browserUse = chromeExecutable
  ? { executablePath: chromeExecutable }
  : { channel: 'chrome' };

/** Defaults to :3000; override only for isolated verification runs. */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  outputDir: path.join(RESULTS_DIR, 'artifacts'),
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(RESULTS_DIR, 'results.json') }],
  ],
  use: {
    baseURL: BASE_URL,
    headless: true,
    ...browserUse,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        ...browserUse,
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
});
