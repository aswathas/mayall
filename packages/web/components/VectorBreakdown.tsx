'use client';

import { ATTACK_VECTORS, type AttackVectorId } from '@helix/core';
import { severityFromVectors } from '../lib/severity';
import { formatInt, formatPct, formatUsdCompact } from '../lib/format';
import { SeverityChip } from './SeverityChip';
import { VectorChip } from './VectorChip';
import { EmptyState } from './Panel';

interface VectorBreakdownProps {
  data: { id: AttackVectorId; label: string; count: number; lossUsd: number }[];
}

/**
 * Ranked attack-vector list. Each row carries its vector chip, the severity
 * weighting of that class, the case count, the classified loss and its share —
 * with a proportional wash behind the row for the share of loss.
 */
export function VectorBreakdown({ data }: VectorBreakdownProps) {
  if (!data.length) {
    return (
      <EmptyState title="No vector data" hint="Attack-vector classes appear once incidents are classified." />
    );
  }

  const ranked = [...data].sort((a, b) => b.lossUsd - a.lossUsd);
  const classifiedLoss = ranked.reduce((sum, entry) => sum + entry.lossUsd, 0);
  const totalCases = ranked.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div className="flex flex-1 flex-col">
      <ul className="flex flex-col">
        {ranked.map((entry) => {
          const share = classifiedLoss > 0 ? entry.lossUsd / classifiedLoss : 0;
          const severity = severityFromVectors([entry.id]);
          const label = ATTACK_VECTORS[entry.id]?.label ?? entry.label;
          return (
            <li
              key={entry.id}
              className="relative flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 overflow-hidden border-t border-edge px-2 py-2 first:border-0"
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-1 left-0 rounded-[4px] bg-arterial/10"
                style={{ width: `${Math.max(share * 100, 1)}%` }}
              />
              <span className="relative flex items-center gap-1.5">
                <VectorChip vectorId={entry.id} />
                <SeverityChip severity={severity} compact />
                <span className="sr-only">{label}</span>
              </span>
              <span className="relative ml-auto flex shrink-0 items-baseline gap-3">
                <span className="mono text-[0.62rem] text-ink-faint">
                  {formatInt(entry.count)} {entry.count === 1 ? 'case' : 'cases'}
                </span>
                <span className="mono text-xs text-ink">{formatUsdCompact(entry.lossUsd)}</span>
                <span className="mono w-11 text-right text-[0.62rem] text-ink-dim">
                  {formatPct(share, 1)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-auto border-t border-edge pt-2.5 font-mono text-[0.6rem] text-ink-faint">
        {formatInt(ranked.length)} vectors · {formatInt(totalCases)} classifications · incidents with several
        vectors count toward each
      </p>
    </div>
  );
}
