'use client';

import { Suspense, useCallback, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ArrowUpRight,
  Check,
  Download,
  FileText,
  Loader2,
  PenLine,
  RotateCw,
  TriangleAlert,
} from 'lucide-react';
import type { ForensicReport } from '@helix/core';
import type { IncidentResponse } from '../../../../lib/types';
import { useApi } from '../../../../lib/useApi';
import { ReportView } from '../../../../components/ReportView';
import { Panel } from '../../../../components/Panel';
import { Skeleton } from '../../../../components/Loading';

interface NarrativeResponse {
  ok: boolean;
  path: string;
}

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-56" />
      <div className="panel flex flex-col gap-4 p-5">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <div className="grid gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      </div>
      <div className="panel flex flex-col gap-3 p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}

function ReportPageView() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = typeof params?.slug === 'string' ? params.slug : params?.slug?.[0] ?? null;

  const requestedScenario = searchParams.get('scenario');
  const { data: incidentData, error: incidentError, reload: reloadIncident } = useApi<IncidentResponse>(
    slug ? `/api/incidents/${encodeURIComponent(slug)}` : null,
  );
  const incident = incidentData?.incident ?? null;
  const scenario = requestedScenario ?? incident?.scenarioId ?? null;

  /* Wait for the incident record so the report is built against the right
     scenario, instead of building a metadata-only report first. */
  const incidentSettled = Boolean(incident) || Boolean(incidentError);
  const query = scenario ? `?scenario=${encodeURIComponent(scenario)}` : '';
  const { data: report, error, reload } = useApi<ForensicReport>(
    slug && incidentSettled ? `/api/report/${encodeURIComponent(slug)}${query}` : null,
  );

  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null);

  const saveNarrative = useCallback(async () => {
    if (!slug || !text.trim()) return;
    setSaving(true);
    setSaveState(null);
    try {
      const response = await fetch(`/api/report/${encodeURIComponent(slug)}/narrative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        throw new Error(
          `The override was rejected (${response.status}). The summary must be non-empty text; shorten it and try again.`,
        );
      }
      const payload = (await response.json()) as NarrativeResponse;
      setSaveState({
        tone: 'ok',
        message: `Override stored at ${payload.path}. The report below is rebuilding with the authored summary.`,
      });
      setText('');
      reload();
    } catch (saveError) {
      setSaveState({
        tone: 'error',
        message:
          saveError instanceof Error
            ? saveError.message
            : 'The override could not be saved. Check that the console API is reachable, then try again.',
      });
    } finally {
      setSaving(false);
    }
  }, [slug, text, reload]);

  if (!slug) {
    return (
      <div className="panel p-6">
        <p className="text-sm text-ink-dim">This report address has no case id. Open it from a case file instead.</p>
        <Link href="/incidents" className="btn btn-primary mt-3 h-11 px-3 text-xs sm:h-9">
          Incident registry <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  const bundleHref = `/api/bundle/${encodeURIComponent(slug)}${query}`;
  const markdownHref = `/api/report/${encodeURIComponent(slug)}/markdown${query}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="display text-[1.9rem] font-medium leading-none text-ink sm:text-[2.2rem]">
              Written case
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-ink-dim">
              <Link
                href={`/cases/${encodeURIComponent(slug)}`}
                className="text-ink underline decoration-edge-strong underline-offset-2 transition-colors duration-100 hover:text-arterial"
              >
                {incidentData?.incident?.name ?? slug}
              </Link>
              <span aria-hidden="true" className="text-ink-faint">
                ·
              </span>
              <span className="mono text-[0.64rem] uppercase tracking-[0.1em] text-ink-faint">
                {scenario
                  ? `scenario ${scenario}`
                  : incidentSettled
                    ? 'metadata only — no scenario linked'
                    : 'resolving case record'}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a className="btn btn-primary h-11 px-3 text-xs sm:h-9" href={bundleHref} download>
              <Download className="h-3.5 w-3.5" aria-hidden="true" /> Download bundle
            </a>
            <a className="btn h-11 px-3 text-xs sm:h-9" href={markdownHref} download>
              <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Download markdown
            </a>
          </div>
        </div>
        <p className="max-w-[70ch] text-xs leading-relaxed text-ink-faint">
          The bundle is a zip containing the report, the simulation artifact, the raw trace and a sha256
          chain-of-custody manifest.
        </p>
      </header>

      <Panel title="Executive summary (operator override)">
        <div className="flex flex-col gap-3">
          <p className="max-w-[74ch] text-xs leading-relaxed text-ink-dim">
            Anything pasted here replaces the generated executive summary the next time this report is built. The
            deterministic summary is not deleted — the override simply wins until it is replaced. This is the slot used
            to inject an authored narrative.
          </p>
          <label htmlFor="narrative" className="label-micro">
            Authored summary
          </label>
          <textarea
            id="narrative"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={5}
            placeholder="Paste the executive summary to publish with this case. Two or three paragraphs is enough: what happened, what the evidence shows, and what remains unproven."
            className="w-full rounded-[9px] border border-edge bg-abyss px-3 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus-visible:border-arterial/60"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary h-11 px-3 text-xs sm:h-9"
              onClick={() => void saveNarrative()}
              disabled={saving || text.trim().length === 0}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {saving ? 'Saving override' : 'Save override'}
            </button>
            <span className="mono text-[0.58rem] uppercase tracking-[0.1em] text-ink-faint">
              {text.trim().length} characters
            </span>
          </div>
          {saveState ? (
            <p
              role="status"
              aria-live="polite"
              className={`flex items-start gap-2 rounded-[9px] border px-3 py-2 text-xs leading-relaxed ${
                saveState.tone === 'ok'
                  ? 'border-mint/35 bg-mint/[0.06] text-ink-dim'
                  : 'border-arterial/35 bg-arterial/[0.06] text-ink-dim'
              }`}
            >
              {saveState.tone === 'ok' ? (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint" aria-hidden="true" />
              ) : (
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-arterial" aria-hidden="true" />
              )}
              <span className="min-w-0">{saveState.message}</span>
            </p>
          ) : null}
        </div>
      </Panel>

      {error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[9px] border border-arterial/35 bg-arterial/[0.06] px-4 py-3">
          <TriangleAlert className="h-4 w-4 shrink-0 text-arterial" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-dim">
            The report could not be assembled ({error}). Recovery: confirm the scenario has a Foundry artifact, then
            rebuild the report.
          </p>
          <button type="button" className="btn h-11 px-3 text-[0.72rem] sm:h-8" onClick={reload}>
            <RotateCw className="h-3 w-3" aria-hidden="true" /> Rebuild report
          </button>
        </div>
      ) : null}

      {incidentError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[9px] border border-arterial/35 bg-arterial/[0.06] px-4 py-3">
          <TriangleAlert className="h-4 w-4 shrink-0 text-arterial" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-dim">
            The case record did not load ({incidentError}), so the report cannot resolve its scenario. Recovery: check
            that the console API is reachable, then retry.
          </p>
          <button type="button" className="btn h-11 px-3 text-[0.72rem] sm:h-8" onClick={reloadIncident}>
            <RotateCw className="h-3 w-3" aria-hidden="true" /> Retry
          </button>
        </div>
      ) : null}

      {!report && !error && !incidentError ? <ReportSkeleton /> : null}

      {report ? (
        <section aria-label="Forensic report" className="flex flex-col gap-3">
          <ReportView {...{ report, caseId: slug, scenarioId: scenario }} />
        </section>
      ) : null}
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<ReportSkeleton />}>
      <ReportPageView />
    </Suspense>
  );
}
