'use client';

import { MicroLabel } from './Panel';
import { formatGas } from '../lib/format';

export function TrackerGasMeter({
  totalGas,
  currentGas,
  active,
}: {
  totalGas: number;
  currentGas: number;
  active: boolean;
}) {
  const ratio = totalGas > 0 ? Math.max(0, Math.min(1, currentGas / totalGas)) : 0;

  return (
    <div className="min-w-0">
      <MicroLabel>Gas attributed</MicroLabel>
      <p className="display mt-2 text-[1.55rem] leading-none tabular-nums text-ink">{formatGas(currentGas)}</p>
      <p className="mono mt-1 text-[0.62rem] text-ink-faint">of {formatGas(totalGas)} gas in the run</p>

      <div className="relative mt-3 h-1.5 overflow-hidden bg-abyss" role="presentation">
        <div
          className="h-full origin-left bg-arterial"
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>

      <div className="mono mt-2 flex items-center justify-between text-[0.56rem] uppercase tracking-[0.1em] text-ink-faint">
        <span className="tabular-nums">{Math.round(ratio * 100)}%</span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${active ? 'live-dot bg-arterial' : 'bg-ink-faint'}`}
          />
          {active ? 'accruing' : 'settled'}
        </span>
      </div>
    </div>
  );
}
