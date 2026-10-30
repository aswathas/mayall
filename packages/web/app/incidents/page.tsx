'use client';

import { Suspense, useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { Incident } from '@helix/core';
import { useApi } from '../../lib/useApi';
import { formatInt, formatUsdCompact } from '../../lib/format';
import { Panel } from '../../components/Panel';
import { IncidentTable } from '../../components/IncidentTable';
import { IncidentFilters, type IncidentFilterPatch, type IncidentSort } from '../../components/IncidentFilters';

const SORTS: IncidentSort[] = ['loss-desc', 'loss-asc', 'date-desc', 'date-asc'];

function parseSort(value: string | null): IncidentSort {
  return SORTS.includes(value as IncidentSort) ? (value as IncidentSort) : 'loss-desc';
}

function RegistryView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, error, reload } = useApi<Incident[]>('/api/incidents');

  const search = searchParams.get('q') ?? '';
  const chain = searchParams.get('chain') ?? '';
  const vector = searchParams.get('vector') ?? '';
  const sort = parseSort(searchParams.get('sort'));

  const incidents = data ?? [];

  const update = useCallback(
    (patch: IncidentFilterPatch) => {
      const next = new URLSearchParams(searchParams.toString());
      const set = (key: string, value: string | undefined, emptyValue = '') => {
        if (value === undefined) return;
        if (value === emptyValue) next.delete(key);
        else next.set(key, value);
      };
      set('q', patch.search);
      set('chain', patch.chain);
      set('vector', patch.vector);
      if (patch.sort !== undefined) set('sort', patch.sort, 'loss-desc');
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return incidents
      .filter((incident) => {
        if (chain && incident.chain !== chain) return false;
        if (vector && !incident.vectors.includes(vector as Incident['vectors'][number])) return false;
        if (!needle) return true;
        return (
          incident.name.toLowerCase().includes(needle) || incident.target.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => {
        switch (sort) {
          case 'loss-asc':
            return a.lossUsd - b.lossUsd;
          case 'date-desc':
            return b.date.localeCompare(a.date);
          case 'date-asc':
            return a.date.localeCompare(b.date);
          case 'loss-desc':
          default:
            return b.lossUsd - a.lossUsd;
        }
      });
  }, [incidents, chain, vector, search, sort]);

  const filteredLoss = filtered.reduce((sum, incident) => sum + incident.lossUsd, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="boot-sweep" aria-hidden="true" />

      <header className="flex flex-col gap-2">
        <h1 className="display text-[1.9rem] leading-tight text-ink sm:text-[2.35rem]">Incident registry</h1>
        <p className="max-w-[75ch] text-sm leading-relaxed text-ink-dim">
          Every tracked exploit with its target, chain and attack vectors, and whether HELIX holds a working
          Foundry reproduction. Filters live in the URL, so a narrowed view can be shared as a link.
        </p>
      </header>

      <Panel title="Filters" subtitle="Search, chain, vector and order">
        <IncidentFilters
          search={search}
          chain={chain}
          vector={vector}
          sort={sort}
          onChange={update}
          resultCount={data ? filtered.length : undefined}
          totalCount={data ? incidents.length : undefined}
        />
      </Panel>

      <Panel
        title="Records"
        flush
        action={
          data ? (
            <span className="mono text-[0.62rem] text-ink-dim">
              {formatInt(filtered.length)} of {formatInt(incidents.length)} · {formatUsdCompact(filteredLoss)}
            </span>
          ) : null
        }
      >
        {!data && !error ? (
          <div className="flex flex-col gap-2 p-4" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="animate-pulse h-9 w-full rounded-md bg-elevated" />
            ))}
          </div>
        ) : error && !data ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-4">
            <AlertTriangle className="h-4 w-4 shrink-0 text-ember" aria-hidden="true" />
            <p className="text-sm text-ink">Incident feed unavailable — {error}.</p>
            <p className="text-xs text-ink-dim">
              The table reads <span className="mono">/api/incidents</span> from the local console server.
            </p>
            <button type="button" onClick={reload} className="btn btn-ghost ml-auto h-9 px-3 text-xs">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : (
          <IncidentTable incidents={filtered} />
        )}
      </Panel>
    </div>
  );
}

export default function IncidentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-2" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="animate-pulse h-9 w-full rounded-md bg-elevated" />
          ))}
        </div>
      }
    >
      <RegistryView />
    </Suspense>
  );
}
