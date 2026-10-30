'use client';

import { useEffect, useState } from 'react';
import { Activity, Cpu, Radio } from 'lucide-react';

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
  updatedAt: string | null;
  count: number;
  cmdc: number;
  agy: number;
  agents: AgentRow[];
  note?: string;
}

function elapsed(from: string | null, now: number): string {
  if (!from) return '—';
  const start = new Date(from).getTime();
  if (Number.isNaN(start)) return '—';
  const secs = Math.max(0, Math.floor((now - start) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function AgentsPage() {
  const [snap, setSnap] = useState<AgentSnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch('/api/agents', { cache: 'no-store' });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = (await res.json()) as AgentSnapshot;
        if (!alive) return;
        setSnap(body);
        setError(null);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'unreachable');
      }
    };

    void load();
    const poll = window.setInterval(load, 4000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);

    return () => {
      alive = false;
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, []);

  const agents = snap?.agents ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          Delegation floor
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-dim">
          Every autonomous agent currently working on Mayall, read live off the machine. The
          watcher scans the process table for <code className="mono">cmdc</code> and{' '}
          <code className="mono">agy</code> sessions and reports what each one was briefed to do.
        </p>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-edge bg-edge sm:grid-cols-4">
        <div className="bg-panel px-4 py-3">
          <p className="label-micro">Running</p>
          <p className="stat-value mt-1">{snap?.count ?? '—'}</p>
        </div>
        <div className="bg-panel px-4 py-3">
          <p className="label-micro">cmdc</p>
          <p className="stat-value mt-1">{snap?.cmdc ?? '—'}</p>
        </div>
        <div className="bg-panel px-4 py-3">
          <p className="label-micro">agy</p>
          <p className="stat-value mt-1">{snap?.agy ?? '—'}</p>
        </div>
        <div className="bg-panel px-4 py-3">
          <p className="label-micro">Snapshot</p>
          <p className="mono mt-1 text-xs text-ink-dim">
            {snap?.updatedAt ? new Date(snap.updatedAt).toLocaleTimeString() : '—'}
          </p>
        </div>
      </section>

      {error && (
        <div className="mb-6 rounded-lg border border-edge bg-panel px-4 py-3 text-sm text-ink-dim">
          Watcher unreachable ({error}). Start it with{' '}
          <code className="mono text-ink">node scripts/agent-watch.mjs</code>.
        </div>
      )}

      {!snap && !error && (
        <div className="rounded-lg border border-edge bg-panel px-4 py-10 text-center text-sm text-ink-dim">
          Reading the process table…
        </div>
      )}

      {snap && agents.length === 0 && (
        <div className="rounded-lg border border-edge bg-panel px-4 py-10 text-center text-sm text-ink-dim">
          {snap.note ?? 'No delegation agents are running right now.'}
        </div>
      )}

      {agents.length > 0 && (
        <ul className="flex flex-col gap-px overflow-hidden rounded-lg border border-edge bg-edge">
          {agents.map((agent) => (
            <li key={agent.name} className="bg-panel px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="flex items-center gap-1.5 text-ink">
                  {agent.kind === 'agy' ? (
                    <Cpu size={14} className="text-ink-faint" aria-hidden="true" />
                  ) : (
                    <Radio size={14} className="text-ink-faint" aria-hidden="true" />
                  )}
                  <span className="text-sm font-medium">{agent.label}</span>
                </span>
                <span className="chip">
                  <Activity size={11} aria-hidden="true" />
                  running
                </span>
                <span className="mono text-[0.65rem] text-ink-faint">{agent.kind}</span>
                <span className="mono text-[0.65rem] text-ink-faint">{agent.model}</span>
                <span className="mono ml-auto text-[0.65rem] text-ink-faint">
                  {elapsed(agent.started, now)}
                </span>
              </div>
              {agent.summary && (
                <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">{agent.summary}</p>
              )}
              <p className="mono mt-1 text-[0.6rem] text-ink-faint">
                pid {agent.pid} · brief {agent.name}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
