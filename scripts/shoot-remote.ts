/** Screenshot a remote URL (used to verify the deployed Pages site). */
import { chromium } from 'playwright-core';
import path from 'node:path';

async function main() {
  const [url, name, theme = 'dark', width = '1440', height = '1000'] = process.argv.slice(2);
  const outDir = path.resolve('artifacts/shots');

  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({
    viewport: { width: Number(width), height: Number(height) },
  });
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.addInitScript((t) => {
    try {
      localStorage.setItem('mayall-theme', t);
    } catch {
      /* ignore */
    }
  }, theme);

  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(4000);
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('shot:', file);
  console.log('url :', url);
  console.log('title:', await page.title());
  console.log('console errors:', errors.length ? errors.slice(0, 5).join(' | ') : 'none');
  await browser.close();
}

main().catch((err) => {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
