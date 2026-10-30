import path from 'node:path';
import type * as LiveCaseEngine from '../../../../forensic-engine/src/live-case';

/**
 * The web app cannot import the engine's `.js`-specifier ESM directly through
 * Next's webpack resolver (see app/api/_lib.ts). This module loads the single
 * live-case module through tsx's require hook, the same way the shared API
 * helper loads the rest of the engine.
 */
let cache: typeof LiveCaseEngine | null = null;

export function liveCaseEngine(): typeof LiveCaseEngine {
  if (cache) return cache;
  const anchor = path.join(process.cwd(), 'package.json');
  const nativeRequire = process.getBuiltinModule('module').createRequire(anchor);
  nativeRequire('tsx/cjs');
  const modulePath = path.resolve(process.cwd(), '../forensic-engine/src/live-case.ts');
  cache = nativeRequire(modulePath) as typeof LiveCaseEngine;
  return cache;
}
