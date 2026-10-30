'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, CornerDownRight, Flame } from 'lucide-react';
import type { TraceNode } from '@helix/core';
import { formatEth, formatGas, truncateAddress } from '../lib/format';
import { EmptyState } from './Panel';

interface TraceViewerProps {
  root: TraceNode | null;
}

function keyOf(node: TraceNode): string {
  return `${node.contractName}::${node.fn}`;
}

function countDescendants(node: TraceNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

function extractValue(raw: string): string | null {
  const match = /value:\s*(\d+)/.exec(raw);
  if (!match) return null;
  return formatEth(match[1], 4);
}

export function TraceViewer({ root }: TraceViewerProps) {
  const repeated = useMemo(() => {
    const counts = new Map<string, number>();
    if (!root) return new Set<string>();
    const walk = (node: TraceNode): void => {
      if (node.contractName !== 'VM') {
        const key = keyOf(node);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      node.children.forEach(walk);
    };
    walk(root);
    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
  }, [root]);

  if (!root) {
    return (
      <EmptyState
        title="No trace captured"
        hint="Run a local Foundry simulation to parse the call tree from forge output."
      />
    );
  }

  return (
    <div className="scroll-y max-h-[560px] overflow-x-auto rounded-[9px] border border-edge bg-abyss/40 p-2">
      <TraceRow node={root} depth={0} repeated={repeated} />
    </div>
  );
}

function TraceRow({
  node,
  depth,
  repeated,
}: {
  node: TraceNode;
  depth: number;
  repeated: Set<string>;
}) {
  const [open, setOpen] = useState(depth < 2 || (depth < 4 && repeated.has(keyOf(node))));
  const hasChildren = node.children.length > 0;
  const harness = node.contractName === 'VM';
  const reentrant = !harness && repeated.has(keyOf(node));
  const value = extractValue(node.raw);
  const calls = countDescendants(node);

  return (
    <div>
      <div
        className={`group flex items-start gap-1.5 rounded-md py-1 pr-2 transition-colors hover:bg-elevated/60 ${
          harness ? 'opacity-45' : ''
        }`}
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          disabled={!hasChildren}
          aria-expanded={hasChildren ? open : undefined}
          aria-label={
            hasChildren
              ? `${open ? 'Collapse' : 'Expand'} ${node.contractName}.${node.fn}`
              : `${node.contractName}.${node.fn} has no child calls`
          }
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] ${
            hasChildren
              ? 'text-ink-faint hover:bg-panel-2 hover:text-arterial'
              : 'cursor-default text-transparent'
          }`}
        >
          {hasChildren ? (
            open ? (
              <ChevronDown className="h-3 w-3" aria-hidden />
            ) : (
              <ChevronRight className="h-3 w-3" aria-hidden />
            )
          ) : (
            <span className="h-1 w-1 rounded-full bg-edge" aria-hidden />
          )}
        </button>

        <span className="mt-1 shrink-0 text-ink-faint" aria-hidden>
          {depth > 0 ? <CornerDownRight className="h-3 w-3" /> : <span className="block h-3 w-3" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className={reentrant ? 'text-arterial' : 'text-ink'}>
              <span className={reentrant ? 'text-arterial' : 'text-ink-dim'}>{node.contractName || 'contract'}</span>
              <span className="text-ink-faint">.</span>
              <span className="font-medium">{node.fn || 'fallback'}</span>
              <span className="text-ink-faint">()</span>
            </span>

            <span className="font-mono text-[0.62rem] text-ink-faint" title={node.address}>
              {truncateAddress(node.address, 6, 4)}
            </span>

            {harness ? (
              <span className="chip !py-0 text-[0.55rem]">harness</span>
            ) : null}

            {reentrant ? (
              <span className="chip chip-threat !py-0 text-[0.55rem]">re-entrant</span>
            ) : null}

            {node.isExternalCall ? (
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.12em] text-ember">external</span>
            ) : null}

            {value ? (
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.1em] text-amber">
                value {value}
              </span>
            ) : null}

            <span className="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap font-mono text-[0.62rem] text-ink-faint">
              <span title={`${calls} calls in this subtree`}>{calls} calls</span>
              <span className="flex items-center gap-1 text-arterial/80">
                <Flame className="h-2.5 w-2.5" aria-hidden />
                {formatGas(node.gasUsed)} gas
              </span>
            </span>
          </div>
        </div>
      </div>

      {hasChildren ? (
        <div className="collapse" data-open={open} style={{ visibility: 'visible' }}>
          <div>
            {node.children.map((child) => (
              <TraceRow key={child.id} node={child} depth={depth + 1} repeated={repeated} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
