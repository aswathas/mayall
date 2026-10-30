'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
  Copy,
  Download,
  FileText,
  FlaskConical,
  Loader2,
  Play,
  RefreshCw,
  Search,
} from 'lucide-react';
import type { ForensicReport, Incident, SimulationResult } from '@helix/core';
import type { ScenarioSpec } from '@helix/forensic-engine';
import { useApi } from '../lib/useApi';
import { formatEthAmount, formatGas, formatInt } from '../lib/format';
import { ChainChip } from './ChainChip';
import { SeverityChip } from './SeverityChip';
import { VectorChip } from './VectorChip';
import { EmptyState, Panel, SubBlock } from './Panel';
import { SimSummary } from './SimSummary';
import { TraceViewer } from './TraceViewer';
import { GasFlameChart } from './GasFlameChart';
import { StorageDiffInspector } from './StorageDiffInspector';
import { BalanceTimeline } from './BalanceTimeline';
import { PatternReport } from './PatternReport';
import { ReportView } from './ReportView';
import { ErrorBlock, LoadingBlock } from './Loading';
import { BundleManifest } from './BundleManifest';
import { ChainOfCustody } from './ChainOfCustody';
import type {
  BundleManifestData,
  CaseEvidencePayload,
  EvidenceCaseSummary,
} from './EvidenceWorkbenchLoader';

export interface EvidenceWorkbenchProps {
  initialCases: EvidenceCaseSummary[];
  initialEvidence: CaseEvidencePayload;
}

export function EvidenceWorkbench({ initialCases, initialEvidence }: EvidenceWorkbenchProps) {
  const { data: scenariosData } = useApi<ScenarioSpec[]>('/api/scenarios');
  const { data: incidentsData } = useApi<Incident[]>('/api/incidents');
  const { data: indexData } = useApi<{ cases: EvidenceCaseSummary[]; defaultCaseId: string }>('/api/evidence');

  const [selectedId, setSelectedId] = useState<string>(initialEvidence.caseId || 'reentrancy');
  const [evidence, setEvidence] = useState<CaseEvidencePayload>(initialEvidence);
  const [manifest, setManifest] = useState<BundleManifestData | null>(initialEvidence.manifest);
  const [reportOverride, setReportOverride] = useState<ForensicReport | null>(null);
  const [markdownText, setMarkdownText] = useState<string>(initialEvidence.reportMarkdown);

  const [loadingCase, setLoadingCase] = useState(false);
  const [runningSim, setRunningSim] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traceFilter, setTraceFilter] = useState('');
  const [copiedTarget, setCopiedTarget] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  // Merge cases from /api/scenarios, /api/incidents, and /api/evidence
  const allCases = useMemo(() => {
    const base = indexData?.cases?.length ? indexData.cases : initialCases;
    const byId = new Map<string, EvidenceCaseSummary>();
    for (const item of base) {
      byId.set(item.id, item);
    }

    if (scenariosData) {
      for (const spec of scenariosData) {
        if (!byId.has(spec.id)) {
          const linked = incidentsData?.find((i) => i.scenarioId === spec.id) ?? null;
          byId.set(spec.id, {
            id: spec.id,
            caseRef: `lab-${spec.id}`,
            scenarioId: spec.id,
            incidentSlug: linked?.slug ?? null,
            title: spec.title,
            subtitle: `${spec.contractName} · ${spec.testFile}`,
            kind: 'scenario',
            vectorId: spec.vectorId,
            chain: spec.chain,
            contractName: spec.contractName,
            severity: 'critical',
            lossEth: '0',
            lossUsd: linked?.lossUsd ?? 0,
            exploited: true,
            reproducible: true,
            hasTrace: true,
            hasBundle: true,
            stepsCount: 3,
            storageMutations: 1,
            balancesCount: 3,
            detectionsCount: 1,
            topDetection: spec.title,
            confidence: 0.9,
            description: spec.description,
          });
        }
      }
    }

    if (incidentsData) {
      for (const inc of incidentsData) {
        if (!byId.has(inc.slug) && !inc.reproducible) {
          byId.set(inc.slug, {
            id: inc.slug,
            caseRef: inc.slug,
            scenarioId: null,
            incidentSlug: inc.slug,
            title: inc.name,
            subtitle: `${inc.target} · public disclosure only`,
            kind: 'incident',
            vectorId: inc.vectors[0] ?? 'logic-error',
            chain: inc.chain,
            contractName: inc.target,
            severity: 'high',
            lossEth: inc.lossAmount ?? '0',
            lossUsd: inc.lossUsd,
            exploited: true,
            reproducible: false,
            hasTrace: false,
            hasBundle: true,
            stepsCount: 0,
            storageMutations: 0,
            balancesCount: 0,
            detectionsCount: 0,
            topDetection: null,
            confidence: 0,
            description: inc.summary,
          });
        }
      }
    }

    return Array.from(byId.values());
  }, [indexData, initialCases, scenariosData, incidentsData]);

  const scenarioCases = useMemo(() => allCases.filter((c) => c.kind === 'scenario'), [allCases]);
  const customRunCases = useMemo(() => allCases.filter((c) => c.kind === 'custom-run'), [allCases]);
  const publicOnlyCases = useMemo(() => allCases.filter((c) => c.kind === 'incident'), [allCases]);

  const activeSummary = useMemo(
    () => allCases.find((c) => c.id === selectedId) ?? allCases[0] ?? null,
    [allCases, selectedId],
  );

  const loadCase = useCallback(async (caseId: string, scenarioId: string | null) => {
    setSelectedId(caseId);
    setLoadingCase(true);
    setError(null);

    const query = scenarioId ? `?scenario=${encodeURIComponent(scenarioId)}` : '';
    const reportCaseId = scenarioId && caseId === scenarioId ? `lab-${scenarioId}` : caseId;

    try {
      const [evRes, manRes, repRes, mdRes] = await Promise.all([
        fetch(`/api/evidence/${encodeURIComponent(caseId)}${query}`, { cache: 'no-store' }),
        fetch(`/api/evidence/${encodeURIComponent(caseId)}/manifest${query}`, { cache: 'no-store' }),
        fetch(`/api/report/${encodeURIComponent(reportCaseId)}${query}`, { cache: 'no-store' }),
        fetch(`/api/report/${encodeURIComponent(reportCaseId)}/markdown${query}`, { cache: 'no-store' }),
      ]);

      if (!evRes.ok) {
        throw new Error(`Failed to load evidence for "${caseId}" (${evRes.status} ${evRes.statusText})`);
      }

      const evData = (await evRes.json()) as CaseEvidencePayload;
      setEvidence(evData);

      if (manRes.ok) {
        const manData = (await manRes.json()) as BundleManifestData;
        setManifest(manData);
      } else {
        setManifest(evData.manifest);
      }

      if (repRes.ok) {
        const repData = (await repRes.json()) as ForensicReport;
        setReportOverride(repData);
      } else {
        setReportOverride(null);
      }

      if (mdRes.ok) {
        const mdText = await mdRes.text();
        setMarkdownText(mdText);
      } else {
        setMarkdownText(evData.reportMarkdown);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch case evidence');
    } finally {
      setLoadingCase(false);
    }
  }, []);

  const runLiveScenario = useCallback(async () => {
    const scenarioId = evidence.scenarioId;
    if (!scenarioId) return;
    setRunningSim(true);
    setError(null);
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId }),
      });
      if (!res.ok) {
        throw new Error(`Foundry simulation failed (${res.status}). Confirm forge is available via /api/status.`);
      }
      const freshSim = (await res.json()) as SimulationResult;
      setEvidence((prev) => ({
        ...prev,
        sim: freshSim,
        artifact: freshSim.artifact,
        traceText: freshSim.traceText,
        trace: freshSim.trace,
        traceLineCount: freshSim.traceText ? freshSim.traceText.split(/\r?\n/).length : 0,
        flame: freshSim.flame,
        detections: freshSim.detections,
      }));
      // Reload manifest and report from API
      await loadCase(selectedId, scenarioId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation execution failed');
    } finally {
      setRunningSim(false);
    }
  }, [evidence.scenarioId, loadCase, selectedId]);

  const copyText = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(key);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedTarget(null), 1500);
    } catch {
      setCopiedTarget(null);
    }
  }, []);

  const activeReport = reportOverride ?? evidence.report;
  const bundleCaseId =
    evidence.scenarioId && evidence.caseId === evidence.scenarioId
      ? `lab-${evidence.scenarioId}`
      : evidence.caseId;
  const scenarioQuery = evidence.scenarioId ? `?scenario=${encodeURIComponent(evidence.scenarioId)}` : '';
  const bundleHref = `/api/bundle/${encodeURIComponent(bundleCaseId)}${scenarioQuery}`;
  const markdownHref = `/api/report/${encodeURIComponent(bundleCaseId)}/markdown${scenarioQuery}`;

  const rawTraceLines = useMemo(() => {
    if (!evidence.traceText) return [];
    const lines = evidence.traceText.split(/\r?\n/);
    if (!traceFilter.trim()) return lines;
    const needle = traceFilter.toLowerCase();
    return lines.filter((line) => line.toLowerCase().includes(needle));
  }, [evidence.traceText, traceFilter]);

  const totalGas = useMemo(
    () => evidence.flame.reduce((sum, node) => sum + node.gasUsed, 0),
    [evidence.flame],
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h1 className="display text-[2rem] font-medium leading-[1.05] text-ink sm:text-[2.5rem]">
              Evidence workbench
            </h1>
            <p className="mt-2 max-w-[74ch] text-sm leading-relaxed text-ink-dim">
              Complete forensic record for a single case on one bench: verbatim <span className="mono text-ink">forge test -vvvv</span> trace
              output, parsed call tree, gas flame graph, 32-byte storage slot diff, ETH balance movements, heuristic
              detector findings, 7-section report, and the SHA-256 bundle manifest.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/trace" className="btn min-h-[44px] px-3.5 text-xs sm:min-h-[38px]">
              How we trace
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            {evidence.scenarioId ? (
              <button
                type="button"
                onClick={() => void runLiveScenario()}
                disabled={runningSim || loadingCase}
                className="btn min-h-[44px] px-3.5 text-xs sm:min-h-[38px]"
              >
                {runningSim ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {runningSim ? 'Running forge…' : 'Re-run Foundry simulation'}
              </button>
            ) : null}
            <a
              href={bundleHref}
              download
              className="btn btn-primary min-h-[44px] px-4 text-xs sm:min-h-[38px]"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Download forensic bundle (.zip)
            </a>
          </div>
        </div>

        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-edge pt-2.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-ink-faint">
          <FlaskConical className="h-3 w-3 text-arterial" aria-hidden="true" />
          <span className="text-ink-dim">Local Foundry simulation</span>
          <span aria-hidden="true">·</span>
          <span>All trace, storage and balance measurements come from local EVM execution, not mainnet state</span>
          <span aria-hidden="true">·</span>
          <span>case::{evidence.caseRef}</span>
        </p>
      </header>

      {error ? (
        <ErrorBlock
          message={error}
          onRetry={() => void loadCase(selectedId, activeSummary?.scenarioId ?? evidence.scenarioId)}
        />
      ) : null}

      {/* 0. CASE SELECTOR */}
      <Panel
        title="Case selector"
        subtitle={`${scenarioCases.length} local Foundry scenarios · ${customRunCases.length} captured custom runs · sourced from /api/scenarios & /api/incidents`}
        action={
          <button
            type="button"
            onClick={() => void loadCase(selectedId, activeSummary?.scenarioId ?? evidence.scenarioId)}
            disabled={loadingCase}
            className="btn btn-ghost min-h-[44px] px-2.5 text-xs sm:min-h-[32px]"
          >
            <RefreshCw className={`h-3 w-3 ${loadingCase ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh evidence
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          <SubBlock title="Local Foundry scenarios (6)">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {scenarioCases.map((item) => {
                const active = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => void loadCase(item.id, item.scenarioId)}
                    className={`flex min-h-[44px] flex-col gap-1.5 rounded-[9px] border p-3 text-left transition-colors duration-100 ${
                      active
                        ? 'border-arterial bg-elevated text-ink'
                        : 'border-edge bg-abyss/50 text-ink-dim hover:border-edge-strong hover:bg-elevated/60 hover:text-ink'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="display text-sm font-medium text-ink">{item.title}</span>
                      <span className="mono text-[0.65rem] tabular-nums text-arterial">
                        {formatEthAmount(item.lossEth, 2)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <VectorChip vectorId={item.vectorId} />
                      <ChainChip chain={item.chain} />
                      <span className="mono ml-auto text-[0.58rem] text-ink-faint">{item.contractName}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </SubBlock>

          {customRunCases.length > 0 ? (
            <SubBlock title="Captured custom runs on disk (artifacts/runs/*)">
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {customRunCases.map((item) => {
                  const active = item.id === selectedId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => void loadCase(item.id, item.scenarioId)}
                      className={`flex min-h-[44px] flex-col gap-1.5 rounded-[9px] border p-3 text-left transition-colors duration-100 ${
                        active
                          ? 'border-arterial bg-elevated text-ink'
                          : 'border-edge bg-abyss/50 text-ink-dim hover:border-edge-strong hover:bg-elevated/60 hover:text-ink'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="display text-sm font-medium text-ink">{item.title}</span>
                        <span className="chip !py-0 text-[0.55rem]">run folder</span>
                      </div>
                      <p className="mono truncate text-[0.62rem] text-ink-faint">{item.subtitle}</p>
                    </button>
                  );
                })}
              </div>
            </SubBlock>
          ) : null}

          {publicOnlyCases.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="incident-case-select" className="label-micro">
                  Inspect public incident record (no local PoC):
                </label>
                <select
                  id="incident-case-select"
                  value={publicOnlyCases.some((c) => c.id === selectedId) ? selectedId : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      void loadCase(e.target.value, null);
                    }
                  }}
                  className="min-h-[44px] rounded-[9px] border border-edge-strong bg-elevated px-3 py-1.5 font-mono text-xs text-ink sm:min-h-[34px]"
                >
                  <option value="">Select unsimulated incident to verify empty states…</option>
                  {publicOnlyCases.map((inc) => (
                    <option key={inc.id} value={inc.id}>
                      {inc.title} ({inc.chain}) — no local PoC
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2 font-mono text-[0.6rem] text-ink-faint">
                <span>Active case:</span>
                <span className="text-ink">{evidence.caseRef}</span>
                {evidence.artifact ? (
                  <SeverityChip severity={evidence.artifact.severity} compact />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </Panel>

      {/* Summary metric band */}
      <SimSummary
        result={evidence.sim}
        scenarioTitle={activeSummary?.title ?? evidence.scenarioSpec?.title ?? evidence.caseRef}
      />

      {loadingCase ? (
        <Panel title="Synchronising case evidence">
          <LoadingBlock label="Loading case evidence from disk" rows={5} />
        </Panel>
      ) : null}

      {/* 1. RAW EVIDENCE */}
      <Panel
        title="Raw evidence — verbatim forge trace"
        subtitle={`evidence/trace.txt · ${formatInt(evidence.traceLineCount)} lines · ${formatInt(evidence.traceText.length)} bytes · local Foundry simulation`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 h-3 w-3 text-ink-faint" aria-hidden="true" />
              <input
                type="search"
                value={traceFilter}
                onChange={(e) => setTraceFilter(e.target.value)}
                placeholder="Filter trace lines…"
                aria-label="Filter raw trace lines"
                className="min-h-[44px] rounded-[9px] border border-edge bg-abyss pl-7 pr-2.5 font-mono text-xs text-ink placeholder:text-ink-faint sm:min-h-[32px]"
              />
            </div>
            <button
              type="button"
              disabled={!evidence.traceText}
              onClick={() => void copyText('raw-trace', evidence.traceText)}
              aria-label="Copy verbatim forge trace text"
              className="btn min-h-[44px] px-3 text-xs sm:min-h-[32px]"
            >
              {copiedTarget === 'raw-trace' ? (
                <Check className="h-3.5 w-3.5 text-mint" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {copiedTarget === 'raw-trace' ? 'Copied trace' : 'Copy raw trace'}
            </button>
          </div>
        }
      >
        {evidence.traceText ? (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-ink-faint">
              <span>Command: {evidence.sim.command || 'forge test -vvvv'}</span>
              <span className="tabular-nums">
                Showing {formatInt(rawTraceLines.length)} of {formatInt(evidence.traceLineCount)} lines
              </span>
            </div>

            <div className="scroll-y max-h-[440px] overflow-x-auto rounded-[9px] border border-edge bg-abyss/80 p-3">
              {rawTraceLines.length ? (
                <pre className="font-mono text-[0.7rem] leading-[1.55] text-ink-dim">
                  {rawTraceLines.map((line, idx) => {
                    const isWithdraw = /withdraw\s*\(/i.test(line);
                    const isValue = /value:\s*[1-9]/.test(line);
                    return (
                      <div
                        key={idx}
                        className={`flex gap-3 px-1.5 py-0.5 ${
                          isWithdraw
                            ? 'bg-arterial/[0.08] text-ink'
                            : isValue
                              ? 'text-amber'
                              : ''
                        }`}
                      >
                        <span className="w-9 shrink-0 select-none text-right tabular-nums text-ink-faint">
                          {idx + 1}
                        </span>
                        <span className="whitespace-pre">{line}</span>
                      </div>
                    );
                  })}
                </pre>
              ) : (
                <EmptyState
                  title="No matching trace lines"
                  hint={`No line in evidence/trace.txt matched "${traceFilter}". Clear the filter to inspect the full output.`}
                />
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            title="No raw trace captured"
            hint="This case has no local Foundry trace on disk. Select one of the six local scenarios or run the simulation in the lab to capture forge -vvvv output."
          />
        )}
      </Panel>

      {/* 2. PARSED CALL TREE */}
      <Panel
        title="Parsed call tree"
        subtitle={`TraceViewer · ${formatInt(evidence.traceNodeCount)} parsed frames · depth = floor(branchIndex / 4) · local Foundry simulation`}
        action={
          <Link href="/trace" className="btn btn-ghost min-h-[44px] px-2.5 text-xs sm:min-h-[30px]">
            How depth is parsed
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        }
      >
        <TraceViewer root={evidence.trace} />
      </Panel>

      {/* 3. GAS FLAME GRAPH */}
      <Panel
        title="Gas flame graph"
        subtitle={`GasFlameChart · ${formatInt(evidence.flame.length)} frames · ${formatGas(totalGas)} total gas attributed · local Foundry simulation`}
      >
        <GasFlameChart flame={evidence.flame} />
      </Panel>

      {/* 4. STORAGE DIFF */}
      <Panel
        title="Storage diff"
        subtitle="StorageDiffInspector · 32-byte slot values before vs after execution · local Foundry simulation"
      >
        <StorageDiffInspector writes={evidence.artifact?.storageWrites ?? []} />
      </Panel>

      {/* 5. BALANCE TIMELINE */}
      <Panel
        title="Balance timeline"
        subtitle="BalanceTimeline · account ETH balances in wei before and after the exploit transaction · local Foundry simulation"
      >
        <BalanceTimeline balances={evidence.artifact?.balances ?? []} />
      </Panel>

      {/* 6. DETECTION FINDINGS */}
      <Panel
        title="Detection findings"
        subtitle={`PatternReport · ${formatInt(evidence.detections.length)} heuristic detector hit(s) across 10 rules · local Foundry simulation`}
      >
        <PatternReport findings={evidence.detections} showDiagrams={true} />
      </Panel>

      {/* 7. REPORT (ReportView + Markdown from /api/report/<caseId>/markdown) */}
      <section aria-labelledby="workbench-report-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2 border-t border-edge pt-4">
          <div>
            <h2 id="workbench-report-heading" className="display text-xl font-medium text-ink">
              Forensic report
            </h2>
            <p className="mt-1 text-xs text-ink-dim">
              Structured 7-section report assembled from the local Foundry simulation, plus the verbatim Markdown from{' '}
              <span className="mono text-ink">/api/report/{bundleCaseId}/markdown</span>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={markdownHref}
              download={`${bundleCaseId}-report.md`}
              className="btn min-h-[44px] px-3 text-xs sm:min-h-[34px]"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              Download report (.md)
            </a>
          </div>
        </div>

        <ReportView
          report={activeReport}
          caseId={bundleCaseId}
          scenarioId={evidence.scenarioId}
          showDiagrams={false}
        />

        <Panel
          title="Verbatim report markdown"
          subtitle={`Fetched from /api/report/${bundleCaseId}/markdown · ${formatInt(markdownText.length)} bytes`}
          action={
            <button
              type="button"
              disabled={!markdownText}
              onClick={() => void copyText('report-md', markdownText)}
              aria-label="Copy report markdown"
              className="btn min-h-[44px] px-3 text-xs sm:min-h-[32px]"
            >
              {copiedTarget === 'report-md' ? (
                <Check className="h-3.5 w-3.5 text-mint" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {copiedTarget === 'report-md' ? 'Copied markdown' : 'Copy markdown'}
            </button>
          }
        >
          {markdownText ? (
            <pre className="scroll-y max-h-[360px] overflow-x-auto whitespace-pre-wrap rounded-[9px] border border-edge bg-abyss/70 p-3.5 font-mono text-[0.72rem] leading-relaxed text-ink-dim">
              {markdownText}
            </pre>
          ) : (
            <EmptyState
              title="No report markdown produced"
              hint="Generate or select a case to view its serialized Markdown report."
            />
          )}
        </Panel>
      </section>

      {/* 8. BUNDLE MANIFEST + CHAIN OF CUSTODY */}
      <BundleManifest manifest={manifest} bundleHref={bundleHref} />
      <ChainOfCustody custody={manifest} bundleHref={bundleHref} />
    </div>
  );
}
