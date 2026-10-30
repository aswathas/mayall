'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { GasFlameNode } from '@helix/core';
import { formatGas, formatPct } from '../lib/format';
import { EmptyState } from './Panel';

interface GasFlameChartProps {
  flame: GasFlameNode[];
}

interface FlameDatum {
  name: string;
  fullLabel: string;
  gasUsed: number;
  share: number;
  depth: number;
  order: number;
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: FlameDatum;
  maxGas?: number;
}

const MAX_ROWS = 24;

function StaggeredBar({ x = 0, y = 0, width = 0, height = 0, payload, maxGas = 0 }: BarShapeProps) {
  const largest = payload ? payload.gasUsed === maxGas : false;
  return (
    <g
      className="grow-x"
      style={{
        animationDelay: `${(payload?.order ?? 0) * 30}ms`,
        transformBox: 'fill-box',
        transformOrigin: 'left center',
      }}
    >
      <rect
        x={x}
        y={y}
        width={Math.max(0, width)}
        height={height}
        rx={2}
        fill={largest ? 'var(--color-arterial)' : 'var(--color-ink-dim)'}
        fillOpacity={largest ? 0.95 : 0.34}
      />
    </g>
  );
}

export function GasFlameChart({ flame }: GasFlameChartProps) {
  if (!flame.length) {
    return <EmptyState title="No gas data" hint="The simulation did not emit a call trace, so there is no gas to attribute." />;
  }

  const ranked = [...flame].sort((a, b) => b.gasUsed - a.gasUsed);
  const totalGas = flame.reduce((sum, node) => sum + node.gasUsed, 0);
  const rows = ranked.slice(0, MAX_ROWS);
  const maxGas = rows[0]?.gasUsed ?? 0;

  const data: FlameDatum[] = rows.map((node, order) => ({
    name: node.label.length > 30 ? `${node.label.slice(0, 29)}…` : node.label,
    fullLabel: node.label,
    gasUsed: node.gasUsed,
    share: totalGas > 0 ? node.gasUsed / totalGas : node.share,
    depth: node.depth,
    order,
  }));

  const height = Math.max(240, data.length * 30);

  return (
    <div className="flex flex-col gap-2">
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 28, bottom: 4, left: 8 }}
            barCategoryGap={6}
          >
            <CartesianGrid horizontal={false} stroke="var(--color-edge)" strokeDasharray="2 4" />
            <XAxis
              type="number"
              tick={{ fill: 'var(--color-ink-faint)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              tickFormatter={(value: number) => formatGas(value)}
              stroke="var(--color-edge)"
            />
            <YAxis
              type="category"
              dataKey="name"
              width={180}
              tick={{ fill: 'var(--color-ink-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              stroke="var(--color-edge)"
            />
            <Tooltip
              cursor={{ fill: 'var(--color-elevated)' }}
              contentStyle={{
                background: 'var(--color-panel-2)',
                border: '1px solid var(--color-edge-strong)',
                borderRadius: 9,
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-ink)',
              }}
              labelStyle={{ color: 'var(--color-ink-dim)' }}
              itemStyle={{ color: 'var(--color-ink)' }}
              formatter={(value, _name, item) => {
                const datum = (item as { payload?: FlameDatum }).payload;
                const gas = Number(value);
                return [
                  `${formatGas(gas)} gas · ${formatPct(datum?.share ?? 0, 1)} of total`,
                  datum?.fullLabel ?? 'frame',
                ];
              }}
            />
            <Bar
              dataKey="gasUsed"
              isAnimationActive={false}
              shape={(props: unknown) => <StaggeredBar {...(props as BarShapeProps)} maxGas={maxGas} />}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 bg-arterial" aria-hidden />
          largest consumer
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 bg-ink-dim/40" aria-hidden />
          other frames
        </span>
        <span className="ml-auto">
          {ranked.length > MAX_ROWS ? `top ${MAX_ROWS} of ${ranked.length} frames` : `${ranked.length} frames`}
        </span>
      </div>
    </div>
  );
}
