import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const LIMITS = [
  {
    title: 'The chain state is local.',
    body: 'Mayall runs each exploit against contracts deployed into a local Foundry EVM. It does not fork mainnet and does not claim to. The Solidity, the EVM execution, the traces and the detections are real; the funds are test funds inside a local simulation.',
  },
  {
    title: 'The detectors are heuristic.',
    body: 'Ten rules score the trace and the artifact. Several key off narrative vocabulary as much as structure, so a finding is a lead to verify, not a verdict. Confidence is the rule’s own score, not a probability.',
  },
  {
    title: 'A reproduction is not a replay.',
    body: 'Rebuilding an attack pattern locally is not proof that a live deployment was exploited. It shows the mechanism is possible in the code you are reading, not what happened on chain.',
  },
  {
    title: 'The registry is disclosure data.',
    body: 'Incident names, dates and loss figures come from public post-mortems, reported at the time and rounded. They are context for the lab work, not evidence Mayall produced.',
  },
];

export function ShowcaseHonesty() {
  return (
    <section
      id="limits"
      aria-labelledby="honesty-heading"
      className="-mx-4 mt-24 border-y border-edge bg-panel/70 px-4 py-12 sm:-mx-6 sm:mt-32 sm:px-6 lg:-mx-8 lg:px-8 lg:py-16"
    >
      <div className="grid grid-cols-12 gap-x-6 gap-y-10">
        <div className="col-span-12 min-w-0 lg:col-span-4">
          <h2
            id="honesty-heading"
            className="display text-[2.25rem] font-medium leading-[1.02] tracking-[-0.03em] text-ink sm:text-[2.7rem]"
          >
            What this proves — and what it doesn&rsquo;t.
          </h2>

          <p className="display mt-7 text-[1.55rem] font-medium leading-[1.12] tracking-[-0.02em] text-ink">
            No mainnet fork.
            <br />
            No claim of one.
          </p>

          <p className="mt-4 max-w-[40ch] text-sm leading-relaxed text-ink-dim">
            A judge who spots a hidden limitation stops trusting the rest of the page. These
            are the limits, stated before you have to ask.
          </p>

          <Link
            href="/docs"
            className="mt-5 inline-flex items-center gap-1.5 text-xs text-ink-dim underline decoration-edge-strong underline-offset-4 transition-colors duration-100 hover:text-ink"
          >
            Read the documented limits
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>

        <div className="col-span-12 min-w-0 lg:col-span-8">
          <dl className="border-t border-edge">
            {LIMITS.map((limit) => (
              <div key={limit.title} className="border-b border-edge py-5">
                <dt className="display text-[1.02rem] font-medium tracking-[-0.01em] text-ink">
                  {limit.title}
                </dt>
                <dd className="mt-2 max-w-[72ch] text-[0.84rem] leading-relaxed text-ink-dim">
                  {limit.body}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
