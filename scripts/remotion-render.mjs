#!/usr/bin/env node
/**
 * Reproducible render path for the two Mayall compositions.
 *
 *   node scripts/remotion-render.mjs
 *
 * Renders the poster still, the 15 s intro film and the 10 s trace film into
 * packages/web/public/intro/. Remotion uses the Chrome already installed on
 * the machine (see packages/web/remotion.config.ts); override it with
 * REMOTION_BROWSER_EXECUTABLE if needed.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const web = path.join(repo, 'packages', 'web');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const steps = [
  ['remotion', 'compositions', 'remotion/index.ts'],
  ['remotion', 'still', 'remotion/index.ts', 'MayallIntro', 'public/intro/mayall-intro-poster.png', '--frame=440'],
  ['remotion', 'render', 'remotion/index.ts', 'MayallIntro', 'public/intro/mayall-intro.mp4', '--codec=h264', '--crf=18'],
  ['remotion', 'render', 'remotion/index.ts', 'MayallTrace', 'public/intro/mayall-trace.mp4', '--codec=h264', '--crf=18'],
];

for (const [command, ...args] of steps) {
  const label = `${command} ${args.join(' ')}`;
  console.log(`\n▶ ${label}`);
  const result = spawnSync(npx, [command, ...args], {
    cwd: web,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`\n✗ failed: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log('\nDone. Outputs are in packages/web/public/intro/.');
