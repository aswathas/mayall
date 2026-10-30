import { BIBLE_CATEGORY_ORDER, type BibleEntry } from '../data/bible';
import { BibleVectorCard } from './BibleVectorCard';

/**
 * The published index: one table, grouped by attack class. Category order is
 * fixed, and inside a class the heaviest vectors come first, so the page reads
 * as a reference work rather than an arbitrary list.
 */
export function BibleIndex({ entries }: { entries: BibleEntry[] }) {
  const groups = BIBLE_CATEGORY_ORDER.map((category) => ({
    category,
    rows: entries
      .filter((entry) => entry.category === category)
      .sort(
        (a, b) => b.severityWeight - a.severityWeight || a.label.localeCompare(b.label),
      ),
  })).filter((group) => group.rows.length > 0);

  return (
    <table className="data-table">
      <caption className="sr-only">
        The Forensic Bible index: every attack vector, grouped by class, with its severity weight,
        the detector rules that watch for it and whether a local reproduction exists.
      </caption>
      <thead>
        <tr>
          <th scope="col" className="w-[42%]">
            Vector
          </th>
          <th scope="col" className="hidden md:table-cell">
            Class
          </th>
          <th scope="col" className="hidden sm:table-cell">
            Weight
          </th>
          <th scope="col" className="hidden md:table-cell">
            Watched by
          </th>
          <th scope="col" className="text-right">
            <span className="sm:hidden">Proof</span>
            <span className="hidden sm:inline">Local proof</span>
          </th>
        </tr>
      </thead>

      {groups.map((group) => (
        <tbody key={group.category}>
          <tr>
            <th
              scope="colgroup"
              colSpan={5}
              className="border-y border-edge bg-panel-2 px-3 py-2 text-left"
            >
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="display text-[0.95rem] font-medium text-ink">{group.category}</span>
                <span className="mono text-[0.56rem] uppercase tracking-[0.14em] text-ink-faint">
                  {group.rows.length} {group.rows.length === 1 ? 'vector' : 'vectors'}
                </span>
              </span>
            </th>
          </tr>
          {group.rows.map((entry) => (
            <BibleVectorCard key={entry.id} entry={entry} />
          ))}
        </tbody>
      ))}
    </table>
  );
}
