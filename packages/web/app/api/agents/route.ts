import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface AgentRow {
  name: string;
  label: string;
  kind: 'cmdc' | 'agy';
  model: string;
  pid: number;
  started: string | null;
  summary: string;
}

interface AgentSnapshot {
  updatedAt: string;
  count: number;
  cmdc: number;
  agy: number;
  agents: AgentRow[];
}

/** Walk up from the web package to the workspace root (the folder holding `packages`). */
function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(path.join(dir, 'packages'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(process.cwd(), '..', '..');
}

export async function GET(): Promise<NextResponse> {
  try {
    const file = path.join(repoRoot(), 'data', 'agents', 'status.json');
    if (!existsSync(file)) {
      return NextResponse.json(
        {
          updatedAt: null,
          count: 0,
          cmdc: 0,
          agy: 0,
          agents: [],
          note: 'The agent watcher has not written a snapshot yet. Start it with: node scripts/agent-watch.mjs',
        },
        { status: 200 },
      );
    }

    const snapshot = JSON.parse(readFileSync(file, 'utf-8')) as AgentSnapshot;
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read agent status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
