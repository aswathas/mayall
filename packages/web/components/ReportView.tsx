'use client';

import { Download, FileText } from 'lucide-react';
import type { ForensicReport } from '@helix/core';
import { formatDateTime, formatEthAmount, formatInt, formatPct, formatUsdFull } from '../lib/format';
import { ChainChip } from './ChainChip';
import { SeverityChip } from './SeverityChip';
import { MetricStrip, type MetricItem } from './MetricStrip';
import { Panel, MicroLabel } from './Panel';
import { PatternReport } from './PatternReport';

interface ReportViewProps {
  report: ForensicReport;
  caseId: string;
  scenarioId?: string | null;
  /** Render each finding's mermaid attack-flow diagram. */
  showDiagrams?: boolean;
}

export function ReportView({ report, caseId, scenarioId, showDiagrams = true }: ReportViewProps) {
  const paragraphs = report.executiveSummary.split(/\n{2,}/).filter((paragraph) => paragraph.trim().length > 0);
  const query = scenarioId ? `?scenario=${encodeURIComponent(scenarioId)}` : '';
  const bundleHref = `/api/bundle/${encodeURIComponent(caseId)}${query}`;

  const metrics: MetricItem[] = [
    { label: 'Reported loss', value: formatUsdFull(report.lossUsd), hint: 'value at disclosure', tone: 'threat' },
    { label: 'Extracted', value: formatEthAmount(report.lossEth, 4), hint: 'local simulation', tone: 'threat' },
    { label: 'Detector confidence', value: formatPct(report.confidence, 1), hint: 'weighted across findings' },
    { label: 'Evidence items', value: formatInt(report.evidenceCount), hint: `${report.findings.length} pattern findings` },
  ];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <MicroLabel>
              <span className="inline-flex items-center gap-1.5">
                <FileText className="h-3 w-3" aria-hidden /> forensic report · {report.caseRef}
              </span>
            </MicroLabel>
            <h1 className="display mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{report.title}</h1>
            <p className="mt-1 font-mono text-[0.62rem] text-ink-faint">
              generated {formatDateTime(report.generatedAt)} · id {report.id}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <SeverityChip severity={report.severity} />
            <ChainChip chain={report.chain} />
            <span className="chip text-arterial">{formatPct(report.confidence, 0)} confidence</span>
          </div>
        </div>

        <MetricStrip items={metrics} />
      </header>

      <Panel
        title="Executive summary"
        action={
          <a href={bundleHref} className="btn btn-primary py-1.5 text-[0.7rem]">
            <Download className="h-3.5 w-3.5" aria-hidden /> Download forensic bundle
          </a>
        }
      >
        <div className="flex flex-col gap-3">
          {paragraphs.length ? (
            paragraphs.map((paragraph, index) => (
              <p key={index} className="text-sm leading-relaxed text-ink-dim">
                {paragraph}
              </p>
            ))
          ) : (
            <p className="text-sm text-ink-faint">No summary was produced for this report.</p>
          )}
        </div>
      </Panel>

      {report.sections.length ? (
        <Panel title="Report sections" flush>
          {report.sections.map((section, index) => (
            <section
              key={`${section.heading}-${index}`}
              className="border-t border-edge px-4 py-4 first:border-t-0 sm:px-5"
            >
              <h2 className="display text-[0.98rem] font-medium text-ink">{section.heading}</h2>
              <p className="mt-1.5 whitespace-pre-wrap text-[0.82rem] leading-relaxed text-ink-dim">
                {section.body}
              </p>
            </section>
          ))}
        </Panel>
      ) : null}

      <Panel title="Pattern findings">
        <PatternReport findings={report.findings} showDiagrams={showDiagrams} />
      </Panel>

      <Panel title="Loss and attribution" flush>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[560px]">
            <thead>
              <tr>
                <th>Field</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <Row label="Case reference" value={report.caseRef} />
              <Row label="Chain" value={report.chain} />
              <Row label="Severity" value={report.severity.toUpperCase()} tone="arterial" />
              <Row label="Reported loss" value={formatUsdFull(report.lossUsd)} />
              <Row label="Extracted" value={formatEthAmount(report.lossEth, 6)} tone="arterial" />
              <Row label="Detector confidence" value={formatPct(report.confidence, 1)} />
              <Row label="Evidence items" value={formatInt(report.evidenceCount)} />
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="font-mono text-[0.55rem] uppercase leading-relaxed tracking-[0.12em] text-ink-faint">
        evidence generated by a local foundry simulation · not mainnet state · bundle includes trace, storage diff and
        detector output
      </p>
    </div>
  );
}

function Row({ label, value, tone = 'ink' }: { label: string; value: string; tone?: 'ink' | 'arterial' }) {
  return (
    <tr>
      <td className="whitespace-nowrap font-mono text-[0.64rem] text-ink-faint">{label}</td>
      <td className="mono text-[0.7rem] tabular-nums">
        <span className={tone === 'arterial' ? 'text-arterial' : 'text-ink'}>{value}</span>
      </td>
    </tr>
  );
}
