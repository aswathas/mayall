/**
 * Screenshot helper for UI review.
 *
 *   npx tsx scripts/shoot.ts <name> <path> [width] [height]
 *
 * Writes artifacts/shots/<name>.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const [, , name = 'shot', route = '/', w = '1600', h = '1000', theme = ''] = process.argv;
const outDir = path.resolve('artifacts', 'shots');
mkdirSync(outDir, { recursive: true });

async function main(): Promise<void> {
  const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
  if (theme === 'dark' || theme === 'light') {
    await page.addInitScript((t: string) => {
      try {
        window.localStorage.setItem('mayall-theme', t);
      } catch {
        /* ignore */
      }
    }, theme);
  }
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  const url = `http://localhost:3000${route}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(2500);
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });

  console.log(`shot: ${file}`);
  console.log(`url : ${url}`);
  console.log(`title: ${await page.title()}`);
  if (errors.length) {
    console.log(`console errors (${errors.length}):`);
    for (const e of errors.slice(0, 12)) console.log(`  - ${e}`);
  } else {
    console.log('console errors: none');
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
