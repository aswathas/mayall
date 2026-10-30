import type { ForensicReport, SimulationArtifact } from '@helix/core';
import { deterministicDiagram, deterministicSequence } from './client-plan.js';

const DIAGRAM_START = /^(sequenceDiagram|flowchart|graph|stateDiagram|erDiagram|classDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|gitGraph)\b/m;

export interface DiagramDoc {
  text: string;
  source: string;
}

/** Pulls the first fenced ```mermaid block out of an LLM document. */
export function extractMermaid(text: string): string | null {
  if (!text) return null;
  const fence = text.match(/```mermaid\s*\n([\s\S]*?)```/i);
  const body = fence ? fence[1] : null;
  if (!body) return null;
  const trimmed = body.trim();
  if (!DIAGRAM_START.test(trimmed)) return null;
  return trimmed;
}

export function mermaidBlocks(text: string): string[] {
  const out: string[] = [];
  const re = /```mermaid\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const body = match[1].trim();
    if (DIAGRAM_START.test(body)) out.push(body);
  }
  return out;
}

/**
 * Chooses the diagram for report/diagram.mmd: the model's mermaid block when it
 * produced one, otherwise a deterministic diagram built from the evidence.
 */
export function resolveDiagram(
  narrativeText: string,
  artifact: SimulationArtifact | null,
  report: ForensicReport,
  narrativeSource = 'minimax-code',
): DiagramDoc {
  const source = narrativeSource === 'deterministic' ? 'deterministic' : narrativeSource;
  const extracted = extractMermaid(narrativeText);
  if (extracted) return { text: extracted, source };
  if (artifact?.steps.length) {
    return { text: deterministicSequence(artifact), source: 'deterministic' };
  }
  return { text: deterministicDiagram(artifact, report), source: 'deterministic' };
}
