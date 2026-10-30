'use client';

import Link from 'next/link';
import { ArrowUpRight, Loader2, Play, RotateCw } from 'lucide-react';
import type { ScenarioFact } from '../remotion/data';
import { Panel } from './Panel';

export type RunState = 'idle' | 'running' | 'complete' | 'error';

const STATE_TEXT: Record<RunState, string> = {
  idle: 'text-ink-faint',
  running: 'text-amber',
  complete: 'text-mint',
  error: 'text-arterial',
};

const STATE_DOT: Record<RunState, string> = {
  idle: 'bg-ink-faint',
  running: 'live-dot bg-amber',
  complete: 'bg-mint',
  error: 'bg-arterial',
};

export interface RailStatus {
  foundry: boolean;
  scenarios: number;
  artifacts: number;
}

export function TrackerRail({
  scenarios,
  states,
  activeId,
  busy,
  status,
  onSelect,
  onRun,
}: {
  scenarios: ScenarioFact[];
  states: Record<string, RunState>;
  activeId: string;
  busy: boolean;
  status: RailStatus | null;
  onSelect: (id: string) => void;
  onRun: (id: string) => void;
}) {
  return (
    <Panel
      title="Scenario status"
      subtitle="six reproductions · polled every 5 s"
      flush
      action={
        <span className="mono flex items-center gap-1.5 text-[0.56rem] uppercase tracking-[0.12em] text-ink-faint">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-mint" aria-hidden="true" />
          5 s
        </span>
      }
    >
      <ul>
        {scenarios.map((scenario) => {
          const state = states[scenario.id] ?? 'idle';
          const active = scenario.id === activeId;
          const isBusy = busy && states[scenario.id] === 'running';
          return (
            <li
              key={scenario.id}
              className={`flex items-stretch border-b border-edge/70 last:border-b-0 ${
                active ? 'bg-elevated/50' : ''
              }`}
            >
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(scenario.id)}
                className="flex min-h-[68px] min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-2.5 text-left transition-colors duration-100 hover:bg-elevated/30"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATE_DOT[state]}`} />
                  <span className={`mono text-[0.54rem] uppercase tracking-[0.12em] ${STATE_TEXT[state]}`}>
                    {state}
                  </span>
                  <span className="mono ml-auto shrink-0 text-[0.58rem] tabular-nums text-arterial">
                    {scenario.lossEth} ETH
                  </span>
                </span>
                <span className="truncate text-[0.8rem] font-medium leading-snug text-ink">{scenario.title}</span>
                <span className="mono truncate text-[0.54rem] text-ink-faint">
                  {scenario.topDetection} · {Math.round(scenario.confidence * 100)}%
                </span>
              </button>

              <button
                type="button"
                onClick={() => onRun(scenario.id)}
                disabled={busy}
                aria-label={`Run ${scenario.title} now`}
                className="flex min-h-[44px] w-11 shrink-0 items-center justify-center border-l border-edge text-ink-dim transition-colors duration-100 hover:text-arterial disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : state === 'complete' ? (
                  <RotateCw className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Play className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-edge px-4 py-3">
        <dl className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <dt className="mono text-[0.56rem] uppercase tracking-[0.12em] text-ink-faint">Foundry</dt>
            <dd className={`mono text-[0.58rem] ${status?.foundry ? 'text-mint' : 'text-arterial'}`}>
              {status ? (status.foundry ? 'ready' : 'unavailable') : '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="mono text-[0.56rem] uppercase tracking-[0.12em] text-ink-faint">Artifacts on disk</dt>
            <dd className="mono text-[0.58rem] tabular-nums text-ink-dim">{status ? status.artifacts : '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="mono text-[0.56rem] uppercase tracking-[0.12em] text-ink-faint">Scenarios</dt>
            <dd className="mono text-[0.58rem] tabular-nums text-ink-dim">{status ? status.scenarios : '—'}</dd>
          </div>
        </dl>

        <Link href="/attack-lab" className="btn btn-ghost mt-3 h-11 w-full text-xs">
          Open the attack lab
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </Panel>
  );
}
