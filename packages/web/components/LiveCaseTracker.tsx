import { Radio } from 'lucide-react';
import type { LiveCase } from '../../forensic-engine/src/live-case';
import { formatDate, formatDateTime, formatUsdCompact } from '../lib/format';
import { MetricStrip } from './MetricStrip';

const STRIP_CLASS =
  'grid-flow-row grid-cols-1 sm:grid-cols-2 lg:grid-flow-col lg:grid-cols-5 ' +
  '[&>div]:border-l-0 [&>div]:border-t [&>div:first-child]:border-t-0 ' +
  'lg:[&>div]:border-t-0 lg:[&>div]:border-l lg:[&>div:first-child]:border-l-0 ' +
  'sm:[&>div:last-child]:col-span-2 lg:[&>div:last-child]:col-span-1';

export function LiveCaseTracker({ liveCase, generatedAt }: { liveCase: LiveCase; generatedAt: string }) {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h1 className="display text-[2rem] font-medium leading-[1.04] text-ink sm:text-[2.7rem]">
            {liveCase.name}
          </h1>
          <p className="mt-2 max-w-[80ch] text-sm leading-relaxed text-ink-dim">{liveCase.summary}</p>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
          <span className="label-micro">Live incident readout</span>
          <span className="chip chip-threat">
            <span className="h-1.5 w-1.5 rounded-full bg-arterial threat-dot" aria-hidden="true" />
            {liveCase.statusLabel}
          </span>
          <span className="mono flex items-center gap-1.5 text-[0.58rem] uppercase tracking-[0.12em] text-ink-dim">
            <Radio className="h-3 w-3 shrink-0 text-arterial" aria-hidden="true" />
            {liveCase.statusDetail}
          </span>
        </div>
      </div>

      <MetricStrip
        className={STRIP_CLASS}
        items={[
          {
            label: 'Reported loss',
            value: formatUsdCompact(liveCase.lossUsd),
            hint: 'largest crypto theft on record',
            tone: 'threat',
          },
          {
            label: 'Frozen',
            value: formatUsdCompact(liveCase.frozenUsd),
            hint: 'Binance and partners',
            tone: 'safe',
          },
          {
            label: 'Attribution',
            value: 'High confidence',
            hint: `${liveCase.attribution.confidenceSource} · ${liveCase.attribution.actor}`,
            tone: 'warn',
          },
          {
            label: 'Status',
            value: 'Active investigation',
            hint: 'recovery in progress',
            tone: 'threat',
          },
          {
            label: 'Last updated',
            value: formatDate(liveCase.lastUpdated),
            hint: 'newest source in the record',
          },
        ]}
      />

      <div className="rounded-[9px] border border-edge bg-panel px-4 py-3">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <dt className="label-micro">First signalled</dt>
            <dd className="mono mt-0.5 text-[0.66rem] text-ink-dim">{formatDate(liveCase.firstSignalledAt)}</dd>
          </div>
          <div>
            <dt className="label-micro">Disclosed</dt>
            <dd className="mono mt-0.5 text-[0.66rem] text-ink-dim">{formatDate(liveCase.disclosedAt)}</dd>
          </div>
          <div>
            <dt className="label-micro">Last record update</dt>
            <dd className="mono mt-0.5 text-[0.66rem] text-ink-dim">{formatDate(liveCase.lastUpdated)}</dd>
          </div>
          <div>
            <dt className="label-micro">Readout generated</dt>
            <dd className="mono mt-0.5 text-[0.66rem] text-ink-dim">{formatDateTime(generatedAt)} UTC</dd>
          </div>
          <div>
            <dt className="label-micro">Sources</dt>
            <dd className="mono mt-0.5 text-[0.66rem] text-ink-dim">{liveCase.sources.length} published reports</dd>
          </div>
        </dl>
        <p className="mt-2.5 border-t border-edge pt-2.5 text-xs leading-relaxed text-ink-dim">
          <span className="label-micro mr-2">Attribution</span>
          {liveCase.attribution.confidenceSource}: {liveCase.attribution.confidence} — {liveCase.attribution.actor}.
        </p>
      </div>
    </header>
  );
}
