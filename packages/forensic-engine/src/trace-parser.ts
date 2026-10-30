import type { TraceNode, GasFlameNode } from '@helix/core';

/**
 * Parses the human-readable call tree that `forge test -vvvv` emits into a
 * structured trace, and derives a proportional gas flame from it.
 *
 * Forge renders the tree with a 4-column indent per level:
 *
 *   [2098604] ReentrancyExploitTest::testExploit()
 *     ├─ [195418] ReentrancyAttacker::attack(6)
 *     │   ├─ [28901] ReentrancyVault::deposit{value: 1000000000000000000}()
 *     │   └─ ← [Return]
 */

const NODE_RE = /\[(\d+)\]\s*(.*)$/;
const BRANCH_RE = /[├└]/;
const ADDRESS_RE = /(0x[0-9a-fA-F]{40})/;
const CREATION_RE = /new\s+([A-Za-z0-9_$]+)@(0x[0-9a-fA-F]{40})/;
/** `Contract::function{value: 1}()` — the selector payload may carry a value or gas suffix. */
const CALL_RE = /([A-Za-z0-9_$.]+)::([A-Za-z0-9_$]+)\s*(\{[^}]*\})?\s*\(/;
const VALUE_RE = /value:\s*(\d+)/;

export interface ParsedTrace {
  root: TraceNode | null;
  flame: GasFlameNode[];
  /** Flat list of every node, in document order. */
  nodes: TraceNode[];
  /** Raw lines that look like a call into an address (for detectors). */
  rawLines: string[];
}

function emptyNode(id: string, depth: number): TraceNode {
  return {
    id,
    depth,
    address: '',
    contractName: '',
    fn: '',
    gasUsed: 0,
    raw: '',
    children: [],
    isExternalCall: false,
    isValueTransfer: false,
  };
}

/** Extracts contract/function names from the text after the gas bracket. */
function describe(node: TraceNode, body: string): void {
  const text = body.trim();

  const creation = text.match(CREATION_RE);
  if (creation) {
    node.contractName = creation[1];
    node.address = creation[2];
    node.fn = 'constructor';
    node.isExternalCall = true;
    return;
  }

  const arrow = text.match(/^→\s*(.*)$/);
  const payload = arrow ? arrow[1] : text;
  const isArrow = Boolean(arrow);

  const addrMatch = payload.match(ADDRESS_RE);
  if (addrMatch) node.address = addrMatch[1];

  const call = payload.match(CALL_RE);
  if (call) {
    node.contractName = call[1];
    node.fn = call[2];
    return;
  }

  const bare = payload.match(/^([A-Za-z0-9_$]+)\s*\(/);
  if (bare) {
    node.fn = bare[1];
    return;
  }

  if (addrMatch) {
    node.fn = 'fallback/receive';
    node.isExternalCall = true;
    return;
  }

  if (isArrow) {
    node.fn = 'call';
    node.isExternalCall = true;
  }
}

/** Forge indents four columns per depth level; the root sits at depth 0. */
function depthOf(line: string): number {
  const branchIndex = line.search(BRANCH_RE);
  if (branchIndex >= 0) return Math.floor(branchIndex / 4);
  const leading = line.length - line.trimStart().length;
  return leading >= 4 ? Math.floor(leading / 4) : 0;
}

export function parseForgeTrace(text: string): ParsedTrace {
  const lines = text.split(/\r?\n/);
  const nodes: TraceNode[] = [];
  const rawLines: string[] = [];
  let root: TraceNode | null = null;
  let counter = 0;

  // Stack of nodes, one per open depth.
  const stack: TraceNode[] = [];

  for (const raw of lines) {
    if (!raw.trim()) continue;
    if (/^\s*\[(PASS|FAIL)\]/i.test(raw)) continue;
    if (/^(Ran \d+ test|Suite result:|Encountered a total of|Encountered \d+ failing)/.test(raw.trim())) continue;

    // Result markers ("← [Return]", "← [Stop]") and event emissions carry no gas
    // bracket, so they never reach the node matcher.
    const m = raw.match(NODE_RE);
    if (!m) continue;
    if (/^\s*[│\s]*[├└]?\s*←/.test(raw)) continue;

    const [, gasStr, body] = m;
    const depth = depthOf(raw);

    const node = emptyNode(`n${counter++}`, depth);
    node.gasUsed = Number(gasStr);
    node.raw = raw.replace(/\s+$/, '');
    describe(node, body);

    const value = body.match(VALUE_RE);
    if (value) {
      node.isValueTransfer = Number(value[1]) > 0;
    }
    if (/selfdestruct|suicide/i.test(body)) {
      node.fn = node.fn || 'selfdestruct';
      node.isValueTransfer = true;
    }

    // Pop the stack until the parent is one level up.
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else if (!root) {
      root = node;
    }

    nodes.push(node);
    stack.push(node);
    rawLines.push(node.raw);
  }

  const flame = buildFlame(root);
  return { root, flame, nodes, rawLines };
}

export function buildFlame(root: TraceNode | null): GasFlameNode[] {
  if (!root) return [];
  const out: GasFlameNode[] = [];
  const walk = (node: TraceNode, depth: number) => {
    out.push({
      id: node.id,
      label: node.contractName ? `${node.contractName}.${node.fn}` : node.fn || node.address || 'call',
      gasUsed: node.gasUsed,
      share: 0,
      depth,
    });
    node.children.forEach((c) => walk(c, depth + 1));
  };
  walk(root, 0);

  const total = out.reduce((s, n) => s + n.gasUsed, 0) || 1;
  for (const n of out) n.share = Number((n.gasUsed / total).toFixed(6));
  return out;
}

/** Flatten a trace tree into a list, preserving depth-first order. */
export function flattenTrace(root: TraceNode | null): TraceNode[] {
  if (!root) return [];
  const out: TraceNode[] = [];
  const walk = (n: TraceNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}
