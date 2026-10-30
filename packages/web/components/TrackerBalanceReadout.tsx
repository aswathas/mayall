'use client';

import { MicroLabel } from './Panel';

export interface BalanceRow {
  label: string;
  before: number;
  after: number;
  current: number;
  delta: number;
  tone: 'threat' | 'safe';
}

function eth(value: number): string {
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ETH`;
}

export function TrackerBalanceReadout({ rows }: { rows: BalanceRow[] }) {
  return (
    <div className="min-w-0">
      <MicroLabel>Balance movement</MicroLabel>
      <p className="mono mt-1 text-[0.62rem] text-ink-faint">real deltas from the run artifact</p>

      <div className="mt-3 flex flex-col gap-3">
        {rows.length === 0 ? (
          <p className="text-[0.72rem] leading-relaxed text-ink-faint">
            No balance deltas have been captured yet.
          </p>
        ) : (
          rows.map((row) => {
            const scale = Math.max(row.before, row.after, 1);
            const ratio = Math.max(0, Math.min(1, row.current / scale));
            const sign = row.delta < 0 ? '−' : '+';
            return (
              <div key={row.label} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="mono truncate text-[0.64rem] text-ink-dim">{row.label}</span>
                  <span className="mono shrink-0 text-[0.64rem] tabular-nums text-ink">{eth(row.current)}</span>
                </div>
                <div className="relative mt-1.5 h-1 overflow-hidden bg-abyss">
                  <div
                    className={`h-full origin-left ${row.tone === 'threat' ? 'bg-arterial' : 'bg-mint'}`}
                    style={{ transform: `scaleX(${ratio})` }}
                  />
                </div>
                <div className="mono mt-1 flex items-center justify-between text-[0.54rem] uppercase tracking-[0.08em] text-ink-faint">
                  <span className="tabular-nums">{eth(row.before)} before</span>
                  <span className={`tabular-nums ${row.delta < 0 ? 'text-arterial' : 'text-mint'}`}>
                    {sign}
                    {eth(Math.abs(row.delta))}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
