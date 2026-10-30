'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Check,
  Download,
  FileText,
  FlaskConical,
  Loader2,
  Play,
  RotateCw,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { ForensicReport, SimulationResult } from '@helix/core';
import type { ScenarioSpec } from '@helix/forensic-engine';
import { useApi } from '../../lib/useApi';
import { formatEthAmount, formatGas } from '../../lib/format';
import { MicroLabel, Panel } from '../../components/Panel';
import { VectorChip } from '../../components/VectorChip';
import { ChainChip } from '../../components/ChainChip';
import { LiveSimPanel } from '../../components/LiveSimPanel';
import { ReportView } from '../../components/ReportView';
import { Skeleton } from '../../components/Loading';

interface SuiteState {
  results: SimulationResult[];
  totalMs: number;
}

function Notice({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[9px] border border-arterial/35 bg-arterial/[0.06] px-3.5 py-2.5">
      <TriangleAlert className="h-4 w-4 shrink-0 text-arterial" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-dim">{text}</p>
      {onRetry ? (
        <button type="button" className="btn min-h-11 py-1 text-[0.7rem] sm:min-h-9" onClick={onRetry}>
          <RotateCw className="h-3 w-3" aria-hidden="true" /> Retry
        </button>
      ) : null}
    </div>
  );
}

function LabView() {
  const searchParams = useSearchParams();
  const { data: scenarioData, loading: scenariosLoading, error: scenariosError, reload } =
    useApi<ScenarioSpec[]>('/api/scenarios');
  const scenarios = useMemo(() => scenarioData ?? [], [scenarioData]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, SimulationResult>>({});
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [suite, setSuite] = useState<SuiteState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [report, setReport] = useState<ForensicReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const startedAt = useRef(0);

  const preselected = searchParams.get('scenario');

  useEffect(() => {
    if (!selectedId && preselected) setSelectedId(preselected);
  }, [preselected, selectedId]);

  useEffect(() => {
    if (!selectedId && scenarios.length) setSelectedId(scenarios[0].id);
  }, [scenarios, selectedId]);

  useEffect(() => {
    if (!runningAll && runningId === null) return;
    startedAt.current = Date.now();
    setElapsed(0);
    const tick = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 100);
    return () => window.clearInterval(tick);
  }, [runningAll, runningId]);

  const selected = scenarios.find((scenario) => scenario.id === selectedId) ?? null;
  const selectedResult = selectedId ? results[selectedId] ?? null : null;
  const busy = runningAll || runningId !== null;

  const select = useCallback((scenarioId: string) => {
    setSelectedId(scenarioId);
    setReport(null);
    setReportError(null);
  }, []);

  const runOne = useCallback(async (scenarioId: string) => {
    setSelectedId(scenarioId);
    setRunningId(scenarioId);
    setNotice(null);
    try {
      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId }),
      });
      if (!response.ok) {
        throw new Error(
          `The engine rejected scenario "${scenarioId}" (${response.status}). Confirm Foundry is installed and the scenario builds, then run it again.`,
        );
      }
      const result = (await response.json()) as SimulationResult;
      setResults((previous) => ({ ...previous, [scenarioId]: result }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'The simulation request could not be completed.';
      setNotice(`${detail} Recovery: run the scenario again, or check the engine status in the rail.`);
    } finally {
      setRunningId(null);
    }
  }, []);

  const runAll = useCallback(async () => {
    setRunningAll(true);
    setNotice(null);
    setSuite(null);
    try {
      const response = await fetch('/api/simulate/all', { method: 'POST' });
      if (!response.ok) {
        throw new Error(
          `The full suite stopped at the engine boundary (${response.status}). Start Foundry locally, then run the suite again.`,
        );
      }
      const payload = (await response.json()) as SuiteState;
      const mapped: Record<string, SimulationResult> = {};
      for (const result of payload.results) mapped[result.scenario] = result;
      setResults((previous) => ({ ...previous, ...mapped }));
      setSuite(payload);
      const firstFailure = payload.results.find((result) => !result.ok)?.scenario;
      setSelectedId(firstFailure ?? payload.results[0]?.scenario ?? selectedId ?? null);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'The suite request could not be completed.';
      setNotice(`${detail} Recovery: run a single scenario to isolate the failure.`);
    } finally {
      setRunningAll(false);
    }
  }, [selectedId]);

  const generateReport = useCallback(async (scenarioId: string) => {
    setReportLoading(true);
    setReportError(null);
    try {
      const caseId = `lab-${scenarioId}`;
      const response = await fetch(
        `/api/report/${encodeURIComponent(caseId)}?scenario=${encodeURIComponent(scenarioId)}`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        throw new Error(
          `The report could not be built (${response.status}). Run the scenario first so an artifact exists, then generate again.`,
        );
      }
      setReport((await response.json()) as ForensicReport);
    } catch (error) {
      setReportError(
        error instanceof Error ? error.message : 'The report request could not be completed. Try again.',
      );
    } finally {
      setReportLoading(false);
    }
  }, []);

  const handleLiveResult = useCallback(
    (result: SimulationResult) => {
      setResults((previous) => ({ ...previous, [result.scenario]: result }));
      setSelectedId(result.scenario);
    },
    [],
  );

  const liveProps = selected
    ? { scenarioId: selected.id, onResult: handleLiveResult }
    : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="display text-[2rem] font-medium leading-none text-ink sm:text-[2.35rem]">Live lab</h1>
            <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-ink-dim">
              Fire one exploit reproduction or the whole suite against the local Foundry harness, then read the
              evidence the engine captured.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-primary h-11 px-4 text-sm sm:h-10"
              onClick={() => void runAll()}
              disabled={busy || scenarios.length === 0}
            >
              {runningAll ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
              {runningAll ? 'Suite running' : 'Run full suite'}
            </button>
          </div>
        </div>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-ink-faint">
          <FlaskConical className="h-3 w-3 text-ink-dim" aria-hidden="true" />
          <span className="text-ink-dim">Local Foundry simulation</span>
          <span aria-hidden="true">·</span>
          <span>local EVM only — no mainnet state is touched</span>
          <span aria-hidden="true">·</span>
          <span>forge test -vvvv</span>
        </p>
      </header>

      {runningAll || runningId !== null ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center gap-3 rounded-[9px] border border-edge bg-panel px-3.5 py-2.5"
        >
          <span className="live-dot h-2 w-2 shrink-0 rounded-full bg-mint" aria-hidden="true" />
          <span className="mono text-[0.66rem] uppercase tracking-[0.14em] text-ink">
            {runningAll ? 'Executing suite · 6 scenarios' : `Executing ${runningId}`}
          </span>
          <span className="mono text-[0.66rem] tabular-nums text-ink-dim">
            {(elapsed / 1000).toFixed(1)}s elapsed
          </span>
          <span className="mono ml-auto text-[0.58rem] uppercase tracking-[0.12em] text-ink-faint">
            forge · local anvil
          </span>
        </div>
      ) : null}

      {scenariosError ? (
        <Notice
          text={`The scenario library did not load (${scenariosError}). Recovery: check that the dev server is reachable, then reload the library.`}
          onRetry={reload}
        />
      ) : null}
      {notice ? <Notice text={notice} /> : null}

      <section aria-labelledby="library-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="library-heading" className="display text-lg font-medium text-ink">
            Scenario library
          </h2>
          <span className="mono text-[0.58rem] uppercase tracking-[0.14em] text-ink-faint">
            {scenarios.length ? `${scenarios.length} reproductions · select one` : 'awaiting engine'}
          </span>
        </div>

        {scenariosLoading && !scenarioData ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="panel flex flex-col gap-3 p-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        ) : scenarios.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-edge px-5 py-10 text-center">
            <p className="text-sm text-ink-dim">No scenarios were returned by the engine.</p>
            <p className="mt-1 text-xs text-ink-faint">
              The library reads from the local Foundry harness. Check engine status, then reload the library.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {scenarios.map((scenario) => {
              const result = results[scenario.id];
              const active = scenario.id === selectedId;
              const isRunning = runningId === scenario.id;
              return (
                <li key={scenario.id} className="min-w-0">
                  <article
                    className={`panel relative flex h-full flex-col transition-colors duration-100 ${
                      active ? 'border-arterial/55' : 'hover:border-edge-strong'
                    }`}
                  >
                    {active ? (
                      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-arterial" />
                    ) : null}

                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => select(scenario.id)}
                      className="flex flex-1 flex-col gap-2.5 p-4 text-left"
                    >
                      <span className="flex flex-wrap items-center gap-1.5">
                        <VectorChip vectorId={scenario.vectorId} />
                        <ChainChip chain={scenario.chain} />
                        {active ? (
                          <span className="mono ml-auto flex items-center gap-1 text-[0.55rem] uppercase tracking-[0.14em] text-arterial">
                            <span aria-hidden="true" className="h-1 w-1 rotate-45 bg-arterial" />
                            selected
                          </span>
                        ) : null}
                      </span>

                      <span className="display block text-[0.98rem] font-medium leading-snug text-ink">
                        {scenario.title}
                      </span>
                      <span className="mono block truncate text-[0.6rem] text-ink-faint">
                        {scenario.contractName} · {scenario.testFile}
                      </span>
                      <span className="block text-[0.76rem] leading-relaxed text-ink-dim">
                        {scenario.description}
                      </span>

                      <span className="mt-1 block">
                        <MicroLabel>Look for in the evidence</MicroLabel>
                        <span className="mt-1.5 flex flex-col gap-1">
                          {scenario.lookFor.map((item) => (
                            <span
                              key={item}
                              className="flex items-start gap-1.5 text-[0.68rem] leading-snug text-ink-faint"
                            >
                              <Check
                                className="mt-[3px] h-2.5 w-2.5 shrink-0 text-arterial/80"
                                aria-hidden="true"
                              />
                              <span>{item}</span>
                            </span>
                          ))}
                        </span>
                      </span>
                    </button>

                    <div className="flex items-center gap-2 border-t border-edge px-4 py-2.5">
                      <button
                        type="button"
                        className="btn h-11 px-3 text-[0.72rem] sm:h-8 sm:px-2.5"
                        onClick={() => void runOne(scenario.id)}
                        disabled={busy}
                      >
                        {isRunning ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        ) : result ? (
                          <RotateCw className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <Play className="h-3 w-3" aria-hidden="true" />
                        )}
                        {isRunning ? 'Running' : result ? 'Re-run' : 'Run'}
                      </button>
                      <span className="mono ml-auto flex items-center gap-2 text-[0.58rem] uppercase tracking-[0.08em] text-ink-faint">
                        {result ? (
                          <>
                            <span
                              className={`inline-flex items-center gap-1 ${result.ok ? 'text-mint' : 'text-arterial'}`}
                            >
                              <span
                                aria-hidden="true"
                                className={`h-1.5 w-1.5 rounded-full ${result.ok ? 'bg-mint' : 'bg-arterial'}`}
                              />
                              {result.ok ? 'pass' : 'fail'}
                            </span>
                            <span className="text-ink-dim">{result.durationMs} ms</span>
                            <span className="text-ink-dim">{formatEthAmount(result.artifact?.lossEth ?? '0', 2)}</span>
                          </>
                        ) : (
                          <span>not run</span>
                        )}
                      </span>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {suite ? (
        <Panel
          title="Suite results"
          subtitle={`${suite.results.filter((result) => result.ok).length} of ${suite.results.length} scenarios passed in ${(suite.totalMs / 1000).toFixed(2)} s`}
          flush
        >
          <ul>
            {suite.results.map((result) => {
              const spec = scenarios.find((scenario) => scenario.id === result.scenario);
              const active = result.scenario === selectedId;
              return (
                <li key={result.id} className="border-b border-edge/70 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => select(result.scenario)}
                    className={`flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 ${
                      active ? 'bg-elevated/60' : 'hover:bg-elevated/40'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${result.ok ? 'bg-mint' : 'bg-arterial'}`}
                    />
                    <span
                      className={`mono w-10 shrink-0 text-[0.58rem] uppercase tracking-[0.12em] ${
                        result.ok ? 'text-mint' : 'text-arterial'
                      }`}
                    >
                      {result.ok ? 'pass' : 'fail'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.82rem] text-ink">
                      {spec?.title ?? result.scenario}
                    </span>
                    <span className="mono hidden shrink-0 text-[0.6rem] text-ink-faint sm:inline">
                      {result.durationMs} ms
                    </span>
                    <span className="mono w-24 shrink-0 text-right text-[0.6rem] text-ink-dim">
                      {formatEthAmount(result.artifact?.lossEth ?? '0', 3)}
                    </span>
                    <span className="mono shrink-0 text-[0.58rem] uppercase tracking-[0.12em] text-arterial">
                      inspect
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      <section aria-labelledby="results-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 id="results-heading" className="display text-lg font-medium text-ink">
              {selected ? `Evidence · ${selected.title}` : 'Evidence'}
            </h2>
            <p className="mt-1 max-w-[70ch] text-xs leading-relaxed text-ink-dim">
              {selected
                ? `Attack replay, call trace, gas flame, storage diff, balance movements, detector findings and raw forge output for ${selected.contractName}.`
                : 'Select a scenario to load its evidence views.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn h-11 px-3 text-xs sm:h-9"
              onClick={() => selected && void generateReport(selected.id)}
              disabled={!selected || reportLoading}
            >
              {reportLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Generate report
            </button>
            {selected ? (
              <a
                className="btn h-11 px-3 text-xs sm:h-9"
                href={`/api/bundle/${encodeURIComponent(`lab-${selected.id}`)}?scenario=${encodeURIComponent(selected.id)}`}
                download
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download bundle
              </a>
            ) : null}
          </div>
        </div>

        {selectedResult ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-[9px] border border-edge bg-panel-2 px-3.5 py-2">
            <span className="mono flex items-center gap-1.5 text-[0.6rem] uppercase tracking-[0.12em] text-ink-faint">
              last execution
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${selectedResult.ok ? 'bg-mint' : 'bg-arterial'}`}
              />
              <span className={selectedResult.ok ? 'text-mint' : 'text-arterial'}>
                {selectedResult.ok ? 'pass' : 'fail'}
              </span>
            </span>
            <span className="mono text-[0.6rem] text-ink-dim">{selectedResult.durationMs} ms</span>
            <span className="mono text-[0.6rem] text-ink-dim">
              {formatGas(selectedResult.flame.reduce((sum, node) => sum + node.gasUsed, 0))} gas
            </span>
            <span className="mono text-[0.6rem] text-ink-dim">
              {formatEthAmount(selectedResult.artifact?.lossEth ?? '0', 4)} extracted
            </span>
            <span className="mono text-[0.6rem] text-ink-faint">{selectedResult.detections.length} findings</span>
            <span className="mono ml-auto text-[0.56rem] text-ink-faint">{selectedResult.id}</span>
          </div>
        ) : null}

        {selected && liveProps ? (
          <LiveSimPanel {...liveProps} />
        ) : (
          <div className="rounded-[14px] border border-dashed border-edge px-5 py-12 text-center">
            <p className="text-sm text-ink-dim">No scenario selected.</p>
            <p className="mt-1 text-xs text-ink-faint">
              Pick a scenario above, then run it. The trace, gas flame, storage diff, balances and findings appear here.
            </p>
          </div>
        )}
      </section>

      {reportError ? <Notice text={reportError} onRetry={selected ? () => void generateReport(selected.id) : undefined} /> : null}

      {report ? (
        <section aria-labelledby="report-heading" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="report-heading" className="display text-lg font-medium text-ink">
              Forensic report · {report.caseRef}
            </h2>
            <button type="button" className="btn h-11 px-3 text-[0.72rem] sm:h-8" onClick={() => setReport(null)}>
              <X className="h-3 w-3" aria-hidden="true" /> Close report
            </button>
          </div>
          <ReportView {...{ report, caseId: report.caseRef, scenarioId: selected?.id }} />
        </section>
      ) : null}

      <p className="text-xs leading-relaxed text-ink-faint">
        Every result on this page comes from a Forge execution against contracts in this repository. Read{' '}
        <Link href="/docs" className="text-ink-dim underline decoration-edge-strong underline-offset-2 hover:text-arterial">
          the documentation
        </Link>{' '}
        for what the evidence does and does not prove.
      </p>
    </div>
  );
}

export default function LabPage() {
  return (
    <Suspense
      fallback={
        <div className="panel flex flex-col gap-3 p-5">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      }
    >
      <LabView />
    </Suspense>
  );
}
