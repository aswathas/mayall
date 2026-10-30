'use client';

import Link from 'next/link';
import { ArrowRight, AlertTriangle, FlaskConical, RefreshCw, ShieldAlert } from 'lucide-react';
import type { AttackVectorId, Chain } from '@helix/core';
import type { OverviewData } from '../lib/types';
import { useApi } from '../lib/useApi';
import { formatInt, formatUsdCompact } from '../lib/format';
import { Panel } from '../components/Panel';
import { MetricStrip } from '../components/MetricStrip';
import { LossTimelineChart } from '../components/LossTimelineChart';
import { VectorBreakdown } from '../components/VectorBreakdown';
import { ChainDonut } from '../components/ChainDonut';
import { SeveritySplit } from '../components/SeveritySplit';
import { IncidentTable } from '../components/IncidentTable';
import { EngineStatus } from '../components/EngineStatus';

const EMPTY_OVERVIEW: OverviewData = {
  totals: { incidents: 0, lossUsd: 0, reproducible: 0, chains: 0, vectors: 0 },
  byVector: [],
  byChain: [],
  timeline: [],
  severity: [],
  topIncidents: [],
};

function Sk({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-elevated ${className}`} />;
}

const METRIC_STRIP_CLASS =
  'grid-flow-row grid-cols-2 gap-px bg-edge lg:grid-flow-col lg:grid-cols-5 ' +
  '[&>div]:border-l-0 [&>div]:bg-panel ' +
  '[&>div:last-child]:col-span-2 lg:[&>div:last-child]:col-span-1';

function MetricStripSkeleton() {
  return (
    <div className={`metric-strip ${METRIC_STRIP_CLASS}`} aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="metric-cell">
          <Sk className="h-2.5 w-20" />
          <Sk className="mt-2.5 h-7 w-24" />
          <Sk className="mt-2 h-2.5 w-28" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Sk className="w-full" />
      <div style={{ height }} className="animate-pulse rounded-md bg-elevated/60" />
      <Sk className="h-3 w-40" />
    </div>
  );
}

export default function OverviewPage() {
  const { data, error, reload } = useApi<OverviewData>('/api/overview');
  const overview = data ?? EMPTY_OVERVIEW;
  const { totals } = overview;
  const ready = Boolean(data);

  const vectorData = overview.byVector.map((entry) => ({
    ...entry,
    id: entry.id as AttackVectorId,
  }));
  const chainData = overview.byChain.map((entry) => ({
    ...entry,
    chain: entry.chain as Chain,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="boot-sweep" aria-hidden="true" />

      <header className="grid grid-cols-12 items-end gap-4">
        <div className="col-span-12 lg:col-span-8">
          <h1 className="display text-[1.9rem] leading-tight text-ink sm:text-[2.35rem]">Exploit landscape</h1>
          <p className="mt-2 max-w-[75ch] text-sm leading-relaxed text-ink-dim">
            Public Web3 exploits and the loss they disclosed, the attack classes behind them, and which of them
            HELIX can reproduce in a local Foundry lab.
          </p>
        </div>
        <div className="col-span-12 flex items-center gap-2 lg:col-span-4 lg:justify-end">
          <Link href="/incidents" className="btn btn-ghost h-10 shrink-0 whitespace-nowrap px-3.5 text-sm">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            Registry
          </Link>
          <Link href="/lab" className="btn btn-primary h-10 shrink-0 whitespace-nowrap px-3.5 text-sm">
            <FlaskConical className="h-4 w-4" aria-hidden="true" />
            Live lab
          </Link>
        </div>
      </header>

      {error ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border border-edge bg-panel px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-ember" aria-hidden="true" />
          <p className="text-sm text-ink">Overview feed unavailable — {error}.</p>
          <p className="text-xs text-ink-dim">
            The page reads <span className="mono">/api/overview</span> from the local console server.
          </p>
          <button type="button" onClick={reload} className="btn btn-ghost ml-auto h-9 px-3 text-xs">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : null}

      {ready ? (
        <MetricStrip
          className={METRIC_STRIP_CLASS}
          items={[
            {
              label: 'Tracked loss',
              value: formatUsdCompact(totals.lossUsd),
              hint: 'reported at disclosure',
              tone: 'threat',
            },
            { label: 'Incidents', value: formatInt(totals.incidents), hint: 'in the registry' },
            {
              label: 'Reproducible',
              value: formatInt(totals.reproducible),
              hint: 'local Foundry PoCs',
              tone: 'safe',
            },
            { label: 'Chains covered', value: formatInt(totals.chains), hint: 'execution environments' },
            { label: 'Attack vectors', value: formatInt(totals.vectors), hint: 'distinct classes' },
          ]}
        />
      ) : (
        <MetricStripSkeleton />
      )}

      <div className="grid grid-cols-12 gap-4">
        <Panel
          title="Loss timeline"
          subtitle="USD · monthly · reported at disclosure"
          className="rise-in col-span-12 lg:col-span-8"
        >
          {ready ? (
            <LossTimelineChart data={overview.timeline} />
          ) : (
            <ChartSkeleton height={272} />
          )}
        </Panel>

        <Panel
          title="Live engine"
          className="rise-in col-span-12 lg:col-span-4"
          bodyClassName="flex flex-col"
        >
          <EngineStatus />
          <Link href="/lab" className="btn btn-primary mt-auto h-10 w-full text-sm">
            Open live lab
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Panel>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Panel
          title="Attack vectors"
          subtitle="Ranked by classified loss"
          className="rise-in col-span-12 lg:col-span-8 xl:col-span-7"
          bodyClassName="flex flex-col"
        >
          {ready ? (
            <VectorBreakdown data={vectorData} />
          ) : (
            <div className="flex flex-col gap-3" aria-hidden="true">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="flex flex-col gap-2">
                  <Sk className="h-5 w-40" />
                  <Sk className="h-1 w-full" />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Chains"
          subtitle="Share of incidents"
          className="rise-in col-span-12 lg:col-span-4 xl:col-span-5"
          bodyClassName="flex flex-col"
        >
          {ready ? (
            <ChainDonut data={chainData} />
          ) : (
            <ChartSkeleton height={184} />
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Panel
          title="Severity split"
          className="rise-in col-span-12 xl:col-span-3"
          bodyClassName="flex flex-col"
        >
          {ready ? (
            <SeveritySplit data={overview.severity} />
          ) : (
            <ChartSkeleton height={10} />
          )}
        </Panel>

        <Panel
          title="Top incidents by loss"
          className="rise-in col-span-12 xl:col-span-9"
          flush
          action={
            <Link
              href="/incidents"
              className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-ink-dim transition-colors duration-100 hover:text-arterial"
            >
              All incidents
            </Link>
          }
        >
          {ready ? (
            <IncidentTable incidents={overview.topIncidents} dense />
          ) : (
            <div className="flex flex-col gap-2 p-4" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, index) => (
                <Sk key={index} className="h-9 w-full" />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <footer className="border-t border-edge pt-4">
        <p className="max-w-[95ch] text-xs leading-relaxed text-ink-dim">
          Every entry is a public disclosure; loss figures are the amounts reported at the time and are rounded.
          HELIX&rsquo;s reproductions are local Foundry simulations of the same exploit logic — they are not replays
          of the original on-chain transactions.
        </p>
      </footer>
    </div>
  );
}
