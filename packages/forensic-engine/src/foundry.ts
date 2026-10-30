import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT_MARKERS = ['packages', 'contracts'];

/**
 * Locates the repository root by walking up from the current working
 * directory. Works from the repo root, from packages/web (Next.js) and from a
 * standalone script, without relying on __dirname (which is unavailable in
 * ESM). HELIX_ROOT overrides the search.
 */
export function repoRoot(): string {
  const override = process.env.HELIX_ROOT;
  if (override && existsSync(override)) return path.resolve(override);

  let dir = path.resolve(process.cwd());
  for (let i = 0; i < 10; i += 1) {
    const looksRight = ROOT_MARKERS.every((m) => existsSync(path.join(dir, m)));
    if (looksRight) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Last resort: the package root that contains this file's workspace.
  try {
    const pkg = path.resolve(process.cwd(), 'package.json');
    if (existsSync(pkg)) {
      const json = JSON.parse(readFileSync(pkg, 'utf-8')) as { name?: string };
      if (json.name === 'helix-forensics') return path.resolve(process.cwd());
    }
  } catch {
    /* ignore */
  }

  return path.resolve(process.cwd());
}

export function foundryBinDir(): string {
  const candidates = [
    path.join(repoRoot(), '.tools', 'foundry'),
    path.join(process.env.FOUNDRY_BIN_DIR ?? ''),
    process.env.FOUNDRY_BIN ?? '',
  ];
  for (const c of candidates) {
    if (c && existsSync(path.join(c, 'forge.exe'))) return c;
    if (c && existsSync(path.join(c, 'forge'))) return c;
  }
  return '';
}

export function foundryTool(name: 'forge' | 'cast' | 'anvil'): string {
  const dir = foundryBinDir();
  const isWin = process.platform === 'win32';
  const exe = isWin ? `${name}.exe` : name;
  if (dir && existsSync(path.join(dir, exe))) return path.join(dir, exe);
  return name; // fall back to PATH
}

export function foundryAvailable(): boolean {
  return existsSync(foundryTool('forge'));
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  command: string;
}

export function runTool(
  tool: 'forge' | 'cast' | 'anvil',
  args: string[],
  opts: { cwd: string; env?: Record<string, string>; timeoutMs?: number },
): Promise<RunResult> {
  const exe = foundryTool(tool);
  const started = Date.now();
  return new Promise((resolve) => {
    execFile(
      exe,
      args,
      {
        cwd: opts.cwd,
        env: { ...process.env, ...(opts.env ?? {}) },
        timeout: opts.timeoutMs ?? 180_000,
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        resolve({
          code: err && typeof (err as any).code === 'number' ? (err as any).code : err ? 1 : 0,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          durationMs: Date.now() - started,
          command: `${exe} ${args.join(' ')}`,
        });
      },
    );
  });
}
