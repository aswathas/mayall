'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  Copy,
  Database,
  Download,
  FileText,
  Flame,
  Layers,
  Play,
  RotateCcw,
  ScanSearch,
  ScrollText,
} from 'lucide-react';
import type { SimulationResult } from '@helix/core';
import { formatInt } from '../lib/format';
import { Panel, EmptyState } from './Panel';
import { SimSummary } from './SimSummary';
import { AttackReplay } from './AttackReplay';
import { TraceViewer } from './TraceViewer';
import { GasFlameChart } from './GasFlameChart';
import { StorageDiffInspector } from './StorageDiffInspector';
import { BalanceTimeline } from './BalanceTimeline';
import { PatternReport } from './PatternReport';
import { ErrorBlock } from './Loading';

export interface LiveSimPanelProps {
  scenarioId: string;
  caseSlug?: string;
  scenarioTitle?: string;
  onResult?: (result: SimulationResult) => void;
}

type Phase = 'idle' | 'running' | 'done' | 'error';
type TabId = 'trace' | 'gas' | 'storage' | 'balances' | 'patterns' | 'raw';

const TABS: { id: TabId; label: string; icon: typeof Flame }[] = [
  { id: 'trace', label: 'Trace', icon: Layers },
  { id: 'gas', label: 'Gas', icon: Flame },
  { id: 'storage', label: 'Storage', icon: Database },
  { id: 'balances', label: 'Balances', icon: ArrowLeftRight },
  { id: 'patterns', label: 'Patterns', icon: ScanSearch },
  { id: 'raw', label: 'Raw', icon: ScrollText },
];

const STAGES = [
  'executing forge test',
  'parsing trace',
  'classifying patterns',
] as const;

export function LiveSimPanel({ scenarioId, caseSlug, scenarioTitle, onResult }: LiveSimPanelProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [tab, setTab] = useState<TabId>('trace');
  const [copied, setCopied] = useState(false);
  const startedRef = useRef(0);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPhase('idle');
    setResult(null);
    setError(null);
    setElapsed(0);
  }, [scenarioId]);

  useEffect(() => {
    if (phase !== 'running') return;
    startedRef.current = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Date.now() - startedRef.current), 100);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const run = useCallback(async () => {
    setPhase('running');
    setError(null);
    setResult(null);
    setTab('trace');

    try {
      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Simulation failed (${response.status} ${response.statusText})`);
      }
      const payload = (await response.json()) as SimulationResult;
      setResult(payload);
      setPhase('done');
      onResult?.(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation request failed');
      setPhase('error');
    }
  }, [scenarioId, onResult]);

  const running = phase === 'running';
  const artifact = result?.artifact ?? null;
  const reportHref = `/cases/${encodeURIComponent(caseSlug ?? `lab-${scenarioId}`)}/report?scenario=${encodeURIComponent(scenarioId)}`;
  const bundleHref = `/api/bundle/lab-${encodeURIComponent(scenarioId)}?scenario=${encodeURIComponent(scenarioId)}`;

  const stageIndex = elapsed < 1500 ? 0 : elapsed < 3200 ? 1 : 2;

  const copyRaw = async (): Promise<void> => {
    if (!result) return;
    const text = `${result.stdout}${result.stderr ? `\n\n--- stderr ---\n${result.stderr}` : ''}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Live foundry execution"
        action={
          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-[0.56rem] uppercase tracking-[0.14em] text-ink-faint sm:inline">
              scenario::{scenarioId}
            </span>
            <button
              type="button"
              className="btn btn-primary py-1.5 text-xs"
              onClick={() => void run()}
              disabled={running}
            >
              {running ? (
                <span className="live-dot h-2 w-2 rounded-full bg-on-bone" aria-hidden />
              ) : result ? (
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden />
              )}
              {running ? 'Running simulation' : result ? 'Re-run simulation' : 'Run simulation'}
            </button>
          </div>
        }
      >
        {phase === 'idle' ? (
          <div className="flex flex-col items-start gap-2 py-2">
            <p className="text-xs leading-relaxed text-ink-dim">
              This case ships a local Foundry reproduction. Run it to execute the exploit against the real contract and
              capture the call trace, gas attribution, storage diff and detector findings.
            </p>
            <span className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-ink-faint">
              forge test --match-path … -vvvv --decode-internal
            </span>
            <p className="text-[0.68rem] leading-relaxed text-ink-faint">
              Evidence is produced by a local simulation, not from mainnet state.
            </p>
          </div>
        ) : null}

        {running ? (
          <div className="flex flex-col gap-3" role="status" aria-live="polite">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-mono text-[0.64rem] uppercase tracking-[0.14em] text-arterial">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-arterial" aria-hidden />
                {STAGES[stageIndex]}
              </span>
              <span className="font-mono text-[0.66rem] tabular-nums text-ink-dim">
                {(elapsed / 1000).toFixed(1)}s
              </span>
            </div>
            <div className="h-px w-full bg-edge" role="presentation">
              <div
                className="h-full bg-arterial"
                style={{ width: `${Math.min(100, 18 + stageIndex * 34)}%` }}
              />
            </div>
            <ol className="flex flex-col gap-1.5">
              {STAGES.map((stage, index) => {
                const done = index < stageIndex;
                const active = index === stageIndex;
                return (
                  <li
                    key={stage}
                    className={`flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.12em] ${
                      active ? 'text-ink' : done ? 'text-mint' : 'text-ink-faint'
                    }`}
                  >
                    {done ? (
                      <Check className="h-3 w-3 text-mint" aria-hidden />
                    ) : (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          active ? 'live-dot bg-arterial' : 'border border-edge'
                        }`}
                        aria-hidden
                      />
                    )}
                    {stage}
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}

        {phase === 'error' && error ? (
          <ErrorBlock message={error} onRetry={() => void run()} />
        ) : null}

        {phase === 'done' && result ? (
          <div className="flex flex-col gap-2">
            <SimSummary result={result} scenarioTitle={scenarioTitle} />
            {!result.ok ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-edge pt-2">
                <span className="flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-ember">
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  forge exited with errors
                </span>
                <span className="text-[0.68rem] text-ink-faint">
                  The trace was still captured. Open Raw for stdout and stderr.
                </span>
                <button type="button" className="btn btn-ghost ml-auto py-1 text-[0.66rem]" onClick={() => setTab('raw')}>
                  <ScrollText className="h-3 w-3" aria-hidden /> Open raw output
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Panel>

      {phase === 'done' && result ? (
        <>
          <Panel title="Attack replay" flush bodyClassName="p-3 sm:p-4">
            <AttackReplay trace={result.trace} artifact={result.artifact} />
          </Panel>

          <Panel
            title="Evidence"
            flush
            action={
              <span className="flex items-center gap-2 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-ink-faint">
                <span className={`h-1.5 w-1.5 rounded-full ${result.ok ? 'bg-mint' : 'bg-arterial'}`} aria-hidden />
                {result.ok ? 'pass' : 'fail'} · {formatInt(result.durationMs)}ms
              </span>
            }
          >
            <div role="tablist" aria-label="Simulation evidence" className="flex items-center gap-1 overflow-x-auto border-b border-edge px-3">
              {TABS.map((item) => {
                const Icon = item.icon;
                const selected = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    id={`sim-tab-${item.id}`}
                    aria-selected={selected}
                    aria-controls={`sim-panel-${item.id}`}
                    onClick={() => setTab(item.id)}
                    className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] transition-colors ${
                      selected
                        ? 'border-arterial text-arterial'
                        : 'border-transparent text-ink-faint hover:text-ink-dim'
                    }`}
                  >
                    <Icon className="h-3 w-3" aria-hidden />
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div
              className="p-4"
              role="tabpanel"
              id={`sim-panel-${tab}`}
              aria-labelledby={`sim-tab-${tab}`}
            >
              {tab === 'trace' ? (
                result.trace ? (
                  <TraceViewer root={result.trace} />
                ) : (
                  <EmptyState title="No trace" hint={result.stderr || 'forge produced no call trace for this run.'} />
                )
              ) : null}

              {tab === 'gas' ? <GasFlameChart flame={result.flame} /> : null}

              {tab === 'storage' ? <StorageDiffInspector writes={artifact?.storageWrites ?? []} /> : null}

              {tab === 'balances' ? <BalanceTimeline balances={artifact?.balances ?? []} /> : null}

              {tab === 'patterns' ? <PatternReport findings={result.detections} /> : null}

              {tab === 'raw' ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip chip-threat">stdout</span>
                    <span className="mono truncate text-[0.56rem] text-ink-faint">{result.command}</span>
                    <button
                      type="button"
                      className="btn btn-ghost ml-auto py-1 text-[0.66rem]"
                      onClick={() => void copyRaw()}
                      aria-label="Copy forge stdout and stderr"
                    >
                      {copied ? (
                        <Check className="h-3 w-3 text-mint" aria-hidden />
                      ) : (
                        <Copy className="h-3 w-3" aria-hidden />
                      )}
                      {copied ? 'Copied' : 'Copy output'}
                    </button>
                  </div>
                  <pre className="scroll-y max-h-[520px] overflow-auto whitespace-pre-wrap break-all rounded-[9px] border border-edge bg-abyss/60 p-3 font-mono text-[0.62rem] leading-relaxed text-ink-dim">
                    {result.stdout || '(empty stdout)'}
                  </pre>
                  {result.stderr ? (
                    <>
                      <span className="chip chip-warn">stderr</span>
                      <pre className="scroll-y max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-[9px] border border-edge bg-abyss/60 p-3 font-mono text-[0.62rem] leading-relaxed text-ember/90">
                        {result.stderr}
                      </pre>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-edge px-4 py-3">
              <Link href={reportHref} className="btn btn-primary py-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" aria-hidden /> Open forensic report
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
              <a href={bundleHref} className="btn py-1.5 text-xs">
                <Download className="h-3.5 w-3.5" aria-hidden /> Download forensic bundle
              </a>
              <span className="ml-auto font-mono text-[0.55rem] uppercase tracking-[0.12em] text-ink-faint">
                local simulation · not mainnet evidence
              </span>
            </div>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
