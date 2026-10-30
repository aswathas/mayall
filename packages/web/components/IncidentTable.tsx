'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, FlaskConical } from 'lucide-react';
import type { Incident, Severity } from '@helix/core';
import { formatDate, formatUsdCompact } from '../lib/format';
import { SeverityChip } from './SeverityChip';
import { ChainChip } from './ChainChip';
import { EmptyState } from './Panel';

interface IncidentTableProps {
  incidents: Incident[];
  /** Tighter row rhythm for the overview's top-incident table. */
  dense?: boolean;
}

/** The same loss bands the overview API uses, so chips agree with the split. */
function severityFromLoss(lossUsd: number): Severity {
  if (lossUsd >= 100_000_000) return 'critical';
  if (lossUsd >= 10_000_000) return 'high';
  if (lossUsd >= 1_000_000) return 'medium';
  return 'low';
}

export function IncidentTable({ incidents, dense = false }: IncidentTableProps) {
  const router = useRouter();

  if (!incidents.length) {
    return (
      <EmptyState
        title="No incidents"
        hint="No incident matches these filters — clear one to widen the search."
      />
    );
  }

  const cell = dense ? 'px-3 py-2' : 'px-3.5 py-2.5';

  return (
    <>
      <div className="hidden md:block">
        <table className="data-table table-fixed">
          <colgroup>
            <col />
            <col className="w-[116px]" />
            <col className="w-[108px]" />
            <col className="w-[92px]" />
            <col className="w-[108px]" />
            <col className="w-[78px]" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Incident</th>
              <th scope="col">Chain</th>
              <th scope="col">Severity</th>
              <th scope="col" className="text-right">
                Loss
              </th>
              <th scope="col" className="text-right">
                Date
              </th>
              <th scope="col" className="text-right">
                PoC
              </th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((incident) => (
              <tr
                key={incident.id}
                className="cursor-pointer"
                onClick={() => router.push(`/cases/${incident.slug}`)}
              >
                <td className={cell}>
                  <Link
                    href={`/cases/${incident.slug}`}
                    onClick={(event) => event.stopPropagation()}
                    className="group flex items-center gap-1 text-sm text-ink transition-colors duration-100 hover:text-arterial"
                  >
                    <span className="truncate">{incident.name}</span>
                    <ArrowUpRight className="h-3 w-3 shrink-0 text-ink-faint opacity-0 transition-opacity duration-100 group-hover:opacity-100" />
                  </Link>
                  <span className="mt-0.5 block truncate text-[0.68rem] leading-tight text-ink-faint">
                    {incident.target}
                  </span>
                </td>
                <td className={cell}>
                  <ChainChip chain={incident.chain} />
                </td>
                <td className={cell}>
                  <SeverityChip severity={severityFromLoss(incident.lossUsd)} compact />
                </td>
                <td className={`${cell} text-right`}>
                  <span className="mono whitespace-nowrap text-xs text-ink">
                    {formatUsdCompact(incident.lossUsd)}
                  </span>
                </td>
                <td className={`${cell} text-right`}>
                  <span className="mono whitespace-nowrap text-[0.68rem] text-ink-dim">
                    {formatDate(incident.date)}
                  </span>
                </td>
                <td className={`${cell} text-right`}>
                  {incident.reproducible ? (
                    <span className="chip chip-safe" title="Local Foundry reproduction available">
                      <FlaskConical className="h-3 w-3" aria-hidden="true" />
                      REPRO
                    </span>
                  ) : (
                    <span className="label-micro">
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">No reproduction</span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col md:hidden">
        {incidents.map((incident) => (
          <li key={incident.id} className="border-b border-edge last:border-0">
            <Link
              href={`/cases/${incident.slug}`}
              className="flex flex-col gap-2 px-4 py-3 transition-colors duration-100 hover:bg-elevated"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{incident.name}</p>
                  <p className="mt-0.5 truncate text-[0.68rem] text-ink-faint">{incident.target}</p>
                </div>
                <SeverityChip severity={severityFromLoss(incident.lossUsd)} compact />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <ChainChip chain={incident.chain} />
                <span className="mono text-xs text-ink">{formatUsdCompact(incident.lossUsd)}</span>
                <span className="mono text-[0.66rem] text-ink-faint">{formatDate(incident.date)}</span>
                {incident.reproducible ? <span className="chip chip-safe">REPRO</span> : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
