#!/usr/bin/env node
/**
 * Thin launcher for the MAYALL CLI.
 *
 *   node scripts/mayall.mjs <args>
 *
 * Resolves the repo root from this file and runs the TypeScript entry point
 * through tsx so it works from the repo root without a build step.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = path.join(root, 'packages', 'cli', 'src', 'index.ts');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const result = spawnSync(npx, ['tsx', entry, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
