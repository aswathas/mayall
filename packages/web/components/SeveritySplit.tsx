'use client';

import { SEVERITY_COLORS, SEVERITY_ORDER, type Severity } from '@helix/core';
import { formatInt, formatPct } from '../lib/format';

interface SeveritySplitProps {
  data: { severity: Severity; count: number }[];
}

const BANDS: { level: Severity; rule: string }[] = [
  { level: 'critical', rule: '≥ $100M' },
  { level: 'high', rule: '≥ $10M' },
  { level: 'medium', rule: '≥ $1M' },
  { level: 'low', rule: '< $1M' },
];

/**
 * One stacked bar with a text legend — severity never relies on colour alone.
 */
export function SeveritySplit({ data }: SeveritySplitProps) {
  const counts = new Map<Severity, number>(data.map((entry) => [entry.severity, entry.count]));
  const total = SEVERITY_ORDER.reduce((sum, level) => sum + (counts.get(level) ?? 0), 0);

  if (!total) {
    return (
      <p className="font-mono text-[0.66rem] text-ink-faint">
        No severity signal yet — incidents appear here once the registry loads.
      </p>
    );
  }

  const label = SEVERITY_ORDER.map((level) => `${level} ${counts.get(level) ?? 0}`).join(', ');

  return (
    <div className="flex flex-1 flex-col justify-between gap-4">
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full border border-edge bg-elevated"
        role="img"
        aria-label={`Severity split across ${formatInt(total)} incidents: ${label}`}
      >
        {SEVERITY_ORDER.map((level) => {
          const count = counts.get(level) ?? 0;
          if (!count) return null;
          return (
            <span
              key={level}
              style={{ width: `${(count / total) * 100}%`, background: SEVERITY_COLORS[level] }}
              className="h-full"
            />
          );
        })}
      </div>

      <ul className="flex flex-col gap-2">
        {SEVERITY_ORDER.map((level) => {
          const count = counts.get(level) ?? 0;
          return (
            <li key={level} className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: SEVERITY_COLORS[level] }} />
              <span className="font-mono text-[0.64rem] uppercase tracking-[0.12em] text-ink-dim">{level}</span>
              <span className="mono ml-auto text-xs text-ink">{formatInt(count)}</span>
              <span className="mono w-10 text-right text-[0.62rem] text-ink-faint">
                {formatPct(count / total, 0)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-edge pt-2.5">
        <p className="label-micro">Bands · reported loss</p>
        <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1">
          {BANDS.map((band) => (
            <div key={band.level} className="flex items-baseline justify-between gap-2">
              <dt className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-ink-faint">{band.level}</dt>
              <dd className="mono text-[0.6rem] text-ink-dim">{band.rule}</dd>
            </div>
          ))}
        </dl>
        <p className="mono mt-2 text-[0.6rem] text-ink-faint">{formatInt(total)} incidents total</p>
      </div>
    </div>
  );
}
