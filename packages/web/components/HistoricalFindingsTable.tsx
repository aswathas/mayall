'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { HistoricalIncidentAnalysis } from '@helix/forensic-engine';
import { formatDate, formatPct, formatUsdCompact, formatUsdFull } from '../lib/format';
import { EmptyState } from './Panel';
import { SeverityChip } from './SeverityChip';
import { ChainChip } from './ChainChip';
import { VectorChip } from './VectorChip';

function ConfidenceCell({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div className="flex min-w-[92px] flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="mono text-[0.66rem] tabular-nums text-ink">{formatPct(clamped, 0)}</span>
      </div>
      <span
        className="block h-[2px] w-full bg-edge"
        role="img"
        aria-label={`classification confidence ${formatPct(clamped, 0)}`}
      >
        <span className="block h-full bg-arterial" style={{ width: `${clamped * 100}%` }} />
      </span>
    </div>
  );
}

export function HistoricalFindingsTable({ incidents }: { incidents: HistoricalIncidentAnalysis[] }) {
  if (!incidents.length) {
    return (
      <EmptyState
        title="No findings"
        hint="The registry did not return an incident with a classified vector."
      />
    );
  }

  return (
    <div className="scroll-y min-w-0 max-w-full overflow-x-auto">
      <table className="data-table min-w-[1020px]" aria-label="Historical findings per incident">
        <thead>
          <tr>
            <th>Incident</th>
            <th>Chain</th>
            <th className="text-right">Reported loss</th>
            <th>Vectors</th>
            <th>Bible pattern</th>
            <th>Confidence</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((incident) => {
            const primary = incident.findings[0];
            const extra = incident.vectors.length - 2;
            return (
              <tr key={incident.slug}>
                <td>
                  <div className="flex flex-col gap-1">
                    <Link
                      href={`/historical/${incident.slug}`}
                      className="inline-flex min-h-11 items-center gap-1.5 text-[0.86rem] font-medium text-ink transition-colors duration-100 hover:text-arterial sm:min-h-0"
                    >
                      {incident.name}
                      <ArrowUpRight className="h-3 w-3 shrink-0 text-ink-faint" aria-hidden="true" />
                    </Link>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.64rem] text-ink-faint">
                      <span>{incident.target}</span>
                      <span aria-hidden="true">·</span>
                      <span className="mono">{formatDate(incident.date)}</span>
                      <SeverityChip severity={incident.severity} compact />
                    </span>
                  </div>
                </td>
                <td>
                  <ChainChip chain={incident.chain} />
                </td>
                <td className="text-right">
                  <span className="mono tabular-nums text-ink" title={formatUsdFull(incident.lossUsd)}>
                    {formatUsdCompact(incident.lossUsd)}
                  </span>
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {incident.vectors.slice(0, 2).map((vector) => (
                      <VectorChip key={vector} vectorId={vector} />
                    ))}
                    {extra > 0 ? (
                      <span className="chip text-ink-faint" title={incident.vectors.slice(2).join(', ')}>
                        +{extra}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td>
                  {primary ? (
                    <div className="flex max-w-[15rem] flex-col gap-0.5">
                      <span className="text-[0.78rem] leading-snug text-ink">{primary.biblePattern}</span>
                      <span className="mono text-[0.56rem] uppercase tracking-[0.1em] text-ink-faint">
                        {primary.bibleFamily}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-ink-faint">unclassified</span>
                  )}
                </td>
                <td>
                  <ConfidenceCell value={incident.topConfidence} />
                </td>
                <td>
                  <span className={`chip ${incident.reproducible ? 'chip-safe' : 'chip-warn'}`}>
                    {incident.reproducible ? 'reproduced' : 'retrospective'}
                  </span>
                  <div className="mono mt-1 text-[0.54rem] uppercase tracking-[0.1em] text-ink-faint">
                    {incident.signalCounts.observed} observed · {incident.signalCounts.expected} expected
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
