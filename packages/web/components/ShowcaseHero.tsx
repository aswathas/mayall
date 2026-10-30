import Link from 'next/link';
import { BookOpen, FlaskConical } from 'lucide-react';

const MEASURED = [
  { label: 'Call tree', value: '83 nodes' },
  { label: 'withdraw() nested', value: '7 times' },
  { label: 'Top finding confidence', value: '0.97' },
];

export function ShowcaseHero() {
  return (
    <section aria-labelledby="showcase-title" className="relative">
      <div className="grid grid-cols-12 items-start gap-x-6 gap-y-12">
        <div className="rise-in col-span-12 min-w-0 lg:col-span-7 lg:pt-4">
          <h1
            id="showcase-title"
            className="display text-[clamp(4.2rem,14vw,8.5rem)] font-semibold leading-[0.82] tracking-[-0.045em] text-ink"
          >
            Mayall
          </h1>

          <div aria-hidden="true" className="mt-6 flex items-center gap-3">
            <span className="h-px w-12 bg-arterial" />
            <span className="mono text-[0.58rem] uppercase tracking-[0.24em] text-ink-dim">
              Web3 exploit forensics
            </span>
          </div>

          <p className="display mt-8 max-w-[20ch] text-[1.9rem] font-medium leading-[1.06] tracking-[-0.02em] text-ink sm:text-[2.45rem]">
            It re-runs the exploit, then shows you how it worked.
          </p>

          <p className="mt-5 max-w-[54ch] text-[0.95rem] leading-relaxed text-ink-dim">
            Mayall executes a Web3 attack against real Solidity in a local EVM, captures the
            call tree and the state it changed, scores it with pattern detectors, and writes
            the report an incident responder needs.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <Link href="/lab" className="btn btn-primary h-11 px-5 text-[0.9rem]">
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              Open the live lab
            </Link>
            <Link href="/bible" className="btn btn-ghost h-11 px-5 text-[0.9rem]">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              Read the Forensic Bible
            </Link>
          </div>

          <p className="mt-5 max-w-[52ch] text-xs leading-relaxed text-ink-dim">
            Local Foundry simulation. No mainnet state is forked, read or touched.
          </p>
        </div>

        <div className="col-span-12 min-w-0 lg:col-span-5 lg:pl-4 lg:pt-24">
          <div className="panel rise-in" style={{ animationDelay: '120ms' }}>
            <div className="panel-header">
              <p className="panel-title">Measured · reentrancy</p>
              <span className="panel-hint">local evm</span>
            </div>
            <div className="p-5">
              <p className="display text-[3.8rem] leading-none tracking-[-0.04em] text-arterial tabular-nums">
                6.0000
              </p>
              <p className="mono mt-2 text-[0.6rem] uppercase tracking-[0.18em] text-ink-dim">
                ETH drained from the vault
              </p>

              <dl className="mt-7 border-t border-edge">
                {MEASURED.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-baseline justify-between gap-4 border-b border-edge py-2.5"
                  >
                    <dt className="mono text-[0.62rem] uppercase tracking-[0.1em] text-ink-dim">
                      {item.label}
                    </dt>
                    <dd className="mono shrink-0 text-[0.78rem] tabular-nums text-ink">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="mono mt-4 text-[0.58rem] leading-relaxed text-ink-dim">
                ReentrancyVault · 0x5615…b72f · forge test -vvvv
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
