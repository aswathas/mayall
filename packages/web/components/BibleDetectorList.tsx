import { AlertTriangle } from 'lucide-react';
import type { DetectorRule } from '@helix/forensic-engine';
import { SeverityChip } from './SeverityChip';
import { MicroLabel } from './Panel';

/**
 * Every shipped detector rule that watches one vector. The limitation is part
 * of the rule and is printed in place — a heuristic that hides its weak spot is
 * a marketing claim, not an instrument.
 */
export function BibleDetectorList({
  detectors,
  vectorLabel,
}: {
  detectors: DetectorRule[];
  vectorLabel: string;
}) {
  if (detectors.length === 0) {
    return (
      <div className="rounded-[9px] border border-dashed border-edge px-4 py-5">
        <p className="label-micro flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3 text-ember" aria-hidden="true" />
          No detector in the catalogue
        </p>
        <p className="mt-2 max-w-[80ch] text-[0.82rem] leading-relaxed text-ink-dim">
          The engine ships no rule that watches for {vectorLabel} directly. A loss of this kind is
          only attributed when the artifact names the broken invariant, in which case the residual
          Invariant / Logic Error rule can fire — a weaker, vocabulary-dependent claim than a named
          detector.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col">
      {detectors.map((detector) => (
        <li
          key={detector.id}
          className="border-t border-edge py-4 first:border-t-0 first:pt-0 last:pb-0"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="display text-[0.98rem] font-medium leading-snug text-ink">
              {detector.label}
            </h3>
            <SeverityChip severity={detector.baseSeverity} compact />
          </div>
          <p className="mono mt-1 text-[0.6rem] uppercase tracking-[0.1em] text-ink-faint">
            {detector.id}
          </p>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <MicroLabel>Looks for</MicroLabel>
              <p className="mt-1 text-[0.8rem] leading-relaxed text-ink-dim">
                {detector.looksFor}
              </p>
            </div>
            <div>
              <MicroLabel>Emits as evidence</MicroLabel>
              <ul className="mt-1 flex flex-col gap-1">
                {detector.emits.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-[0.8rem] leading-snug text-ink-dim"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-[7px] h-1 w-1 shrink-0 rounded-[1px] bg-arterial"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 border-t border-edge pt-2.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ember" aria-hidden="true" />
            <div>
              <MicroLabel>Limitation</MicroLabel>
              <p className="mt-1 text-[0.8rem] leading-relaxed text-ink-dim">
                {detector.limitation}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
