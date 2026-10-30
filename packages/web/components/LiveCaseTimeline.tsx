import type { LiveCase, LiveCaseTimelineEntry } from '../../forensic-engine/src/live-case';
import { formatDate } from '../lib/format';
import { Panel } from './Panel';

const KIND_LABEL: Record<LiveCaseTimelineEntry['kind'], string> = {
  alert: 'alert',
  disclosure: 'disclosure',
  'root-cause': 'root cause',
  amplifier: 'amplifier',
  attribution: 'attribution',
  freeze: 'freeze',
  'law-enforcement': 'law enforcement',
  market: 'market',
  holdings: 'holdings',
  response: 'response',
  'follow-up': 'follow-up',
};

const KIND_TONE: Record<LiveCaseTimelineEntry['kind'], string> = {
  alert: 'text-arterial',
  disclosure: 'text-arterial',
  'root-cause': 'text-ember',
  amplifier: 'text-amber',
  attribution: 'text-amber',
  freeze: 'text-mint',
  'law-enforcement': 'text-mint',
  market: 'text-ember',
  holdings: 'text-arterial',
  response: 'text-mint',
  'follow-up': 'text-amber',
};

function sourceLine(liveCase: LiveCase, ids: string[]): string | null {
  const sources = ids
    .map((id) => liveCase.sources.find((source) => source.id === id))
    .filter((source): source is LiveCase['sources'][number] => Boolean(source));
  if (!sources.length) return null;
  const publishers = [...new Set(sources.map((source) => source.publisher))].join(', ');
  const dates = [...new Set(sources.map((source) => formatDate(source.date)))].join(' · ');
  return `${publishers} · ${dates}`;
}

export function LiveCaseTimeline({ liveCase }: { liveCase: LiveCase }) {
  return (
    <Panel
      title="Incident timeline"
      subtitle="29–30 October 2026 · dates as published, no clock times invented"
    >
      <ol className="flex flex-col">
        {liveCase.timeline.map((entry, index) => {
          const source = sourceLine(liveCase, entry.sourceIds);
          return (
            <li
              key={entry.id}
              className={`grid gap-2 py-4 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4 ${
                index > 0 ? 'border-t border-edge' : 'pt-0'
              }`}
            >
              <div className="flex flex-row items-baseline gap-2 sm:flex-col sm:items-start sm:gap-1">
                <p className="mono text-[0.68rem] tabular-nums text-ink">{formatDate(entry.date)}</p>
                <p className={`mono text-[0.54rem] uppercase tracking-[0.14em] ${KIND_TONE[entry.kind]}`}>
                  {KIND_LABEL[entry.kind]}
                </p>
              </div>
              <div className="min-w-0">
                <h3 className="display text-[0.98rem] font-medium leading-snug text-ink">{entry.title}</h3>
                <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-ink-dim">{entry.description}</p>
                {source ? (
                  <p className="mono mt-1.5 text-[0.56rem] uppercase tracking-[0.1em] text-ink-faint">
                    source · {source}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
