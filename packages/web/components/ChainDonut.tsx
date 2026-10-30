'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { TooltipProps } from 'recharts';
import { CHAIN_COLORS, type Chain } from '@helix/core';
import { formatInt, formatPct, formatUsdCompact, formatUsdFull } from '../lib/format';
import { EmptyState } from './Panel';

interface ChainDonutProps {
  data: { chain: Chain; count: number; lossUsd: number }[];
}

interface Datum {
  chain: Chain;
  count: number;
  lossUsd: number;
  color: string;
}

function ChainTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as Datum | undefined;
  if (!point) return null;
  return (
    <div className="rounded-[9px] border border-edge-strong bg-panel px-3 py-2">
      <p className="label-micro">{point.chain}</p>
      <p className="mono mt-1 text-sm text-ink">{formatUsdFull(point.lossUsd)}</p>
      <p className="mono mt-0.5 text-[0.62rem] text-ink-dim">
        {formatInt(point.count)} {point.count === 1 ? 'incident' : 'incidents'}
      </p>
    </div>
  );
}

/** Chain distribution as a donut, with a legend that carries the loss per chain. */
export function ChainDonut({ data }: ChainDonutProps) {
  if (!data.length) {
    return (
      <EmptyState title="No chain data" hint="Chain distribution appears once incidents are loaded." />
    );
  }

  const series: Datum[] = [...data]
    .sort((a, b) => b.lossUsd - a.lossUsd)
    .map((entry) => ({
      chain: entry.chain,
      count: entry.count,
      lossUsd: entry.lossUsd,
      color: CHAIN_COLORS[entry.chain] ?? 'var(--color-ink-faint)',
    }));

  const totalCount = series.reduce((sum, entry) => sum + entry.count, 0);
  const totalLoss = series.reduce((sum, entry) => sum + entry.lossUsd, 0);
  const heaviest = series[0];
  const heavyChains = series.filter((entry) => entry.lossUsd >= 100_000_000).length;

  return (
    <div className="flex flex-1 flex-col justify-between gap-4">
      <div className="relative mx-auto h-[232px] w-full max-w-[286px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={series}
              dataKey="count"
              nameKey="chain"
              innerRadius={72}
              outerRadius={104}
              paddingAngle={2}
              stroke="var(--color-panel)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {series.map((entry) => (
                <Cell key={entry.chain} fill={entry.color} fillOpacity={0.88} />
              ))}
            </Pie>
            <Tooltip content={<ChainTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="display text-xl leading-none text-ink">{formatInt(series.length)}</span>
          <span className="label-micro mt-1.5">chains</span>
        </div>
      </div>

      <ul className="flex flex-col">
        {series.map((entry) => (
          <li
            key={entry.chain}
            className="flex items-center gap-2 border-t border-edge py-2.5 first:border-0"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: entry.color }} />
            <span className="min-w-0 flex-1 truncate text-xs text-ink-dim">{entry.chain}</span>
            <span className="mono text-[0.62rem] text-ink-faint">{formatPct(entry.count / totalCount, 0)}</span>
            <span className="mono w-14 text-right text-[0.68rem] text-ink">
              {formatUsdCompact(entry.lossUsd)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto border-t border-edge pt-2.5">
        <p className="label-micro">Concentration</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-dim">
          {heaviest.chain} carries {formatPct(heaviest.lossUsd / totalLoss, 0)} of tracked loss;{' '}
          {heavyChains} {heavyChains === 1 ? 'chain exceeds' : 'chains exceed'} $100M.
        </p>
        <p className="mono mt-1.5 text-[0.6rem] text-ink-faint">
          {formatUsdCompact(totalLoss)} across {formatInt(totalCount)} incidents
        </p>
      </div>
    </div>
  );
}
