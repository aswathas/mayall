import path from 'node:path';
import { test, expect, type Page } from 'playwright/test';
import {
  RESULTS_DIR,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  writeResultArtifact,
} from '../fixtures/scenarios';

const themeToggle = (page: Page) => page.locator('button[aria-label*="theme" i]:visible').first();

async function currentTheme(page: Page): Promise<string | null> {
  return page.locator('html').getAttribute(THEME_ATTRIBUTE);
}

test.describe('theme', () => {
  test('toggle flips data-theme, persists under mayall-theme, and survives reload', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const initial = await currentTheme(page);
    expect(['dark', 'light'], `unexpected initial ${THEME_ATTRIBUTE}="${initial}"`).toContain(initial);

    const toggle = themeToggle(page);
    await expect(toggle, 'theme toggle (aria-label contains "theme") not found').toBeVisible();

    await toggle.click();
    const expected = initial === 'dark' ? 'light' : 'dark';
    await expect(page.locator('html'), 'data-theme did not flip').toHaveAttribute(
      THEME_ATTRIBUTE,
      expected,
    );

    const stored = await page.evaluate((key) => window.localStorage.getItem(key), THEME_STORAGE_KEY);
    expect(stored, `localStorage["${THEME_STORAGE_KEY}"] after toggle`).toBe(expected);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-theme'));

    expect(
      await currentTheme(page),
      `theme did not survive reload (expected "${expected}" from localStorage["${THEME_STORAGE_KEY}"])`,
    ).toBe(expected);
  });

  test('captures dark and light screenshots', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const toggle = themeToggle(page);
    await expect(toggle).toBeVisible();

    if ((await currentTheme(page)) !== 'dark') {
      await toggle.click();
      await expect(page.locator('html')).toHaveAttribute(THEME_ATTRIBUTE, 'dark');
    }
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(RESULTS_DIR, 'theme-dark.png'),
      fullPage: true,
    });

    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute(THEME_ATTRIBUTE, 'light');
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(RESULTS_DIR, 'theme-light.png'),
      fullPage: true,
    });

    writeResultArtifact('theme.json', 'screenshots', {
      dark: path.join(RESULTS_DIR, 'theme-dark.png'),
      light: path.join(RESULTS_DIR, 'theme-light.png'),
    });
  });

  test('no horizontal overflow at 390px viewport width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));

    writeResultArtifact('theme.json', 'overflow-390', metrics);

    expect(
      metrics.scrollWidth,
      `horizontal overflow at 390px: scrollWidth=${metrics.scrollWidth} innerWidth=${metrics.innerWidth}`,
    ).toBeLessThanOrEqual(metrics.innerWidth + 1);
  });
});
