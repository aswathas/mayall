'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { StorageWrite } from '@helix/core';
import { truncateAddress } from '../lib/format';
import { EmptyState } from './Panel';

interface StorageDiffInspectorProps {
  writes: StorageWrite[];
}

function compactHex(value: string): string {
  if (value.length <= 24) return value;
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export function StorageDiffInspector({ writes }: StorageDiffInspectorProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  if (!writes.length) {
    return (
      <EmptyState
        title="No storage writes"
        hint="This execution did not record a storage diff, so there are no slots to inspect."
      />
    );
  }

  const mutated = writes.filter((write) => write.changed).length;

  const copy = async (slot: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(slot);
      setCopied(slot);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(null), 1400);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <p className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-ink-faint">
        <span className="text-arterial">{mutated}</span> of {writes.length} slots mutated ·{' '}
        {writes.length - mutated} unchanged
      </p>

      <div className="overflow-x-auto rounded-[9px] border border-edge">
        <table className="data-table min-w-[900px]">
          <thead>
            <tr>
              <th>Contract</th>
              <th>Label</th>
              <th>Slot</th>
              <th>Before</th>
              <th>After</th>
              <th>Kind</th>
            </tr>
          </thead>
          <tbody>
            {writes.map((write, index) => {
              const isCopied = copied === write.slot;
              return (
                <tr
                  key={`${write.contract}-${write.slot}-${index}`}
                  className={write.changed ? 'bg-arterial/[0.045]' : 'opacity-60'}
                >
                  <td>
                    <span className={write.changed ? 'text-ink' : 'text-ink-dim'}>{write.contractName}</span>
                    <span className="mono mt-0.5 block text-[0.58rem] text-ink-faint" title={write.contract}>
                      {truncateAddress(write.contract, 6, 4)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="mono text-[0.68rem] text-ink-dim">{write.label}</span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span className="mono text-[0.64rem] text-ink-dim" title={write.slot}>
                        {compactHex(write.slot)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void copy(write.slot)}
                        aria-label={`Copy storage slot for ${write.contractName} ${write.label}`}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-ink-faint transition-colors hover:bg-elevated hover:text-arterial"
                      >
                        {isCopied ? (
                          <Check className="h-3 w-3 text-mint" aria-hidden />
                        ) : (
                          <Copy className="h-3 w-3" aria-hidden />
                        )}
                      </button>
                    </div>
                  </td>
                  <td>
                    <span className="mono block max-w-[200px] break-all text-[0.64rem] text-ink-faint" title={write.before}>
                      {compactHex(write.before)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`mono block max-w-[200px] break-all text-[0.64rem] ${
                        write.changed ? 'text-arterial' : 'text-ink-faint'
                      }`}
                      title={write.after}
                    >
                      {compactHex(write.after)}
                    </span>
                    <span
                      className={`mono mt-0.5 block text-[0.52rem] uppercase tracking-[0.12em] ${
                        write.changed ? 'text-arterial/80' : 'text-ink-faint'
                      }`}
                    >
                      {write.changed ? 'mutated' : 'unchanged'}
                    </span>
                  </td>
                  <td>
                    <span className={`chip ${write.changed ? 'chip-threat' : ''}`}>{write.kind}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
