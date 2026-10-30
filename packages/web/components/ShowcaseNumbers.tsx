import { ATTACK_VECTOR_LIST } from '@helix/core';
import { MetricStrip, type MetricItem } from './MetricStrip';
import { formatUsdCompact } from '../lib/format';

const INCIDENT_COUNT = 16;
const REPORTED_LOSS_USD = 2_394_400_000;
const CHAIN_COUNT = 5;

const STRIP_CLASS =
  'grid-flow-row grid-cols-2 md:grid-cols-4 2xl:grid-flow-col 2xl:grid-cols-7 ' +
  '[&>div]:border-l-0 [&>div]:border-t [&>div:nth-child(-n+2)]:border-t-0 ' +
  'md:[&>div:nth-child(3)]:border-t-0 md:[&>div:nth-child(4)]:border-t-0 ' +
  '[&>div:last-child]:col-span-2 2xl:[&>div:last-child]:col-span-1 ' +
  '2xl:[&>div]:border-t-0 2xl:[&>div]:border-l 2xl:[&>div:first-child]:border-l-0';

const ITEMS: MetricItem[] = [
  { label: 'Incidents', value: String(INCIDENT_COUNT), hint: 'public disclosures' },
  {
    label: 'Reported losses',
    value: formatUsdCompact(REPORTED_LOSS_USD),
    hint: 'USD at disclosure',
    tone: 'threat',
  },
  { label: 'Chains', value: String(CHAIN_COUNT), hint: 'in the registry' },
  {
    label: 'Attack vectors',
    value: String(ATTACK_VECTOR_LIST.length),
    hint: 'classes modelled',
  },
  { label: 'Detectors', value: '10', hint: 'heuristic rules' },
  { label: 'Reproductions', value: '6', hint: 'live Foundry scenarios' },
  { label: 'Full suite', value: '1.3 s', hint: 'six scenarios, measured' },
];

export function ShowcaseNumbers() {
  return (
    <section aria-labelledby="numbers-heading" className="mt-24 border-t border-edge pt-10 sm:mt-32">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <h2
            id="numbers-heading"
            className="display text-[2rem] font-medium leading-none tracking-[-0.03em] text-ink sm:text-[2.6rem]"
          >
            The registry, measured.
          </h2>
          <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-ink-dim">
            Sixteen disclosed incidents, five execution environments, sixteen modelled attack
            classes — and six exploits the lab can re-run from source in one suite.
          </p>
        </div>
        <p className="mono shrink-0 text-[0.58rem] uppercase tracking-[0.14em] text-ink-dim">
          verified in this repository
        </p>
      </div>

      <div className="mt-8">
        <MetricStrip className={STRIP_CLASS} items={ITEMS} />
      </div>

      <p className="mt-3 text-xs leading-relaxed text-ink-dim">
        Loss figures are the amounts reported at disclosure and are rounded. Suite time is the
        measured wall clock for six scenarios on this machine, not a benchmark.
      </p>
    </section>
  );
}
