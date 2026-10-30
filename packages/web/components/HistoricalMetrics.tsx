'use client';

import type { MetricItem, MetricTone } from './MetricStrip';

const TONE: Record<MetricTone, string> = {
  default: 'text-ink',
  threat: 'text-arterial',
  warn: 'text-ember',
  safe: 'text-mint',
  signal: 'text-ink',
};

/**
 * The same single-band metric treatment as MetricStrip, but with a responsive
 * grid. The shared metric-strip geometry stays in one row at every width,
 * which is unreadable at 390px; RED-ROOM requires it to wrap to two columns
 * then one, and the shared component cannot be edited from this task.
 */
export function HistoricalMetricBand({
  items,
  desktopColumns = 5,
  className = '',
}: {
  items: MetricItem[];
  desktopColumns?: 4 | 5;
  className?: string;
}) {
  const columns =
    desktopColumns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3 lg:grid-cols-5';
  const mobileSpan = items.length % 2 === 1 ? 'last:col-span-2 sm:last:col-span-1' : '';

  return (
    <div
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-edge bg-edge ${columns} ${className}`}
    >
      {items.map((item, index) => (
        <div
          key={item.label}
          className={`roll-up min-w-0 bg-panel p-4 sm:p-5 ${mobileSpan}`}
          style={{ animationDelay: `${80 + index * 45}ms` }}
        >
          <p className="metric-label">{item.label}</p>
          <p className={`metric-value ${TONE[item.tone ?? 'default']}`}>{item.value}</p>
          {item.hint ? <p className="metric-hint break-words">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
