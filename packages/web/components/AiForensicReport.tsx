'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  Cpu,
  Database,
  FileCode2,
  FlaskConical,
  Info,
  Quote,
} from 'lucide-react';
import type { GeneratedIncidentReport } from '@helix/forensic-engine';
import { formatDateTime, formatPct, formatUsdCompact } from '../lib/format';
import { Panel, SubBlock } from './Panel';
import { HistoricalMetricBand } from './HistoricalMetrics';
import { SeverityChip } from './SeverityChip';
import { ChainChip } from './ChainChip';
import { VectorChip } from './VectorChip';
import { MermaidDiagram } from './MermaidDiagram';
import { PatternReport } from './PatternReport';
import { HistoricalMarkdown } from './HistoricalMarkdown';

export type HistoricalReportPayload = GeneratedIncidentReport & { stored?: boolean };

function withoutDiagram(body: string): string {
  return body
    .replace(/###\s+Attack flow\s*/gi, '')
    .replace(/```mermaid[\s\S]*?```/gi, '')
    .trim();
}

function CopyReportButton({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [markdown]);

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="btn btn-primary h-11 px-3 text-xs sm:h-9"
      aria-label={copied ? 'Report markdown copied' : 'Copy report markdown'}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-mint" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span aria-live="polite">{copied ? 'Copied' : 'Copy markdown'}</span>
    </button>
  );
}

export function AiForensicReport({ report }: { report: HistoricalReportPayload }) {
  const { analysis, detection } = report;
  const reproduced = Boolean(analysis.scenarioId);

  const detectorLimitations = analysis.findings
    .filter((finding) => detection.detections.some((item) => item.vectorId === finding.vector))
    .map((finding) => ({
      key: finding.vector,
      label: finding.vectorLabel,
      detector: finding.biblePattern,
      limitation: finding.limitations,
    }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/historical"
          className="inline-flex min-h-11 items-center gap-1.5 text-xs text-ink-dim transition-colors duration-100 hover:text-arterial sm:min-h-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Historical analysis
        </Link>
      </div>

      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <h1 className="display text-[1.95rem] font-medium leading-[1.06] text-ink sm:text-[2.5rem]">
              {analysis.name}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-dim">
              <span>{analysis.target}</span>
              <span aria-hidden="true" className="text-ink-faint">
                ·
              </span>
              <span className="mono text-[0.7rem] text-ink-faint">{analysis.date}</span>
              <span aria-hidden="true" className="text-ink-faint">
                ·
              </span>
              <span className="mono text-[0.7rem] text-ink-faint">{report.caseId}</span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <ChainChip chain={analysis.chain} />
              <SeverityChip severity={analysis.severity} />
              {analysis.recovered ? <span className="chip chip-safe">recovered</span> : null}
              {reproduced ? (
                <span className="chip chip-safe">local reproduction</span>
              ) : (
                <span className="chip chip-warn">retrospective only</span>
              )}
              {report.generatedBy === 'minimax-code' ? (
                <span className="chip text-ink-dim">
                  <Cpu className="h-3 w-3" aria-hidden="true" />
                  minimax-code · {report.model ?? 'model'}
                </span>
              ) : (
                <span className="chip chip-warn">
                  <FileCode2 className="h-3 w-3" aria-hidden="true" />
                  deterministic writer
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <CopyReportButton markdown={report.markdown} />
            <Link href={`/cases/${analysis.slug}`} className="btn h-11 px-3 text-xs sm:h-9">
              Incident record
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            {analysis.scenarioId ? (
              <Link
                href={`/lab?scenario=${encodeURIComponent(analysis.scenarioId)}`}
                className="btn h-11 px-3 text-xs sm:h-9"
              >
                <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                Open local lab
              </Link>
            ) : null}
          </div>
        </div>

        <HistoricalMetricBand
          desktopColumns={4}
          items={[
            {
              label: 'Reported loss',
              value: formatUsdCompact(analysis.lossUsd),
              hint: 'reported at disclosure',
              tone: 'threat',
            },
            {
              label: 'Attack vectors',
              value: String(analysis.findings.length),
              hint: analysis.findings.map((finding) => finding.vectorLabel).join(' · '),
            },
            {
              label: 'Classification',
              value: formatPct(analysis.topConfidence, 0),
              hint: 'retrospective confidence',
            },
            {
              label: 'Local reproduction',
              value: reproduced ? 'Available' : 'None',
              hint: reproduced ? `scenario ${analysis.scenarioId}` : 'public record only',
              tone: reproduced ? 'safe' : 'default',
            },
          ]}
        />
      </header>

      <div className="flex items-start gap-3 rounded-[9px] border border-edge bg-panel-2 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-dim" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[0.8rem] leading-relaxed text-ink-dim">
            This is a retrospective classification over public records, not a mainnet trace analysis. Detector output
            comes from the local Foundry reproduction of the same attack vector, not from the historic transaction.
          </p>
          <p className="mono mt-1.5 text-[0.58rem] uppercase tracking-[0.12em] text-ink-faint">
            generated {formatDateTime(report.generatedAt)} · {report.generatedBy}
            {report.model ? ` · ${report.model}` : ''}
            {report.stored === false ? ' · draft, not stored' : ''}
          </p>
        </div>
      </div>

      {report.generatedBy === 'deterministic' ? (
        <div className="flex items-start gap-3 rounded-[9px] border border-amber/35 bg-amber/[0.04] px-4 py-3">
          <FileCode2 className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden="true" />
          <p className="text-[0.8rem] leading-relaxed text-ink-dim">
            Deterministic report. No model authored this document; it was assembled from the registry, the Bible
            mapping and the local detector output. Run{' '}
            <span className="mono text-ink">npx tsx scripts/generate-historical-reports.ts</span> to attempt the
            MiniMax Code version.
          </p>
        </div>
      ) : null}

      <div className="flex items-start gap-3 rounded-[9px] border border-edge px-4 py-3">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
        <p className="text-[0.78rem] leading-relaxed text-ink-faint">
          <strong className="font-semibold text-ink-dim">Source precedence.</strong> Incident metadata comes from{' '}
          <span className="mono">packages/core/src/incidents.ts</span>. Bible sheets 03 and 04 supply the pattern and
          signal names. The Bible&apos;s real-world examples are annotations and can cite different figures — for
          example, Beanstalk is $182M in the Bible and $75M in the registry. This report uses the registry figure; where
          the two disagree, the registry wins.
        </p>
      </div>

      {report.mermaid ? (
        <Panel title="Attack flow" subtitle="published sequence with the local reproduction boundary">
          <MermaidDiagram
            chart={report.mermaid}
            caption={`attack flow · ${analysis.slug} · retrospective classification`}
          />
        </Panel>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {analysis.vectors.map((vector) => (
          <VectorChip key={vector} vectorId={vector} />
        ))}
      </div>

      {report.sections.map((section) => {
        const isDetection = /detection analysis/i.test(section.heading);
        const body = withoutDiagram(section.body);
        return (
          <Panel key={section.heading} title={section.heading}>
            {body ? <HistoricalMarkdown source={body} /> : null}

            {isDetection ? (
              <div className="mt-4 flex flex-col gap-4 border-t border-edge pt-4">
                {detection.detections.length ? (
                  <SubBlock title="structured detector output · local reproduction">
                    <PatternReport findings={detection.detections} showDiagrams={false} />
                  </SubBlock>
                ) : (
                  <p className="text-xs leading-relaxed text-ink-faint">{detection.note}</p>
                )}

                {detectorLimitations.length ? (
                  <SubBlock title="detector limitations · quoted from DETECTOR_CATALOG">
                    <ul className="flex flex-col gap-3">
                      {detectorLimitations.map((entry) => (
                        <li key={entry.key} className="flex items-start gap-2.5">
                          <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-arterial/70" aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="mono text-[0.58rem] uppercase tracking-[0.12em] text-ink-faint">
                              {entry.label} · {entry.detector}
                            </p>
                            <p className="mt-1 text-[0.8rem] leading-relaxed text-ink-dim">{entry.limitation}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </SubBlock>
                ) : null}
              </div>
            ) : null}
          </Panel>
        );
      })}

      <footer className="flex flex-col gap-2 border-t border-edge pt-4">
        <p className="mono text-[0.55rem] uppercase leading-relaxed tracking-[0.12em] text-ink-faint">
          retrospective classification · public incident records · local foundry reproduction for detector output · not
          mainnet state
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/historical" className="btn h-11 px-3 text-xs sm:h-9">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            All historical findings
          </Link>
          <Link href={`/cases/${analysis.slug}`} className="btn h-11 px-3 text-xs sm:h-9">
            Incident record
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </footer>
    </div>
  );
}
