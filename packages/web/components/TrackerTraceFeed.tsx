'use client';

import { formatGas } from '../lib/format';

export interface FlatTraceNode {
  key: string;
  depth: number;
  contract: string;
  fn: string;
  gas: number;
  external: boolean;
}

/**
 * The running feed. Newest frame first, so the newest node is always visible
 * without fight-the-user auto-scrolling. Only parsed frames are rendered.
 */
export function TrackerTraceFeed({
  nodes,
  revealed,
  total,
}: {
  nodes: FlatTraceNode[];
  revealed: number;
  total: number;
}) {
  const visible = nodes.slice(0, revealed).slice(-70).reverse();

  return (
    <div className="min-w-0">
      {visible.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="label-micro">No trace nodes yet</p>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-ink-faint">
            Start a run and each parsed frame appears here as the replay reaches it.
          </p>
        </div>
      ) : (
        <ol className="max-h-[300px] overflow-y-auto" aria-label="Parsed trace frames, newest first">
          {visible.map((node) => {
            const withdraw = node.fn === 'withdraw';
            return (
              <li
                key={node.key}
                className="flex items-center gap-2 border-b border-edge/60 py-1.5 pr-3 last:border-b-0"
                style={{ paddingLeft: `${10 + Math.min(node.depth, 12) * 7}px` }}
              >
                <span className="mono w-7 shrink-0 text-[0.55rem] tabular-nums text-ink-faint">d{node.depth}</span>
                <span
                  className={`mono min-w-0 flex-1 truncate text-[0.68rem] ${
                    withdraw ? 'text-arterial' : node.external ? 'text-ember' : 'text-ink-dim'
                  }`}
                >
                  {node.contract}
                  <span className="text-ink-faint">::</span>
                  {node.fn}
                </span>
                <span className="mono shrink-0 text-[0.58rem] tabular-nums text-ink-faint">
                  {formatGas(node.gas)}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-edge px-3 py-2">
        <span className="mono text-[0.55rem] uppercase tracking-[0.12em] text-ink-faint">
          {revealed} of {total} frames revealed
        </span>
        <span className="mono text-[0.55rem] uppercase tracking-[0.12em] text-ink-faint">newest first</span>
      </div>
    </div>
  );
}
