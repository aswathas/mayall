'use client';

import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { ATTACK_VECTOR_LIST, CHAIN_COLORS, type Chain } from '@helix/core';
import { formatInt } from '../lib/format';

export type IncidentSort = 'loss-desc' | 'loss-asc' | 'date-desc' | 'date-asc';

export interface IncidentFilterPatch {
  search?: string;
  chain?: string;
  vector?: string;
  sort?: IncidentSort;
}

interface IncidentFiltersProps {
  search: string;
  chain: string;
  vector: string;
  sort: IncidentSort;
  onChange: (patch: IncidentFilterPatch) => void;
  resultCount?: number;
  totalCount?: number;
}

const CHAINS = Object.keys(CHAIN_COLORS) as Chain[];

const FIELD =
  'h-11 w-full rounded-[9px] border border-edge bg-panel-2 px-3 text-sm text-ink placeholder:text-ink-faint transition-colors duration-100 hover:border-edge-strong focus-visible:border-edge-strong';

const SELECT = `${FIELD} appearance-none pr-9 font-mono text-[0.78rem]`;

const SORTS: { value: IncidentSort; label: string }[] = [
  { value: 'loss-desc', label: 'Loss — high to low' },
  { value: 'loss-asc', label: 'Loss — low to high' },
  { value: 'date-desc', label: 'Date — newest first' },
  { value: 'date-asc', label: 'Date — oldest first' },
];

export function IncidentFilters({
  search,
  chain,
  vector,
  sort,
  onChange,
  resultCount,
  totalCount,
}: IncidentFiltersProps) {
  const active =
    (search.trim() ? 1 : 0) + (chain ? 1 : 0) + (vector ? 1 : 0) + (sort !== 'loss-desc' ? 1 : 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="incident-search" className="label-micro">
            Search
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
            <input
              id="incident-search"
              type="search"
              value={search}
              onChange={(event) => onChange({ search: event.target.value })}
              placeholder="Name or target"
              autoComplete="off"
              className={`${FIELD} pl-9`}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="incident-chain" className="label-micro">
            Chain
          </label>
          <div className="relative">
            <select
              id="incident-chain"
              value={chain}
              onChange={(event) => onChange({ chain: event.target.value })}
              className={SELECT}
            >
              <option value="">All chains</option>
              {CHAINS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="incident-vector" className="label-micro">
            Attack vector
          </label>
          <div className="relative">
            <select
              id="incident-vector"
              value={vector}
              onChange={(event) => onChange({ vector: event.target.value })}
              className={SELECT}
            >
              <option value="">All vectors</option>
              {ATTACK_VECTOR_LIST.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="incident-sort" className="label-micro">
            Sort
          </label>
          <div className="relative">
            <select
              id="incident-sort"
              value={sort}
              onChange={(event) => onChange({ sort: event.target.value as IncidentSort })}
              className={SELECT}
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge pt-3">
        <p className="flex items-center gap-1.5 font-mono text-[0.64rem] text-ink-dim">
          <SlidersHorizontal className="h-3 w-3 text-ink-faint" aria-hidden="true" />
          {resultCount !== undefined && totalCount !== undefined ? (
            <span>
              {formatInt(resultCount)} of {formatInt(totalCount)} records
            </span>
          ) : null}
          <span className="text-ink-faint" aria-hidden="true">
            ·
          </span>
          <span className="text-ink-faint">
            {active} {active === 1 ? 'filter active' : 'filters active'}
          </span>
        </p>
        <button
          type="button"
          onClick={() => onChange({ search: '', chain: '', vector: '', sort: 'loss-desc' })}
          disabled={active === 0}
          className="btn btn-ghost h-11 px-3 text-xs md:h-9"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Clear filters
        </button>
      </div>
    </div>
  );
}
