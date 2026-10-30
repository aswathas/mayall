'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  Loader2,
  Play,
  Radar,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import type { GasFlameNode, PatternDetection, SimulationArtifact, SimulationResult, TraceNode } from '@helix/core';
import { useApi } from '../lib/useApi';
import { formatGas, weiToEth } from '../lib/format';
import { EmptyState, Panel } from './Panel';
import { AttackReplay } from './AttackReplay';
import { TrackerGasMeter } from './TrackerGasMeter';
import { TrackerDepthGauge } from './TrackerDepthGauge';
import { TrackerBalanceReadout, type BalanceRow } from './TrackerBalanceReadout';
import { TrackerTraceFeed, type FlatTraceNode } from './TrackerTraceFeed';
import { TrackerRail, type RailStatus, type RunState } from './TrackerRail';
import { SCENARIO_FACTS } from '../remotion/data';

const REPLAY_MS = 8000;
const REPLAY_SECONDS = REPLAY_MS / 1000;

interface ScenarioSpec {
  id: string;
  title: string;
  vectorId: string;
  chain: string;
  contractName: string;
  description: string;
}

type StreamMode = 'live' | 'poll';

interface StreamStats {
  caseId: string;
  elapsedMs: number;
  lines: number;
}

function flattenTrace(root: TraceNode | null): FlatTraceNode[] {
  if (!root) return [];
  const out: FlatTraceNode[] = [];
  const walk = (node: TraceNode): void => {
    if (node.contractName === 'VM') {
      node.children.forEach(walk);
      return;
    }
    out.push({
      key: node.id,
      depth: node.depth,
      contract: node.contractName,
      fn: node.fn,
      gas: node.gasUsed,
      external: node.isExternalCall,
    });
    node.children.forEach(walk);
  };
  walk(root);
  return out;
}

function Notice({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[9px] border border-arterial/35 bg-arterial/[0.06] px-3.5 py-2.5">
      <AlertTriangle className="h-4 w-4 shrink-0 text-arterial" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-dim">{text}</p>
      {onRetry ? (
        <button type="button" className="btn h-11 px-3 text-[0.7rem]" onClick={onRetry}>
          <RefreshCw className="h-3 w-3" aria-hidden="true" /> Retry
        </button>
      ) : null}
    </div>
  );
}

function RunningStage({
  startedAt,
  scenarioId,
  lines,
  streamed,
  stats,
}: {
  startedAt: number;
  scenarioId: string;
  lines: string[];
  streamed: boolean;
  stats: StreamStats | null;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt), 90);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const stage = elapsed < 1500 ? 'executing forge test' : elapsed < 3200 ? 'parsing trace' : 'classifying patterns';
  const visible = lines.slice(-12);

  return (
    <div className="flex flex-col gap-3 px-1 py-4" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="mono flex items-center gap-2 text-[0.64rem] uppercase tracking-[0.14em] text-arterial">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-arterial" aria-hidden="true" />
          {streamed ? 'streaming forge output' : stage}
        </span>
        <span className="mono text-[0.66rem] tabular-nums text-ink-dim">
          {((stats?.elapsedMs ?? elapsed) / 1000).toFixed(1)} s
          {streamed && stats ? ` · ${stats.lines} lines` : ''}
        </span>
      </div>
      <div className="h-px w-full bg-edge" role="presentation">
        <div className="h-full bg-arterial" style={{ width: `${Math.min(96, 12 + (elapsed / 3400) * 84)}%` }} />
      </div>
      <p className="mono text-[0.6rem] uppercase tracking-[0.12em] text-ink-faint">
        {scenarioId} · local EVM only · forge -vvvv {stats?.caseId ? `· ${stats.caseId}` : ''}
      </p>

      {visible.length > 0 ? (
        <div className="max-h-[260px] overflow-y-auto border-t border-edge pt-2">
          {visible.map((line, index) => (
            <p
              key={`${index}-${line.slice(0, 12)}`}
              className="mono truncate text-[0.6rem] leading-relaxed text-ink-dim"
            >
              {line || ' '}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TrackerConsole() {
  const { data: scenarioData, error: scenarioError, reload } = useApi<ScenarioSpec[]>('/api/scenarios');

  const [status, setStatus] = useState<RailStatus | null>(null);
  const [streamMode, setStreamMode] = useState<StreamMode>('poll');
  const [streamLines, setStreamLines] = useState<string[]>([]);
  const [streamStats, setStreamStats] = useState<StreamStats | null>(null);
  const streamAbort = useRef<AbortController | null>(null);

  const [resultsByScenario, setResultsByScenario] = useState<Record<string, SimulationResult>>({});
  const [states, setStates] = useState<Record<string, RunState>>({});
  const [activeId, setActiveId] = useState<string>('reentrancy');
  const [busy, setBusy] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [progress, setProgress] = useState(0);
  const [replayNonce, setReplayNonce] = useState(0);
  const startRef = useRef(0);
  const [reduced, setReduced] = useState(false);

  const scenarios = useMemo(() => {
    const fromApi = scenarioData ?? [];
    return SCENARIO_FACTS.map((fact) => {
      const spec = fromApi.find((entry) => entry.id === fact.id);
      return {
        ...fact,
        title: spec?.title ?? fact.title,
        vectorId: spec?.vectorId ?? fact.vectorId,
        chain: spec?.chain ?? fact.chain,
      };
    });
  }, [scenarioData]);

  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const scenario of scenarios) map.set(scenario.id, scenario.title);
    return map;
  }, [scenarios]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (): void => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(reload, 10_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch('/api/status', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = (await response.json()) as RailStatus;
        if (active) setStatus(payload);
      } catch {
        /* the rail shows an em dash when the engine status is unreachable */
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(
    () => () => {
      streamAbort.current?.abort();
    },
    [],
  );

  const startReplay = useCallback(() => {
    startRef.current = performance.now();
    setProgress(0);
    setReplayNonce((value) => value + 1);
  }, []);

  const result = resultsByScenario[activeId] ?? null;
  const activeTitle = titleById.get(activeId) ?? activeId;
  const streamedResult = result?.id.startsWith('stream-') ?? false;

  useEffect(() => {
    if (!result) {
      setProgress(0);
      return;
    }
    if (reduced) {
      setProgress(1);
      return;
    }
    if (startRef.current === 0) startRef.current = performance.now();
    const started = startRef.current;

    const tick = (): boolean => {
      const next = Math.max(0, Math.min(1, (performance.now() - started) / REPLAY_MS));
      setProgress(next);
      return next < 1;
    };

    if (tick()) {
      const timer = window.setInterval(() => {
        if (!tick()) window.clearInterval(timer);
      }, 90);
      return () => window.clearInterval(timer);
    }
    return;
  }, [result, reduced, replayNonce, activeId]);

  const run = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      setActiveId(id);
      setStates((previous) => ({ ...previous, [id]: 'running' }));
      setRunStartedAt(Date.now());
      setStreamLines([]);
      setStreamStats(null);

      try {
        const response = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenarioId: id }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(
            payload?.error ??
              `The engine rejected "${id}" (${response.status}). Recovery: confirm Foundry is installed, then run the scenario again.`,
          );
        }
        const simulation = (await response.json()) as SimulationResult;
        setResultsByScenario((previous) => ({ ...previous, [id]: simulation }));
        setStates((previous) => ({ ...previous, [id]: simulation.ok ? 'complete' : 'error' }));
        setActiveId(id);
        startReplay();
      } catch (err) {
        setStates((previous) => ({ ...previous, [id]: 'error' }));
        setError(
          err instanceof Error
            ? err.message
            : 'The simulation request could not be completed. Recovery: run the scenario again from the rail.',
        );
      } finally {
        setBusy(false);
      }
    },
    [startReplay],
  );

  const streamRun = useCallback(
    async (id: string) => {
      const fact = SCENARIO_FACTS.find((entry) => entry.id === id);
      streamAbort.current?.abort();
      const controller = new AbortController();
      streamAbort.current = controller;

      setBusy(true);
      setError(null);
      setActiveId(id);
      setStates((previous) => ({ ...previous, [id]: 'running' }));
      setRunStartedAt(Date.now());
      setStreamLines([]);
      setStreamStats(null);
      setStreamMode('live');

      const finishDone = (payload: Record<string, unknown>): void => {
        const artifact = (payload.artifact ?? null) as SimulationArtifact | null;
        const simulation: SimulationResult = {
          id: `stream-${String(payload.caseId ?? id)}`,
          scenario: id,
          attackVector: artifact?.attackVector ?? 'logic-error',
          startedAt: String(payload.startedAt ?? new Date().toISOString()),
          durationMs: Number(payload.durationMs ?? 0),
          ok: Boolean(payload.ok),
          command: String(payload.command ?? ''),
          stdout: '',
          stderr: String(payload.stderr ?? ''),
          artifact,
          trace: (payload.trace ?? null) as TraceNode | null,
          flame: Array.isArray(payload.flame) ? (payload.flame as GasFlameNode[]) : [],
          detections: Array.isArray(payload.detections) ? (payload.detections as PatternDetection[]) : [],
          traceText: '',
          logs: [],
        };
        setResultsByScenario((previous) => ({ ...previous, [id]: simulation }));
        setStates((previous) => ({ ...previous, [id]: simulation.ok ? 'complete' : 'error' }));
        startReplay();
      };

      try {
        const query = new URLSearchParams({ vector: fact?.vectorId ?? id });
        const response = await fetch(`/api/custom/stream?${query.toString()}`, {
          headers: { Accept: 'text/event-stream' },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(
            `The live stream did not open (${response.status}). Recovery: run the scenario from the rail instead.`,
          );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const rawEvent of events) {
            const eventName = rawEvent
              .split('\n')
              .find((entry) => entry.startsWith('event:'))
              ?.slice(6)
              .trim();
            const dataLine = rawEvent.split('\n').find((entry) => entry.startsWith('data:'));
            if (!dataLine) continue;

            let payload: Record<string, unknown>;
            try {
              payload = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;
            } catch {
              continue;
            }

            if (eventName === 'open') {
              setStreamStats({
                caseId: String(payload.caseId ?? ''),
                elapsedMs: 0,
                lines: 0,
              });
            } else if (eventName === 'line') {
              const line = String(payload.line ?? '');
              setStreamLines((previous) => {
                const next = [...previous, line];
                return next.length > 240 ? next.slice(next.length - 240) : next;
              });
            } else if (eventName === 'progress') {
              setStreamStats((previous) => ({
                caseId: previous?.caseId ?? '',
                elapsedMs: Number(payload.elapsedMs ?? 0),
                lines: Number(payload.lines ?? previous?.lines ?? 0),
              }));
            } else if (eventName === 'done') {
              finishDone(payload);
            } else if (eventName === 'error') {
              throw new Error(String(payload.message ?? 'The streamed run failed.'));
            }
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setStates((previous) => ({ ...previous, [id]: 'error' }));
          setError(
            err instanceof Error
              ? err.message
              : 'The streamed run could not be completed. Recovery: run the scenario from the rail instead.',
          );
        }
      } finally {
        if (!controller.signal.aborted) setStreamMode('poll');
        setBusy(false);
      }
    },
    [startReplay],
  );

  const select = useCallback(
    (id: string) => {
      setActiveId(id);
      if (resultsByScenario[id]) startReplay();
    },
    [resultsByScenario, startReplay],
  );

  const flat = useMemo(() => flattenTrace(result?.trace ?? null), [result]);
  const totalGas = useMemo(() => {
    if (result?.flame?.length) return result.flame.reduce((sum, node) => sum + node.gasUsed, 0);
    return flat.reduce((sum, node) => sum + node.gas, 0);
  }, [result, flat]);

  const maxDepth = useMemo(() => flat.reduce((max, node) => Math.max(max, node.depth), 0), [flat]);
  const withdrawCount = useMemo(() => flat.filter((node) => node.fn === 'withdraw').length, [flat]);

  const seconds = progress * REPLAY_SECONDS;
  const revealed = flat.length
    ? Math.max(0, Math.min(flat.length, Math.floor((seconds - 2.4) / 0.055)))
    : 0;
  const currentDepth = revealed > 0 ? flat[Math.min(revealed, flat.length) - 1]?.depth ?? 0 : 0;
  const gasProgress = Math.max(0, Math.min(1, (seconds - 2.4) / 4.8));
  const currentGas = totalGas * gasProgress;

  const balanceRows = useMemo<BalanceRow[]>(() => {
    const balances = result?.artifact?.balances ?? [];
    const valueProgress = Math.max(0, Math.min(1, (seconds - 5.6) / 2.4));
    const rows: BalanceRow[] = [];

    const victim = [...balances]
      .filter((entry) => entry.deltaWei.startsWith('-'))
      .sort((a, b) => (BigInt(a.deltaWei) < BigInt(b.deltaWei) ? -1 : 1))[0];
    const attacker = [...balances]
      .filter((entry) => !entry.deltaWei.startsWith('-') && entry.deltaWei !== '0')
      .sort((a, b) => (BigInt(b.deltaWei) < BigInt(a.deltaWei) ? -1 : 1))[0];

    if (victim) {
      const before = Number(weiToEth(victim.beforeWei, 4));
      const after = Number(weiToEth(victim.afterWei, 4));
      rows.push({
        label: victim.label,
        before,
        after,
        current: before + (after - before) * valueProgress,
        delta: after - before,
        tone: 'threat',
      });
    }
    if (attacker) {
      const before = Number(weiToEth(attacker.beforeWei, 4));
      const after = Number(weiToEth(attacker.afterWei, 4));
      rows.push({
        label: attacker.label,
        before,
        after,
        current: before + (after - before) * valueProgress,
        delta: after - before,
        tone: 'safe',
      });
    }
    return rows;
  }, [result, seconds]);

  const stageState: 'idle' | 'running' | 'replay' | 'complete' = busy
    ? 'running'
    : !result
      ? 'idle'
      : progress >= 1
        ? 'complete'
        : 'replay';

  const stageLabel =
    stageState === 'running'
      ? 'Attack in flight'
      : stageState === 'replay'
        ? streamedResult
          ? 'Replay of a streamed run'
          : 'Replay of a captured run'
        : stageState === 'complete'
          ? 'Run complete'
          : 'No active run';

  const stageTitle = result
    ? streamedResult
      ? `Custom ${result.scenario} run`
      : titleById.get(result.scenario) ?? result.scenario
    : activeTitle;

  const streamLabel = streamMode === 'live' ? 'live stream' : streamedResult ? 'stream captured' : 'artifact replay';
  const sourceLabel =
    streamMode === 'live'
      ? '/api/custom/stream · SSE'
      : streamedResult
        ? '/api/custom/stream · completed'
        : '/api/status · every 5 s';

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display text-[2rem] font-medium leading-none text-ink sm:text-[2.35rem]">
              Live attack tracker
            </h1>
            <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-ink-dim">
              One run, followed frame by frame: the gas it spends, the depth it reaches, the balances it moves, and
              the parsed trace as each node appears. Start a scenario replay, or stream a live forge run and watch
              its output arrive line by line.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/attack-lab" className="btn btn-primary h-11 px-4 text-sm">
              <Play className="h-4 w-4" aria-hidden="true" />
              Start a run
            </Link>
            <button
              type="button"
              className="btn h-11 px-4 text-sm"
              onClick={() => void streamRun(activeId)}
              disabled={busy}
              aria-label={`Stream a live custom ${activeTitle} run`}
            >
              {busy && streamMode === 'live' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Radar className="h-4 w-4" aria-hidden="true" />
              )}
              Stream live
            </button>
            <button
              type="button"
              className="btn btn-ghost h-11 px-4 text-sm"
              onClick={() => void run(activeId)}
              disabled={busy}
            >
              {busy && streamMode !== 'live' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
              {busy && streamMode !== 'live' ? 'Running' : `Run ${activeTitle}`}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={`chip ${streamMode === 'live' ? 'chip-safe' : ''}`}>
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${streamMode === 'live' ? 'live-dot bg-mint' : 'bg-ink-faint'}`}
            />
            {streamLabel}
          </span>
          <span className="mono text-[0.56rem] uppercase tracking-[0.12em] text-ink-faint">source · {sourceLabel}</span>
          <span className="mono flex items-center gap-1.5 text-[0.56rem] uppercase tracking-[0.12em] text-ink-faint">
            foundry
            <span className={`h-1.5 w-1.5 rounded-full ${status?.foundry ? 'bg-mint' : 'bg-arterial'}`} aria-hidden="true" />
            <span className={status?.foundry ? 'text-mint' : 'text-arterial'}>
              {status ? (status.foundry ? 'ready' : 'unavailable') : '—'}
            </span>
          </span>
          <span className="mono text-[0.56rem] uppercase tracking-[0.12em] text-ink-faint">
            artifacts <span className="tabular-nums text-ink-dim">{status?.artifacts ?? '—'}</span>
          </span>
        </div>

        {scenarioError ? (
          <Notice
            text={`The scenario library did not load (${scenarioError}). Recovery: confirm the dev server is reachable, then reload the library.`}
            onRetry={reload}
          />
        ) : null}
        {error ? <Notice text={error} onRetry={() => void run(activeId)} /> : null}
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <TrackerRail
          scenarios={scenarios}
          states={states}
          activeId={activeId}
          busy={busy}
          status={status}
          onSelect={select}
          onRun={(id) => void run(id)}
        />

        <div className="flex min-w-0 flex-col gap-4">
          <Panel flush bodyClassName="p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-edge pb-3">
              <div className="min-w-0">
                <p className="mono flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.14em] text-ink-faint">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${
                      stageState === 'running'
                        ? 'live-dot bg-arterial'
                        : stageState === 'idle'
                          ? 'bg-ink-faint'
                          : 'bg-mint'
                    }`}
                  />
                  {stageLabel}
                </p>
                <p className="mt-1 truncate text-[0.95rem] font-medium text-ink">{stageTitle}</p>
                <p className="mono mt-0.5 truncate text-[0.56rem] text-ink-faint">
                  {result
                    ? `${result.scenario} · ${result.durationMs} ms · ${result.ok ? 'pass' : 'fail'} · ${result.command.replace(
                        /^.*?forge(?:\.exe)?\s+/i,
                        'forge ',
                      )}`
                    : 'forge test -vvvv · local EVM only · not mainnet evidence'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="mono text-[0.6rem] tabular-nums text-ink-dim">
                  {seconds.toFixed(1)}s / {REPLAY_SECONDS.toFixed(1)}s
                </span>
                <button
                  type="button"
                  className="btn btn-ghost h-11 px-3 text-xs"
                  onClick={startReplay}
                  disabled={!result}
                  aria-label="Replay this run from the start"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Replay
                </button>
                <button
                  type="button"
                  className="btn h-11 px-3 text-xs"
                  onClick={() => void run(activeId)}
                  disabled={busy}
                >
                  {busy && streamMode !== 'live' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {busy && streamMode !== 'live' ? 'Running' : 'Run'}
                </button>
              </div>
            </div>

            {result && !busy ? (
              <div key={replayNonce} className="rise-in">
                <AttackReplay
                  trace={result.trace}
                  artifact={result.artifact}
                  durationMs={REPLAY_MS}
                  onComplete={() => setProgress(1)}
                />
              </div>
            ) : busy ? (
              <RunningStage
                startedAt={runStartedAt}
                scenarioId={activeId}
                lines={streamLines}
                streamed={streamMode === 'live'}
                stats={streamStats}
              />
            ) : (
              <div className="px-2 py-6">
                <EmptyState
                  title="No run in flight"
                  hint="Start a local Foundry simulation and the attack draws itself here — call tree, gas, depth and balance movement. Nothing on this page is a mock value."
                />
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    className="btn btn-primary h-11 px-4 text-sm"
                    onClick={() => void run(activeId)}
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                    Run {activeTitle}
                  </button>
                  <button
                    type="button"
                    className="btn h-11 px-4 text-sm"
                    onClick={() => void streamRun(activeId)}
                  >
                    <Radar className="h-4 w-4" aria-hidden="true" />
                    Stream a live run
                  </button>
                  <Link href="/attack-lab" className="btn btn-ghost h-11 px-4 text-sm">
                    Start a custom run
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            )}
          </Panel>

          <Panel
            title="Instrumentation"
            subtitle={result ? 'synced to the 8 s replay · measured values' : 'waiting for a run'}
            flush
          >
            <div className="grid grid-cols-1 divide-y divide-edge sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="min-w-0 p-4">
                <TrackerGasMeter totalGas={totalGas} currentGas={currentGas} active={stageState === 'replay'} />
              </div>
              <div className="min-w-0 p-4">
                <TrackerBalanceReadout rows={balanceRows} />
              </div>
              <div className="min-w-0 p-4">
                <TrackerDepthGauge maxDepth={maxDepth} currentDepth={currentDepth} withdrawCount={withdrawCount} />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge px-4 py-3">
              <span className="mono text-[0.56rem] uppercase tracking-[0.12em] text-ink-faint">
                loss <span className="text-arterial">{result?.artifact?.lossEth ?? '0'} ETH</span>
              </span>
              <span className="mono text-[0.56rem] uppercase tracking-[0.12em] text-ink-faint">
                {result ? `${flat.length} parsed frames · ${formatGas(totalGas)} gas attributed` : 'no captured run'}
              </span>
            </div>
          </Panel>

          <Panel
            title="Trace feed"
            subtitle={
              result
                ? `${result.scenario} · ${streamedResult ? 'custom harness' : 'scenario'} · parsed from forge output`
                : 'no run selected'
            }
            flush
          >
            <TrackerTraceFeed nodes={flat} revealed={revealed} total={flat.length} />
          </Panel>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge pt-3">
            <p className="max-w-[80ch] text-xs leading-relaxed text-ink-dim">
              The replay is drawn from a real <span className="mono text-[0.92em] text-ink">forge -vvvv</span> trace
              captured on this machine. It is a local reproduction of the exploit logic, not a mainnet transaction.
            </p>
            <Link
              href="/lab"
              className="mono inline-flex min-h-11 items-center gap-1 text-[0.62rem] uppercase tracking-[0.12em] text-ink-dim transition-colors duration-100 hover:text-arterial"
            >
              Open the lab
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
