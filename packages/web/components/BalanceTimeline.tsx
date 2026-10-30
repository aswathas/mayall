'use client';

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { BalanceDelta } from '@helix/core';
import { formatEth, isNegativeWei, isPositiveWei, signedEth, truncateAddress } from '../lib/format';
import { EmptyState } from './Panel';

interface BalanceTimelineProps {
  balances: BalanceDelta[];
}

export function BalanceTimeline({ balances }: BalanceTimelineProps) {
  if (!balances.length) {
    return (
      <EmptyState
        title="No balance deltas"
        hint="The artifact recorded no before/after balances for this execution."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-[9px] border border-edge">
      <table className="data-table min-w-[760px]">
        <thead>
          <tr>
            <th>Account</th>
            <th className="text-right">Before</th>
            <th className="text-right">After</th>
            <th className="text-right">Delta</th>
            <th className="text-right">Movement</th>
          </tr>
        </thead>
        <tbody>
          {balances.map((balance, index) => {
            const loss = isNegativeWei(balance.deltaWei);
            const gain = isPositiveWei(balance.deltaWei);
            return (
              <tr key={`${balance.address}-${index}`}>
                <td>
                  <span className="block text-[0.82rem] text-ink">{balance.label || 'account'}</span>
                  <span className="mono mt-0.5 block text-[0.58rem] text-ink-faint" title={balance.address}>
                    {truncateAddress(balance.address, 10, 6)}
                  </span>
                </td>
                <td className="mono whitespace-nowrap text-right text-[0.7rem] tabular-nums text-ink-dim">
                  {formatEth(balance.beforeWei, 4)}
                </td>
                <td className="mono whitespace-nowrap text-right text-[0.7rem] tabular-nums text-ink">
                  {formatEth(balance.afterWei, 4)}
                </td>
                <td
                  className={`mono whitespace-nowrap text-right text-[0.72rem] font-medium tabular-nums ${
                    loss ? 'text-arterial' : gain ? 'text-mint' : 'text-ink-faint'
                  }`}
                >
                  {signedEth(balance.deltaWei, 4)}
                </td>
                <td className="text-right">
                  <span
                    className={`inline-flex items-center gap-1 font-mono text-[0.56rem] uppercase tracking-[0.12em] ${
                      loss ? 'text-arterial' : gain ? 'text-mint' : 'text-ink-faint'
                    }`}
                  >
                    {loss ? (
                      <ArrowDownRight className="h-3 w-3" aria-hidden />
                    ) : gain ? (
                      <ArrowUpRight className="h-3 w-3" aria-hidden />
                    ) : (
                      <Minus className="h-3 w-3" aria-hidden />
                    )}
                    {loss ? 'loss' : gain ? 'gain' : 'stable'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
