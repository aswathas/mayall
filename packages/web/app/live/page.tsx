'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import type {
  LiveCase,
  LiveCaseAnalysis,
  LiveCaseReport,
} from '../../../forensic-engine/src/live-case';
import { useApi } from '../../lib/useApi';
import { Panel } from '../../components/Panel';
import { ErrorBlock, Skeleton } from '../../components/Loading';
import { LiveCaseTracker } from '../../components/LiveCaseTracker';
import { LiveCaseTimeline } from '../../components/LiveCaseTimeline';
import { LiveCaseBibleMapping, LiveCaseClassification } from '../../components/LiveCaseAnalysis';
import { LiveCaseAnalogue, LiveCaseCoverage } from '../../components/LiveCaseCoverage';
import { LiveCaseReportPanel } from '../../components/LiveCaseReport';
import {
  LiveCaseAssets,
  LiveCaseMethod,
  LiveCaseResponders,
  LiveCaseSources,
} from '../../components/LiveCaseSources';

interface LivePayload {
  liveCase: LiveCase;
  analysis: LiveCaseAnalysis;
  generatedAt: string;
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-busy="true" aria-label="Loading the live case">
      <span className="sr-only">Loading the live case</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-2/3 max-w-xl" />
        <Skeleton className="h-4 w-full max-w-3xl" />
        <Skeleton className="h-4 w-4/5 max-w-2xl" />
      </div>
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-12 gap-4">
        <Skeleton className="col-span-12 h-64 lg:col-span-7" />
        <Skeleton className="col-span-12 h-64 lg:col-span-5" />
      </div>
    </div>
  );
}

function ActionPlan({ analysis }: { analysis: LiveCaseAnalysis }) {
  return (
    <Panel
      title="Client action plan"
      subtitle="For an exchange in this position · 24 hours / first week / first month"
    >
      <div className="flex flex-col gap-4">
        {analysis.actionPlan.map((group, index) => (
          <section key={group.window} className={index > 0 ? 'border-t border-edge pt-3' : ''}>
            <p className="label-micro">{group.window}</p>
            <ol className="mt-1.5 flex list-decimal flex-col gap-1.5 pl-4 text-xs leading-relaxed text-ink-dim">
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </Panel>
  );
}

export default function LiveCasePage() {
  const { data, loading, error, reload } = useApi<LivePayload>('/api/live');
  const report = useApi<LiveCaseReport>('/api/live/report');

  if (loading && !data) return <PageSkeleton />;

  if (error || !data) {
    return (
      <div className="panel flex flex-col items-start gap-4 p-6">
        <ErrorBlock
          message={error ?? 'The live case returned no data.'}
          recovery="Check that the console API is reachable at /api/live, then retry."
          onRetry={reload}
        />
      </div>
    );
  }

  const { liveCase, analysis, generatedAt } = data;

  return (
    <div className="flex flex-col gap-5">
      <div className="boot-sweep" aria-hidden="true" />

      <LiveCaseTracker liveCase={liveCase} generatedAt={generatedAt} />

      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-[9px] border border-edge bg-panel px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-dim">{liveCase.scopeNote}</p>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 min-w-0 lg:col-span-7">
          <LiveCaseTimeline liveCase={liveCase} />
        </div>
        <div className="col-span-12 flex min-w-0 flex-col gap-4 lg:col-span-5">
          <LiveCaseAssets liveCase={liveCase} />
          <LiveCaseResponders liveCase={liveCase} />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 min-w-0 xl:col-span-5">
          <LiveCaseClassification analysis={analysis} />
        </div>
        <div className="col-span-12 min-w-0 xl:col-span-7">
          <LiveCaseBibleMapping analysis={analysis} />
        </div>
      </div>

      <div className="min-w-0">
        <LiveCaseCoverage analysis={analysis} />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 min-w-0 xl:col-span-7">
          <LiveCaseAnalogue analysis={analysis} />
        </div>
        <div className="col-span-12 min-w-0 xl:col-span-5">
          <ActionPlan analysis={analysis} />
        </div>
      </div>

      <LiveCaseReportPanel
        report={report.data}
        loading={report.loading}
        error={report.error}
        onRetry={report.reload}
      />

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 min-w-0 lg:col-span-7">
          <LiveCaseSources liveCase={liveCase} />
        </div>
        <div className="col-span-12 min-w-0 lg:col-span-5">
          <LiveCaseMethod liveCase={liveCase} />
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-4">
        <p className="max-w-[80ch] text-xs leading-relaxed text-ink-dim">
          The registry entry carries no transaction hash or wallet address because none was published. The
          local delegatecall scenario is the closest analogue, not a reproduction of the breach.
        </p>
        <Link href={`/cases/${liveCase.incidentSlug}`} className="btn btn-ghost h-11 px-3.5 text-xs">
          Registry case file
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </footer>
    </div>
  );
}
