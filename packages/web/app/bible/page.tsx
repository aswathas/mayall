import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, FlaskConical } from 'lucide-react';
import { BIBLE_ENTRIES, BIBLE_STATS } from '../../data/bible';
import { MetricStrip } from '../../components/MetricStrip';
import { Panel } from '../../components/Panel';
import { BibleIndex } from '../../components/BibleIndex';

export const metadata: Metadata = {
  title: 'The Forensic Bible — Mayall',
  description:
    'The sixteen Web3 attack vectors, the ten detector rules the engine executes, and the six local Foundry reproductions that prove them.',
};

const INDEX_STRIP_CLASS =
  'grid-flow-row grid-cols-1 sm:grid-cols-2 lg:grid-flow-col lg:grid-cols-4 ' +
  '[&>div]:border-l-0 [&>div]:border-t [&>div:first-child]:border-t-0 ' +
  'sm:[&>div:nth-child(2)]:border-t-0 ' +
  'lg:[&>div]:border-t-0 lg:[&>div]:border-l lg:[&>div:first-child]:border-l-0';

const HOW_TO_READ = [
  {
    title: 'The pattern',
    body: 'What the mechanism is, in plain language, so the class is recognisable before there is a trace to read.',
  },
  {
    title: 'The trace signature',
    body: 'The concrete call, slot or balance movement that fires the detector — taken from the live reproduction where one exists.',
  },
  {
    title: 'The fix',
    body: 'The change in code that closes it, written from the mechanism rather than from a checklist of modifiers.',
  },
];

export default function BibleIndexPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="display text-[2rem] leading-tight text-ink sm:text-[2.5rem]">
          The Forensic Bible
        </h1>
        <p className="max-w-[82ch] text-sm leading-relaxed text-ink-dim">
          The reference for the sixteen attack classes this console can name and the ten detector
          rules it can execute. The rules printed here are imported from the same catalogue the
          engine loads at run time — published and executed are one object, limitations included.
          Six vectors have a Foundry reproduction in this repository; every entry states whether a
          measured proof exists, and the ten without one say so.
        </p>
      </header>

      <MetricStrip
        className={INDEX_STRIP_CLASS}
        items={[
          {
            label: 'Attack vectors',
            value: String(BIBLE_STATS.vectors),
            hint: 'in the taxonomy',
          },
          {
            label: 'Detector rules',
            value: String(BIBLE_STATS.detectors),
            hint: 'executed by the engine',
          },
          {
            label: 'Live reproductions',
            value: String(BIBLE_STATS.scenarios),
            hint: 'Foundry scenarios in the repo',
          },
          {
            label: 'Vectors with a local proof',
            value: String(BIBLE_STATS.reproducedVectors),
            hint: `of ${BIBLE_STATS.vectors} vectors`,
            tone: 'safe',
          },
        ]}
      />

      <section aria-labelledby="how-to-read" className="border-y border-edge py-4">
        <h2 id="how-to-read" className="display text-base font-medium text-ink">
          How to read an entry
        </h2>
        <div className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-3">
          {HOW_TO_READ.map((item) => (
            <div key={item.title}>
              <p className="label-micro">{item.title}</p>
              <p className="mt-1 text-[0.78rem] leading-relaxed text-ink-dim">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <Panel
        title="Vector index"
        subtitle={`${BIBLE_STATS.vectors} vectors · grouped by class · heaviest first within each class`}
        flush
      >
        <BibleIndex entries={BIBLE_ENTRIES} />
      </Panel>

      <footer className="flex flex-wrap items-start justify-between gap-4 border-t border-edge pt-4">
        <p className="max-w-[85ch] text-xs leading-relaxed text-ink-faint">
          LIVE marks a vector with a Foundry test in this repository. The figures on an entry come
          from the recorded local run of that test: a simulation of the exploit logic, not a replay
          of a mainnet transaction.
        </p>
        <Link href="/lab" className="btn btn-ghost h-9 shrink-0 px-3 text-xs">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
          Open the live lab
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </footer>
    </div>
  );
}
