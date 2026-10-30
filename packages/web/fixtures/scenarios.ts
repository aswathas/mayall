import fs from 'node:fs';
import path from 'node:path';
import type { ConsoleMessage, Page } from 'playwright/test';

/**
 * Shared QA fixtures: the route matrix, API matrix, live-lab expectations and
 * helpers that persist diagnostics for scripts/qa/run-qa.mjs.
 */

export const RESULTS_DIR = path.resolve(__dirname, '../../../test-results');

export interface PageRoute {
  path: string;
  label: string;
}

/** Every user-facing route. Add a route here to add it to the smoke matrix. */
export const PAGE_ROUTES: PageRoute[] = [
  { path: '/', label: 'overview' },
  { path: '/incidents', label: 'incidents' },
  { path: '/lab', label: 'lab' },
  { path: '/docs', label: 'docs' },
  { path: '/cases/curve-v2-reentrancy', label: 'case' },
  { path: '/cases/curve-v2-reentrancy/report', label: 'report' },
];

/** API endpoints that must answer 200 with valid JSON. */
export const API_ENDPOINTS = [
  '/api/status',
  '/api/overview',
  '/api/incidents',
  '/api/scenarios',
] as const;

export const LAB_SCENARIO = {
  id: 'reentrancy',
  title: 'Re-entrant Withdrawal Drain',
  url: '/lab?scenario=reentrancy',
  /** Loss figure rendered by SimSummary, e.g. "6 ETH". */
  lossPattern: /\d[\d,.]*\s*ETH/,
  /** Detector confidence rendered by PatternReport, e.g. "97%". */
  confidencePattern: /\d{1,3}%/,
  /** Raw forge stdout must contain a test result marker. */
  rawOutputPattern: /\[PASS\]|forge/i,
} as const;

export const THEME_ATTRIBUTE = 'data-theme';
export const THEME_STORAGE_KEY = 'mayall-theme';

/** Attach a console/pageerror collector. Call this BEFORE page.goto(). */
export function captureConsoleErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error') return;
    const location = message.location();
    const where = location.url ? ` (${location.url}:${location.lineNumber ?? 0})` : '';
    errors.push(`[console.error] ${message.text()}${where}`);
  });

  page.on('pageerror', (error: Error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  return errors;
}

/**
 * Merge a diagnostics entry into a JSON file in test-results/. Workers are
 * pinned to 1, so read-modify-write is safe within a run; keys are route paths
 * so a re-run replaces stale entries instead of duplicating them.
 */
export function writeResultArtifact(fileName: string, key: string, value: unknown): void {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const file = path.join(RESULTS_DIR, fileName);

  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    data = {};
  }

  data[key] = value;
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
