import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  CircleOff,
  FlaskConical,
  Play,
  Wrench,
} from 'lucide-react';
import { formatDate, formatEthAmount, formatInt, formatPct } from '../lib/format';
import { MetricStrip } from './MetricStrip';
import { BibleDetectorList } from './BibleDetectorList';
import type { BibleEntry as BibleEntryData } from '../data/bible';

const EVIDENCE_STRIP_CLASS =
  'grid-flow-row grid-cols-1 sm:grid-flow-col sm:grid-cols-3 ' +
  '[&>div]:border-l-0 [&>div]:border-t [&>div:first-child]:border-t-0 ' +
  'sm:[&>div]:border-t-0 sm:[&>div]:border-l sm:[&>div:first-child]:border-l-0';

function Section({
  id,
  title,
  meta,
  children,
}: {
  id: string;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t border-edge pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id} className="display text-[1.05rem] font-medium text-ink">
          {title}
        </h2>
        {meta ? (
          <span className="mono text-[0.58rem] uppercase tracking-[0.14em] text-ink-faint">
            {meta}
          </span>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** One full Bible entry: the pattern, the trace tell, the rules, the fix, the proof. */
export function BibleEntry({ entry }: { entry: BibleEntryData }) {
  const scenario = entry.scenarios[0] ?? null;
  const evidence = entry.evidence;

  return (
    <article className="flex flex-col gap-6">
      <nav aria-label="Bible navigation">
        <Link
          href="/bible"
          className="mono inline-flex items-center gap-1.5 text-[0.62rem] uppercase tracking-[0.14em] text-ink-dim transition-colors duration-100 hover:text-arterial"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          All vectors
        </Link>
      </nav>

      <header className="flex flex-col gap-3 border-b border-edge pb-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="display text-[2rem] leading-tight text-ink sm:text-[2.35rem]">
              {entry.label}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {entry.live ? (
              <span className="chip chip-safe">
                <span aria-hidden="true" className="live-dot h-1.5 w-1.5 rounded-full bg-mint" />
                LIVE
              </span>
            ) : (
              <span className="chip">NO LOCAL PROOF</span>
            )}
            {scenario ? (
              <Link
                href={`/lab?scenario=${encodeURIComponent(scenario.id)}`}
                className="btn btn-primary h-10 px-3.5 text-sm"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                Reproduce locally
              </Link>
            ) : null}
          </div>
        </div>

        <p className="mono flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6rem] uppercase tracking-[0.12em] text-ink-faint">
          <span className="text-ink-dim">{entry.category}</span>
          <span aria-hidden="true" className="h-2.5 w-px bg-edge" />
          <span>
            severity weight <span className="text-ink">{entry.severityWeight.toFixed(2)}</span>
          </span>
          <span aria-hidden="true" className="h-2.5 w-px bg-edge" />
          <span>
            {entry.detectors.length}{' '}
            {entry.detectors.length === 1 ? 'detector rule' : 'detector rules'}
          </span>
          <span aria-hidden="true" className="h-2.5 w-px bg-edge" />
          <span>{entry.live ? 'local reproduction available' : 'no local reproduction'}</span>
        </p>
      </header>

      <Section id="pattern" title="What the pattern is" meta={entry.id}>
        <p className="max-w-[80ch] text-[0.95rem] leading-relaxed text-ink">{entry.signature}</p>
        <p className="mt-2 max-w-[80ch] text-[0.92rem] leading-relaxed text-ink-dim">
          {entry.mechanism}
        </p>
      </Section>

      <Section
        id="trace-signature"
        title="The trace signature"
        meta={scenario ? `taken from the ${scenario.id} reproduction` : 'from the mechanism'}
      >
        <p className="max-w-[78ch] text-[0.82rem] leading-relaxed text-ink-dim">
          {scenario
            ? 'In the local reproduction, the evidence reads as these concrete tells:'
            : 'In a call tree, this vector reads as these concrete tells — no local reproduction exists to print measured ones:'}
        </p>
        <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {entry.traceSignature.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-arterial" aria-hidden="true" />
              <span className="text-[0.82rem] leading-relaxed text-ink-dim">{item}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="detectors"
        title="The detectors"
        meta={
          entry.detectors.length
            ? `${entry.detectors.length} catalogue ${entry.detectors.length === 1 ? 'rule' : 'rules'}`
            : 'no matching rule'
        }
      >
        <BibleDetectorList detectors={entry.detectors} vectorLabel={entry.label} />
      </Section>

      <Section id="fix" title="The fix">
        <div className="flex items-start gap-2">
          <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
          <p className="max-w-[78ch] text-[0.82rem] leading-relaxed text-ink-dim">
            The remediation follows from the mechanism: change the order, bind the value, or close the
            path the attacker used.
          </p>
        </div>
        <ol className="mt-3 flex flex-col gap-2.5">
          {entry.fix.map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <span className="mono mt-[3px] w-6 shrink-0 text-[0.6rem] tabular-nums text-arterial">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="text-[0.85rem] leading-relaxed text-ink-dim">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="evidence"
        title="Evidence from our lab"
        meta={evidence ? 'local Foundry simulation' : entry.live ? 'run not recorded' : 'not reproduced'}
      >
        {evidence ? (
          <div className="flex flex-col gap-3">
            <MetricStrip
              className={EVIDENCE_STRIP_CLASS}
              items={[
                {
                  label: 'Measured loss',
                  value: formatEthAmount(evidence.lossEth, 4),
                  hint: 'extracted in the local run',
                  tone: 'threat',
                },
                {
                  label: 'Top finding',
                  value: evidence.confidence !== null ? formatPct(evidence.confidence, 0) : '—',
                  hint: evidence.topDetector ?? 'no detector fired',
                  tone: 'warn',
                },
                {
                  label: 'Findings',
                  value: formatInt(evidence.findings),
                  hint: 'detectors that fired',
                },
              ]}
            />

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-edge pt-3">
              <span className="mono text-[0.62rem] text-ink-dim">{evidence.scenarioTitle}</span>
              <span aria-hidden="true" className="h-2.5 w-px bg-edge" />
              <span className="mono text-[0.62rem] text-ink-faint">{evidence.contractName}</span>
              <span aria-hidden="true" className="h-2.5 w-px bg-edge" />
              <span className="mono text-[0.62rem] text-ink-faint">{evidence.testFile}</span>
              {evidence.measuredAt ? (
                <span className="mono ml-auto text-[0.58rem] uppercase tracking-[0.1em] text-ink-faint">
                  measured {formatDate(evidence.measuredAt)}
                </span>
              ) : null}
            </div>

            <p className="max-w-[85ch] text-[0.76rem] leading-relaxed text-ink-faint">
              Read from <span className="mono">artifacts/{evidence.scenarioId}.json</span> and{' '}
              <span className="mono">artifacts/summary.json</span>: a local Foundry simulation of the
              exploit logic, not a replay of a mainnet transaction. The top finding is whichever
              rule reached the highest confidence in that run, which is not necessarily the rule
              above.
            </p>

            {scenario ? (
              <Link
                href={`/lab?scenario=${encodeURIComponent(scenario.id)}`}
                className="btn btn-ghost h-9 w-fit px-3 text-xs"
              >
                <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                Open this run in the lab
              </Link>
            ) : null}
          </div>
        ) : entry.live && scenario ? (
          <div className="rounded-[9px] border border-dashed border-edge px-4 py-5">
            <p className="label-micro flex items-center gap-1.5">
              <FlaskConical className="h-3 w-3 text-ink-faint" aria-hidden="true" />
              No recorded run
            </p>
            <p className="mt-2 max-w-[80ch] text-[0.82rem] leading-relaxed text-ink-dim">
              A local reproduction of this vector exists, but no artifact is recorded on disk yet, so
              the Bible prints no measured loss for it. Run the scenario to produce the figures.
            </p>
            <Link
              href={`/lab?scenario=${encodeURIComponent(scenario.id)}`}
              className="btn btn-ghost mt-3 h-9 w-fit px-3 text-xs"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              Run this scenario
            </Link>
          </div>
        ) : (
          <div className="rounded-[9px] border border-dashed border-edge px-4 py-5">
            <p className="label-micro flex items-center gap-1.5">
              <CircleOff className="h-3 w-3 text-ember" aria-hidden="true" />
              No local reproduction
            </p>
            <p className="mt-2 max-w-[80ch] text-[0.82rem] leading-relaxed text-ink-dim">
              No Foundry test in this repository exercises this vector, so there is no measured loss
              to print. The pattern, the trace signature and the fix are published; the proof is
              not. Vectors with a proof are marked LIVE in the index.
            </p>
            <Link href="/lab" className="btn btn-ghost mt-3 h-9 w-fit px-3 text-xs">
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              Open the live lab
            </Link>
          </div>
        )}
      </Section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-4">
        <Link
          href="/bible"
          className="mono inline-flex items-center gap-1.5 text-[0.62rem] uppercase tracking-[0.14em] text-ink-dim transition-colors duration-100 hover:text-arterial"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          All vectors
        </Link>
        <span className="flex items-center gap-1.5 text-[0.66rem] text-ink-faint">
          <FlaskConical className="h-3 w-3" aria-hidden="true" />
          Local simulation — not mainnet evidence.
        </span>
      </footer>
    </article>
  );
}
