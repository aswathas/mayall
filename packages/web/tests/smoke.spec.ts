import { test, expect } from 'playwright/test';
import {
  API_ENDPOINTS,
  PAGE_ROUTES,
  captureConsoleErrors,
  writeResultArtifact,
} from '../fixtures/scenarios';

/**
 * Smoke matrix: every route must answer 200, render a non-empty h1, and emit no
 * console error during navigation. The console-error assertion is the most
 * valuable check in the suite — it surfaces hydration mismatches, failed
 * fetches and client crashes that a status-code check alone would miss.
 */
for (const route of PAGE_ROUTES) {
  test(`route ${route.path} renders without console errors`, async ({ page }) => {
    const consoleErrors = captureConsoleErrors(page);

    const response = await page.goto(route.path, { waitUntil: 'networkidle' });
    expect(response, `no HTTP response for ${route.path}`).not.toBeNull();
    expect(response!.status(), `HTTP status for ${route.path}`).toBe(200);

    const heading = page.locator('h1').first();
    await expect(heading, `h1 missing on ${route.path}`).toBeVisible();
    expect(
      (await heading.textContent())?.trim().length ?? 0,
      `h1 is empty on ${route.path}`,
    ).toBeGreaterThan(0);

    // Let post-hydration effects (fetches, theme bootstrap, charts) settle.
    await page.waitForTimeout(400);

    writeResultArtifact('console-errors.json', route.path, consoleErrors);
    expect(
      consoleErrors,
      `console errors emitted on ${route.path}:\n${consoleErrors.join('\n')}`,
    ).toEqual([]);
  });
}

for (const endpoint of API_ENDPOINTS) {
  test(`api ${endpoint} returns 200 JSON`, async ({ request }) => {
    const response = await request.get(endpoint);
    expect(response.status(), `HTTP status for ${endpoint}`).toBe(200);
    expect(
      response.headers()['content-type'] ?? '',
      `content-type for ${endpoint}`,
    ).toContain('application/json');

    const body = (await response.json()) as unknown;
    expect(body, `${endpoint} returned an empty body`).not.toBeNull();
    expect(typeof body, `${endpoint} did not return an object/array`).toBe('object');
  });
}

test('api /api/overview exposes populated aggregates', async ({ request }) => {
  const response = await request.get('/api/overview');
  expect(response.status()).toBe(200);

  const body = (await response.json()) as {
    totals?: { incidents?: number; lossUsd?: number };
    byVector?: unknown[];
  };

  expect(body.totals, 'overview is missing totals').toBeTruthy();
  expect(body.totals!.incidents ?? 0, 'overview totals.incidents').toBeGreaterThan(0);
  expect(Array.isArray(body.byVector), 'overview byVector is not an array').toBe(true);
  expect(body.byVector!.length, 'overview byVector is empty').toBeGreaterThan(0);
});
