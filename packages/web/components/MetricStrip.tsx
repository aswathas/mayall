import type { ReactNode } from 'react';

export type MetricTone = 'default' | 'threat' | 'warn' | 'safe' | 'signal';

export interface MetricItem {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: MetricTone;
}

const TONE: Record<MetricTone, string> = {
  default: 'text-ink',
  threat: 'text-arterial',
  warn: 'text-ember',
  safe: 'text-mint',
  signal: 'text-ink',
};

/**
 * The overview's headline numbers live in ONE bordered band with hairline
 * separators — not a row of identical cards. Values use the display face with
 * tabular numerals so digits do not jitter when they change.
 */
export function MetricStrip({ items, className = '' }: { items: MetricItem[]; className?: string }) {
  return (
    <div className={`metric-strip ${className}`}>
      {items.map((item, index) => (
        <div
          key={item.label}
          className="metric-cell roll-up"
          style={{ animationDelay: `${80 + index * 45}ms` }}
        >
          <p className="metric-label">{item.label}</p>
          <p className={`metric-value ${TONE[item.tone ?? 'default']}`}>{item.value}</p>
          {item.hint ? <p className="metric-hint">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
