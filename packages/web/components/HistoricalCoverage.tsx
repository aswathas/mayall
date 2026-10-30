'use client';

import { CircleCheck, Clock3, FlaskConical, Layers3 } from 'lucide-react';
import type { AttackVectorId } from '@helix/core';
import type { HistoricalAnalysis } from '@helix/forensic-engine';
import { formatPct, formatUsdCompact } from '../lib/format';
import { Panel, SubBlock } from './Panel';
import { VectorChip } from './VectorChip';

function CoverageBar({ ratio, label }: { ratio: number; label: string }) {
  const clamped = Math.max(0, Math.min(1, ratio));
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-elevated"
      role="img"
      aria-label={label}
    >
      <div className="h-full bg-mint" style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}

export function HistoricalCoverage({ analysis }: { analysis: HistoricalAnalysis }) {
  const { coverage } = analysis;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Coverage" subtitle="local reproduction vs retrospective classification">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div>
            <p className="label-micro">locally reproduced</p>
            <p className="display mt-1 text-[2.1rem] leading-none tabular-nums text-ink">
              {coverage.reproducible}
              <span className="text-ink-faint"> / {coverage.incidents}</span>
            </p>
            <p className="mt-1.5 text-xs text-ink-dim">
              incidents with a live Foundry scenario in the local lab
            </p>
          </div>
          <span className="chip chip-safe">
            <FlaskConical className="h-3 w-3" aria-hidden="true" />
            {formatPct(coverage.reproduciblePct, 0)} reproduced
          </span>
        </div>

        <div className="mt-4">
          <CoverageBar
            ratio={coverage.reproduciblePct}
            label={`${formatPct(coverage.reproduciblePct, 0)} of incidents have a local reproduction`}
          />
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-edge pt-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 text-ink-dim">
              <CircleCheck className="h-3.5 w-3.5 text-mint" aria-hidden="true" />
              Foundry reproduction of the vector
            </span>
            <span className="mono tabular-nums text-ink">{coverage.reproducible}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 text-ink-dim">
              <Clock3 className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />
              Retrospective classification only
            </span>
            <span className="mono tabular-nums text-ink">{coverage.retrospectiveOnly}</span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SubBlock title="Vectors in reproduced incidents">
            <div className="flex flex-wrap gap-1.5">
              {coverage.reproducedVectors.length ? (
                coverage.reproducedVectors.map((vector) => (
                  <VectorChip key={vector} vectorId={vector as AttackVectorId} />
                ))
              ) : (
                <p className="text-xs text-ink-faint">None.</p>
              )}
            </div>
          </SubBlock>
          <SubBlock title="Vectors in retrospective-only incidents">
            <div className="flex flex-wrap gap-1.5">
              {coverage.retrospectiveVectors.length ? (
                coverage.retrospectiveVectors.map((vector) => (
                  <VectorChip key={vector} vectorId={vector as AttackVectorId} />
                ))
              ) : (
                <p className="text-xs text-ink-faint">None.</p>
              )}
            </div>
          </SubBlock>
        </div>

        <p className="mt-4 border-t border-edge pt-3 text-[0.68rem] leading-relaxed text-ink-faint">
          Coverage is incident-level, not per-vector: an incident counts as reproduced when a scenario exists for its
          primary vector, even if it also carries a second vector the scenario does not exercise. No reproduction
          replays the historic mainnet transaction.
        </p>
      </Panel>

      <Panel title="Confidence distribution" subtitle="finding-level confidence in the classification">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="label-micro">mean confidence</p>
            <p className="display mt-1 text-[2.1rem] leading-none tabular-nums text-ink">
              {formatPct(confidenceMean(analysis), 0)}
            </p>
          </div>
          <p className="mono text-[0.62rem] text-ink-faint">
            min {formatPct(analysis.confidence.min, 0)} · max {formatPct(analysis.confidence.max, 0)} ·{' '}
            {analysis.totals.findings} findings
          </p>
        </div>

        <ul className="mt-4 flex flex-col gap-3">
          {analysis.confidence.buckets.map((bucket) => {
            const share = analysis.totals.findings ? bucket.count / analysis.totals.findings : 0;
            return (
              <li key={bucket.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="mono text-[0.64rem] tabular-nums text-ink-dim">{bucket.label}</span>
                  <span className="mono text-[0.64rem] tabular-nums text-ink">
                    {bucket.count} <span className="text-ink-faint">· {formatPct(share, 0)}</span>
                  </span>
                </div>
                <div
                  className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-elevated"
                  role="img"
                  aria-label={`${bucket.label} confidence: ${bucket.count} findings`}
                >
                  <div className="h-full bg-arterial" style={{ width: `${share * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 border-t border-edge pt-3 text-[0.68rem] leading-relaxed text-ink-faint">
          Confidence measures how explicitly the published record names the mechanism. It is not a trace-verification
          score, and no finding here is derived from mainnet calldata.
        </p>
      </Panel>
    </div>
  );
}

function confidenceMean(analysis: HistoricalAnalysis): number {
  if (!analysis.totals.findings) return 0;
  return analysis.confidence.mean;
}

export function HistoricalBreakdown({ analysis }: { analysis: HistoricalAnalysis }) {
  const maxFamily = Math.max(1, ...analysis.byFamily.map((family) => family.count));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel
        title="Findings by Bible family"
        subtitle="sheet 04 attack families, aggregated across the registry"
        flush
      >
        <div className="scroll-y min-w-0 max-w-full overflow-x-auto">
          <table className="data-table min-w-[560px]">
            <thead>
              <tr>
                <th>Family</th>
                <th className="text-right">Findings</th>
                <th className="text-right">Incidents</th>
                <th className="text-right">Incident loss</th>
                <th className="text-right">Mean</th>
              </tr>
            </thead>
            <tbody>
              {analysis.byFamily.map((family) => (
                <tr key={family.family}>
                  <td>
                    <div className="flex flex-col gap-1">
                      <span className="text-[0.82rem] text-ink">{family.family}</span>
                      <span className="block h-[2px] w-full max-w-[9rem] bg-edge" aria-hidden="true">
                        <span
                          className="block h-full bg-arterial/80"
                          style={{ width: `${(family.count / maxFamily) * 100}%` }}
                        />
                      </span>
                    </div>
                  </td>
                  <td className="text-right mono tabular-nums text-ink">{family.count}</td>
                  <td className="text-right mono tabular-nums text-ink-dim">{family.incidentCount}</td>
                  <td className="text-right mono tabular-nums text-ink-dim">{formatUsdCompact(family.lossUsd)}</td>
                  <td className="text-right mono tabular-nums text-ink-dim">
                    {formatPct(family.meanConfidence, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-edge px-4 py-3 text-[0.66rem] leading-relaxed text-ink-faint sm:px-5">
          Incident loss repeats across families when one incident maps to several vectors; this is a coverage view, not
          an additive loss total.
        </p>
      </Panel>

      <Panel title="Findings by attack vector" subtitle="our 16-vector taxonomy" flush>
        <div className="scroll-y min-w-0 max-w-full overflow-x-auto">
          <table className="data-table min-w-[600px]">
            <thead>
              <tr>
                <th>Vector</th>
                <th className="text-right">Findings</th>
                <th className="text-right">Incidents</th>
                <th className="text-right">In reproduced</th>
                <th className="text-right">Mean</th>
              </tr>
            </thead>
            <tbody>
              {analysis.byVector.map((vector) => (
                <tr key={vector.vectorId}>
                  <td>
                    <VectorChip vectorId={vector.vectorId} />
                  </td>
                  <td className="text-right mono tabular-nums text-ink">{vector.count}</td>
                  <td className="text-right mono tabular-nums text-ink-dim">{vector.incidentCount}</td>
                  <td className="text-right mono tabular-nums text-ink-dim">
                    {vector.reproducibleCount}
                    <span className="text-ink-faint"> / {vector.incidentCount}</span>
                  </td>
                  <td className="text-right mono tabular-nums text-ink-dim">
                    {formatPct(vector.meanConfidence, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="flex items-center gap-2 border-t border-edge px-4 py-3 text-[0.66rem] leading-relaxed text-ink-faint sm:px-5">
          <Layers3 className="h-3 w-3 shrink-0" aria-hidden="true" />
          A finding is one incident × one recorded vector. An incident with three vectors contributes three findings.
        </p>
      </Panel>
    </div>
  );
}
