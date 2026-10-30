import { SeverityChip } from './SeverityChip';

const TRACE_LINES = [
  '[2099367] ReentrancyExploitTest::testExploit()',
  '    ├─ [195418] ReentrancyAttacker::attack(6)',
  '    │   ├─ [28901] ReentrancyVault::deposit{value: 1000000000000000000}()',
  '    │   ├─ [110836] ReentrancyVault::withdraw()',
  '    │   │   ├─ [101728] ReentrancyAttacker::receive{value: 1000000000000000000}()',
  '    │   │   │   ├─ [80999] ReentrancyVault::withdraw()',
  '    │   │   │   │   ├─ [71891] ReentrancyAttacker::receive{value: 1000000000000000000}()',
  '    │   │   │   │   │   ├─ [71062] ReentrancyVault::withdraw()',
  '    │   │   │   │   │   │   ├─ [61954] ReentrancyAttacker::receive{value: 1000000000000000000}()',
  '    │   │   │   │   │   │   │   ├─ [61125] ReentrancyVault::withdraw()',
  '    │   │   │   │   │   │   │   │   ├─ [52017] ReentrancyAttacker::receive{value: 1000000000000000000}()',
  '    │   │   │   │   │   │   │   │   │   ├─ [51188] ReentrancyVault::withdraw()',
  '    │   │   │   │   │   │   │   │   │   │   ├─ [42080] ReentrancyAttacker::receive{value: 1000000000000000000}()',
  '    │   │   │   │   │   │   │   │   │   │   │   ├─ [41251] ReentrancyVault::withdraw()',
  '    │   │   │   │   │   │   │   │   │   │   │   │   ├─ [32143] ReentrancyAttacker::receive{value: 1000000000000000000}()',
  '    │   │   │   │   │   │   │   │   │   │   │   │   │   ├─ [31314] ReentrancyVault::withdraw()',
  '    │   │   │   │   │   │   │   │   │   │   │   │   │   │   ├─ [306] ReentrancyAttacker::receive{value: 1000000000000000000}()',
];

const FRAMES = [
  { depth: 0, name: 'ReentrancyExploitTest::testExploit()', gas: '2099367' },
  { depth: 1, name: 'ReentrancyAttacker::attack(6)', gas: '195418' },
  { depth: 2, name: 'ReentrancyVault::deposit()', gas: '28901' },
  { depth: 2, name: 'ReentrancyVault::withdraw()', gas: '110836' },
  { depth: 3, name: 'ReentrancyAttacker::receive()', gas: '101728' },
  { depth: 4, name: 'ReentrancyVault::withdraw()', gas: '80999' },
  { depth: 5, name: 'ReentrancyAttacker::receive()', gas: '71891' },
  { depth: 6, name: 'ReentrancyVault::withdraw()', gas: '71062' },
  { depth: 7, name: 'ReentrancyAttacker::receive()', gas: '61954' },
  { depth: 8, name: 'ReentrancyVault::withdraw()', gas: '61125' },
  { depth: 9, name: 'ReentrancyAttacker::receive()', gas: '52017' },
  { depth: 10, name: 'ReentrancyVault::withdraw()', gas: '51188' },
  { depth: 11, name: 'ReentrancyAttacker::receive()', gas: '42080' },
  { depth: 12, name: 'ReentrancyVault::withdraw()', gas: '41251' },
  { depth: 13, name: 'ReentrancyAttacker::receive()', gas: '32143' },
  { depth: 14, name: 'ReentrancyVault::withdraw()', gas: '31314' },
  { depth: 15, name: 'ReentrancyAttacker::receive()', gas: '306' },
];

const STORAGE = [
  {
    label: 'totalDeposited',
    slot: '0x…0001',
    before: '0x…8ac7230489e80000',
    after: '0x…98a7d9b8314c0000',
    changed: true,
  },
  {
    label: 'totalWithdrawn',
    slot: '0x…0002',
    before: '0x…0000000000000000',
    after: '0x…6124fee993bc0000',
    changed: true,
  },
  {
    label: 'balances[attacker]',
    slot: '0xc6bd…8579',
    before: '0x…0000000000000000',
    after: '0x…0000000000000000',
    changed: false,
  },
];

const BALANCES = [
  { label: 'ReentrancyVault', before: '10.0000', after: '4.0000', delta: '−6.0000', loss: true },
  { label: 'ReentrancyAttacker', before: '1.0000', after: '7.0000', delta: '+6.0000', loss: false },
];

function frameTone(name: string): string {
  if (name.includes('withdraw')) return 'text-arterial';
  if (name.includes('receive')) return 'text-ink-dim';
  return 'text-ink';
}

export function ShowcaseEvidence() {
  return (
    <section aria-labelledby="evidence-heading" className="mt-24 border-t border-edge pt-10 sm:mt-32">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <h2
            id="evidence-heading"
            className="display text-[2rem] font-medium leading-none tracking-[-0.03em] text-ink sm:text-[2.6rem]"
          >
            The evidence, not a summary of it.
          </h2>
          <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-ink-dim">
            One transaction, four kinds of evidence. The trace is printed verbatim from the
            Forge run; narrower screens list the same frames by depth. The storage diff,
            balance movement and finding are the same run&rsquo;s output.
          </p>
        </div>
        <p className="mono shrink-0 text-[0.58rem] uppercase tracking-[0.14em] text-ink-dim">
          reentrancy · ethereum · local foundry
        </p>
      </div>

      <div className="panel mt-8 overflow-hidden">
        <div className="panel-header">
          <p className="panel-title">Exhibit · reentrancy</p>
          <span className="panel-hint">
            <span className="sm:hidden">forge · 1 passed</span>
            <span className="hidden sm:inline">forge test -vvvv · 1 passed</span>
          </span>
        </div>

        <div className="border-b border-edge">
          <pre
            aria-label="Call tree from the reentrancy run"
            className="mono hidden overflow-x-auto p-4 text-[0.7rem] leading-[1.85] xl:block"
          >
            {TRACE_LINES.map((line, index) => (
              <span key={index} className="flex">
                <span
                  aria-hidden="true"
                  className="mr-3 w-5 shrink-0 select-none text-right text-ink-dim/60 tabular-nums"
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span
                  className={
                    line.includes('withdraw()')
                      ? 'whitespace-pre text-arterial'
                      : 'whitespace-pre text-ink-dim'
                  }
                >
                  {line}
                </span>
              </span>
            ))}
          </pre>

          <ol
            aria-label="Call frames from the reentrancy run, depth preserved"
            className="mono px-4 py-3.5 xl:hidden"
          >
            {FRAMES.map((frame) => (
              <li key={`${frame.name}-${frame.gas}`} className="flex py-[2px] text-[0.58rem] leading-[1.7] sm:text-[0.66rem]">
                <span style={{ paddingLeft: `${frame.depth * 4}px` }} className="min-w-0">
                  <span className={frameTone(frame.name)}>{frame.name}</span>
                  <span className="text-ink-dim"> · {frame.gas}</span>
                </span>
              </li>
            ))}
          </ol>

          <p className="mono border-t border-edge px-4 py-3 text-[0.58rem] uppercase tracking-[0.12em] text-ink-dim">
            82 nodes parsed · 7 nested withdrawals · deepest frame 306 gas
          </p>
        </div>

        <div className="grid grid-cols-1 divide-y divide-edge md:grid-cols-3 md:divide-x md:divide-y-0">
          <div className="min-w-0 p-4 sm:p-5">
            <p className="label-micro">Storage diff</p>
            <div className="mt-3 flex flex-col gap-3">
              {STORAGE.map((write) => (
                <div key={write.label} className="min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="mono text-[0.68rem] text-ink">{write.label}</p>
                    <p className="mono text-[0.58rem] text-ink-dim">{write.slot}</p>
                  </div>
                  <p className="mono mt-1 flex flex-wrap items-baseline gap-x-1.5 text-[0.6rem]">
                    <span className="text-ink-dim">{write.before}</span>
                    <span aria-hidden="true" className="text-ink-dim">
                      →
                    </span>
                    <span className={write.changed ? 'text-arterial' : 'text-ink'}>
                      {write.after}
                    </span>
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[0.68rem] leading-relaxed text-ink-dim">
              The attacker balance slot never moves. The state update runs after the nested
              calls return — that is the bug.
            </p>
          </div>

          <div className="min-w-0 p-4 sm:p-5">
            <p className="label-micro">Balance delta</p>
            <dl className="mt-3 flex flex-col gap-3">
              {BALANCES.map((row) => (
                <div key={row.label} className="flex flex-wrap items-baseline gap-x-3">
                  <dt className="mono min-w-0 flex-1 text-[0.66rem] text-ink">{row.label}</dt>
                  <dd className="mono shrink-0 text-[0.6rem] text-ink-dim tabular-nums">
                    {row.before} → {row.after} ETH
                  </dd>
                  <dd
                    className={`mono w-16 shrink-0 text-right text-[0.66rem] tabular-nums ${
                      row.loss ? 'text-arterial' : 'text-ink'
                    }`}
                  >
                    {row.delta}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[0.68rem] leading-relaxed text-ink-dim">
              The vault pays out 6 ETH it still believes the attacker holds. The attacker
              balance slot is never decremented.
            </p>
          </div>

          <div className="min-w-0 p-4 sm:p-5">
            <p className="label-micro">Pattern finding</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <SeverityChip severity="critical" />
              <span className="display text-[1.05rem] font-medium text-ink">Reentrancy</span>
              <span className="mono ml-auto text-[0.9rem] tabular-nums text-arterial">0.97</span>
            </div>
            <p className="mt-2 text-[0.72rem] leading-relaxed text-ink-dim">
              The same entry point is re-entered before its state update completes, letting
              the attacker pull funds across nested calls.
            </p>
            <p className="mono mt-3 border-t border-edge pt-3 text-[0.6rem] leading-relaxed text-ink-dim">
              Trace shows ReentrancyVault::withdraw invoked 7 times within a single
              transaction
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
