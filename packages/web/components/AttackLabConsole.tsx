'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowUpRight,
  Download,
  FileJson,
  FlaskConical,
  Loader2,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Terminal,
  Zap,
} from 'lucide-react';
import type {
  ForensicReport,
  GasFlameNode,
  PatternDetection,
  SimulationArtifact,
  TraceNode,
} from '@helix/core';
import { formatEthAmount, formatGas, formatPct } from '../lib/format';
import { useApi } from '../lib/useApi';
import { EmptyState, MicroLabel, Panel } from './Panel';
import { MetricStrip, type MetricItem } from './MetricStrip';
import { PatternReport } from './PatternReport';
import { TraceViewer } from './TraceViewer';
import { GasFlameChart } from './GasFlameChart';
import { StorageDiffInspector } from './StorageDiffInspector';
import { BalanceTimeline } from './BalanceTimeline';
import { ErrorBlock, Skeleton } from './Loading';
import { LiveTraceStream } from './LiveTraceStream';

type Severity = 'critical' | 'high' | 'medium' | 'low';
type Unit = 'ETH' | 'WEI';
type Phase = 'idle' | 'running' | 'done' | 'error';

interface VectorSpec {
  id: string;
  label: string;
  family: string;
  vectorId: string;
  severity: Severity;
  description: string;
  drains: string;
  assumption: string;
  defaultTxs: number;
  defaultAmountEth: number;
}

interface OptionsResponse {
  vectors: VectorSpec[];
  limits: {
    txs: { min: number; max: number; default: number };
    amountEth: { min: number; max: number; default: number };
    seed: { min: number; max: number; default: number };
  };
  toolchain: { foundry: boolean; forgePath: string; contractsDir: string; testFile: string; testPresent: boolean };
  test: { file: string; name: string };
}

interface TraceSummary {
  nodes: number;
  maxDepth: number;
  totalGas: number;
  valueTransfers: number;
  repeatedFrames: { label: string; count: number }[];
}

interface RunResult {
  caseId: string;
  ok: boolean;
  vector: string;
  vectorLabel: string;
  startedAt: string;
  durationMs: number;
  command: string;
  request: { vector: string; txs: number; amountWei: string; seed: number };
  artifact: SimulationArtifact | null;
  trace: TraceNode | null;
  flame: GasFlameNode[];
  detections: PatternDetection[];
  report: ForensicReport;
  traceSummary: TraceSummary;
  bundleUrl: string;
  reportUrl: string;
  stdoutTail: string;
  stderr: string;
}

const SEVERITY_DOT: Record<Severity, string> = {
  critical: 'bg-arterial',
  high: 'bg-ember',
  medium: 'bg-amber',
  low: 'bg-mint',
};

const SEVERITY_TEXT: Record<Severity, string> = {
  critical: 'text-arterial',
  high: 'text-ember',
  medium: 'text-amber',
  low: 'text-mint',
};

const MAX_WEI = 1000n * 10n ** 18n;

function parseAmount(text: string, unit: Unit): bigint | null {
  const value = text.trim();
  if (!value) return null;
  if (unit === 'WEI') {
    if (!/^\d+$/.test(value)) return null;
    return BigInt(value);
  }
  if (!/^\d*(\.\d{0,18})?$/.test(value) || value === '.') return null;
  const [whole = '0', fraction = ''] = value.split('.');
  const padded = (fraction + '0'.repeat(18)).slice(0, 18);
  return BigInt(whole || '0') * 10n ** 18n + BigInt(padded || '0');
}

function weiToEthString(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function AttackLabConsole() {
  const searchParams = useSearchParams();
  const caseParam = searchParams.get('case');

  const { data: options, loading: optionsLoading, error: optionsError, reload } = useApi<OptionsResponse>(
    '/api/custom/options',
  );

  const vectors = useMemo(() => options?.vectors ?? [], [options]);
  const limits = options?.limits;

  const [vector, setVector] = useState('reentrancy');
  const [txs, setTxs] = useState(3);
  const [amountText, setAmountText] = useState('6');
  const [unit, setUnit] = useState<Unit>('ETH');
  const [seed, setSeed] = useState('1');

  const [phase, setPhase] = useState<Phase>('idle');
  const [lines, setLines] = useState<string[]>([]);
  const [liveLines, setLiveLines] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const startedRef = useRef(0);
  const restoredRef = useRef<string | null>(null);

  const amountWei = useMemo(() => parseAmount(amountText, unit), [amountText, unit]);
  const amountValid = amountWei !== null && amountWei > 0n && amountWei <= MAX_WEI;
  const activeVector = vectors.find((entry) => entry.id === vector) ?? null;

  useEffect(() => {
    if (!vectors.length) return;
    if (vectors.some((entry) => entry.id === vector)) return;
    const first = vectors[0];
    setVector(first.id);
    setTxs(first.defaultTxs);
    setAmountText(String(first.defaultAmountEth));
  }, [vectors, vector]);

  useEffect(() => {
    if (phase !== 'running') return;
    const timer = window.setInterval(() => setElapsed(Date.now() - startedRef.current), 120);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (!streamUrl) return;
    const source = new EventSource(streamUrl);

    const onLine = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as { line: string };
        setLines((previous) =>
          previous.length > 4000 ? [...previous.slice(-3500), payload.line] : [...previous, payload.line],
        );
        setLiveLines((count) => count + 1);
      } catch {
        /* ignore malformed line */
      }
    };

    const onProgress = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as { elapsedMs: number; lines: number };
        setElapsed(payload.elapsedMs);
        setLiveLines(payload.lines);
      } catch {
        /* ignore malformed progress */
      }
    };

    const onDone = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as RunResult;
        setResult(payload);
        setPhase('done');
        setElapsed(payload.durationMs);
      } catch {
        setError('The run completed but its evidence payload could not be read. Recovery: run the attack again.');
        setPhase('error');
      }
      source.close();
      setStreamUrl(null);
    };

    const onStreamError = (event: Event) => {
      const data = (event as MessageEvent<string>).data;
      if (typeof data === 'string' && data.length > 0) {
        try {
          const payload = JSON.parse(data) as { message?: string };
          setError(payload.message ?? 'The attack run failed before the evidence was assembled.');
        } catch {
          setError('The attack run failed before the evidence was assembled.');
        }
        setPhase('error');
        source.close();
        setStreamUrl(null);
        return;
      }
      if (source.readyState === EventSource.CLOSED) {
        setError(
          'The live stream closed before the run finished. Recovery: run the attack again and check the dev server log for the forge invocation.',
        );
        setPhase('error');
        setStreamUrl(null);
      }
    };

    source.addEventListener('line', onLine);
    source.addEventListener('progress', onProgress);
    source.addEventListener('done', onDone);
    source.addEventListener('error', onStreamError);

    return () => {
      source.removeEventListener('line', onLine);
      source.removeEventListener('progress', onProgress);
      source.removeEventListener('done', onDone);
      source.removeEventListener('error', onStreamError);
      source.close();
    };
  }, [streamUrl]);

  useEffect(() => {
    if (!caseParam || restoredRef.current === caseParam) return;
    restoredRef.current = caseParam;
    let cancelled = false;

    fetch(`/api/custom?caseId=${encodeURIComponent(caseParam)}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`The case "${caseParam}" could not be loaded (${response.status}). Recovery: run the attack again.`);
        }
        return (await response.json()) as RunResult;
      })
      .then((payload) => {
        if (cancelled) return;
        setResult(payload);
        setPhase('done');
        setVector(payload.request.vector);
        setTxs(payload.request.txs);
        setSeed(String(payload.request.seed));
        setUnit('ETH');
        setAmountText(weiToEthString(BigInt(payload.request.amountWei)));
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'The case could not be loaded.');
        setPhase('error');
      });

    return () => {
      cancelled = true;
    };
  }, [caseParam]);

  const startRun = useCallback(
    (overrides?: { vector?: string; txs?: number; amountWei?: bigint; seed?: number }) => {
      if (phase === 'running') return;
      const nextVector = overrides?.vector ?? vector;
      const nextTxs = overrides?.txs ?? txs;
      const nextWei = overrides?.amountWei ?? amountWei;
      const nextSeed = overrides?.seed ?? Number(seed);

      if (nextWei === null || nextWei <= 0n) {
        setError('Enter a positive amount to drain before running the simulation.');
        setPhase('error');
        return;
      }

      const params = new URLSearchParams({
        vector: nextVector,
        txs: String(nextTxs),
        amountWei: nextWei.toString(),
        seed: String(Number.isFinite(nextSeed) ? nextSeed : 1),
      });

      setLines([]);
      setLiveLines(0);
      setResult(null);
      setError(null);
      setElapsed(0);
      setPhase('running');
      startedRef.current = Date.now();
      setStreamUrl(`/api/custom/stream?${params.toString()}`);
    },
    [amountWei, phase, seed, txs, vector],
  );

  const runPreset = useCallback(
    (preset: VectorSpec) => {
      const wei = BigInt(Math.round(preset.defaultAmountEth * 1e6)) * 10n ** 12n;
      setVector(preset.id);
      setTxs(preset.defaultTxs);
      setUnit('ETH');
      setAmountText(String(preset.defaultAmountEth));
      startRun({ vector: preset.id, txs: preset.defaultTxs, amountWei: wei, seed: Number(seed) || 1 });
    },
    [seed, startRun],
  );

  const switchUnit = useCallback(
    (next: Unit) => {
      if (next === unit) return;
      const current = parseAmount(amountText, unit);
      if (current !== null) {
        setAmountText(next === 'WEI' ? current.toString() : weiToEthString(current));
      }
      setUnit(next);
    },
    [amountText, unit],
  );

  const running = phase === 'running';
  const busy = running;
  const minTxs = limits?.txs.min ?? 1;
  const maxTxs = limits?.txs.max ?? 12;

  const metrics: MetricItem[] = useMemo(() => {
    if (!result) return [];
    const top = [...result.detections].sort((a, b) => b.confidence - a.confidence)[0] ?? null;
    return [
      {
        label: 'Extracted',
        value: formatEthAmount(result.artifact?.lossEth ?? '0', 4),
        hint: 'attacker gain · simulated',
        tone: 'threat',
      },
      {
        label: 'Attack vector',
        value: result.vectorLabel,
        hint: activeVector ? activeVector.family : result.vector,
      },
      {
        label: 'Run time',
        value: `${(result.durationMs / 1000).toFixed(2)} s`,
        hint: `${formatGas(result.traceSummary.totalGas)} gas · ${result.traceSummary.nodes} frames`,
      },
      {
        label: 'Verdict',
        value: result.ok ? 'PASS' : 'FAIL',
        hint: 'forge test · local EVM',
        tone: result.ok ? 'safe' : 'threat',
      },
      {
        label: 'Findings',
        value: String(result.detections.length),
        hint: top ? `${top.label} · ${formatPct(top.confidence, 0)}` : 'no detector fired',
      },
      {
        label: 'Trace depth',
        value: String(result.traceSummary.maxDepth),
        hint: `${result.traceSummary.valueTransfers} value transfers`,
      },
    ];
  }, [activeVector, result]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="display text-[2rem] font-medium leading-none text-ink sm:text-[2.35rem]">
              Custom Attack Lab
            </h1>
            <p className="mt-2 max-w-[66ch] text-sm leading-relaxed text-ink-dim">
              Parameterise a real Foundry exploit against a deliberately vulnerable vault, watch the call tree
              assemble live, then read the detector findings and take the evidence bundle.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip" title={options?.test.file ?? 'test/CustomAttack.t.sol'}>
              <Terminal className="h-3 w-3" aria-hidden />
              forge test -vvvv
            </span>
            {options?.toolchain ? (
              options.toolchain.foundry ? (
                <span className="chip chip-safe">Foundry ready</span>
              ) : (
                <span className="chip chip-warn">Foundry missing</span>
              )
            ) : null}
          </div>
        </div>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-ink-faint">
          <FlaskConical className="h-3 w-3 text-ink-dim" aria-hidden />
          <span className="text-ink-dim">Local Foundry simulation</span>
          <span aria-hidden>·</span>
          <span>not mainnet evidence</span>
          <span aria-hidden>·</span>
          <span>detectors are heuristic</span>
        </p>
      </header>

      {optionsError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[9px] border border-arterial/35 bg-arterial/[0.06] px-3.5 py-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-arterial" aria-hidden />
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-dim">
            The attack catalogue did not load. Recovery: confirm the dev server is running, then reload the catalogue.
          </p>
          <button type="button" className="btn py-1 text-[0.7rem]" onClick={reload}>
            <RotateCcw className="h-3 w-3" aria-hidden /> Reload catalogue
          </button>
        </div>
      ) : null}

      <section aria-label="Presets" className="flex flex-wrap items-center gap-2">
        <MicroLabel>Presets</MicroLabel>
        {optionsLoading && !vectors.length
          ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-8 w-28" />)
          : vectors.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="btn h-8 px-2.5 text-[0.72rem]"
                onClick={() => runPreset(preset)}
                disabled={busy}
                title={`${preset.drains} — breaks: ${preset.assumption}`}
              >
                <Zap className="h-3 w-3 text-arterial" aria-hidden />
                {preset.label}
                <span className="mono text-[0.56rem] text-ink-faint">{preset.defaultAmountEth} ETH</span>
              </button>
            ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Panel
            title="Attack parameters"
            subtitle={activeVector ? `${activeVector.family} · ${activeVector.severity} severity` : undefined}
          >
            <div className="flex flex-col gap-4">
              <div>
                <MicroLabel>Attack family</MicroLabel>
                <ul role="list" className="mt-2 flex flex-col gap-1.5">
                  {vectors.map((entry) => {
                    const active = entry.id === vector;
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            setVector(entry.id);
                            setTxs(entry.defaultTxs);
                          }}
                          className={`w-full rounded-[9px] border px-3 py-2 text-left transition-colors duration-100 ${
                            active
                              ? 'border-arterial/60 bg-arterial/[0.05]'
                              : 'border-edge bg-abyss/40 hover:border-edge-strong hover:bg-elevated/40'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[entry.severity]}`} aria-hidden />
                            <span className={`text-[0.82rem] font-medium ${active ? 'text-ink' : 'text-ink-dim'}`}>
                              {entry.label}
                            </span>
                            <span className="mono ml-auto text-[0.5rem] uppercase tracking-[0.1em] text-ink-faint">
                              {entry.family}
                            </span>
                          </span>
                          <span className="mt-1 block text-[0.64rem] leading-snug text-ink-faint">
                            Drains: {entry.drains}
                          </span>
                          <span className="mt-0.5 block text-[0.64rem] leading-snug text-ink-faint">
                            Breaks: {entry.assumption}
                          </span>
                          <span className={`mono mt-1 block text-[0.5rem] uppercase tracking-[0.14em] ${SEVERITY_TEXT[entry.severity]}`}>
                            {entry.severity}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {!vectors.length && !optionsError ? (
                    <li className="text-xs text-ink-faint">Loading the catalogue…</li>
                  ) : null}
                </ul>
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <MicroLabel>Attacker transactions</MicroLabel>
                  <span className="mono text-[0.8rem] tabular-nums text-ink">{txs}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="btn h-8 w-8 !min-h-0 !p-0"
                    onClick={() => setTxs((value) => Math.max(minTxs, value - 1))}
                    aria-label="Decrease attacker transactions"
                    disabled={txs <= minTxs}
                  >
                    <Minus className="h-3 w-3" aria-hidden />
                  </button>
                  <input
                    type="range"
                    min={minTxs}
                    max={maxTxs}
                    step={1}
                    value={txs}
                    onChange={(event) => setTxs(Number(event.target.value))}
                    aria-label="Number of attacker transactions"
                    aria-valuetext={`${txs} attacker transactions`}
                    className="min-w-0 flex-1 cursor-pointer"
                    style={{ accentColor: 'var(--hx-arterial)' }}
                  />
                  <button
                    type="button"
                    className="btn h-8 w-8 !min-h-0 !p-0"
                    onClick={() => setTxs((value) => Math.min(maxTxs, value + 1))}
                    aria-label="Increase attacker transactions"
                    disabled={txs >= maxTxs}
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                  </button>
                </div>
                <p className="mono mt-1.5 text-[0.54rem] uppercase tracking-[0.1em] text-ink-faint">
                  {minTxs}–{maxTxs} · interleaved with benign session traffic
                </p>
              </div>

              <div>
                <MicroLabel>Total to drain</MicroLabel>
                <div className="mt-2 flex items-stretch gap-2">
                  <input
                    inputMode="decimal"
                    value={amountText}
                    onChange={(event) => setAmountText(event.target.value)}
                    aria-label="Total amount to drain"
                    aria-invalid={!amountValid}
                    className="mono min-w-0 flex-1 rounded-[9px] border border-edge bg-abyss px-3 py-2 text-sm tabular-nums text-ink"
                  />
                  <div role="group" aria-label="Amount unit" className="flex overflow-hidden rounded-[9px] border border-edge">
                    {(['ETH', 'WEI'] as const).map((candidate) => (
                      <button
                        key={candidate}
                        type="button"
                        aria-pressed={unit === candidate}
                        onClick={() => switchUnit(candidate)}
                        className={`mono px-2.5 py-2 text-[0.6rem] uppercase tracking-[0.1em] transition-colors ${
                          unit === candidate ? 'bg-elevated text-ink' : 'text-ink-faint hover:text-ink-dim'
                        }`}
                      >
                        {candidate}
                      </button>
                    ))}
                  </div>
                </div>
                <p className={`mono mt-1.5 text-[0.54rem] ${amountValid ? 'text-ink-faint' : 'text-arterial'}`}>
                  {amountValid
                    ? `${amountWei?.toString()} wei${unit === 'ETH' ? ' · unit ETH' : ' · unit WEI'}`
                    : `Enter a positive amount up to ${MAX_WEI / 10n ** 18n} ETH`}
                </p>
              </div>

              <div>
                <MicroLabel>Noise seed</MicroLabel>
                <input
                  type="number"
                  min={0}
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                  aria-label="Noise seed"
                  className="mono mt-2 w-full rounded-[9px] border border-edge bg-abyss px-3 py-2 text-sm tabular-nums text-ink"
                />
                <p className="mt-1.5 text-[0.58rem] leading-relaxed text-ink-faint">
                  Seeds the benign session traffic interleaved between attacker transactions.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={() => startRun()}
                disabled={busy || !amountValid}
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Play className="h-4 w-4" aria-hidden />
                )}
                {running ? 'Running simulation' : 'Run simulation'}
              </button>

              <p className="flex items-start gap-2 rounded-[9px] border border-edge bg-panel-2 px-3 py-2 text-[0.64rem] leading-relaxed text-ink-faint">
                <FlaskConical className="mt-0.5 h-3 w-3 shrink-0 text-ink-dim" aria-hidden />
                Local Foundry simulation. Not mainnet evidence.
              </p>

              {options?.toolchain && !options.toolchain.foundry ? (
                <p className="text-[0.64rem] leading-relaxed text-ember">
                  Foundry not found — run `npm run setup:foundry`. Expected binaries under .tools/foundry.
                </p>
              ) : null}
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title="Live execution"
            flush
            bodyClassName="p-3 sm:p-4"
            action={
              <span className="mono flex items-center gap-2 text-[0.56rem] uppercase tracking-[0.12em] text-ink-faint">
                {running ? (
                  <span className="live-dot h-1.5 w-1.5 rounded-full bg-arterial" aria-hidden />
                ) : (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${result ? (result.ok ? 'bg-mint' : 'bg-arterial') : 'bg-edge'}`}
                    aria-hidden
                  />
                )}
                <span className={result && !running ? (result.ok ? 'text-mint' : 'text-arterial') : undefined}>
                  {running ? 'streaming' : result ? (result.ok ? 'pass' : 'fail') : 'idle'}
                </span>
                {running ? (
                  <span className="tabular-nums text-ink-dim">
                    {(elapsed / 1000).toFixed(1)}s · {liveLines} lines
                  </span>
                ) : null}
              </span>
            }
          >
            {phase === 'idle' && !result ? (
              <EmptyState
                title="No run yet"
                hint="Choose a family and run it, or hit a preset. The forge output and the parsed call tree appear here line by line."
              />
            ) : null}

            {phase === 'error' && error ? (
              <ErrorBlock message={error} onRetry={() => startRun()} />
            ) : null}

            {phase === 'running' || phase === 'done' || lines.length > 0 ? (
              <div className="flex flex-col gap-3">
                {phase === 'running' ? (
                  <div className="flex items-center gap-3 rounded-[9px] border border-edge bg-panel-2 px-3 py-2" role="status" aria-live="polite">
                    <span className="live-dot h-2 w-2 shrink-0 rounded-full bg-mint" aria-hidden />
                    <span className="mono text-[0.62rem] uppercase tracking-[0.14em] text-ink">
                      forge test · {vector}
                    </span>
                    <span className="mono text-[0.62rem] tabular-nums text-ink-dim">
                      {(elapsed / 1000).toFixed(1)}s
                    </span>
                    <span className="mono ml-auto text-[0.54rem] uppercase tracking-[0.12em] text-ink-faint">
                      {liveLines} output lines
                    </span>
                  </div>
                ) : null}
                <LiveTraceStream lines={lines} running={phase === 'running'} caseId={result?.caseId ?? null} />
              </div>
            ) : null}
          </Panel>

          {result ? <RunEvidence result={result} activeVector={activeVector} metrics={metrics} onRunAgain={() => startRun()} busy={busy} /> : null}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-ink-faint">
        Every number above comes from <span className="mono">forge test</span> against the contracts in this
        repository. The detectors are heuristic pattern checks, the report is generated from the simulated
        evidence, and nothing here is a replay of mainnet state.
      </p>
    </div>
  );
}

function RunEvidence({
  result,
  activeVector,
  metrics,
  onRunAgain,
  busy,
}: {
  result: RunResult;
  activeVector: VectorSpec | null;
  metrics: MetricItem[];
  onRunAgain: () => void;
  busy: boolean;
}) {
  const artifact = result.artifact;
  const narrative = result.report?.executiveSummary ?? '';
  const caseHref = `/attack-lab?case=${encodeURIComponent(result.caseId)}`;

  return (
    <section aria-labelledby="run-evidence-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="run-evidence-heading" className="display text-lg font-medium text-ink">
            Run evidence · {result.vectorLabel}
          </h2>
          <p className="mono mt-1 text-[0.56rem] uppercase tracking-[0.12em] text-ink-faint">
            {result.caseId} · {result.request.txs} attacker transactions · {weiToEthString(BigInt(result.request.amountWei))} ETH
          </p>
        </div>
        {!result.ok ? (
          <span className="flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-ember">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            forge exited with errors — trace still captured
          </span>
        ) : null}
      </div>

      <MetricStrip items={metrics} />

      {artifact?.rootCause ? (
        <Panel title="Root cause">
          <p className="text-[0.86rem] leading-relaxed text-ink-dim">{artifact.rootCause}</p>
          {activeVector ? (
            <p className="mt-2 text-[0.68rem] leading-relaxed text-ink-faint">
              Trust assumption broken: {activeVector.assumption}
            </p>
          ) : null}
        </Panel>
      ) : null}

      <Panel
        title="Detector findings"
        action={
          <span className="mono text-[0.56rem] uppercase tracking-[0.12em] text-ink-faint">
            {result.detections.length} finding{result.detections.length === 1 ? '' : 's'} · heuristic
          </span>
        }
      >
        <PatternReport findings={result.detections} />
        <p className="mt-3 border-t border-edge pt-2 text-[0.66rem] leading-relaxed text-ink-faint">
          The vector under test is {result.vectorLabel}. Every finding is a heuristic signal; a session with
          repeated frames can also trip the repetition-based re-entrancy rule, so read the evidence rather than
          the count.
        </p>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Call trace" flush bodyClassName="p-3">
          <TraceViewer root={result.trace} />
        </Panel>
        <Panel title="Gas attribution" flush bodyClassName="p-3">
          <GasFlameChart flame={result.flame} />
        </Panel>
      </div>

      <Panel title="Storage diff" flush bodyClassName="p-3">
        <StorageDiffInspector writes={artifact?.storageWrites ?? []} />
      </Panel>

      <Panel title="Balance movements" flush bodyClassName="p-3">
        <BalanceTimeline balances={artifact?.balances ?? []} />
      </Panel>

      {narrative ? (
        <Panel title="Analyst narrative">
          <p className="whitespace-pre-line text-[0.84rem] leading-relaxed text-ink-dim">{narrative}</p>
          <p className="mt-3 text-[0.66rem] leading-relaxed text-ink-faint">
            Generated from the simulated evidence. Treat it as a draft narrative, not a finding of fact.
          </p>
        </Panel>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <a className="btn btn-primary py-1.5 text-xs" href={result.bundleUrl} download>
          <Download className="h-3.5 w-3.5" aria-hidden /> Download forensic bundle
        </a>
        <a className="btn py-1.5 text-xs" href={result.reportUrl} target="_blank" rel="noreferrer">
          <FileJson className="h-3.5 w-3.5" aria-hidden /> Open report JSON
        </a>
        <Link className="btn py-1.5 text-xs" href={caseHref}>
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> Open case view
        </Link>
        <button type="button" className="btn py-1.5 text-xs" onClick={onRunAgain} disabled={busy}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Run again
        </button>
        <span className="mono ml-auto text-[0.54rem] uppercase tracking-[0.12em] text-ink-faint">
          local simulation · not mainnet evidence
        </span>
      </div>
    </section>
  );
}
