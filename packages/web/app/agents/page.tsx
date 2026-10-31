import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import AgentsFloor, {
  type AgentHistory,
  type AgentSnapshot,
} from '../../components/AgentsFloor';

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

function readJson<T>(file: string): T | null {
  try {
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

/**
 * The snapshot and the completed-run record are read at build time so the static
 * export carries real content; the client component then polls for live updates
 * when a server runtime is present.
 */
export default function AgentsPage() {
  const root = repoRoot();
  const snapshot = readJson<AgentSnapshot>(
    path.join(root, 'data', 'agents', 'status.json'),
  );
  const history = readJson<AgentHistory>(path.join(root, 'data', 'agents', 'history.json'));

  return <AgentsFloor initialSnapshot={snapshot} history={history} />;
}
