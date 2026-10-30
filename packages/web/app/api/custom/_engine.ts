import { statSync } from 'node:fs';
import path from 'node:path';
import { engine } from '../_lib';

/**
 * The custom-attack engine lives in `packages/forensic-engine/src/custom.ts`.
 * It is loaded through the same tsx require hook `_lib.ts` uses for the engine
 * package, because the workspace `exports` map only exposes the package root.
 *
 * The loader keeps the compiled module warm per process but re-reads it when the
 * source file changes, so editing the engine does not leave a stale module in a
 * long-running dev server.
 */
export type CustomEngineModule = typeof import('../../../../forensic-engine/src/custom');

const CACHE_KEY = '__mayallCustomEngine__';

interface CachedModule {
  mtimeMs: number;
  mod: CustomEngineModule;
}

export function customEngine(): CustomEngineModule {
  const store = globalThis as unknown as Record<string, CachedModule | undefined>;
  const source = path.join(engine().repoRoot(), 'packages', 'forensic-engine', 'src', 'custom.ts');
  const mtimeMs = statSync(source).mtimeMs;

  const cached = store[CACHE_KEY];
  if (cached && cached.mtimeMs === mtimeMs) return cached.mod;

  const anchor = path.join(process.cwd(), 'package.json');
  const nativeRequire = process.getBuiltinModule('module').createRequire(anchor);
  nativeRequire('tsx/cjs');

  try {
    delete nativeRequire.cache[nativeRequire.resolve(source)];
  } catch {
    /* not cached yet */
  }

  const loaded = nativeRequire(source) as CustomEngineModule;
  store[CACHE_KEY] = { mtimeMs, mod: loaded };
  return loaded;
}

export function statusOf(error: unknown): number {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return 500;
}
