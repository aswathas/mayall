'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  FlaskConical,
  Hash,
  RotateCw,
  TriangleAlert,
} from 'lucide-react';
import type { AttackVectorId, Incident } from '@helix/core';
import { ATTACK_VECTORS } from '@helix/core';
import type { IncidentResponse } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import {
  formatDate,
  formatInt,
  formatPct,
  formatUsdCompact,
  formatUsdFull,
  truncateAddress,
} from '../../../lib/format';
import { severityFromVectors } from '../../../lib/severity';
import { EmptyState, MicroLabel, Panel, SubBlock } from '../../../components/Panel';
import { MetricStrip } from '../../../components/MetricStrip';
import { SeverityChip } from '../../../components/SeverityChip';
import { ChainChip } from '../../../components/ChainChip';
import { VectorChip } from '../../../components/VectorChip';
import { LiveSimPanel } from '../../../components/LiveSimPanel';
import { Skeleton } from '../../../components/Loading';

const ROLE_TONE: Record<Incident['actors'][number]['role'], string> = {
  attacker: 'text-arterial',
  victim: 'text-ink-dim',
  intermediary: 'text-amber',
};

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={`Copy ${label}`}
      className="btn btn-ghost h-11 w-11 !min-h-0 shrink-0 !p-0 sm:h-7 sm:w-7"
    >
      {copied ? (
        <Check className="h-3 w-3 text-mint" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? 'copied' : ''}
      </span>
    </button>
  );
}

function LossByVector({ incident }: { incident: Incident }) {
  const weights = incident.vectors.map((vectorId) => ({
    vectorId,
    weight: ATTACK_VECTORS[vectorId]?.severityWeight ?? 0.5,
  }));
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0) || 1;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {weights.map(({ vectorId, weight }) => {
          const share = weight / total;
          return (
            <li key={vectorId}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-ink">{ATTACK_VECTORS[vectorId]?.label ?? vectorId}</span>
                <span className="mono text-[0.66rem] text-ink-dim">{formatUsdCompact(incident.lossUsd * share)}</span>
              </div>
              <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-elevated">
                <div className="h-full rounded-full bg-arterial" style={{ width: `${Math.round(share * 100)}%` }} />
              </div>
              <p className="mono mt-1 text-[0.56rem] uppercase tracking-[0.1em] text-ink-faint">
                severity weight {weight.toFixed(2)} · {formatPct(share, 0)} of case loss
              </p>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-edge pt-2.5 text-[0.66rem] leading-relaxed text-ink-faint">
        Per-vector loss is not published for this incident. This split is derived from the taxonomy severity weights
        and is indicative, not reported.
      </p>
    </div>
  );
}

function CaseSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}

export default function CasePage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === 'string' ? params.slug : params?.slug?.[0] ?? null;
  const { data, loading, error, reload } = useApi<IncidentResponse>(
    slug ? `/api/incidents/${encodeURIComponent(slug)}` : null,
  );

  const incident = data?.incident ?? null;
  const notFound = error !== null && error.includes('404');

  if (loading && !data) return <CaseSkeleton />;

  if (notFound) {
    return (
      <div className="panel flex flex-col items-start gap-4 p-8">
        <EmptyState
          title="No case file at this address"
          hint={`No incident in the registry has the slug "${slug ?? ''}". The file may have been renamed, or the link is mistyped.`}
        />
        <Link href="/incidents" className="btn btn-primary h-11 px-3 text-xs sm:h-9">
          Back to the incident registry <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[9px] border border-arterial/35 bg-arterial/[0.06] px-4 py-3">
        <TriangleAlert className="h-4 w-4 shrink-0 text-arterial" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-dim">
          {error
            ? `The case record did not load (${error}). Recovery: check that the console API is reachable, then retry.`
            : 'The case record came back empty. Recovery: retry the request, or open the registry instead.'}
        </p>
        <button type="button" className="btn h-11 px-3 text-[0.72rem] sm:h-8" onClick={reload}>
          <RotateCw className="h-3 w-3" aria-hidden="true" /> Retry
        </button>
        <Link href="/incidents" className="btn h-11 px-3 text-[0.72rem] sm:h-8">
          Registry
        </Link>
      </div>
    );
  }

  const severity = severityFromVectors(incident.vectors);
  const scenarioId = incident.scenarioId ?? null;
  const liveProps =
    incident.reproducible && scenarioId
      ? { scenarioId, caseSlug: incident.slug, scenarioTitle: incident.name }
      : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <h1 className="display text-[2rem] font-medium leading-[1.05] text-ink sm:text-[2.6rem]">
              {incident.name}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-dim">
              <span>{incident.target}</span>
              <span aria-hidden="true" className="text-ink-faint">
                ·
              </span>
              <span className="mono text-[0.7rem] text-ink-faint">{formatDate(incident.date)}</span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <ChainChip chain={incident.chain} />
              <SeverityChip severity={severity} />
              {incident.recovered ? <span className="chip chip-safe">recovered</span> : null}
              {incident.reproducible ? <span className="chip chip-threat">local PoC available</span> : null}
            </div>
          </div>

          <div className="shrink-0 text-left sm:text-right">
            <p className="label-micro">Reported loss</p>
            <p className="display mt-1 text-[2.2rem] font-medium leading-none tabular-nums text-arterial sm:text-[2.9rem]">
              {formatUsdCompact(incident.lossUsd)}
            </p>
            <p className="mono mt-1.5 text-[0.62rem] text-ink-faint">
              {formatUsdFull(incident.lossUsd)}
              {incident.lossAmount ? ` · ${formatInt(Number(incident.lossAmount))} ${incident.lossAsset ?? ''}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {incident.vectors.map((vectorId: AttackVectorId) => (
            <VectorChip key={vectorId} vectorId={vectorId} />
          ))}
        </div>
      </header>

      <MetricStrip
        items={[
          {
            label: 'Reported loss',
            value: formatUsdCompact(incident.lossUsd),
            hint: 'value at disclosure',
            tone: 'threat',
          },
          {
            label: 'Attack vectors',
            value: String(incident.vectors.length),
            hint: incident.vectors.map((vectorId) => ATTACK_VECTORS[vectorId]?.label ?? vectorId).join(' · '),
          },
          {
            label: 'Documented transactions',
            value: String(incident.txs.length),
            hint: 'on the public record',
          },
          {
            label: 'Local reproduction',
            value: incident.reproducible ? 'Available' : 'None',
            hint: incident.reproducible ? `scenario ${scenarioId ?? '—'}` : 'no local proof-of-concept',
            tone: incident.reproducible ? 'safe' : 'default',
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Summary">
            <p className="max-w-[72ch] text-sm leading-relaxed text-ink-dim">{incident.summary}</p>
          </Panel>

          <Panel title="Root cause">
            <p className="max-w-[72ch] text-sm leading-relaxed text-ink-dim">{incident.rootCause}</p>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
              {[...new Set(incident.vectors.map((vectorId) => ATTACK_VECTORS[vectorId]?.category ?? '—'))].map(
                (category) => (
                  <span
                    key={category}
                    className="mono text-[0.6rem] uppercase tracking-[0.1em] text-ink-faint"
                  >
                    {category}
                  </span>
                ),
              )}
            </div>
          </Panel>

          <Panel title="Actors and transactions">
            <SubBlock title="Addresses">
              <ul className="flex flex-col divide-y divide-edge/70">
                {incident.actors.map((actor) => (
                  <li
                    key={`${actor.address}-${actor.label}`}
                    className="flex items-center gap-2 py-2 first:pt-0 last:pb-0"
                  >
                    <span
                      className={`mono w-[5.4rem] shrink-0 text-[0.54rem] uppercase tracking-[0.12em] ${ROLE_TONE[actor.role]}`}
                    >
                      {actor.role}
                    </span>
                    <span className="mono min-w-0 flex-1 truncate text-[0.7rem] text-ink" title={actor.address}>
                      {truncateAddress(actor.address, 10, 8)}
                    </span>
                    <span className="hidden min-w-0 max-w-[9rem] truncate text-[0.66rem] text-ink-faint sm:block">
                      {actor.label}
                    </span>
                    <CopyButton
                      value={actor.address}
                      label={`${actor.role} address ${truncateAddress(actor.address, 6, 4)}`}
                    />
                  </li>
                ))}
              </ul>
            </SubBlock>

            <SubBlock title="Transaction hashes" className="mt-4">
              {incident.txs.length ? (
                <ul className="flex flex-col divide-y divide-edge/70">
                  {incident.txs.map((tx) => (
                    <li key={tx} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                      <Hash className="h-3 w-3 shrink-0 text-ink-faint" aria-hidden="true" />
                      <span className="mono min-w-0 flex-1 truncate text-[0.7rem] text-ink" title={tx}>
                        {tx}
                      </span>
                      <CopyButton value={tx} label={`transaction hash ${truncateAddress(tx, 6, 4)}`} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-faint">
                  No transaction hash was published for this incident. The record is limited to the case narrative and
                  references.
                </p>
              )}
            </SubBlock>
          </Panel>

          <Panel title="References">
            {incident.references.length ? (
              <ul className="flex flex-col gap-2">
                {incident.references.map((reference) => (
                  <li key={reference.url}>
                    <a
                      href={reference.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="group flex items-center gap-2 text-xs text-ink-dim transition-colors duration-100 hover:text-arterial"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0 text-ink-faint" aria-hidden="true" />
                      <span className="shrink-0 group-hover:underline group-hover:underline-offset-2">
                        {reference.label}
                      </span>
                      <span className="mono min-w-0 truncate text-[0.58rem] text-ink-faint">{reference.url}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-faint">No public references were recorded for this case.</p>
            )}
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Panel title="Loss by vector">
            <LossByVector incident={incident} />
          </Panel>

          <Panel title="Chain">
            <div className="flex items-center gap-2">
              <ChainChip chain={incident.chain} />
              <span className="text-xs leading-relaxed text-ink-dim">execution environment at the time of the incident</span>
            </div>
            <dl className="mt-3 flex flex-col gap-1.5 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-faint">First disclosed</dt>
                <dd className="mono text-ink-dim">{formatDate(incident.date)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-faint">Target</dt>
                <dd className="min-w-0 truncate text-ink-dim" title={incident.target}>
                  {incident.target}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-faint">Case slug</dt>
                <dd className="mono min-w-0 truncate text-ink-dim">{incident.slug}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Reproduction">
            {liveProps ? (
              <div className="flex flex-col gap-3">
                <p className="text-xs leading-relaxed text-ink-dim">
                  This incident ships with a local Foundry reproduction. Running it executes the exploit against the
                  repository&apos;s contract and returns the real trace, storage diff and detector findings.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/lab?scenario=${encodeURIComponent(liveProps.scenarioId)}`}
                    className="btn btn-primary h-11 px-3 text-xs sm:h-9"
                  >
                    <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                    Open in the live lab
                  </Link>
                  <Link href={`/cases/${incident.slug}/report`} className="btn h-11 px-3 text-xs sm:h-9">
                    Written report <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
                <p className="mono border-t border-edge pt-2.5 text-[0.56rem] uppercase tracking-[0.1em] text-ink-faint">
                  scenario::{liveProps.scenarioId} · run panel below
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs leading-relaxed text-ink-dim">
                  No local proof-of-concept exists for this incident. Mayall has not executed this exploit, so the case
                  rests on the public record alone.
                </p>
                <p className="text-[0.68rem] leading-relaxed text-ink-faint">
                  The record contains {incident.txs.length} documented transaction
                  {incident.txs.length === 1 ? '' : 's'}, {incident.actors.length} actor address
                  {incident.actors.length === 1 ? '' : 'es'} and {incident.references.length} reference
                  {incident.references.length === 1 ? '' : 's'}. Those are cited above; nothing on this page is
                  presented as captured evidence.
                </p>
                <Link href={`/cases/${incident.slug}/report`} className="btn h-11 self-start px-3 text-xs sm:h-9">
                  Written report <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            )}
          </Panel>
        </aside>
      </div>

      {liveProps ? (
        <section aria-labelledby="live-heading" className="flex flex-col gap-3">
          <div>
            <h2 id="live-heading" className="display text-lg font-medium text-ink">
              Live execution · {incident.name}
            </h2>
            <p className="mt-1 max-w-[70ch] text-xs leading-relaxed text-ink-dim">
              The reproduction below runs <span className="mono text-ink">forge test</span> against the local harness and
              streams back everything the engine captured. The result is simulated evidence, not mainnet data.
            </p>
          </div>
          <LiveSimPanel {...liveProps} />
        </section>
      ) : null}
    </div>
  );
}
