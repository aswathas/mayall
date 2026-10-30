'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import type { Incident } from '@helix/core';
import type { HistoricalIncidentAnalysis } from '@helix/forensic-engine';
import { useApi } from '../../../lib/useApi';
import { EmptyState, Panel } from '../../../components/Panel';
import { AiForensicReport, type HistoricalReportPayload } from '../../../components/AiForensicReport';
import { Skeleton } from '../../../components/Loading';

interface HistoricalDetail {
  incident: Incident;
  analysis: HistoricalIncidentAnalysis;
  report: { markdown: boolean; json: boolean };
}

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-busy="true" aria-label="Loading forensic report">
      <Skeleton className="h-5 w-32" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-2/3 max-w-lg" />
        <Skeleton className="h-4 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-24 w-full rounded-[14px]" />
      <Skeleton className="h-56 w-full rounded-[14px]" />
      <Skeleton className="h-72 w-full rounded-[14px]" />
    </div>
  );
}

export default function HistoricalReportPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === 'string' ? params.slug : params?.slug?.[0] ?? null;

  const detail = useApi<HistoricalDetail>(slug ? `/api/historical/${encodeURIComponent(slug)}` : null);
  const report = useApi<HistoricalReportPayload>(
    slug ? `/api/historical/${encodeURIComponent(slug)}/report` : null,
  );

  if (!slug) return <ReportSkeleton />;

  const notFound =
    (detail.error !== null && detail.error.includes('404')) ||
    (report.error !== null && report.error.includes('404'));

  if (notFound) {
    return (
      <div className="panel flex flex-col items-start gap-4 p-8">
        <EmptyState
          title="No historical report at this address"
          hint={`No incident in the registry has the slug "${slug ?? ''}". The report may not have been generated, or the link is mistyped.`}
        />
        <Link href="/historical" className="btn btn-primary h-11 px-3 text-xs sm:h-9">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to historical analysis
        </Link>
      </div>
    );
  }

  if (report.data) {
    return <AiForensicReport report={report.data} />;
  }

  if (report.error) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/historical"
          className="inline-flex min-h-11 items-center gap-1.5 text-xs text-ink-dim transition-colors duration-100 hover:text-arterial sm:min-h-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Historical analysis
        </Link>
        <Panel title="Report unavailable">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-ember" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm text-ink">
              The report did not load — {report.error}. Recovery: confirm the console API is reachable, then retry. A
              deterministic report is assembled on request when no stored report exists.
            </p>
            <button
              type="button"
              onClick={report.reload}
              className="btn btn-ghost h-11 px-3 text-xs sm:h-9"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          </div>
        </Panel>
      </div>
    );
  }

  return <ReportSkeleton />;
}
