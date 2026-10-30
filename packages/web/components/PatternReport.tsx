'use client';

import { CornerDownRight } from 'lucide-react';
import type { PatternDetection } from '@helix/core';
import { ATTACK_VECTORS } from '@helix/core';
import { formatPct } from '../lib/format';
import { EmptyState } from './Panel';
import { SeverityChip } from './SeverityChip';
import { VectorChip } from './VectorChip';
import { MermaidDiagram } from './MermaidDiagram';

interface PatternReportProps {
  findings: PatternDetection[];
  /** Render each finding's mermaid attack-flow diagram. */
  showDiagrams?: boolean;
}

export function PatternReport({ findings, showDiagrams = true }: PatternReportProps) {
  if (!findings.length) {
    return (
      <EmptyState
        title="No patterns detected"
        hint="No detector crossed the confidence threshold for this execution."
      />
    );
  }

  const ordered = [...findings].sort((a, b) => b.confidence - a.confidence);

  return (
    <div className="flex flex-col">
      {ordered.map((finding, index) => {
        const confidence = Math.max(0, Math.min(1, finding.confidence));
        const vectorLabel = ATTACK_VECTORS[finding.vectorId]?.label;
        const showVector = vectorLabel ? vectorLabel.toLowerCase() !== finding.label.trim().toLowerCase() : false;
        return (
          <article
            key={finding.id}
            className={`flex flex-col gap-3 py-4 ${index > 0 ? 'border-t border-edge' : 'pt-0'}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="display text-[0.98rem] font-medium text-ink">{finding.label}</h3>
              <SeverityChip severity={finding.severity} compact />
              {showVector ? <VectorChip vectorId={finding.vectorId} /> : null}
            </div>

            <div className="flex items-center gap-2">
              <span className="shrink-0 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-ink-faint">
                confidence
              </span>
              <div className="h-[2px] flex-1 bg-edge" role="presentation">
                <div className="h-full bg-arterial" style={{ width: `${confidence * 100}%` }} />
              </div>
              <span className="w-9 shrink-0 text-right font-mono text-[0.58rem] tabular-nums text-ink-dim">
                {formatPct(confidence, 0)}
              </span>
            </div>

            <p className="text-[0.82rem] leading-relaxed text-ink-dim">{finding.rationale}</p>

            {finding.evidence.length ? (
              <div>
                <p className="label-micro mb-1.5">evidence</p>
                <ul className="flex flex-col gap-1">
                  {finding.evidence.map((item, evidenceIndex) => (
                    <li
                      key={`${finding.id}-evidence-${evidenceIndex}`}
                      className="flex items-start gap-1.5 font-mono text-[0.62rem] leading-relaxed text-ink-faint"
                    >
                      <CornerDownRight className="mt-0.5 h-2.5 w-2.5 shrink-0 text-arterial/70" aria-hidden />
                      <span className="break-words">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {showDiagrams && finding.mermaid ? (
              <MermaidDiagram chart={finding.mermaid} caption={`attack flow · ${finding.label}`} />
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
