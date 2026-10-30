'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { BalanceDelta, SimulationArtifact, TraceNode } from '@helix/core';
import { formatEth, formatEthAmount, formatGas } from '../lib/format';

export interface AttackReplayProps {
  trace: TraceNode | null;
  artifact: SimulationArtifact | null;
  /** ms; the storyboard is authored at 8000ms. */
  durationMs?: number;
  className?: string;
  onComplete?: () => void;
}

export interface ReplayPalette {
  ground: string;
  arterial: string;
  ember: string;
  bone: string;
  ink: string;
  inkDim: string;
  hairline: string;
  mint: string;
  display: string;
  mono: string;
  sans: string;
}

export interface ReplayNode {
  id: string;
  depth: number;
  contract: string;
  fn: string;
  label: string;
  gas: number;
  size: number;
  x: number;
  y: number;
  repeat: boolean;
  isTarget: boolean;
  isExternal: boolean;
  appearAt: number;
  parentIndex: number | null;
}

export interface ReplayTick {
  s: number;
  j: number;
}

export interface ReplayModel {
  width: number;
  height: number;
  palette: ReplayPalette;
  targetName: string;
  rootGas: number;
  nodes: ReplayNode[];
  edges: { from: number; to: number }[];
  repeatLabel: string | null;
  repeatCount: number;
  reentrancy: boolean;
  spiral: { x: number; y: number; maxRadius: number; turns: number } | null;
  lossEth: string;
  severity: string;
  victim: { label: string; before: string; after: string } | null;
  attacker: { label: string; before: string; after: string } | null;
  ticks: ReplayTick[];
  lossFraction: number;
  signal: { x: number; y: number };
  valuePath: { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number };
  bars: { y: number; victimX: number; victimW: number; attackerX: number; attackerW: number };
}

const PIECE_SECONDS = 8;
const SHOT_IGNITE = 0.8;
const SHOT_TREE = 2.4;
const SHOT_VALUE = 5.6;
const SHOT_VERDICT = 7.2;
const NODE_STAGGER = 0.07;
const MAX_NODES = 40;

/* ─────────────────────────── deterministic helpers ─────────────────────────── */

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Mulberry32 — tiny, seeded, identical on every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const ax = (a: number, b: number) => 1 - 3 * b + 3 * a;
  const bx = (a: number, b: number) => 3 * b - 6 * a;
  const cx = (a: number) => 3 * a;
  const sample = (t: number, a: number, b: number) => ((ax(a, b) * t + bx(a, b)) * t + cx(a)) * t;
  const slope = (t: number, a: number, b: number) => 3 * ax(a, b) * t * t + 2 * bx(a, b) * t + cx(a);

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i += 1) {
      const dx = sample(t, x1, x2) - x;
      if (Math.abs(dx) < 1e-5) break;
      const d = slope(t, x1, x2);
      t -= d === 0 ? dx : dx / d;
    }
    return sample(clamp(t, 0, 1), y1, y2);
  };
}

const easeEntrance = cubicBezier(0.16, 1, 0.3, 1);
const easeSettle = cubicBezier(0.4, 0, 0.2, 1);

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.trim();
  if (!clean.startsWith('#')) return clean;
  const value = clean.slice(1);
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value.slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return clean;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ───────────────────────────── model construction ──────────────────────────── */

function keyOf(node: TraceNode): string {
  return `${node.contractName}::${node.fn}`;
}

function subtreeSize(node: TraceNode): number {
  return 1 + node.children.reduce((sum, child) => sum + subtreeSize(child), 0);
}

/** Removes the forge harness so VM cheatcodes never read as contract behaviour. */
function pruneHarness(node: TraceNode): TraceNode | null {
  const children = node.children
    .map(pruneHarness)
    .filter((child): child is TraceNode => child !== null);

  if (node.contractName === 'VM') {
    return children.length === 1 ? children[0] : null;
  }
  return { ...node, children };
}

function flatten(node: TraceNode, limit = MAX_NODES): TraceNode[] {
  const out: TraceNode[] = [];
  const walk = (current: TraceNode): void => {
    if (out.length >= limit) return;
    out.push(current);
    for (const child of current.children) walk(child);
  };
  walk(node);
  return out;
}

function mostCommonContract(nodes: TraceNode[]): string {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    if (node.contractName === 'VM') continue;
    counts.set(node.contractName, (counts.get(node.contractName) ?? 0) + 1);
  }
  let best = nodes[0]?.contractName ?? 'contract';
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

function fractionDrained(balance: BalanceDelta | null): number {
  if (!balance) return 0.6;
  try {
    const before = BigInt(balance.beforeWei);
    const after = BigInt(balance.afterWei);
    if (before <= 0n) return 0.6;
    const delta = before - after;
    if (delta <= 0n) return 0;
    return clamp(Number(delta) / Number(before), 0, 1);
  } catch {
    return 0.6;
  }
}

export function buildReplayModel(
  trace: TraceNode | null,
  artifact: SimulationArtifact | null,
  width: number,
  height: number,
  palette: ReplayPalette,
): ReplayModel {
  const margin = Math.max(18, width * 0.05);
  const rootX = width * 0.28;
  const rootY = height * 0.34;

  const empty: ReplayModel = {
    width,
    height,
    palette,
    targetName: artifact?.contractName ?? 'target',
    rootGas: 0,
    nodes: [],
    edges: [],
    repeatLabel: null,
    repeatCount: 0,
    reentrancy: Boolean(artifact?.attackVector.toLowerCase().includes('reentran')),
    spiral: null,
    lossEth: artifact ? formatEthAmount(artifact.lossEth, 3) : '0 ETH',
    severity: artifact?.severity ? artifact.severity.toUpperCase() : 'UNKNOWN',
    victim: null,
    attacker: null,
    ticks: [],
    lossFraction: 0.6,
    signal: { x: margin + 14, y: rootY },
    valuePath: {
      x0: rootX,
      y0: rootY,
      cx: width * 0.56,
      cy: height * 0.52,
      x1: width * 0.68,
      y1: height - 128,
    },
    bars: {
      y: height - 36,
      victimX: margin + 8,
      victimW: width * 0.24,
      attackerX: width * 0.6,
      attackerW: width * 0.28,
    },
  };

  if (!trace) return empty;

  const pruned = pruneHarness(trace);
  if (!pruned) return empty;

  const targetName = artifact?.contractName ?? mostCommonContract(flatten(pruned, 500));

  const allNodes = flatten(pruned, 500);
  const candidates = allNodes.filter((node) => node.contractName === targetName && subtreeSize(node) > 1);
  const focus =
    candidates.sort((a, b) => subtreeSize(b) - subtreeSize(a))[0] ??
    (subtreeSize(pruned) > 1 ? pruned : null);
  if (!focus) return { ...empty, targetName };

  const flat = flatten(focus, MAX_NODES);
  const indexById = new Map(flat.map((node, index) => [node.id, index]));
  const parentIndex = new Map<number, number>();
  flat.forEach((node, index) => {
    for (const child of node.children) {
      const childIndex = indexById.get(child.id);
      if (childIndex !== undefined) parentIndex.set(childIndex, index);
    }
  });

  const depthOf = new Array<number>(flat.length).fill(0);
  for (let index = 1; index < flat.length; index += 1) {
    const parent = parentIndex.get(index);
    depthOf[index] = parent === undefined ? 0 : (depthOf[parent] ?? 0) + 1;
  }

  const keyCounts = new Map<string, number>();
  const seen = new Set<string>();
  const repeatIndexes: number[] = [];
  flat.forEach((node, index) => {
    const key = keyOf(node);
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    if (seen.has(key)) repeatIndexes.push(index);
    seen.add(key);
  });

  const repeatKeys = new Set<string>();
  for (const [key, count] of keyCounts) if (count > 1) repeatKeys.add(key);

  const repeatStats = new Map<string, number>();
  flat.forEach((node) => {
    const key = keyOf(node);
    repeatStats.set(key, (repeatStats.get(key) ?? 0) + 1);
  });
  let repeatLabel: string | null = null;
  let repeatCount = 0;
  for (const [key, count] of repeatStats) {
    if (count > repeatCount) {
      repeatCount = count;
      repeatLabel = key.replace('::', '.');
    }
  }
  if (repeatCount < 2) {
    repeatLabel = null;
    repeatCount = 0;
  }

  const maxNonRepeatDepth = flat.reduce(
    (max, node, index) => (repeatKeys.has(keyOf(node)) && index !== repeatIndexes[0] ? max : Math.max(max, depthOf[index])),
    1,
  );
  const dx = clamp((width * 0.44) / Math.max(2, maxNonRepeatDepth + 1), 54, 118);

  const natural: { x: number; y: number }[] = [];
  const childrenOf = (index: number): number[] =>
    flat.flatMap((_, childIndex) => (parentIndex.get(childIndex) === index ? [childIndex] : []));

  const walkLayout = (index: number, x: number, y: number): void => {
    natural[index] = { x, y };
    const children = childrenOf(index);
    const spread = children.length > 1 ? Math.min(42, (height * 0.34) / children.length) : 0;
    children.forEach((child, order) => {
      const childY = y + (order - (children.length - 1) / 2) * spread;
      walkLayout(child, x + dx, childY);
    });
  };
  walkLayout(0, rootX, rootY);

  const firstRepeat = repeatIndexes.length ? repeatIndexes[0] : -1;
  const center = firstRepeat >= 0 ? natural[firstRepeat] : { x: rootX, y: rootY };
  const spiralNodes = repeatIndexes.filter((index) => index !== firstRepeat);
  const spiralCount = spiralNodes.length;
  const spiralMaxRadius = Math.min(122, height * 0.25);
  const spiralMinRadius = 30;
  const positions: { x: number; y: number }[] = [];
  let spiralStep = 0;
  flat.forEach((node, index) => {
    const isRepeat = repeatKeys.has(keyOf(node)) && repeatIndexes.includes(index);
    if (!isRepeat || index === firstRepeat) {
      positions[index] = natural[index] ?? { x: rootX, y: rootY };
      return;
    }
    spiralStep += 1;
    const progress = spiralCount <= 1 ? 0 : (spiralStep - 1) / Math.max(1, spiralCount - 1);
    const angle = -0.9 + (spiralStep - 1) * 1.06;
    const radius = spiralMaxRadius - (spiralMaxRadius - spiralMinRadius) * progress;
    positions[index] = {
      x: clamp(center.x + Math.cos(angle) * radius, margin + 12, width - margin - 12),
      y: clamp(center.y + Math.sin(angle) * radius, margin + 30, height * 0.6),
    };
  });

  const maxGas = flat.reduce((max, node) => Math.max(max, node.gasUsed), 1);
  const nodes: ReplayNode[] = flat.map((node, index) => {
    const position = positions[index] ?? { x: rootX, y: rootY };
    const share = clamp(node.gasUsed / maxGas, 0, 1);
    return {
      id: node.id,
      depth: depthOf[index] ?? 0,
      contract: node.contractName,
      fn: node.fn,
      label: `${node.contractName}.${node.fn}`,
      gas: node.gasUsed,
      size: 2.5 + 13 * Math.sqrt(share),
      x: position.x,
      y: position.y,
      repeat: repeatKeys.has(keyOf(node)),
      isTarget: node.contractName === targetName,
      isExternal: node.isExternalCall,
      appearAt: SHOT_TREE + index * NODE_STAGGER,
      parentIndex: parentIndex.get(index) ?? null,
    };
  });

  const edges = Array.from(parentIndex.entries())
    .map(([child, parent]) => ({ from: parent, to: child }))
    .filter((edge) => edge.from !== edge.to);

  const balances = artifact?.balances ?? [];
  const victimDelta = [...balances].sort((a, b) => Number(BigInt(a.deltaWei)) - Number(BigInt(b.deltaWei)))[0] ?? null;
  const attackerDelta = [...balances].sort((a, b) => Number(BigInt(b.deltaWei)) - Number(BigInt(a.deltaWei)))[0] ?? null;
  const victim =
    victimDelta && victimDelta.deltaWei.startsWith('-')
      ? {
          label: victimDelta.label,
          before: formatEth(victimDelta.beforeWei, 3),
          after: formatEth(victimDelta.afterWei, 3),
        }
      : null;
  const attacker =
    attackerDelta && !attackerDelta.deltaWei.startsWith('-') && attackerDelta.deltaWei !== '0'
      ? {
          label: attackerDelta.label,
          before: formatEth(attackerDelta.beforeWei, 3),
          after: formatEth(attackerDelta.afterWei, 3),
        }
      : null;

  const rng = mulberry32(0x51ed);
  const ticks: ReplayTick[] = Array.from({ length: 18 }, (_, index) => ({
    s: index / 18 + rng() * 0.03,
    j: (rng() - 0.5) * 11,
  }));

  const bars = {
    y: height - 36,
    victimX: margin + 8,
    victimW: width * 0.24,
    attackerX: width * 0.6,
    attackerW: width * 0.28,
  };

  return {
    width,
    height,
    palette,
    targetName,
    rootGas: flat[0]?.gasUsed ?? 0,
    nodes,
    edges,
    repeatLabel,
    repeatCount,
    reentrancy: Boolean(artifact?.attackVector.toLowerCase().includes('reentran')),
    spiral:
      firstRepeat >= 0 && spiralCount > 0
        ? { x: center.x, y: center.y, maxRadius: spiralMaxRadius, turns: spiralCount }
        : null,
    lossEth: artifact ? formatEthAmount(artifact.lossEth, 3) : '0 ETH',
    severity: artifact?.severity ? artifact.severity.toUpperCase() : 'UNKNOWN',
    victim,
    attacker,
    ticks,
    lossFraction: fractionDrained(victimDelta),
    signal: { x: margin + 14, y: rootY },
    valuePath: {
      x0: nodes[0]?.x ?? rootX,
      y0: nodes[0]?.y ?? rootY,
      cx: (nodes[0]?.x ?? rootX) + (bars.attackerX + bars.attackerW * 0.35 - (nodes[0]?.x ?? rootX)) * 0.45,
      cy: (nodes[0]?.y ?? rootY) + (bars.y - 10 - (nodes[0]?.y ?? rootY)) * 0.4,
      x1: bars.attackerX + bars.attackerW * 0.35,
      y1: bars.y - 10,
    },
    bars,
  };
}

/* ───────────────────────────────── the frame ────────────────────────────────── */

function bezierAt(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  t: number,
): { x: number; y: number; dx: number; dy: number } {
  const mt = 1 - t;
  const x = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
  const y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
  const dx = 2 * mt * (cx - x0) + 2 * t * (x1 - cx);
  const dy = 2 * mt * (cy - y0) + 2 * t * (y1 - cy);
  return { x, y, dx, dy };
}

/**
 * Pure renderer: the whole piece is a function of `t` (storyboard seconds,
 * 0..8) and the model. No clocks, no counters, no unseeded randomness.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, t: number, model: ReplayModel): void {
  const { width, height, palette } = model;
  const margin = Math.max(18, width * 0.05);
  const time = clamp(t, 0, PIECE_SECONDS);
  const arterial = palette.arterial;
  const ink = palette.ink;
  const inkDim = palette.inkDim;
  const hairline = palette.hairline;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'alphabetic';

  /* shot 1 — the signal point and the line it draws */
  const pulse = Math.sin(Math.PI * clamp(time / SHOT_IGNITE, 0, 1));
  const signalAlpha = easeEntrance(clamp(time / 0.18, 0, 1));
  ctx.beginPath();
  ctx.arc(model.signal.x, model.signal.y, 9 + pulse * 9, 0, Math.PI * 2);
  ctx.strokeStyle = hexToRgba(arterial, 0.22 * pulse * signalAlpha);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(model.signal.x, model.signal.y, 3.2, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(arterial, signalAlpha);
  ctx.fill();

  const root = model.nodes[0];
  const targetX = root?.x ?? width * 0.32;
  const targetY = root?.y ?? height * 0.38;
  const lineProgress = easeEntrance(clamp((time - 0.68) / 1.15, 0, 1));
  if (lineProgress > 0) {
    const endX = lerp(model.signal.x, targetX, lineProgress);
    const endY = lerp(model.signal.y, targetY, lineProgress);
    ctx.beginPath();
    ctx.moveTo(model.signal.x, model.signal.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = hexToRgba(arterial, 0.75);
    ctx.lineWidth = 1;
    ctx.stroke();
    if (lineProgress < 1) {
      ctx.beginPath();
      ctx.arc(endX, endY, 2, 0, Math.PI * 2);
      ctx.fillStyle = arterial;
      ctx.fill();
    }
  }

  /* shot 2 — the target ignites */
  const ignite = easeEntrance(clamp((time - 1.72) / 0.58, 0, 1));
  if (ignite > 0 && root) {
    const side = 13 + 8 * ignite;
    ctx.save();
    ctx.translate(targetX, targetY);
    ctx.strokeStyle = hexToRgba(arterial, 0.95);
    ctx.fillStyle = hexToRgba(arterial, 0.12 * ignite);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(-side / 2, -side / 2, side, side);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.font = `500 10px ${palette.mono}`;
    ctx.fillStyle = hexToRgba(inkDim, ignite);
    ctx.textAlign = 'center';
    ctx.fillText(model.targetName, targetX, targetY - 22);
    ctx.font = `400 9px ${palette.mono}`;
    ctx.fillStyle = hexToRgba(palette.inkDim, 0.72 * ignite);
    ctx.fillText(`${formatGas(model.rootGas)} gas`, targetX, targetY + 28);
  }

  /* shot 3 — the call tree draws itself, node by node */
  if (time >= SHOT_TREE) {
    if (model.spiral) {
      const { x, y, maxRadius, turns } = model.spiral;
      const guideAlpha = 0.2 * clamp((time - SHOT_TREE) / 0.7, 0, 1);
      ctx.beginPath();
      const steps = Math.max(48, Math.round(turns * 22));
      for (let step = 0; step <= steps; step += 1) {
        const k = (step / steps) * turns;
        const radius = maxRadius - (maxRadius - 30) * (k / Math.max(1, turns));
        const px = x + Math.cos(-0.9 + k * 1.06) * radius;
        const py = y + Math.sin(-0.9 + k * 1.06) * radius;
        if (step === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = hexToRgba(arterial, guideAlpha);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const edge of model.edges) {
      const from = model.nodes[edge.from];
      const to = model.nodes[edge.to];
      if (!from || !to) continue;
      const reveal = clamp((time - to.appearAt) / 0.24, 0, 1);
      if (reveal <= 0) continue;
      const draw = easeEntrance(reveal);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(lerp(from.x, to.x, draw), lerp(from.y, to.y, draw));
      ctx.strokeStyle = to.repeat ? hexToRgba(arterial, 0.22) : hexToRgba(hairline, 0.9);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    for (const node of model.nodes) {
      const reveal = clamp((time - node.appearAt) / 0.3, 0, 1);
      if (reveal <= 0) continue;
      const e = easeEntrance(reveal);
      const radius = node.size * (0.45 + 0.55 * e);
      const nodeAlpha = clamp(reveal * 1.4, 0, 1);

      if (node.repeat) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 4.5, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(arterial, 0.3 * nodeAlpha);
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.beginPath();
      if (node.isTarget) {
        const side = radius * 2;
        ctx.rect(node.x - side / 2, node.y - side / 2, side, side);
      } else {
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = hexToRgba(node.repeat ? arterial : palette.bone, node.repeat ? 0.16 * nodeAlpha : 0.05 * nodeAlpha);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(
        node.repeat ? arterial : node.isExternal ? palette.ember : palette.inkDim,
        (node.repeat ? 0.95 : 0.55) * nodeAlpha,
      );
      ctx.lineWidth = node.repeat ? 1.4 : 1;
      ctx.stroke();
    }

    if (model.spiral && model.repeatLabel) {
      const fn = model.repeatLabel.split('.').pop() ?? model.repeatLabel;
      const tellY = Math.min(height * 0.64, model.spiral.y + model.spiral.maxRadius + 20);
      ctx.textAlign = 'center';
      ctx.font = `500 9px ${palette.mono}`;
      ctx.fillStyle = hexToRgba(arterial, 0.95);
      ctx.fillText(`${fn} x${model.repeatCount}`, model.spiral.x, tellY);
      ctx.font = `400 8px ${palette.mono}`;
      ctx.fillStyle = hexToRgba(inkDim, 0.8);
      ctx.fillText(model.reentrancy ? 're-entrancy tell' : 'repeated call', model.spiral.x, tellY + 12);
    }
  }

  /* shot 4 — value travels out of the victim into the attacker */
  if (time >= SHOT_VALUE) {
    const appear = clamp((time - SHOT_VALUE) / 0.35, 0, 1);
    const travel = clamp((time - SHOT_VALUE) / 1.55, 0, 1);
    const { bars } = model;

    ctx.font = `500 8px ${palette.mono}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = hexToRgba(inkDim, appear * 0.9);
    ctx.fillText('victim', bars.victimX, bars.y - 12);
    ctx.textAlign = 'right';
    ctx.fillText('attacker', bars.attackerX + bars.attackerW, bars.y - 12);

    ctx.font = `400 9px ${palette.mono}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = hexToRgba(ink, appear * 0.86);
    if (model.victim) {
      ctx.fillText(`${model.victim.label} · ${model.victim.before} -> ${model.victim.after}`, bars.victimX, bars.y - 24);
    }
    ctx.textAlign = 'right';
    if (model.attacker) {
      ctx.fillText(`${model.attacker.label} · ${model.attacker.before} -> ${model.attacker.after}`, bars.attackerX + bars.attackerW, bars.y - 24);
    }

    const rail = (x: number, w: number): void => {
      ctx.fillStyle = hexToRgba(hairline, 0.95 * appear);
      ctx.fillRect(x, bars.y, w, 3);
    };
    rail(bars.victimX, bars.victimW);
    rail(bars.attackerX, bars.attackerW);

    const drained = clamp(model.lossFraction * travel, 0, 1);
    ctx.fillStyle = hexToRgba(arterial, appear);
    ctx.fillRect(bars.victimX, bars.y, bars.victimW * (1 - drained), 3);

    const attackerStart = 0.12;
    ctx.fillStyle = hexToRgba(palette.mint, appear);
    ctx.fillRect(
      bars.attackerX,
      bars.y,
      bars.attackerW * (attackerStart + (1 - attackerStart) * travel),
      3,
    );

    for (const tick of model.ticks) {
      const u = (tick.s + travel * 0.32) % 1;
      if (u < 0.1) continue;
      const point = bezierAt(
        model.valuePath.x0,
        model.valuePath.y0,
        model.valuePath.cx,
        model.valuePath.cy,
        model.valuePath.x1,
        model.valuePath.y1,
        u,
      );
      const length = Math.hypot(point.dx, point.dy) || 1;
      const nx = -point.dy / length;
      const ny = point.dx / length;
      const alpha = clamp(travel * 2.4, 0, 1) * (0.35 + 0.65 * Math.sin(Math.PI * u));
      ctx.beginPath();
      ctx.moveTo(point.x + nx * tick.j * 0.35 - nx * 3.5, point.y + ny * tick.j * 0.35 - ny * 3.5);
      ctx.lineTo(point.x + nx * tick.j * 0.35 + nx * 3.5, point.y + ny * tick.j * 0.35 + ny * 3.5);
      ctx.strokeStyle = hexToRgba(arterial, alpha);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  /* shot 5 — the verdict holds */
  const verdict = easeSettle(clamp((time - SHOT_VERDICT) / 0.52, 0, 1));
  if (verdict > 0) {
    const x = margin + 8;
    const baseY = height - 150 + (1 - verdict) * 9;
    const rightLimit = width - margin;

    ctx.textAlign = 'left';
    ctx.font = `500 8px ${palette.mono}`;
    ctx.fillStyle = hexToRgba(inkDim, verdict * 0.9);
    ctx.fillText('loss', x, baseY);

    ctx.font = `600 30px ${palette.display}`;
    ctx.fillStyle = hexToRgba(arterial, verdict);
    const lossText = model.lossEth;
    ctx.fillText(lossText, Math.min(x, rightLimit - ctx.measureText(lossText).width), baseY + 32);

    ctx.font = `500 9px ${palette.mono}`;
    ctx.fillStyle = hexToRgba(palette.ember, verdict * 0.95);
    ctx.fillText(`severity · ${model.severity}`, x, baseY + 50);

    ctx.font = `400 9px ${palette.mono}`;
    ctx.fillStyle = hexToRgba(ink, verdict * 0.82);
    const repeatText = model.repeatLabel
      ? `${model.repeatLabel}() x${model.repeatCount}`
      : model.targetName;
    ctx.fillText(`deepest repeat · ${repeatText}`, x, baseY + 65);
  }

  ctx.restore();
}

/* ─────────────────────────────────── fonts ─────────────────────────────────── */

function resolveFont(className: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const probe = document.createElement('span');
  probe.className = className;
  probe.textContent = 'x';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  document.body.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily || fallback;
  probe.remove();
  return family;
}

function readPalette(fonts: { display: string; mono: string; sans: string }): ReplayPalette {
  if (typeof document === 'undefined') {
    return {
      ground: 'transparent',
      arterial: 'currentColor',
      ember: 'currentColor',
      bone: 'currentColor',
      ink: 'currentColor',
      inkDim: 'currentColor',
      hairline: 'currentColor',
      mint: 'currentColor',
      display: fonts.display,
      mono: fonts.mono,
      sans: fonts.sans,
    };
  }
  const root = getComputedStyle(document.documentElement);
  const read = (name: string): string => root.getPropertyValue(name).trim() || 'currentColor';
  return {
    ground: read('--hx-void'),
    arterial: read('--hx-arterial'),
    ember: read('--hx-ember'),
    bone: read('--hx-bone'),
    ink: read('--hx-ink'),
    inkDim: read('--hx-ink-dim'),
    hairline: read('--hx-edge'),
    mint: read('--hx-mint'),
    display: fonts.display,
    mono: fonts.mono,
    sans: fonts.sans,
  };
}

/* ─────────────────────────────── the component ─────────────────────────────── */

export function AttackReplay({
  trace,
  artifact,
  durationMs = 8000,
  className = '',
  onComplete,
}: AttackReplayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const completedRef = useRef(false);
  const progressRef = useRef(0);
  const lastProgressRef = useRef(-1);
  const onCompleteRef = useRef(onComplete);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [replayNonce, setReplayNonce] = useState(0);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const measure = (): void => {
      const width = node.clientWidth;
      if (width <= 0) return;
      const height = clamp(width * 0.42, 380, 520);
      setSize((previous) =>
        Math.abs(previous.width - width) < 2 && Math.abs(previous.height - height) < 2
          ? previous
          : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fonts = useMemo(
    () => ({
      display: resolveFont('font-display', 'Familjen Grotesk, sans-serif'),
      mono: resolveFont('font-mono', 'JetBrains Mono, monospace'),
      sans: resolveFont('font-sans', 'Public Sans, sans-serif'),
    }),
    [],
  );

  const width = size.width || 960;
  const height = size.height || 400;

  const geometry = useMemo(
    () => buildReplayModel(trace, artifact, width, height, readPalette(fonts)),
    [trace, artifact, width, height, fonts],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = '100%';
    canvas.style.height = `${height}px`;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let cancelled = false;
    const startRef = { current: performance.now() };
    completedRef.current = false;

    const paint = (t: number): void => {
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFrame(context, t, { ...geometry, palette: readPalette(fonts) });
      const next = clamp(t / PIECE_SECONDS, 0, 1);
      progressRef.current = next;
      if (next === 1 || Math.abs(next - lastProgressRef.current) >= 0.004) {
        lastProgressRef.current = next;
        setProgress(next);
      }
    };

    const finish = (): void => {
      paint(PIECE_SECONDS);
      setPlaying(false);
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current?.();
      }
    };

    const loop = (): void => {
      if (cancelled) return;
      const elapsed = (performance.now() - startRef.current) / 1000;
      const pieceSeconds = Math.max(0.25, durationMs / 1000);
      const t = Math.min(PIECE_SECONDS, elapsed * (PIECE_SECONDS / pieceSeconds));
      paint(t);
      if (t >= PIECE_SECONDS) {
        finish();
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    let started = false;
    const start = (): void => {
      if (cancelled || started) return;
      started = true;
      if (reduced.matches) {
        setPlaying(false);
        paint(PIECE_SECONDS);
        setProgress(1);
        return;
      }
      setPlaying(true);
      raf = requestAnimationFrame(loop);
    };

    void document.fonts.ready.then(start).catch(start);

    const onReducedChange = (): void => {
      if (cancelled) return;
      cancelAnimationFrame(raf);
      if (reduced.matches) {
        setPlaying(false);
        paint(PIECE_SECONDS);
        setProgress(1);
      } else {
        setReplayNonce((value) => value + 1);
      }
    };
    reduced.addEventListener('change', onReducedChange);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      reduced.removeEventListener('change', onReducedChange);
    };
  }, [geometry, durationMs, replayNonce, size.width, width, height, fonts]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const observer = new MutationObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFrame(context, progressRef.current * PIECE_SECONDS, {
        ...geometry,
        palette: readPalette(fonts),
      });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [geometry, size.width, fonts]);

  const replay = useCallback(() => {
    completedRef.current = false;
    lastProgressRef.current = -1;
    setProgress(0);
    setPlaying(true);
    setReplayNonce((value) => value + 1);
  }, []);

  const phase =
    progress >= 1
      ? 'verdict'
      : progress * PIECE_SECONDS < SHOT_IGNITE
        ? 'signal'
        : progress * PIECE_SECONDS < SHOT_TREE
          ? 'target acquired'
          : progress * PIECE_SECONDS < SHOT_VALUE
            ? 'call tree'
            : 'value transfer';

  const seconds = progress * PIECE_SECONDS;

  if (!trace && !artifact) {
    return (
      <div className={`rounded-[14px] border border-edge bg-panel p-8 text-center ${className}`}>
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-ink-dim">No trace to replay</p>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-ink-faint">
          Run a local Foundry simulation and the attack replay will draw its call tree, value movement and verdict here.
        </p>
      </div>
    );
  }

  return (
    <figure ref={containerRef} className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-ink-faint">
          <span className={`h-1.5 w-1.5 rounded-full ${playing ? 'live-dot bg-arterial' : 'bg-ink-faint'}`} />
          attack replay · local foundry simulation
        </span>
        <button type="button" className="btn btn-ghost min-h-8 py-1 text-[0.7rem]" onClick={replay}>
          <RotateCcw className="h-3 w-3" aria-hidden />
          Replay attack
        </button>
      </div>

      <div className="relative h-px w-full overflow-hidden bg-edge" role="presentation">
        <div
          className="absolute inset-y-0 left-0 bg-arterial"
          style={{ width: `${Math.round(progress * 1000) / 10}%` }}
        />
      </div>

      <canvas
        ref={canvasRef}
        className="w-full rounded-[9px] border border-edge"
        role="img"
        aria-label={`Attack replay for ${artifact?.contractName ?? 'the target contract'}: ${
          artifact ? `${formatEthAmount(artifact.lossEth, 3)} extracted, ${artifact.severity} severity` : 'call tree and value movement'
        }.`}
      />

      <figcaption className="flex flex-wrap items-center justify-between gap-2 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-ink-faint">
        <span>{phase}</span>
        <span className="tabular-nums">
          {seconds.toFixed(1)}s / {(durationMs / 1000).toFixed(1)}s
        </span>
      </figcaption>
    </figure>
  );
}
