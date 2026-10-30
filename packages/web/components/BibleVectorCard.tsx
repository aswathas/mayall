import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { BibleEntry } from '../data/bible';

/**
 * One row of the published index. Dense and aligned — the index is a reference
 * table, not a card grid, so a row carries the name, the class, the weight, the
 * rules that watch it and whether a proof exists.
 */
export function BibleVectorCard({ entry }: { entry: BibleEntry }) {
  const weightPct = Math.round(entry.severityWeight * 100);

  return (
    <tr>
      <td>
        <Link
          href={`/bible/${entry.id}`}
          className="display group inline-flex items-baseline gap-1 text-[0.92rem] font-medium leading-snug text-ink"
        >
          <span className="group-hover:text-arterial">{entry.label}</span>
          <ArrowUpRight
            className="h-3 w-3 shrink-0 text-ink-faint transition-colors duration-100 group-hover:text-arterial"
            aria-hidden="true"
          />
        </Link>
        <p className="mt-0.5 line-clamp-1 max-w-[58ch] text-[0.7rem] leading-snug text-ink-faint">
          {entry.signature}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.6rem] leading-snug text-ink-faint md:hidden">
          <span className="mono">{entry.severityWeight.toFixed(2)} weight</span>
          <span aria-hidden="true" className="h-2.5 w-px bg-edge" />
          {entry.detectors.length ? (
            <span>{entry.detectors.map((detector) => detector.label).join(', ')}</span>
          ) : (
            <span>no detector watches this</span>
          )}
        </p>
      </td>

      <td className="hidden md:table-cell">
        <span className="mono text-[0.64rem] uppercase tracking-[0.1em] text-ink-dim">
          {entry.category}
        </span>
      </td>

      <td className="hidden sm:table-cell">
        <span className="flex items-center gap-2">
          <span
            className="h-[3px] w-14 shrink-0 overflow-hidden rounded-full bg-edge-strong"
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full bg-arterial"
              style={{ width: `${weightPct}%` }}
            />
          </span>
          <span className="mono text-[0.7rem] text-ink">{entry.severityWeight.toFixed(2)}</span>
        </span>
      </td>

      <td className="hidden md:table-cell">
        {entry.detectors.length ? (
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {entry.detectors.map((detector, index) => (
              <span key={detector.id} className="flex items-center gap-1.5">
                {index > 0 ? (
                  <span aria-hidden="true" className="h-2.5 w-px bg-edge" />
                ) : null}
                <span className="mono text-[0.64rem] text-ink-dim">{detector.label}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="text-[0.68rem] text-ink-faint">none in the catalogue</span>
        )}
      </td>

      <td className="text-right">
        {entry.live ? (
          <span className="chip chip-safe">
            <span aria-hidden="true" className="live-dot h-1.5 w-1.5 rounded-full bg-mint" />
            LIVE
          </span>
        ) : (
          <>
            <span className="chip sm:hidden">NO POC</span>
            <span className="hidden text-[0.66rem] text-ink-faint sm:inline">not reproduced</span>
          </>
        )}
      </td>
    </tr>
  );
}
