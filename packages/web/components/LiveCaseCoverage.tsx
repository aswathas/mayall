import Link from 'next/link';
import { FlaskConical } from 'lucide-react';
import type { LiveCaseAnalysis } from '../../forensic-engine/src/live-case';
import { Panel } from './Panel';
import { VectorChip } from './VectorChip';
import { CoverageChip } from './LiveCaseChips';

export function LiveCaseCoverage({ analysis }: { analysis: LiveCaseAnalysis }) {
  const fired = analysis.coverage.filter((item) => item.status === 'fired').length;
  const notFired = analysis.coverage.filter((item) => item.status === 'not-fired').length;
  const outOfScope = analysis.coverage.filter((item) => item.status === 'out-of-scope').length;

  return (
    <Panel
      title="Detector coverage"
      subtitle="All ten detectors · what Mayall can and cannot see"
    >
      <p className="max-w-[82ch] text-sm leading-relaxed text-ink-dim">
        Most of Mayall’s detectors will not fire here, because there is no contract bug to find. The trust
        boundary that broke was a signing key on a DevOps laptop, not a modifier in Solidity. Saying that
        plainly is the point of this matrix.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="chip chip-threat">FIRED · {fired}</span>
        <span className="chip">NOT FIRED · {notFired}</span>
        <span className="chip chip-amber">OUT OF SCOPE · {outOfScope}</span>
      </div>

      <div className="mt-4 flex flex-col">
        {analysis.coverage.map((item, index) => (
          <article
            key={item.id}
            className={`flex flex-col gap-2 py-4 ${index > 0 ? 'border-t border-edge' : 'pt-0'}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="display text-[1rem] font-medium text-ink">{item.label}</h3>
              <VectorChip vectorId={item.vectorId} />
              <CoverageChip status={item.status} />
            </div>
            <p className="max-w-[82ch] text-sm leading-relaxed text-ink-dim">{item.reason}</p>
            <blockquote className="border-l border-edge pl-3">
              <p className="label-micro">detector limitation, quoted</p>
              <p className="mt-1 max-w-[82ch] text-xs leading-relaxed text-ink-dim">“{item.limitation}”</p>
            </blockquote>
          </article>
        ))}
      </div>
    </Panel>
  );
}

export function LiveCaseAnalogue({ analysis }: { analysis: LiveCaseAnalysis }) {
  const analogue = analysis.analogue;

  return (
    <Panel
      title="Local reproduction — closest analogue"
      subtitle="Delegatecall scenario · real measured numbers"
    >
      <div className="grid grid-cols-2 divide-x divide-edge rounded-[9px] border border-edge bg-panel-2">
        <div className="px-4 py-3">
          <p className="label-micro">Drained by the scenario</p>
          <p className="display mt-1 text-[2rem] leading-none tabular-nums text-arterial">
            {analogue.lossEth} ETH
          </p>
          <p className="mono mt-1 text-[0.56rem] uppercase tracking-[0.1em] text-ink-faint">
            measured from the artifact
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="label-micro">Delegatecall confidence</p>
          <p className="display mt-1 text-[2rem] leading-none tabular-nums text-ember">
            {Math.round(analogue.confidence * 100)}%
          </p>
          <p className="mono mt-1 text-[0.56rem] uppercase tracking-[0.1em] text-ink-faint">
            {analogue.detectorLabel}
          </p>
        </div>
      </div>

      <p className="mt-3 max-w-[82ch] text-sm leading-relaxed text-ink-dim">{analogue.reproduces}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="label-micro">What it does not reproduce</p>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-ink-dim">
            {analogue.doesNotReproduce.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="label-micro">Boundary</p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">{analogue.note}</p>
        </div>
      </div>

      <p className="mono mt-3 break-all text-[0.58rem] text-ink-faint">
        artifact · {analogue.artifactSource} · scenario::{analogue.scenarioId}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={analogue.route} className="btn btn-primary h-11 px-3.5 text-sm">
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          Open the delegatecall lab
        </Link>
        <span className="text-xs leading-relaxed text-ink-faint">
          Runs the local Foundry scenario, not a Binance transaction.
        </span>
      </div>

      <p className="mt-3 border-t border-edge pt-3 text-xs leading-relaxed text-ink-dim">
        The custom attack lab exposes the same family in{' '}
        <span className="mono text-ink">contracts/src/CustomTarget.sol</span> with{' '}
        <span className="mono text-ink">MAYALL_VECTOR=delegatecall</span>. It is the same line: local
        delegatecall mechanics, not the incident.
      </p>
    </Panel>
  );
}
