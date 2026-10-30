import path from 'node:path';
import { test, expect } from 'playwright/test';
import {
  LAB_SCENARIO,
  RESULTS_DIR,
  captureConsoleErrors,
  writeResultArtifact,
} from '../fixtures/scenarios';

/**
 * The live simulation path: the most important flow in the product. It presses
 * the single-scenario control on /lab, waits up to 60s for Foundry output, then
 * asserts the rendered evidence (title, ETH loss, detector confidence) and the
 * retrievable raw forge log.
 *
 * Foundry is installed at <repo>/.tools/foundry. If the toolchain is missing
 * the test fails loudly with the page state instead of skipping.
 */
test('live lab runs the reentrancy scenario end to end', async ({ page }) => {
  const consoleErrors = captureConsoleErrors(page);

  await page.goto(LAB_SCENARIO.url, { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { name: /Scenario library/i })).toBeVisible();
  await expect(
    page.getByText(LAB_SCENARIO.title, { exact: false }).first(),
    `scenario "${LAB_SCENARIO.title}" was not listed on /lab`,
  ).toBeVisible();

  // The live panel's single-scenario control. (The per-card "Run" button only
  // fills the card summary; the detailed evidence tabs live in this panel.)
  const runButton = page.getByRole('button', { name: /^Run simulation$/i });
  await expect(runButton, 'single-scenario run control not found').toBeVisible();
  await expect(runButton, 'run control stayed disabled').toBeEnabled({ timeout: 30_000 });

  await runButton.click();

  try {
    // The evidence tab strip only renders once the result is applied.
    await expect(
      page.getByRole('tablist', { name: /Simulation evidence/i }),
      'simulation results did not render',
    ).toBeVisible({ timeout: 60_000 });
  } catch (error) {
    const bodyText = (await page.locator('body').innerText()).slice(0, 2000);
    throw new Error(
      `Simulation did not produce results within 60s. ` +
        `Check Foundry at <repo>/.tools/foundry and the engine notice on /lab.\n` +
        `Visible page text:\n${bodyText}`,
    );
  }

  await expect(
    page.getByRole('heading', { name: /Evidence.*Re-entrant Withdrawal Drain/ }),
    'scenario title not shown in the evidence section',
  ).toBeVisible();

  await expect(
    page.getByText(LAB_SCENARIO.lossPattern).first(),
    'no ETH loss figure rendered',
  ).toBeVisible();

  // Detector findings live on the Patterns tab.
  await page.getByRole('tab', { name: /Patterns/i }).click();
  await expect(
    page.getByText(LAB_SCENARIO.confidencePattern).first(),
    'no detector confidence percentage rendered',
  ).toBeVisible();

  // Raw forge stdout lives on the Raw tab.
  await page.getByRole('tab', { name: /^Raw$/i }).click();
  const rawPanel = page.getByRole('tabpanel');
  const rawText = await rawPanel.locator('pre').first().innerText();
  expect(rawText.trim().length, 'raw forge output is empty').toBeGreaterThan(0);
  expect(
    LAB_SCENARIO.rawOutputPattern.test(rawText),
    `raw forge output did not contain "[PASS]" or "forge":\n${rawText.slice(0, 1000)}`,
  ).toBe(true);

  await page.screenshot({
    path: path.join(RESULTS_DIR, 'lab-run.png'),
    fullPage: true,
  });

  writeResultArtifact('lab.json', LAB_SCENARIO.id, {
    title: LAB_SCENARIO.title,
    rawOutputExcerpt: rawText.slice(0, 500),
    consoleErrors,
  });

  expect(
    consoleErrors,
    `console errors emitted during the lab run:\n${consoleErrors.join('\n')}`,
  ).toEqual([]);
});
