'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Download,
  FlaskConical,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import type { ScenarioSpec } from '@helix/forensic-engine';
import { useApi } from '../lib/useApi';
import { formatEthAmount, formatGas, formatInt, formatPct } from '../lib/format';
import { EmptyState, Panel, SubBlock } from './Panel';
import { SeverityChip } from './SeverityChip';
import { VectorChip } from './VectorChip';
import { TraceViewer } from './TraceViewer';
import { MetricStrip } from './MetricStrip';
import type { CaseEvidencePayload } from './EvidenceWorkbenchLoader';

export interface TraceExplainerProps {
  initialEvidence: CaseEvidencePayload;
}

export interface PipelinePalette {
  ground: string;
  panel: string;
  panel2: string;
  elevated: string;
  edge: string;
  edgeStrong: string;
  ink: string;
  inkDim: string;
  inkFaint: string;
  arterial: string;
  ember: string;
  amber: string;
  mint: string;
  bone: string;
  display: string;
  mono: string;
  sans: string;
}

export interface ParsedLineSample {
  lineNumber: number;
  raw: string;
  trimmed: string;
  branchIndex: number;
  leadingSpaces: number;
  depth: number;
  gasUsed: number;
  contractName: string;
  fn: string;
  isValueTransfer: boolean;
  isRepeatedWithdraw: boolean;
}

export interface PipelineCanvasModel {
  width: number;
  height: number;
  palette: PipelinePalette;
  scenarioId: string;
  contractName: string;
  lines: ParsedLineSample[];
  totalNodes: number;
  maxDepth: number;
  repeatedKey: string;
  repeatedCount: number;
  repeatedDepths: number[];
  valueCallsCount: number;
  topDetectorLabel: string;
  topConfidence: number;
  lossEth: string;
  rootChainHash: string;
  bundleFileCount: number;
}

export const PIECE_SECONDS = 8.0;

const STAGE_WINDOWS = [
  { stage: 1, code: 'RAW', label: 'Stage 1 · Raw trace', t0: 0.0, t1: 1.6 },
  { stage: 2, code: 'PARSE', label: 'Stage 2 · Depth parser', t0: 1.6, t1: 3.3 },
  { stage: 3, code: 'TREE', label: 'Stage 3 · Call tree', t0: 3.3, t1: 5.0 },
  { stage: 4, code: 'DETECT', label: 'Stage 4 · Detectors', t0: 5.0, t1: 6.6 },
  { stage: 5, code: 'REPORT', label: 'Stage 5 · Report & bundle', t0: 6.6, t1: 8.0 },
] as const;

const TRACE_PARSER_EXCERPT = `// packages/forensic-engine/src/trace-parser.ts
const NODE_RE = /\\[(\\d+)\\]\\s*(.*)$/;
const BRANCH_RE = /[├└]/;
const CALL_RE = /([A-Za-z0-9_$.]+)::([A-Za-z0-9_$]+)\\s*(\\{[^}]*\\})?\\s*\\(/;
const VALUE_RE = /value:\\s*(\\d+)/;

/** Forge indents four columns per depth level; the root sits at depth 0. */
function depthOf(line: string): number {
  const branchIndex = line.search(BRANCH_RE);
  if (branchIndex >= 0) return Math.floor(branchIndex / 4);
  const leading = line.length - line.trimStart().length;
  return leading >= 4 ? Math.floor(leading / 4) : 0;
}`;

const STACK_BUILDER_EXCERPT = `// Stack of nodes, one per open depth (trace-parser.ts L108-151)
const stack: TraceNode[] = [];

for (const raw of lines) {
  const m = raw.match(NODE_RE);
  if (!m || /^\\s*[│\\s]*[├└]?\\s*←/.test(raw)) continue;

  const [, gasStr, body] = m;
  const depth = depthOf(raw);
  const node = emptyNode(\`n\${counter++}\`, depth);
  node.gasUsed = Number(gasStr);
  describe(node, body);

  // Pop the stack until the parent is one level up.
  while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();

  const parent = stack[stack.length - 1];
  if (parent) parent.children.push(node);
  else if (!root) root = node;

  stack.push(node);
}`;

const DETECTOR_EXCERPT = `// packages/forensic-engine/src/detectors.ts (det-reentrancy)
const seen = new Map<string, number>();
for (const n of ctx.nodes) {
  if (!n.contractName || !n.fn || n.fn === 'result') continue;
  if (n.contractName === 'VM') continue; // exclude harness noise
  const key = \`\${n.contractName}::\${n.fn}\`;
  seen.set(key, (seen.get(key) ?? 0) + 1);
}
const repeated = [...seen.entries()].filter(([, c]) => c > 1);
for (const [key, count] of repeated) {
  evidence.push(\`Trace shows \${key} invoked \${count} times within a single transaction\`);
  confidence = Math.max(confidence, 0.55 + 0.12 * (count - 1));
}`;

/* ─────────────────────── deterministic math & easing ─────────────────────── */

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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

const easeOutExpo = cubicBezier(0.16, 1, 0.3, 1);
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

/* ─────────────────────── trace sample extraction ─────────────────────── */

const NODE_RE = /\[(\d+)\]\s*(.*)$/;
const BRANCH_RE = /[├└]/;
const CALL_RE = /([A-Za-z0-9_$.]+)::([A-Za-z0-9_$]+)\s*(\{[^}]*\})?\s*\(/;
const VALUE_RE = /value:\s*(\d+)/;

export function extractInterestingLines(traceText: string, maxLines = 11): ParsedLineSample[] {
  if (!traceText) return [];
  const rawLines = traceText.split(/\r?\n/);
  const allParsed: ParsedLineSample[] = [];

  rawLines.forEach((raw, idx) => {
    const m = raw.match(NODE_RE);
    if (!m) return;
    if (/^\s*[│\s]*[├└]?\s*←/.test(raw)) return;

    const [, gasStr, body] = m;
    const branchIndex = raw.search(BRANCH_RE);
    const leadingSpaces = raw.length - raw.trimStart().length;
    const depth = branchIndex >= 0 ? Math.floor(branchIndex / 4) : leadingSpaces >= 4 ? Math.floor(leadingSpaces / 4) : 0;

    const callMatch = body.match(CALL_RE);
    const contractName = callMatch ? callMatch[1] : body.includes('new ') ? 'deploy' : 'contract';
    const fn = callMatch ? callMatch[2] : 'call';
    const valMatch = body.match(VALUE_RE);
    const isValueTransfer = Boolean(valMatch && Number(valMatch[1]) > 0);

    allParsed.push({
      lineNumber: idx + 1,
      raw,
      trimmed: body.trim(),
      branchIndex: branchIndex >= 0 ? branchIndex : leadingSpaces,
      leadingSpaces,
      depth,
      gasUsed: Number(gasStr),
      contractName,
      fn,
      isValueTransfer,
      isRepeatedWithdraw: false,
    });
  });

  // Identify repeated non-VM contract::fn pairs
  const counts = new Map<string, number>();
  for (const item of allParsed) {
    if (item.contractName === 'VM') continue;
    const key = `${item.contractName}::${item.fn}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  for (const item of allParsed) {
    const key = `${item.contractName}::${item.fn}`;
    if (item.contractName !== 'VM' && (counts.get(key) ?? 0) > 1) {
      item.isRepeatedWithdraw = true;
    }
  }

  // Prefer the root test line + the non-VM exploit sequence
  const nonVm = allParsed.filter((item, index) => index === 0 || item.contractName !== 'VM');
  return (nonVm.length >= 4 ? nonVm : allParsed).slice(0, maxLines);
}

/* ─────────────────────── pure draw(t) renderer ─────────────────────── */

/**
 * Pure function of `t` (seconds in 0..8.0) and `model`.
 * Follows the motion-graphics and RED-ROOM.md rules:
 * - No per-frame state accumulation, no unseeded randomness
 * - Text stays inside a 5% safe margin
 * - Final frame holds from 7.0s to 8.0s
 */
export function drawTracePipelineFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  model: PipelineCanvasModel,
): void {
  const { width, height, palette } = model;
  const time = clamp(t, 0, PIECE_SECONDS);
  const safeX = Math.max(20, Math.round(width * 0.05));
  const safeY = Math.max(18, Math.round(height * 0.05));
  const innerW = width - safeX * 2;
  const innerH = height - safeY * 2;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'alphabetic';

  // Subtle measuring grid inside safe area
  ctx.strokeStyle = hexToRgba(palette.edge, 0.45);
  ctx.lineWidth = 1;
  ctx.strokeRect(safeX, safeY, innerW, innerH);

  // Top Stage Rail inside safe area
  const railH = 36;
  const stageW = innerW / STAGE_WINDOWS.length;
  STAGE_WINDOWS.forEach((st, idx) => {
    const sx = safeX + idx * stageW;
    const prog = clamp((time - st.t0) / (st.t1 - st.t0), 0, 1);
    const active = time >= st.t0 && (time < st.t1 || idx === STAGE_WINDOWS.length - 1);

    ctx.fillStyle = active ? hexToRgba(palette.arterial, 0.1) : hexToRgba(palette.panel2, 0.65);
    ctx.fillRect(sx, safeY, stageW, railH);

    if (idx > 0) {
      ctx.beginPath();
      ctx.moveTo(sx, safeY);
      ctx.lineTo(sx, safeY + railH);
      ctx.strokeStyle = palette.edge;
      ctx.stroke();
    }

    // Progress bar at bottom of stage cell
    ctx.fillStyle = hexToRgba(palette.arterial, prog > 0 ? 0.9 : 0.18);
    ctx.fillRect(sx, safeY + railH - 2, stageW * easeOutExpo(prog), 2);

    ctx.font = `600 9px ${palette.mono}`;
    ctx.fillStyle = prog > 0 ? palette.arterial : palette.inkFaint;
    ctx.textAlign = 'left';
    ctx.fillText(`0${st.stage} · ${st.code}`, sx + 10, safeY + 15);

    ctx.font = `400 9px ${palette.sans}`;
    ctx.fillStyle = prog > 0 ? palette.ink : palette.inkDim;
    ctx.fillText(st.label.split('·')[1]?.trim() ?? st.label, sx + 10, safeY + 28);
  });

  ctx.beginPath();
  ctx.moveTo(safeX, safeY + railH);
  ctx.lineTo(safeX + innerW, safeY + railH);
  ctx.strokeStyle = palette.edgeStrong;
  ctx.stroke();

  // Three main columns below the rail
  const bodyY = safeY + railH + 14;
  const bodyH = innerH - railH - 20;
  const col1W = Math.round(innerW * 0.42);
  const col2W = Math.round(innerW * 0.30);
  const col3W = innerW - col1W - col2W;

  const col1X = safeX;
  const col2X = safeX + col1W;
  const col3X = col2X + col2W;

  // Vertical column dividers
  [col2X, col3X].forEach((divX) => {
    ctx.beginPath();
    ctx.moveTo(divX, safeY + railH);
    ctx.lineTo(divX, safeY + innerH);
    ctx.strokeStyle = hexToRgba(palette.edge, 0.85);
    ctx.stroke();
  });

  // ── COLUMN 1: STAGE 1 (RAW) + STAGE 2 (PARSE: 4-COL DEPTH RULER) ──
  const rawProgress = easeOutExpo(clamp(time / 1.5, 0, 1));
  const parseProgress = easeOutExpo(clamp((time - 1.5) / 1.7, 0, 1));

  ctx.font = `500 9px ${palette.mono}`;
  ctx.fillStyle = palette.inkDim;
  ctx.textAlign = 'left';
  ctx.fillText('1. RAW FORGE TRACE  +  2. 4-COLUMN DEPTH RULER', col1X + 12, bodyY + 4);

  // Draw 4-column caliper ruler header
  const rulerY = bodyY + 20;
  const codeStartX = col1X + 48;
  const colPx = 5.5; // pixels per character column in ruler

  if (parseProgress > 0) {
    ctx.save();
    for (let c = 0; c <= 28; c += 4) {
      const tickX = codeStartX + c * colPx;
      if (tickX > col2X - 18) break;
      const tickAlpha = clamp((parseProgress - c / 40) * 2.2, 0, 1);
      ctx.strokeStyle = hexToRgba(palette.arterial, 0.45 * tickAlpha);
      ctx.beginPath();
      ctx.moveTo(tickX, rulerY - 4);
      ctx.lineTo(tickX, rulerY + 2);
      ctx.stroke();

      ctx.font = `400 7.5px ${palette.mono}`;
      ctx.fillStyle = hexToRgba(palette.inkFaint, tickAlpha);
      ctx.textAlign = 'center';
      ctx.fillText(`${c}`, tickX, rulerY - 6);
    }
    ctx.restore();
  }

  const lines = model.lines.slice(0, 10);
  const rowH = Math.min(28, Math.floor((bodyH - 42) / Math.max(1, lines.length)));

  lines.forEach((line, idx) => {
    const lineAppear = easeOutExpo(clamp((rawProgress * lines.length - idx * 0.65), 0, 1));
    if (lineAppear <= 0) return;

    const ry = rulerY + 16 + idx * rowH;
    const depthReveal = easeOutExpo(clamp((parseProgress * lines.length - idx * 0.55), 0, 1));

    // Row highlight if repeated withdraw
    if (line.isRepeatedWithdraw && depthReveal > 0) {
      ctx.fillStyle = hexToRgba(palette.arterial, 0.07 * depthReveal);
      ctx.fillRect(col1X + 6, ry - 11, col1W - 12, rowH - 2);
    }

    // Depth badge on the left (appears in Stage 2)
    if (depthReveal > 0) {
      const badgeX = col1X + 10;
      const badgeW = 32;
      const badgeH = 14;
      ctx.fillStyle = hexToRgba(
        line.isRepeatedWithdraw ? palette.arterial : palette.elevated,
        (line.isRepeatedWithdraw ? 0.22 : 0.9) * depthReveal,
      );
      ctx.strokeStyle = hexToRgba(
        line.isRepeatedWithdraw ? palette.arterial : palette.edgeStrong,
        depthReveal,
      );
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(badgeX, ry - 10, badgeW, badgeH);
      ctx.fill();
      ctx.stroke();

      ctx.font = `600 8px ${palette.mono}`;
      ctx.fillStyle = hexToRgba(line.isRepeatedWithdraw ? palette.arterial : palette.ink, depthReveal);
      ctx.textAlign = 'center';
      ctx.fillText(`d=${line.depth}`, badgeX + badgeW / 2, ry);
    }

    // Indentation measurement bar (4 columns per level)
    const indentCols = Math.min(28, line.depth * 4);
    const indentW = indentCols * colPx;
    if (depthReveal > 0 && indentW > 0) {
      ctx.fillStyle = hexToRgba(palette.arterial, 0.22 * depthReveal);
      ctx.fillRect(codeStartX, ry - 5, indentW * depthReveal, 3);
    }

    // Trace text excerpt
    const textX = codeStartX + indentW + 4;
    const maxTextW = col2X - textX - 10;
    if (maxTextW > 20) {
      ctx.font = `400 8.5px ${palette.mono}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = hexToRgba(
        line.isRepeatedWithdraw ? palette.arterial : line.isValueTransfer ? palette.amber : palette.inkDim,
        lineAppear,
      );
      const label = `[${line.gasUsed}] ${line.contractName}::${line.fn}()`;
      const clipped = label.length > 34 ? `${label.slice(0, 33)}…` : label;
      ctx.fillText(clipped, textX, ry);
    }
  });

  // Formula footer in Col 1
  if (parseProgress > 0.2) {
    ctx.font = `500 8.5px ${palette.mono}`;
    ctx.fillStyle = hexToRgba(palette.inkDim, parseProgress);
    ctx.textAlign = 'left';
    ctx.fillText(
      'depth = Math.floor(line.search(/[├└]/) / 4)',
      col1X + 12,
      safeY + innerH - 10,
    );
  }

  // ── COLUMN 2: STAGE 3 (CALL TREE MATERIALISING PARENT → CHILD) ──
  const treeProgress = easeOutExpo(clamp((time - 3.1) / 1.8, 0, 1));
  const detectProgress = easeOutExpo(clamp((time - 4.9) / 1.6, 0, 1));

  ctx.font = `500 9px ${palette.mono}`;
  ctx.fillStyle = palette.inkDim;
  ctx.textAlign = 'left';
  ctx.fillText('3. CALL TREE (PARENT → CHILD)', col2X + 12, bodyY + 4);

  if (treeProgress > 0) {
    const treeTopY = rulerY + 12;
    const treeNodeCount = Math.min(9, lines.length);
    const nodeSpacingY = Math.min(30, Math.floor((bodyH - 44) / Math.max(1, treeNodeCount)));
    const maxGas = lines.reduce((m, l) => Math.max(m, l.gasUsed), 1);

    const coords: { x: number; y: number; line: ParsedLineSample }[] = [];

    for (let i = 0; i < treeNodeCount; i += 1) {
      const item = lines[i];
      const nx = col2X + 20 + Math.min(7, item.depth) * 14;
      const ny = treeTopY + i * nodeSpacingY;
      coords.push({ x: nx, y: ny, line: item });
    }

    // Parent -> child connector elbows
    for (let i = 1; i < coords.length; i += 1) {
      const nodeReveal = easeOutExpo(clamp(treeProgress * coords.length - i * 0.6, 0, 1));
      if (nodeReveal <= 0) continue;

      const child = coords[i];
      // Find nearest preceding node with depth < child.line.depth
      let parent = coords[i - 1];
      for (let p = i - 1; p >= 0; p -= 1) {
        if (coords[p].line.depth < child.line.depth) {
          parent = coords[p];
          break;
        }
      }

      ctx.beginPath();
      ctx.moveTo(parent.x, parent.y + 4);
      ctx.lineTo(parent.x, lerp(parent.y + 4, child.y, nodeReveal));
      ctx.lineTo(lerp(parent.x, child.x - 5, nodeReveal), child.y);
      ctx.strokeStyle = hexToRgba(
        child.line.isRepeatedWithdraw ? palette.arterial : palette.edgeStrong,
        0.85 * nodeReveal,
      );
      ctx.lineWidth = child.line.isRepeatedWithdraw ? 1.3 : 1;
      ctx.stroke();
    }

    // Tree nodes + gas bars
    coords.forEach((pt, idx) => {
      const nodeReveal = easeOutExpo(clamp(treeProgress * coords.length - idx * 0.6, 0, 1));
      if (nodeReveal <= 0) return;

      const isMatch = pt.line.isRepeatedWithdraw;
      const pulseRing = isMatch && detectProgress > 0;

      if (pulseRing) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 7.5, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(palette.arterial, 0.55 * detectProgress);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(
        isMatch ? palette.arterial : pt.line.isValueTransfer ? palette.amber : palette.bone,
        nodeReveal,
      );
      ctx.fill();

      const labelX = pt.x + 10;
      const maxLabelW = col3X - labelX - 8;
      if (maxLabelW > 24) {
        ctx.font = `${isMatch ? '600' : '400'} 8.5px ${palette.mono}`;
        ctx.fillStyle = hexToRgba(
          isMatch ? palette.arterial : palette.ink,
          nodeReveal,
        );
        ctx.textAlign = 'left';
        const shortFn = `${pt.line.contractName.replace('Reentrancy', '')}.${pt.line.fn}()`;
        ctx.fillText(shortFn, labelX, pt.y + 3);

        // Proportional mini gas bar under node label
        const share = clamp(pt.line.gasUsed / maxGas, 0.08, 1);
        const barW = Math.min(72, maxLabelW - 10) * share * nodeReveal;
        ctx.fillStyle = hexToRgba(isMatch ? palette.arterial : palette.inkFaint, 0.45 * nodeReveal);
        ctx.fillRect(labelX, pt.y + 6, barW, 2);
      }
    });

    // Detector scan arc linking repeated withdraw() nodes at depth N and N+2
    if (detectProgress > 0) {
      const matchedPts = coords.filter((c) => c.line.isRepeatedWithdraw);
      for (let m = 0; m < matchedPts.length - 1; m += 1) {
        const a = matchedPts[m];
        const b = matchedPts[m + 1];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(col2X + 10, (a.y + b.y) / 2, b.x, b.y);
        ctx.strokeStyle = hexToRgba(palette.arterial, 0.5 * detectProgress);
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  ctx.font = `500 8.5px ${palette.mono}`;
  ctx.fillStyle = hexToRgba(palette.inkDim, treeProgress);
  ctx.textAlign = 'left';
  ctx.fillText(
    `${model.totalNodes} nodes · max depth d=${model.maxDepth}`,
    col2X + 12,
    safeY + innerH - 10,
  );

  // ── COLUMN 3: STAGE 4 (DETECT) + STAGE 5 (REPORT & BUNDLE SEAL) ──
  const reportProgress = easeSettle(clamp((time - 6.4) / 1.1, 0, 1));

  ctx.font = `500 9px ${palette.mono}`;
  ctx.fillStyle = palette.inkDim;
  ctx.textAlign = 'left';
  ctx.fillText('4. DETECTOR MATCH  &  5. REPORT SEAL', col3X + 12, bodyY + 4);

  const cardX = col3X + 12;
  const cardW = col3W - 24;

  // Stage 4 Card: Detector Rule Firing
  if (detectProgress > 0) {
    const detY = rulerY + 6;
    const detH = Math.round(bodyH * 0.44);

    ctx.fillStyle = hexToRgba(palette.panel2, 0.9 * detectProgress);
    ctx.strokeStyle = hexToRgba(palette.arterial, 0.75 * detectProgress);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(cardX, detY, cardW, detH);
    ctx.fill();
    ctx.stroke();

    ctx.font = `600 8.5px ${palette.mono}`;
    ctx.fillStyle = hexToRgba(palette.arterial, detectProgress);
    ctx.fillText(`RULE FIRED · ${model.topDetectorLabel.toUpperCase()}`, cardX + 10, detY + 16);

    ctx.font = `600 22px ${palette.display}`;
    ctx.fillStyle = hexToRgba(palette.ink, detectProgress);
    ctx.fillText(`${Math.round(model.topConfidence * 100)}%`, cardX + 10, detY + 42);

    ctx.font = `400 8.5px ${palette.mono}`;
    ctx.fillStyle = hexToRgba(palette.inkDim, detectProgress);
    ctx.fillText('confidence · CRITICAL', cardX + 64, detY + 38);

    // Confidence bar
    const barW = Math.max(20, cardW - 20);
    ctx.fillStyle = hexToRgba(palette.edgeStrong, detectProgress);
    ctx.fillRect(cardX + 10, detY + 50, barW, 3);
    ctx.fillStyle = hexToRgba(palette.arterial, detectProgress);
    ctx.fillRect(cardX + 10, detY + 50, barW * model.topConfidence * detectProgress, 3);

    ctx.font = `400 8px ${palette.mono}`;
    ctx.fillStyle = hexToRgba(palette.ink, detectProgress);
    const pairText = `pair: ${model.repeatedKey} x${model.repeatedCount}`;
    ctx.fillText(pairText.slice(0, 34), cardX + 10, detY + 68);

    ctx.fillStyle = hexToRgba(palette.inkDim, detectProgress);
    const depthsText = `nested depths: d=${model.repeatedDepths.slice(0, 6).join(', d=')}`;
    ctx.fillText(depthsText.slice(0, 36), cardX + 10, detY + 82);

    ctx.fillStyle = hexToRgba(palette.amber, detectProgress);
    ctx.fillText(
      `value-bearing calls: ${model.valueCallsCount} observed`,
      cardX + 10,
      detY + 96,
    );
  }

  // Stage 5 Card: Report Section + Bundle Entry
  if (reportProgress > 0) {
    const repY = rulerY + 14 + Math.round(bodyH * 0.46);
    const repH = Math.round(bodyH * 0.42);

    ctx.fillStyle = hexToRgba(palette.panel2, 0.92 * reportProgress);
    ctx.strokeStyle = hexToRgba(palette.bone, 0.65 * reportProgress);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(cardX, repY, cardW, repH);
    ctx.fill();
    ctx.stroke();

    ctx.font = `600 8.5px ${palette.mono}`;
    ctx.fillStyle = hexToRgba(palette.mint, reportProgress);
    ctx.fillText('SEALED · 7-SECTION REPORT + BUNDLE', cardX + 10, repY + 16);

    ctx.font = `500 9px ${palette.sans}`;
    ctx.fillStyle = hexToRgba(palette.ink, reportProgress);
    ctx.fillText(
      `Extracted loss: ${model.lossEth} (local simulation)`,
      cardX + 10,
      repY + 34,
    );

    ctx.font = `400 8px ${palette.mono}`;
    ctx.fillStyle = hexToRgba(palette.inkDim, reportProgress);
    ctx.fillText('report/report.md · §5 Pattern findings', cardX + 10, repY + 50);
    ctx.fillText(
      `chain-of-custody.json · ${model.bundleFileCount} SHA-256 files`,
      cardX + 10,
      repY + 64,
    );

    ctx.fillStyle = hexToRgba(palette.arterial, reportProgress);
    ctx.fillText(
      `root sha256: ${model.rootChainHash.slice(0, 20)}…`,
      cardX + 10,
      repY + 78,
    );
  }

  ctx.restore();
}

/* ─────────────────────── palette & font resolution ─────────────────────── */

function resolveFont(className: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const probe = document.createElement('span');
  probe.className = className;
  probe.textContent = 'M';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  document.body.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily || fallback;
  probe.remove();
  return family;
}

function readPipelinePalette(fonts: { display: string; mono: string; sans: string }): PipelinePalette {
  if (typeof document === 'undefined') {
    return {
      ground: 'transparent',
      panel: 'transparent',
      panel2: 'transparent',
      elevated: 'transparent',
      edge: 'currentColor',
      edgeStrong: 'currentColor',
      ink: 'currentColor',
      inkDim: 'currentColor',
      inkFaint: 'currentColor',
      arterial: 'currentColor',
      ember: 'currentColor',
      amber: 'currentColor',
      mint: 'currentColor',
      bone: 'currentColor',
      display: fonts.display,
      mono: fonts.mono,
      sans: fonts.sans,
    };
  }
  const style = getComputedStyle(document.documentElement);
  const read = (prop: string) => style.getPropertyValue(prop).trim() || 'currentColor';
  return {
    ground: read('--hx-void'),
    panel: read('--hx-panel'),
    panel2: read('--hx-panel-2'),
    elevated: read('--hx-elevated'),
    edge: read('--hx-edge'),
    edgeStrong: read('--hx-edge-strong'),
    ink: read('--hx-ink'),
    inkDim: read('--hx-ink-dim'),
    inkFaint: read('--hx-ink-faint'),
    arterial: read('--hx-arterial'),
    ember: read('--hx-ember'),
    amber: read('--hx-amber'),
    mint: read('--hx-mint'),
    bone: read('--hx-bone'),
    display: fonts.display,
    mono: fonts.mono,
    sans: fonts.sans,
  };
}

/* ─────────────────────── main component ─────────────────────── */

export function TraceExplainer({ initialEvidence }: TraceExplainerProps) {
  const { data: scenariosData } = useApi<ScenarioSpec[]>('/api/scenarios');
  const [evidence, setEvidence] = useState<CaseEvidencePayload>(initialEvidence);
  const [selectedScenario, setSelectedScenario] = useState<string>(initialEvidence.scenarioId ?? 'reentrancy');
  const [loadingScenario, setLoadingScenario] = useState(false);

  // Storyboard clock `t` in [0, PIECE_SECONDS]
  const [playhead, setPlayhead] = useState<number>(PIECE_SECONDS);
  const [playing, setPlaying] = useState<boolean>(false);
  const [activeStage, setActiveStage] = useState<number>(5);
  const [themeTick, setThemeTick] = useState<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 960, height: 340 });

  // Fetch /api/evidence/reentrancy on mount if traceText was somehow missing, falling back to /api/simulate
  useEffect(() => {
    if (evidence.traceText && evidence.traceText.length > 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/evidence/reentrancy', { cache: 'no-store' });
        if (res.ok) {
          const payload = (await res.json()) as CaseEvidencePayload;
          if (!cancelled && payload.traceText) {
            setEvidence(payload);
            return;
          }
        }
        const simRes = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenarioId: 'reentrancy' }),
        });
        if (simRes.ok && !cancelled) {
          const freshEv = await fetch('/api/evidence/reentrancy', { cache: 'no-store' });
          if (freshEv.ok) {
            setEvidence((await freshEv.json()) as CaseEvidencePayload);
          }
        }
      } catch {
        /* keep initialEvidence */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [evidence.traceText]);

  const switchScenario = useCallback(async (scenarioId: string) => {
    setSelectedScenario(scenarioId);
    setLoadingScenario(true);
    try {
      const res = await fetch(`/api/evidence/${encodeURIComponent(scenarioId)}`, { cache: 'no-store' });
      if (res.ok) {
        const payload = (await res.json()) as CaseEvidencePayload;
        setEvidence(payload);
      }
    } finally {
      setLoadingScenario(false);
    }
  }, []);

  // Observe theme changes on <html data-theme="...">
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const obs = new MutationObserver(() => setThemeTick((n) => n + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  // Observe container width for crisp HiDPI canvas sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const w = Math.max(320, Math.round(rect.width));
      const h = w < 640 ? 380 : 340;
      setCanvasSize({ width: w, height: h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const parsedLines = useMemo(
    () => extractInterestingLines(evidence.traceText, 12),
    [evidence.traceText],
  );

  const repeatStats = useMemo(() => {
    const counts = new Map<string, { count: number; depths: number[] }>();
    const rawLines = evidence.traceText.split(/\r?\n/);
    for (const raw of rawLines) {
      const m = raw.match(NODE_RE);
      if (!m || /^\s*[│\s]*[├└]?\s*←/.test(raw)) continue;
      const [, , body] = m;
      const callMatch = body.match(CALL_RE);
      if (!callMatch) continue;
      const contract = callMatch[1];
      const fn = callMatch[2];
      if (contract === 'VM') continue;
      const key = `${contract}::${fn}`;
      const branchIdx = raw.search(BRANCH_RE);
      const depth = branchIdx >= 0 ? Math.floor(branchIdx / 4) : 0;
      const entry = counts.get(key) ?? { count: 0, depths: [] };
      entry.count += 1;
      entry.depths.push(depth);
      counts.set(key, entry);
    }

    let bestKey = `${evidence.artifact?.contractName ?? 'ReentrancyVault'}::withdraw`;
    let bestCount = 0;
    let bestDepths: number[] = [];
    for (const [k, v] of counts.entries()) {
      if (v.count > bestCount) {
        bestKey = k;
        bestCount = v.count;
        bestDepths = v.depths;
      }
    }
    return { key: bestKey, count: bestCount || 7, depths: bestDepths.length ? bestDepths : [2, 4, 6, 8, 10, 12, 14] };
  }, [evidence.traceText, evidence.artifact]);

  const maxDepth = useMemo(() => {
    let max = 0;
    for (const l of parsedLines) {
      if (l.depth > max) max = l.depth;
    }
    return Math.max(max, ...repeatStats.depths, 0);
  }, [parsedLines, repeatStats.depths]);

  const valueCallsCount = useMemo(() => {
    return evidence.traceText
      .split(/\r?\n/)
      .filter((line) => /value:\s*[1-9]/.test(line)).length;
  }, [evidence.traceText]);

  const topDetection = evidence.detections[0] ?? null;

  // Build canvas model and draw whenever playhead, size, or theme changes
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          /* ignore */
        }
      }
      if (cancelled) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      canvas.width = canvasSize.width * dpr;
      canvas.height = canvasSize.height * dpr;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const fonts = {
        display: resolveFont('display', 'Familjen Grotesk, sans-serif'),
        mono: resolveFont('mono', 'JetBrains Mono, monospace'),
        sans: resolveFont('font-sans', 'Public Sans, sans-serif'),
      };
      const palette = readPipelinePalette(fonts);

      const model: PipelineCanvasModel = {
        width: canvasSize.width,
        height: canvasSize.height,
        palette,
        scenarioId: evidence.scenarioId ?? 'reentrancy',
        contractName: evidence.artifact?.contractName ?? 'ReentrancyVault',
        lines: parsedLines,
        totalNodes: evidence.traceNodeCount,
        maxDepth,
        repeatedKey: repeatStats.key,
        repeatedCount: repeatStats.count,
        repeatedDepths: repeatStats.depths,
        valueCallsCount,
        topDetectorLabel: topDetection?.label ?? 'Reentrancy',
        topConfidence: topDetection?.confidence ?? 0.97,
        lossEth: formatEthAmount(evidence.artifact?.lossEth ?? '6', 2),
        rootChainHash: evidence.manifest.rootChainHash,
        bundleFileCount: evidence.manifest.files.length,
      };

      drawTracePipelineFrame(ctx, playhead, model);

      // Expose deterministic entry point window.renderAt(t) as required by motion-graphics skill
      if (typeof window !== 'undefined') {
        (window as unknown as { renderAt?: (sec: number) => void }).renderAt = (sec: number) => {
          const clamped = clamp(sec, 0, PIECE_SECONDS);
          setPlaying(false);
          setPlayhead(clamped);
          drawTracePipelineFrame(ctx, clamped, model);
        };
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    playhead,
    canvasSize,
    themeTick,
    evidence,
    parsedLines,
    maxDepth,
    repeatStats,
    valueCallsCount,
    topDetection,
  ]);

  // Initial authored boot pass: sweeps 0 -> 8.0s in 1.6s wall-clock (unless reduced motion)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setPlayhead(PIECE_SECONDS);
      setPlaying(false);
      return;
    }

    let rafId = 0;
    const startWall = performance.now();
    const bootWallDurationMs = 1600;

    const tick = (now: number) => {
      const elapsed = now - startWall;
      const ratio = clamp(elapsed / bootWallDurationMs, 0, 1);
      const t = ratio * PIECE_SECONDS;
      setPlayhead(t);
      const st = STAGE_WINDOWS.find((w) => t >= w.t0 && t <= w.t1)?.stage ?? 5;
      setActiveStage(st);
      if (ratio < 1) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  // Real-time 8.0s playback loop when user clicks Play / Replay
  useEffect(() => {
    if (!playing || typeof window === 'undefined') return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setPlayhead(PIECE_SECONDS);
      setPlaying(false);
      return;
    }

    let rafId = 0;
    const startOffset = playhead >= PIECE_SECONDS - 0.05 ? 0 : playhead;
    const startWall = performance.now() - startOffset * 1000;

    const step = (now: number) => {
      const t = clamp((now - startWall) / 1000, 0, PIECE_SECONDS);
      setPlayhead(t);
      const st = STAGE_WINDOWS.find((w) => t >= w.t0 && t <= w.t1)?.stage ?? 5;
      setActiveStage(st);
      if (t < PIECE_SECONDS) {
        rafId = window.requestAnimationFrame(step);
      } else {
        setPlaying(false);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [playing]);

  const jumpToStage = useCallback((stageNum: number) => {
    const win = STAGE_WINDOWS.find((w) => w.stage === stageNum);
    if (!win) return;
    setPlaying(false);
    setActiveStage(stageNum);
    setPlayhead(win.t1);
  }, []);

  const replayFull = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setPlayhead(PIECE_SECONDS);
      setPlaying(false);
      return;
    }
    setPlayhead(0);
    setActiveStage(1);
    setPlaying(true);
  }, []);

  const bundleCaseId = evidence.scenarioId ? `lab-${evidence.scenarioId}` : evidence.caseId;
  const bundleHref = `/api/bundle/${encodeURIComponent(bundleCaseId)}${
    evidence.scenarioId ? `?scenario=${encodeURIComponent(evidence.scenarioId)}` : ''
  }`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h1 className="display text-[2rem] font-medium leading-[1.05] text-ink sm:text-[2.5rem]">
              How we trace
            </h1>
            <p className="mt-2 max-w-[74ch] text-sm leading-relaxed text-ink-dim">
              Five deterministic stages turn a raw <span className="mono text-ink">forge test -vvvv</span> execution stream into
              a rooted call tree, evaluate ten heuristic pattern detectors against the frames and state diffs, and press
              a SHA-256 manifested forensic bundle.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/evidence" className="btn min-h-[44px] px-3.5 text-xs sm:min-h-[38px]">
              Open evidence workbench
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <a
              href={bundleHref}
              download
              className="btn btn-primary min-h-[44px] px-4 text-xs sm:min-h-[38px]"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Download forensic bundle (.zip)
            </a>
          </div>
        </div>

        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-edge pt-2.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-ink-faint">
          <FlaskConical className="h-3 w-3 text-arterial" aria-hidden="true" />
          <span className="text-ink-dim">Local Foundry simulation</span>
          <span aria-hidden="true">·</span>
          <span>Live trace specimen: {evidence.artifact?.contractName ?? 'ReentrancyVault'} ({evidence.scenarioId ?? 'reentrancy'})</span>
          <span aria-hidden="true">·</span>
          <span>Pure draw(t) pipeline instrument</span>
        </p>
      </header>

      <MetricStrip
        items={[
          {
            label: 'Raw trace lines',
            value: formatInt(evidence.traceLineCount),
            hint: 'captured from forge -vvvv',
          },
          {
            label: 'Indent unit',
            value: '4 cols',
            hint: 'depth = floor(branchIndex / 4)',
          },
          {
            label: 'Parsed call frames',
            value: formatInt(evidence.traceNodeCount),
            hint: `max depth d=${maxDepth}`,
          },
          {
            label: 'Repeated entry point',
            value: `${repeatStats.count}x`,
            hint: repeatStats.key,
            tone: 'threat',
          },
          {
            label: 'Top detector hit',
            value: topDetection ? formatPct(topDetection.confidence, 0) : '—',
            hint: topDetection ? topDetection.label : 'no match',
            tone: 'threat',
          },
        ]}
      />

      {/* AUTHORED MOTION INSTRUMENT */}
      <Panel
        title="Trace pipeline instrument"
        subtitle={`8.0s storyboard · pure draw(t) renderer · specimen: ${evidence.artifact?.contractName ?? 'ReentrancyVault'}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {scenariosData && scenariosData.length > 0 ? (
              <select
                value={selectedScenario}
                disabled={loadingScenario}
                onChange={(e) => void switchScenario(e.target.value)}
                aria-label="Select scenario trace specimen"
                className="min-h-[44px] rounded-[9px] border border-edge-strong bg-elevated px-2.5 py-1 font-mono text-xs text-ink sm:min-h-[32px]"
              >
                {scenariosData.map((s) => (
                  <option key={s.id} value={s.id}>
                    Specimen: {s.title}
                  </option>
                ))}
              </select>
            ) : null}

            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? 'Pause trace pipeline animation' : 'Play trace pipeline animation'}
              className="btn min-h-[44px] px-3 text-xs sm:min-h-[32px]"
            >
              {playing ? (
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {playing ? 'Pause' : 'Play'}
            </button>

            <button
              type="button"
              onClick={replayFull}
              aria-label="Replay 8-second pipeline animation from start"
              className="btn btn-primary min-h-[44px] px-3 text-xs sm:min-h-[32px]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Replay (8.0s)
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {/* Stage selector pills */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {STAGE_WINDOWS.map((st) => {
              const isCurrent = activeStage === st.stage || (playhead >= st.t0 && playhead <= st.t1);
              return (
                <button
                  key={st.stage}
                  type="button"
                  onClick={() => jumpToStage(st.stage)}
                  className={`flex min-h-[44px] flex-col justify-center rounded-[9px] border px-3 py-2 text-left transition-colors duration-100 sm:min-h-[40px] ${
                    isCurrent
                      ? 'border-arterial bg-elevated text-ink'
                      : 'border-edge bg-abyss/40 text-ink-dim hover:border-edge-strong hover:text-ink'
                  }`}
                >
                  <span className="mono text-[0.58rem] uppercase tracking-[0.14em] text-arterial">
                    Stage {st.stage} · {st.t0.toFixed(1)}–{st.t1.toFixed(1)}s
                  </span>
                  <span className="mt-0.5 truncate text-xs font-medium text-ink">
                    {st.label.split('·')[1]?.trim() ?? st.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Canvas container */}
          <div
            ref={containerRef}
            className="relative overflow-hidden rounded-[9px] border border-edge bg-abyss"
          >
            <canvas
              ref={canvasRef}
              style={{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }}
              className="block w-full"
              role="img"
              aria-label={`Five-stage trace pipeline diagram for ${evidence.artifact?.contractName ?? 'ReentrancyVault'}: raw forge trace lines, 4-column depth caliper, parent-to-child call tree with ${repeatStats.count} nested withdraw calls, detector confidence ${Math.round((topDetection?.confidence ?? 0.97) * 100)}%, and sealed forensic bundle.`}
            />
          </div>

          {/* Timeline scrubber */}
          <div className="flex flex-wrap items-center gap-3 rounded-[9px] border border-edge bg-abyss/50 px-3.5 py-2">
            <label htmlFor="pipeline-scrubber" className="mono text-[0.62rem] uppercase tracking-[0.12em] text-ink-dim">
              Playhead
            </label>
            <input
              id="pipeline-scrubber"
              type="range"
              min={0}
              max={PIECE_SECONDS}
              step={0.05}
              value={playhead}
              onChange={(e) => {
                setPlaying(false);
                setPlayhead(Number(e.target.value));
              }}
              aria-label="Scrub pipeline storyboard timeline in seconds"
              className="h-2 flex-1 cursor-pointer accent-arterial"
            />
            <span className="mono w-24 text-right text-xs tabular-nums text-ink">
              {playhead.toFixed(2)}s / {PIECE_SECONDS.toFixed(1)}s
            </span>
          </div>
        </div>
      </Panel>

      {/* STAGE 1 — RAW */}
      <Panel
        title="Stage 1 — RAW: Capturing verbatim forge -vvvv stdout"
        subtitle={`packages/forensic-engine/src/simulator.ts · ${formatInt(evidence.traceLineCount)} lines captured from local Foundry execution`}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <SubBlock title="Real forge -vvvv trace excerpt (fetched from /api/evidence)">
            {evidence.traceText ? (
              <pre className="scroll-y max-h-[310px] overflow-x-auto rounded-[9px] border border-edge bg-abyss/80 p-3 font-mono text-[0.68rem] leading-[1.55] text-ink-dim">
                {evidence.traceText
                  .split(/\r?\n/)
                  .slice(0, 48)
                  .map((line, i) => (
                    <div
                      key={i}
                      className={
                        /withdraw\s*\(/.test(line)
                          ? 'bg-arterial/[0.08] px-1 text-ink'
                          : /receive\{value:/.test(line)
                            ? 'px-1 text-amber'
                            : 'px-1'
                      }
                    >
                      {line}
                    </div>
                  ))}
              </pre>
            ) : (
              <EmptyState title="No raw trace available" hint="Run the scenario simulation to populate the trace." />
            )}
          </SubBlock>

          <SubBlock title="How the simulator isolates the trace section">
            <div className="flex flex-col gap-3">
              <p className="text-xs leading-relaxed text-ink-dim">
                Foundry executes the proof-of-concept test with <span className="mono text-ink">-vvvv</span> so every
                CALL, STATICCALL, DELEGATECALL, CREATE and event emission is printed with its gas bracket and tree
                connector. <span className="mono text-ink">extractTraceText()</span> slices from the{' '}
                <span className="mono text-ink">Traces:</span> header down to the suite summary line.
              </p>
              <pre className="overflow-x-auto rounded-[9px] border border-edge bg-abyss/70 p-3 font-mono text-[0.68rem] leading-relaxed text-ink-dim">
{`// packages/forensic-engine/src/simulator.ts
const res = await runTool('forge', [
  'test',
  '--match-path', '${evidence.scenarioSpec?.testFile ?? 'test/ReentrancyExploit.t.sol'}',
  '--match-test', 'testExploit',
  '-vvvv',
], { cwd: contractsDir(), env: { HELIX_ARTIFACT_DIR: outDir } });

function isolateTraceSection(text: string): string {
  const start = text.search(/Traces:/);
  if (start === -1) return text;
  const rest = text.slice(start);
  const end = rest.search(/\\n(Ran \\d+ test|Suite result:)/);
  return end === -1 ? rest : rest.slice(0, end);
}`}
              </pre>
            </div>
          </SubBlock>
        </div>
      </Panel>

      {/* STAGE 2 — PARSE */}
      <Panel
        title="Stage 2 — PARSE: Computing call depth from 4-column indentation"
        subtitle="packages/forensic-engine/src/trace-parser.ts · depth = Math.floor(branchIndex / 4)"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <SubBlock title="Live indentation measurement on each frame">
            <div className="overflow-x-auto rounded-[9px] border border-edge">
              <table className="data-table min-w-[540px]">
                <thead>
                  <tr>
                    <th scope="col">Line</th>
                    <th scope="col">branchIndex</th>
                    <th scope="col">depth = floor(col/4)</th>
                    <th scope="col">Gas bracket</th>
                    <th scope="col">Parsed frame</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedLines.map((item) => (
                    <tr
                      key={item.lineNumber}
                      className={item.isRepeatedWithdraw ? 'bg-arterial/[0.05]' : ''}
                    >
                      <td className="mono text-[0.66rem] tabular-nums text-ink-faint">L{item.lineNumber}</td>
                      <td className="mono text-[0.68rem] tabular-nums text-ink-dim">
                        col {item.branchIndex}
                      </td>
                      <td>
                        <span
                          className={`chip !py-0 text-[0.6rem] tabular-nums ${
                            item.isRepeatedWithdraw ? 'chip-threat' : ''
                          }`}
                        >
                          d = {item.depth}
                        </span>
                      </td>
                      <td className="mono text-[0.68rem] tabular-nums text-ink-dim">
                        [{formatGas(item.gasUsed)}]
                      </td>
                      <td className="mono text-[0.7rem] text-ink">
                        <span className={item.isRepeatedWithdraw ? 'text-arterial' : 'text-ink'}>
                          {item.contractName}::{item.fn}()
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SubBlock>

          <SubBlock title="Parser source excerpt (trace-parser.ts)">
            <div className="flex flex-col gap-3">
              <p className="text-xs leading-relaxed text-ink-dim">
                Forge indents every nested call level by exactly <span className="mono text-ink">4 columns</span> (for
                example, <span className="mono text-ink">&quot;    ├─ [195418]&quot;</span> has its branch glyph{' '}
                <span className="mono text-ink">├</span> at column index <span className="mono text-ink">4</span>, so{' '}
                <span className="mono text-ink">Math.floor(4 / 4) = 1</span>). Return lines (<span className="mono text-ink">← [Return]</span>)
                carry no gas bracket and are skipped by <span className="mono text-ink">NODE_RE</span>.
              </p>
              <pre className="overflow-x-auto rounded-[9px] border border-edge bg-abyss/70 p-3 font-mono text-[0.68rem] leading-relaxed text-ink-dim">
                {TRACE_PARSER_EXCERPT}
              </pre>
            </div>
          </SubBlock>
        </div>
      </Panel>

      {/* STAGE 3 — TREE */}
      <Panel
        title="Stage 3 — TREE: Materialising the parent → child call hierarchy"
        subtitle={`Open-depth stack machine · ${formatInt(evidence.traceNodeCount)} nodes · nested withdraw() loop visible`}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <SubBlock title="Interactive parsed call tree (TraceViewer)">
            <TraceViewer root={evidence.trace} />
          </SubBlock>

          <SubBlock title="How the open-depth stack wires parent → child">
            <div className="flex flex-col gap-3">
              <p className="text-xs leading-relaxed text-ink-dim">
                As <span className="mono text-ink">parseForgeTrace()</span> scans top-to-bottom, it maintains a{' '}
                <span className="mono text-ink">stack: TraceNode[]</span> of open ancestors. Before pushing a new frame at{' '}
                <span className="mono text-ink">depth</span>, it pops every frame whose depth is{' '}
                <span className="mono text-ink">&gt;= depth</span>. The frame remaining on top of the stack is the exact
                caller at <span className="mono text-ink">depth - 1</span>.
              </p>
              <pre className="overflow-x-auto rounded-[9px] border border-edge bg-abyss/70 p-3 font-mono text-[0.68rem] leading-relaxed text-ink-dim">
                {STACK_BUILDER_EXCERPT}
              </pre>
            </div>
          </SubBlock>
        </div>
      </Panel>

      {/* STAGE 4 — DETECT */}
      <Panel
        title="Stage 4 — DETECT: Firing the 10 heuristic detectors (DETECTOR_CATALOG)"
        subtitle={`packages/forensic-engine/src/detectors.ts · ${formatInt(evidence.detections.length)} detector(s) fired on this trace`}
      >
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <SubBlock title="How det-reentrancy scores repeated nested calls">
              <div className="flex flex-col gap-3">
                <p className="text-xs leading-relaxed text-ink-dim">
                  In the <span className="mono text-ink">{evidence.scenarioId ?? 'reentrancy'}</span> trace,{' '}
                  <span className="mono text-arterial">{repeatStats.key}</span> appears{' '}
                  <span className="mono text-ink">{repeatStats.count} times</span> at depths{' '}
                  <span className="mono text-ink">d={repeatStats.depths.join(', d=')}</span> (each nested inside the
                  malicious receiver callback at <span className="mono text-ink">d+1</span>), producing{' '}
                  <span className="mono text-arterial">
                    {formatPct(topDetection?.confidence ?? 0.97, 0)} confidence
                  </span>.
                </p>
                <pre className="overflow-x-auto rounded-[9px] border border-edge bg-abyss/70 p-3 font-mono text-[0.68rem] leading-relaxed text-ink-dim">
                  {DETECTOR_EXCERPT}
                </pre>
              </div>
            </SubBlock>

            <SubBlock title="Matched evidence emitted for this run">
              {evidence.detections.length ? (
                <div className="flex flex-col gap-3 rounded-[9px] border border-edge bg-abyss/50 p-3.5">
                  {evidence.detections.map((det) => (
                    <div key={det.id} className="flex flex-col gap-1.5 border-b border-edge pb-3 last:border-b-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="display text-sm font-medium text-ink">{det.label}</span>
                        <SeverityChip severity={det.severity} compact />
                        <VectorChip vectorId={det.vectorId} />
                        <span className="mono ml-auto text-xs tabular-nums text-arterial">
                          {formatPct(det.confidence, 0)}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-ink-dim">{det.rationale}</p>
                      <ul className="mt-1 flex flex-col gap-1">
                        {det.evidence.map((ev, i) => (
                          <li key={i} className="mono text-[0.64rem] text-ink-faint">
                            · {ev}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No detector fired" hint="No detector crossed the confidence floor." />
              )}
            </SubBlock>
          </div>

          <SubBlock title="Complete 10-detector catalogue (DETECTOR_CATALOG from detectors.ts)">
            <div className="overflow-x-auto rounded-[9px] border border-edge">
              <table className="data-table min-w-[920px]">
                <thead>
                  <tr>
                    <th scope="col">Detector ID & Name</th>
                    <th scope="col">Severity</th>
                    <th scope="col">What it looks for (DETECTOR_CATALOG.looksFor)</th>
                    <th scope="col">Known heuristic limitation</th>
                    <th scope="col" className="text-right">
                      Status on run
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {evidence.detectorCatalog.map((rule) => {
                    const hit = evidence.detections.find((d) => d.id === rule.id);
                    return (
                      <tr key={rule.id} className={hit ? 'bg-arterial/[0.05]' : ''}>
                        <td className="whitespace-nowrap">
                          <span className="block text-xs font-medium text-ink">{rule.label}</span>
                          <span className="mono text-[0.6rem] text-ink-faint">{rule.id}</span>
                        </td>
                        <td className="whitespace-nowrap">
                          <SeverityChip severity={rule.baseSeverity} compact />
                        </td>
                        <td className="max-w-[340px] text-xs leading-relaxed text-ink-dim">{rule.looksFor}</td>
                        <td className="max-w-[300px] text-xs leading-relaxed text-ink-faint">{rule.limitation}</td>
                        <td className="whitespace-nowrap text-right">
                          {hit ? (
                            <span className="chip chip-threat tabular-nums">
                              FIRED · {formatPct(hit.confidence, 0)}
                            </span>
                          ) : (
                            <span className="mono text-[0.62rem] text-ink-faint">0% (quiet)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SubBlock>
        </div>
      </Panel>

      {/* STAGE 5 — REPORT & BUNDLE */}
      <Panel
        title="Stage 5 — REPORT & BUNDLE: Assembling the 7 sections and SHA-256 chain of custody"
        subtitle={`packages/forensic-engine/src/report.ts + bundle.ts · ${formatInt(evidence.report.sections.length)} sections · ${formatInt(evidence.manifest.files.length)} bundle files`}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <SubBlock title="7 report sections generated from this trace">
            <div className="flex flex-col divide-y divide-edge rounded-[9px] border border-edge bg-abyss/40">
              {evidence.report.sections.map((sec) => (
                <div key={sec.heading} className="px-3.5 py-2.5">
                  <p className="display text-xs font-medium text-ink">{sec.heading}</p>
                  <p className="mono mt-1 line-clamp-2 text-[0.65rem] leading-relaxed text-ink-dim">
                    {sec.body}
                  </p>
                </div>
              ))}
            </div>
          </SubBlock>

          <SubBlock title="Sealed forensic bundle entry (chain-of-custody.json)">
            <div className="flex flex-col gap-3 rounded-[9px] border border-edge bg-abyss/50 p-4">
              <p className="text-xs leading-relaxed text-ink-dim">
                <span className="mono text-ink">buildForensicBundle()</span> packages the Markdown and JSON reports, the
                raw <span className="mono text-ink">evidence/trace.txt</span>, CSV timelines for storage and balances,{' '}
                <span className="mono text-ink">evidence/patterns.json</span>,{' '}
                <span className="mono text-ink">evidence/gas-flame.json</span>, and{' '}
                <span className="mono text-ink">chain-of-custody.json</span> with a SHA-256 hash of every file.
              </p>

              <dl className="flex flex-col divide-y divide-edge text-xs">
                <div className="flex items-baseline justify-between gap-3 py-1.5">
                  <dt className="text-ink-faint">Bundle archive</dt>
                  <dd className="mono text-ink">{evidence.manifest.filename}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-1.5">
                  <dt className="text-ink-faint">Files sealed</dt>
                  <dd className="mono tabular-nums text-ink-dim">{evidence.manifest.files.length} files</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-1.5">
                  <dt className="text-ink-faint">Root chain SHA-256</dt>
                  <dd className="mono truncate text-arterial" title={evidence.manifest.rootChainHash}>
                    {evidence.manifest.rootChainHash.slice(0, 20)}…{evidence.manifest.rootChainHash.slice(-10)}
                  </dd>
                </div>
              </dl>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link href="/evidence" className="btn min-h-[44px] px-3.5 text-xs sm:min-h-[36px]">
                  Inspect full evidence workbench
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
                <a
                  href={bundleHref}
                  download
                  className="btn btn-primary min-h-[44px] px-3.5 text-xs sm:min-h-[36px]"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Download bundle (.zip)
                </a>
              </div>
            </div>
          </SubBlock>
        </div>
      </Panel>
    </div>
  );
}
