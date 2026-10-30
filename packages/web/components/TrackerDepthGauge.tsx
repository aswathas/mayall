'use client';

import { MicroLabel } from './Panel';

export function TrackerDepthGauge({
  maxDepth,
  currentDepth,
  withdrawCount,
}: {
  maxDepth: number;
  currentDepth: number;
  withdrawCount: number;
}) {
  const ticks = Array.from({ length: Math.max(1, maxDepth + 1) }, (_, index) => index);
  const hasData = maxDepth > 0;

  return (
    <div className="min-w-0">
      <MicroLabel>Call depth</MicroLabel>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="display text-[1.55rem] leading-none tabular-nums text-ink">{currentDepth}</span>
        <span className="mono text-[0.66rem] text-ink-faint">/ {maxDepth}</span>
      </div>
      <p className="mono mt-1 text-[0.62rem] text-ink-faint">deepest frame reached</p>

      <div className="mt-3 flex h-7 items-end gap-1" role="img" aria-label={`Depth gauge: ${currentDepth} of ${maxDepth} call frames`}>
        {ticks.map((depth) => (
          <span
            key={depth}
            className={`w-full ${hasData && depth <= currentDepth ? 'bg-arterial' : 'bg-edge'}`}
            style={{ height: `${28 + (depth / Math.max(1, maxDepth)) * 72}%` }}
          />
        ))}
      </div>

      <div className="mono mt-2 flex items-center justify-between text-[0.56rem] uppercase tracking-[0.1em] text-ink-faint">
        <span className="tabular-nums">{withdrawCount} withdrawals</span>
        <span>nested</span>
      </div>
    </div>
  );
}
