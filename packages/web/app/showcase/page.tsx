import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Terminal } from 'lucide-react';
import { ATTACK_VECTOR_LIST } from '@helix/core';
import { ShowcaseHero } from '../../components/ShowcaseHero';
import { ShowcasePipeline } from '../../components/ShowcasePipeline';
import { ShowcaseEvidence } from '../../components/ShowcaseEvidence';
import { ShowcaseNumbers } from '../../components/ShowcaseNumbers';
import { ShowcaseHonesty } from '../../components/ShowcaseHonesty';

export const metadata: Metadata = {
  title: 'Showcase — Mayall',
  description:
    'Mayall re-executes Web3 exploits in a local Foundry EVM, captures the call tree, diffs the state and writes the forensic report. The evidence, the method and the limits.',
};

const COMMANDS = [
  { command: 'npm install', note: 'Install the workspace.' },
  { command: 'npm run setup:foundry', note: 'Fetch the Foundry toolchain into .tools/.' },
  { command: 'npm run dev', note: 'Serve the console on localhost:3000.' },
];

const PRODUCTION = [
  {
    title: 'Mainnet fork replay',
    body: 'Re-execute the same PoCs against forked chain state at the exploit block, then reconcile the observed trace with the published one.',
  },
  {
    title: 'More chains',
    body: 'The registry spans Ethereum, Polygon, BNB Chain, Arbitrum and zkSync Era. The lab reproduces one EVM at a time.',
  },
  {
    title: 'Multi-scenario correlation',
    body: 'Link findings across cases so a shared deployer, funding path or attacker pattern surfaces without manual search.',
  },
  {
    title: 'ML-assisted triage',
    body: 'Rank findings by likelihood and monetary impact when a trace is too large for rule thresholds alone.',
  },
];

export default function ShowcasePage() {
  return (
    <article className="flex flex-col pb-10">
      <ShowcaseHero />

      <section aria-labelledby="problem-heading" className="mt-24 border-t border-edge pt-10 sm:mt-32">
        <div className="grid grid-cols-12 gap-x-6 gap-y-10">
          <div className="col-span-12 min-w-0 lg:col-span-4">
            <h2
              id="problem-heading"
              className="display text-[2.1rem] font-medium leading-[1.04] tracking-[-0.03em] text-ink sm:text-[2.7rem]"
            >
              A block explorer shows you{' '}
              <span className="text-ink-dim">that</span> it happened. It cannot show you{' '}
              how.
            </h2>
            <p className="mt-5 max-w-[46ch] text-sm leading-relaxed text-ink-dim">
              Incident responders do not need another balance chart. They need the call path,
              the state the attacker changed, and the point where the design assumption broke.
              That is the layer Mayall captures.
            </p>
            <p className="mono mt-5 text-[0.58rem] uppercase tracking-[0.14em] text-ink-dim">
              sixteen classes in the taxonomy
            </p>
          </div>

          <div className="col-span-12 min-w-0 lg:col-span-8">
            <ul className="gap-x-7 sm:columns-2 xl:columns-3">
              {ATTACK_VECTOR_LIST.map((vector) => (
                <li
                  key={vector.id}
                  className="mb-4 break-inside-avoid border-t border-edge pt-2.5"
                >
                  <p className="display text-[0.98rem] font-medium leading-snug text-ink">
                    {vector.label}
                  </p>
                  <p className="mt-1 text-[0.72rem] leading-relaxed text-ink-dim">
                    {vector.signature}
                  </p>
                  <p className="mono mt-1.5 text-[0.55rem] uppercase tracking-[0.12em] text-ink-dim">
                    {vector.category}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <ShowcasePipeline />

      <div id="evidence">
        <ShowcaseEvidence />
      </div>

      <ShowcaseNumbers />

      <ShowcaseHonesty />

      <section aria-labelledby="run-heading" className="mt-24 sm:mt-32">
        <div className="grid grid-cols-12 gap-x-6 gap-y-12">
          <div className="col-span-12 min-w-0 lg:col-span-6">
            <h2
              id="run-heading"
              className="display text-[2rem] font-medium leading-none tracking-[-0.03em] text-ink sm:text-[2.6rem]"
            >
              Run it locally.
            </h2>
            <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-ink-dim">
              The console runs against the Foundry toolchain on your machine. Node 20 or newer.
            </p>

            <div className="mt-6 overflow-hidden rounded-[14px] border border-edge bg-panel">
              {COMMANDS.map((step, index) => (
                <div
                  key={step.command}
                  className={`px-4 py-3.5 ${
                    index < COMMANDS.length - 1 ? 'border-b border-edge' : ''
                  }`}
                >
                  <p className="flex items-baseline gap-2.5">
                    <span aria-hidden="true" className="mono text-[0.72rem] text-ink-dim">
                      $
                    </span>
                    <code className="mono break-all text-[0.8rem] text-ink">{step.command}</code>
                  </p>
                  <p className="mt-1 pl-6 text-[0.72rem] leading-relaxed text-ink-dim">
                    {step.note}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-ink-dim">
              <Terminal className="h-3.5 w-3.5 text-ink-dim" aria-hidden="true" />
              Then open
              <Link
                href="/lab"
                className="text-ink underline decoration-edge-strong underline-offset-4 transition-colors duration-100 hover:text-arterial"
              >
                the live lab
              </Link>
              and run one scenario or the full suite.
            </p>
          </div>

          <div className="col-span-12 min-w-0 lg:col-span-6 lg:pl-8">
            <h3 className="display text-[1.45rem] font-medium leading-tight tracking-[-0.02em] text-ink">
              What a production version would need.
            </h3>
            <p className="mt-3 max-w-[56ch] text-sm leading-relaxed text-ink-dim">
              The current build is an honest local instrument. These are the gaps between it
              and a service an incident response team could run on live data.
            </p>

            <dl className="mt-6 border-t border-edge">
              {PRODUCTION.map((item) => (
                <div key={item.title} className="border-b border-edge py-4">
                  <dt className="display flex items-baseline gap-2 text-[0.98rem] font-medium text-ink">
                    {item.title}
                    <ArrowUpRight className="h-3.5 w-3.5 text-ink-dim" aria-hidden="true" />
                  </dt>
                  <dd className="mt-1.5 max-w-[62ch] text-[0.8rem] leading-relaxed text-ink-dim">
                    {item.body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <p className="mt-14 border-t border-edge pt-5 text-xs leading-relaxed text-ink-dim">
          Every measurement on this page was produced by a run in this repository. Every
          incident figure comes from the public registry it ships with.
        </p>
      </section>
    </article>
  );
}
