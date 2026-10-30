'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipProps } from 'recharts';
import { formatDateMonth, formatInt, formatUsdCompact, formatUsdFull } from '../lib/format';
import { EmptyState } from './Panel';

export interface TimelinePoint {
  month: string;
  lossUsd: number;
  count: number;
}

interface LossTimelineChartProps {
  data: TimelinePoint[];
}

interface Datum {
  month: string;
  label: string;
  lossUsd: number;
  count: number;
}

function LossTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as Datum | undefined;
  if (!point) return null;
  return (
    <div className="rounded-[9px] border border-edge-strong bg-panel px-3 py-2">
      <p className="label-micro">{point.label}</p>
      <p className="mono mt-1 text-sm text-arterial">{formatUsdFull(point.lossUsd)}</p>
      <p className="mono mt-0.5 text-[0.62rem] text-ink-dim">
        {formatInt(point.count)} {point.count === 1 ? 'incident' : 'incidents'}
      </p>
    </div>
  );
}

/**
 * Monthly loss as an area chart. The gradient is data, not decoration: it only
 * exists under the arterial line so the magnitude reads as volume.
 */
export function LossTimelineChart({ data }: LossTimelineChartProps) {
  if (!data.length) {
    return (
      <EmptyState
        title="No timeline data"
        hint="Monthly loss appears here once incidents are loaded from the registry."
      />
    );
  }

  const series: Datum[] = data.map((point) => ({
    month: point.month,
    label: formatDateMonth(point.month),
    lossUsd: point.lossUsd,
    count: point.count,
  }));

  const total = series.reduce((sum, point) => sum + point.lossUsd, 0);
  const incidents = series.reduce((sum, point) => sum + point.count, 0);
  const peak = series.reduce((best, point) => (point.lossUsd > best.lossUsd ? point : best), series[0]);

  return (
    <div className="flex flex-col gap-3">
      <div className="h-[272px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="helix-loss-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-arterial)" stopOpacity={0.3} />
                <stop offset="55%" stopColor="var(--color-arterial)" stopOpacity={0.09} />
                <stop offset="100%" stopColor="var(--color-arterial)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-edge)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--color-ink-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              axisLine={{ stroke: 'var(--color-edge)' }}
              tickLine={false}
              tickMargin={8}
              interval="preserveStartEnd"
              minTickGap={18}
            />
            <YAxis
              tick={{ fill: 'var(--color-ink-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              axisLine={false}
              tickLine={false}
              width={58}
              tickFormatter={(value: number) => formatUsdCompact(value)}
            />
            <Tooltip content={<LossTooltip />} cursor={{ stroke: 'var(--color-edge-strong)', strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="lossUsd"
              stroke="var(--color-arterial)"
              strokeWidth={1.6}
              fill="url(#helix-loss-fill)"
              dot={false}
              activeDot={{ r: 3, fill: 'var(--color-arterial)', stroke: 'var(--color-panel)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-edge pt-2.5">
        <div className="flex items-baseline gap-2">
          <dt className="label-micro">Window</dt>
          <dd className="mono text-xs text-ink">{formatUsdCompact(total)}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="label-micro">Peak</dt>
          <dd className="mono text-xs text-ink">
            {peak.label} · {formatUsdCompact(peak.lossUsd)}
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="label-micro">Incidents</dt>
          <dd className="mono text-xs text-ink">{formatInt(incidents)}</dd>
        </div>
      </dl>
    </div>
  );
}
