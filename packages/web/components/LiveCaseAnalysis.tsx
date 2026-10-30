import type { LiveCaseAnalysis } from '../../forensic-engine/src/live-case';
import { formatPct } from '../lib/format';
import { Panel } from './Panel';
import { PatternRoleChip, SignalChip } from './LiveCaseChips';

export function LiveCaseClassification({ analysis }: { analysis: LiveCaseAnalysis }) {
  return (
    <Panel
      title="Mayall classification"
      subtitle="16-vector taxonomy · record-level confidence, not trace evidence"
    >
      <div className="flex flex-col gap-5">
        {analysis.classification.map((item, index) => (
          <article key={item.role} className={index > 0 ? 'border-t border-edge pt-4' : ''}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="display text-[1.05rem] font-medium text-ink">{item.label}</h3>
              <span className={`chip ${item.role === 'primary' ? 'chip-threat' : 'chip-amber'}`}>
                {item.role === 'primary' ? 'PRIMARY VECTOR' : 'CONTRIBUTING AMPLIFIER'}
              </span>
              <span className="mono ml-auto text-[0.72rem] tabular-nums text-ink">
                {formatPct(item.confidence, 0)}
              </span>
            </div>
            <p className="mono mt-1.5 text-[0.58rem] uppercase tracking-[0.1em] text-ink-faint">
              {item.mechanism}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">{item.rationale}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <span className="mono text-[0.56rem] uppercase tracking-[0.1em] text-ink-faint">
                bible pattern · {item.biblePattern}
              </span>
              <span className="mono text-[0.56rem] uppercase tracking-[0.1em] text-ink-faint">
                family · {item.bibleFamily}
              </span>
              <span className="mono text-[0.56rem] uppercase tracking-[0.1em] text-ink-faint">
                id · {item.vectorId}
              </span>
            </div>
          </article>
        ))}

        <p className="border-t border-edge pt-3 text-[0.7rem] leading-relaxed text-ink-faint">
          Both ids are normalised through <span className="mono text-ink-dim">resolveAttackVectorId()</span>.{' '}
          <span className="mono text-ink-dim">access-control</span> is already canonical; the free-form{' '}
          <span className="mono text-ink-dim">delegatecall</span> resolves to{' '}
          <span className="mono text-ink-dim">delegatecall-injection</span>. The second vector is an amplifier,
          never the root cause.
        </p>
      </div>
    </Panel>
  );
}

export function LiveCaseBibleMapping({ analysis }: { analysis: LiveCaseAnalysis }) {
  const counts = analysis.signalCounts;

  return (
    <Panel
      title="Forensic Bible mapping"
      subtitle="Sheet 04 patterns · sheet 03 signals · thresholds quoted verbatim"
    >
      <div className="grid grid-cols-3 divide-x divide-edge rounded-[9px] border border-edge bg-panel-2">
        <div className="px-3 py-2.5">
          <p className="label-micro">Observed</p>
          <p className="display mt-1 text-2xl leading-none tabular-nums text-arterial">{counts.observed}</p>
        </div>
        <div className="px-3 py-2.5">
          <p className="label-micro">Expected</p>
          <p className="display mt-1 text-2xl leading-none tabular-nums text-amber">{counts.expected}</p>
        </div>
        <div className="px-3 py-2.5">
          <p className="label-micro">Not applicable</p>
          <p className="display mt-1 text-2xl leading-none tabular-nums text-ink-dim">{counts.notApplicable}</p>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-ink-dim">
        Counts are unique signal names; a signal shared by two patterns is counted once. The Bible is a
        reference input — the pattern thresholds, signal thresholds and weights below are read from the
        sheets themselves, not paraphrased.
      </p>

      <div className="mt-4 flex flex-col gap-5">
        {analysis.biblePatterns.map((pattern, index) => {
          const signals = analysis.signals.filter((signal) => signal.pattern === pattern.name);
          return (
            <section key={pattern.name} className={index > 0 ? 'border-t border-edge pt-4' : ''}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="display text-[1rem] font-medium text-ink">{pattern.name}</h3>
                <PatternRoleChip role={pattern.role} />
                <span className="mono text-[0.56rem] uppercase tracking-[0.1em] text-ink-faint">
                  {pattern.family}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <span className="mono text-[0.58rem] uppercase tracking-[0.1em] text-ink-faint">
                  {pattern.attackType || 'attack type not in Bible'}
                </span>
                <span className={pattern.thresholdMet ? 'chip chip-safe' : 'chip chip-amber'}>
                  {pattern.thresholdMet ? 'THRESHOLD MET' : 'THRESHOLD NOT MET'}
                </span>
              </div>

              <p className="mono mt-2 whitespace-pre-line border-l border-edge pl-3 text-[0.6rem] leading-relaxed text-ink-dim">
                {pattern.threshold || 'Threshold not available in the Bible sheet.'}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-dim">{pattern.note}</p>

              <ul className="mt-3 flex flex-col divide-y divide-edge/70 border-t border-edge">
                {signals.map((signal, signalIndex) => (
                  <li
                    key={`${pattern.name}-${signal.name}-${signalIndex}`}
                    className="flex flex-col gap-1.5 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="mono break-all text-[0.68rem] text-ink">{signal.name}</code>
                      <SignalChip status={signal.status} />
                      <span className="mono text-[0.54rem] uppercase tracking-[0.1em] text-ink-faint">
                        {signal.weight || 'weight not in Bible'}
                      </span>
                      <span className="mono text-[0.54rem] uppercase tracking-[0.1em] text-ink-faint">
                        {signal.family}
                      </span>
                    </div>
                    <p className="mono break-words text-[0.6rem] leading-relaxed text-ink-dim">
                      <span className="text-ink-faint">threshold · </span>
                      {signal.threshold || '—'}
                    </p>
                    <p className="text-xs leading-relaxed text-ink-dim">{signal.note}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Panel>
  );
}
