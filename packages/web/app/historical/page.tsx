'use client';

import { AlertTriangle, BookOpen, RefreshCw } from 'lucide-react';
import type { HistoricalAnalysis } from '@helix/forensic-engine';
import { useApi } from '../../lib/useApi';
import { formatInt, formatPct, formatUsdCompact } from '../../lib/format';
import { Panel, SubBlock } from '../../components/Panel';
import { HistoricalMetricBand } from '../../components/HistoricalMetrics';
import { HistoricalCoverage, HistoricalBreakdown } from '../../components/HistoricalCoverage';
import { HistoricalFindingsTable } from '../../components/HistoricalFindingsTable';

function HistoricalSkeleton() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-busy="true" aria-label="Loading historical analysis">
      <div className="flex flex-col gap-3">
        <div className="h-9 w-2/3 max-w-md animate-pulse rounded-[4px] bg-elevated" aria-hidden="true" />
        <div className="h-4 w-full max-w-2xl animate-pulse rounded-[4px] bg-elevated" aria-hidden="true" />
      </div>
      <div className="h-24 w-full animate-pulse rounded-[14px] bg-elevated" aria-hidden="true" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 w-full animate-pulse rounded-[14px] bg-elevated" aria-hidden="true" />
        <div className="h-64 w-full animate-pulse rounded-[14px] bg-elevated" aria-hidden="true" />
      </div>
      <div className="h-80 w-full animate-pulse rounded-[14px] bg-elevated" aria-hidden="true" />
    </div>
  );
}

function ReadingGuide() {
  return (
    <Panel title="How to read this analysis" subtitle="what is proven, what is inferred">
      <div className="grid gap-4 md:grid-cols-2">
        <SubBlock title="Retrospective vs reproduced">
          <ul className="flex flex-col gap-2 text-[0.8rem] leading-relaxed text-ink-dim">
            <li>
              <strong className="font-semibold text-ink">Retrospective classification</strong> — the vector and Bible
              pattern are inferred from the incident&apos;s published root cause, summary and registry metadata.
            </li>
            <li>
              <strong className="font-semibold text-ink">Reproduced</strong> — Mayall has a local Foundry scenario for
              the same attack vector. Running it produces a real trace, storage diff and detector output. It is not a
              replay of the historic transaction.
            </li>
            <li>
              <strong className="font-semibold text-ink">Observed</strong> — the published narrative names the
              mechanism a Bible signal detects. This is a record-level statement, never an on-chain log observation.
            </li>
            <li>
              <strong className="font-semibold text-ink">Expected</strong> — the Bible signal would be required to prove
              the pattern from a full trace, but no raw log for the incident is in the registry.
            </li>
          </ul>
        </SubBlock>

        <SubBlock title="Sources">
          <ul className="flex flex-col gap-2 text-[0.8rem] leading-relaxed text-ink-dim">
            <li>
              Incident metadata comes from <span className="mono text-ink">packages/core/src/incidents.ts</span>.
            </li>
            <li>
              Attack patterns are sheet <span className="mono text-ink">04</span> and signals are sheet{' '}
              <span className="mono text-ink">03</span> of{' '}
              <span className="mono text-ink">data/bible/forensic-bible.json</span>.
            </li>
            <li>
              Detector limitations are quoted verbatim from{' '}
              <span className="mono text-ink">DETECTOR_CATALOG</span>; no detector is described as stronger than its
              published limitation.
            </li>
            <li>
              Report bodies are authored by the local MiniMax Code CLI, or by the deterministic writer when the model
              is unavailable. The report page always states which.
            </li>
          </ul>
        </SubBlock>
      </div>

      <p className="mt-4 flex items-start gap-2 border-t border-edge pt-3 text-[0.7rem] leading-relaxed text-ink-faint">
        <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        No loss figure, transaction hash, address or date on this page is generated. Every value is read from the
        registry or the Forensic Bible.
      </p>
    </Panel>
  );
}

export default function HistoricalPage() {
  const { data, loading, error, reload } = useApi<HistoricalAnalysis>('/api/historical');

  if (loading && !data) return <HistoricalSkeleton />;

  if (error && !data) {
    return (
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <h1 className="display text-[1.9rem] leading-tight text-ink sm:text-[2.35rem]">Historical analysis</h1>
          <p className="max-w-[75ch] text-sm leading-relaxed text-ink-dim">
            Retired exploits in the registry, classified against the Forensic Bible. The API did not respond.
          </p>
        </header>
        <Panel title="Analysis unavailable">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-ember" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm text-ink">
              The historical analysis did not load — {error}. The page reads{' '}
              <span className="mono">/api/historical</span> from the local console server.
            </p>
            <button type="button" onClick={reload} className="btn btn-ghost h-11 px-3 text-xs sm:h-9">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          </div>
        </Panel>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="boot-sweep" aria-hidden="true" />

      <header className="flex flex-col gap-2">
        <h1 className="display text-[1.9rem] leading-tight text-ink sm:text-[2.35rem]">Historical analysis</h1>
        <p className="max-w-[78ch] text-sm leading-relaxed text-ink-dim">
          The {formatInt(data.totals.incidents)} real incidents in the registry, classified by Mayall against the Bible
          attack-pattern catalogue and its detection signals. Each finding says whether Mayall can re-execute the
          vector locally or only classify it from the public record.
        </p>
      </header>

      <HistoricalMetricBand
        desktopColumns={5}
        items={[
          {
            label: 'Incidents',
            value: formatInt(data.totals.incidents),
            hint: 'in the registry',
          },
          {
            label: 'Reported loss',
            value: formatUsdCompact(data.totals.lossUsd),
            hint: 'sum of disclosed losses',
            tone: 'threat',
          },
          {
            label: 'Reproduced',
            value: formatInt(data.coverage.reproducible),
            hint: `${formatPct(data.coverage.reproduciblePct, 0)} of incidents · Foundry`,
            tone: 'safe',
          },
          {
            label: 'Findings',
            value: formatInt(data.totals.findings),
            hint: 'incident × recorded vector',
          },
          {
            label: 'Bible signals',
            value: formatInt(data.totals.signalsObserved),
            hint: `observed · ${formatInt(data.totals.signalsExpected)} expected · ${formatInt(
              data.totals.signalsNotApplicable,
            )} n/a`,
          },
        ]}
      />

      <div className="flex items-start gap-3 rounded-[9px] border border-edge bg-panel-2 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden="true" />
        <p className="text-[0.8rem] leading-relaxed text-ink-dim">
          <strong className="font-semibold text-ink">Retrospective, not a mainnet trace.</strong> The analysis is
          metadata-driven classification over public records. The local reproductions are Foundry simulations of the
          same attack vector, not replays of the historic transactions. No claim on this page is derived from mainnet
          calldata.
        </p>
      </div>

      <HistoricalCoverage analysis={data} />

      <Panel
        title="Findings per incident"
        subtitle="one row per incident, ordered by reported loss"
        action={
          <span className="mono text-[0.62rem] text-ink-dim">
            {formatInt(data.incidents.length)} incidents · {formatInt(data.totals.findings)} findings
          </span>
        }
        flush
      >
        <HistoricalFindingsTable incidents={data.incidents} />
      </Panel>

      <HistoricalBreakdown analysis={data} />

      <ReadingGuide />
    </div>
  );
}
