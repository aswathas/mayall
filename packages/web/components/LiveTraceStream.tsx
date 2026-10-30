'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownRight, Flame, Terminal } from 'lucide-react';
import { formatGas } from '../lib/format';
import { MicroLabel } from './Panel';

/** One parsed frame from a live forge stream. */
export interface LiveTraceNode {
  id: number;
  depth: number;
  contract: string;
  fn: string;
  gas: number;
  value: boolean;
  external: boolean;
}

const NODE_RE = /\[(\d+)\]\s*(.*)$/;
const BRANCH_RE = /[├└]/;
const ADDRESS_RE = /(0x[0-9a-fA-F]{40})/;
const CREATION_RE = /new\s+([A-Za-z0-9_$]+)@(0x[0-9a-fA-F]{40})/;
const CALL_RE = /([A-Za-z0-9_$.]+)::([A-Za-z0-9_$]+)\s*(\{[^}]*\})?\s*\(/;
const VALUE_RE = /value:\s*(\d+)/;

function depthOf(line: string): number {
  const branch = line.search(BRANCH_RE);
  if (branch >= 0) return Math.floor(branch / 4);
  const leading = line.length - line.trimStart().length;
  return leading >= 4 ? Math.floor(leading / 4) : 0;
}

/**
 * Mirrors the server-side trace parser closely enough to draw the tree while
 * forge is still writing. The authoritative tree always comes from the engine
 * when the run completes; this one exists for the live read.
 */
export function parseLiveTrace(lines: string[]): LiveTraceNode[] {
  const nodes: LiveTraceNode[] = [];
  let counter = 0;

  for (const raw of lines) {
    if (!raw.trim()) continue;
    if (/^\s*\[(PASS|FAIL)\]/i.test(raw)) continue;

    const match = raw.match(NODE_RE);
    if (!match) continue;

    const body = match[2];
    if (/^\s*(←|→)/.test(body)) continue;

    const node: LiveTraceNode = {
      id: counter++,
      depth: depthOf(raw),
      contract: '',
      fn: '',
      gas: Number(match[1]),
      value: VALUE_RE.test(body) && Number(body.match(VALUE_RE)?.[1] ?? '0') > 0,
      external: false,
    };

    const creation = body.match(CREATION_RE);
    if (creation) {
      node.contract = creation[1];
      node.fn = 'constructor';
      node.external = true;
      nodes.push(node);
      continue;
    }

    const call = body.match(CALL_RE);
    if (call) {
      node.contract = call[1];
      node.fn = call[2];
      nodes.push(node);
      continue;
    }

    const address = body.match(ADDRESS_RE);
    const bare = body.match(/^([A-Za-z0-9_$]+)\s*\(/);
    if (bare) {
      node.fn = bare[1];
    } else if (address) {
      node.contract = 'contract';
      node.fn = 'fallback/receive';
      node.external = true;
    } else {
      continue;
    }
    nodes.push(node);
  }

  return nodes;
}

interface LiveTraceStreamProps {
  lines: string[];
  running: boolean;
  caseId?: string | null;
}

const MAX_RAW_LINES = 900;

export function LiveTraceStream({ lines, running, caseId }: LiveTraceStreamProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const rawRef = useRef<HTMLPreElement | null>(null);

  const parsed = useMemo(() => parseLiveTrace(lines), [lines]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setRevealed(parsed.length);
      return;
    }
    if (revealed >= parsed.length) return;
    const timer = window.setTimeout(() => {
      setRevealed((value) => Math.min(parsed.length, value + 1));
    }, 26);
    return () => window.clearTimeout(timer);
  }, [parsed.length, revealed, reducedMotion]);

  useEffect(() => {
    if (revealed > parsed.length) setRevealed(parsed.length);
  }, [parsed.length, revealed]);

  useEffect(() => {
    const element = rawRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [lines.length]);

  const visible = useMemo(() => parsed.slice(0, Math.max(0, revealed)), [parsed, revealed]);

  const repeated = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of parsed) {
      if (!node.contract || !node.fn || node.contract === 'VM') continue;
      const key = `${node.contract}::${node.fn}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(
      [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key),
    );
  }, [parsed]);

  const rawLines = lines.slice(-MAX_RAW_LINES);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <MicroLabel>forge stdout</MicroLabel>
          <span className="mono text-[0.56rem] uppercase tracking-[0.12em] text-ink-faint">
            {lines.length} lines
          </span>
        </div>
        <pre
          ref={rawRef}
          aria-label="Raw forge output"
          className="scroll-y h-[380px] overflow-auto whitespace-pre rounded-[9px] border border-edge bg-abyss/60 p-3 font-mono text-[0.6rem] leading-relaxed text-ink-dim"
        >
          {rawLines.length ? rawLines.join('\n') : 'Waiting for forge output…'}
        </pre>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <MicroLabel>parsed call tree</MicroLabel>
          <span className="mono flex items-center gap-1.5 text-[0.56rem] uppercase tracking-[0.12em] text-ink-faint">
            {running ? <span className="live-dot h-1.5 w-1.5 rounded-full bg-arterial" aria-hidden /> : null}
            {visible.length} nodes
          </span>
        </div>
        <div
          className="scroll-y h-[380px] overflow-auto rounded-[9px] border border-edge bg-abyss/40 p-2"
          aria-live={running ? 'polite' : 'off'}
          aria-label="Parsed call tree from the live trace"
        >
          {visible.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
              <Terminal className="h-4 w-4 text-ink-faint" aria-hidden />
              <p className="max-w-[28ch] text-[0.68rem] leading-relaxed text-ink-faint">
                Call frames appear here as forge emits them. The tree grows with each parsed depth level.
              </p>
            </div>
          ) : (
            <ol className="flex flex-col">
              {visible.map((node) => {
                const key = `${node.contract}::${node.fn}`;
                const reentrant = node.contract !== 'VM' && repeated.has(key);
                const harness = node.contract === 'VM';
                return (
                  <li
                    key={node.id}
                    className="rise-in flex items-baseline gap-1.5 rounded-[5px] py-[3px] pr-2"
                    style={{ paddingLeft: `${Math.min(node.depth, 10) * 14}px` }}
                  >
                    <CornerDownRight
                      className={`h-2.5 w-2.5 shrink-0 ${reentrant ? 'text-arterial' : 'text-ink-faint/60'}`}
                      aria-hidden
                    />
                    <span
                      className={`min-w-0 break-all font-mono text-[0.64rem] ${
                        harness ? 'opacity-55' : 'text-ink'
                      }`}
                    >
                      <span className={reentrant ? 'text-arterial' : 'text-ink-dim'}>{node.contract || 'contract'}</span>
                      <span className="text-ink-faint">.</span>
                      <span className={reentrant ? 'font-medium text-arterial' : 'font-medium'}>{node.fn}</span>
                      <span className="text-ink-faint">()</span>
                    </span>
                    {reentrant ? (
                      <span className="chip chip-threat !py-0 shrink-0 text-[0.5rem]">re-entrant</span>
                    ) : null}
                    {node.value ? (
                      <span className="mono shrink-0 text-[0.5rem] uppercase tracking-[0.1em] text-amber">value</span>
                    ) : null}
                    <span className="mono ml-auto flex shrink-0 items-center gap-1 text-[0.56rem] tabular-nums text-ink-faint">
                      <Flame className="h-2.5 w-2.5 text-arterial/70" aria-hidden />
                      {formatGas(node.gas)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      {caseId ? (
        <p className="mono text-[0.54rem] uppercase tracking-[0.14em] text-ink-faint lg:col-span-2">
          case {caseId}
        </p>
      ) : null}
    </div>
  );
}
