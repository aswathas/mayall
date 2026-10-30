import { NextResponse } from 'next/server';
import { errorResponse } from '../../_lib';
import { liveCaseEngine } from '../_lib';

export const dynamic = 'force-dynamic';

/**
 * The stored forensic report. It prefers the narrative written by the
 * generator (data/narratives/binance-7702.md plus the metadata in
 * data/ai-reports/binance-7702.json) and falls back to the deterministic
 * writer when no narrative is present. `?format=markdown` returns the raw file.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const report = liveCaseEngine().buildLiveReportResponse();
    const format = new URL(req.url).searchParams.get('format');

    if (format === 'markdown') {
      return new Response(report.markdown, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': 'attachment; filename="binance-7702-forensic-report.md"',
        },
      });
    }

    return NextResponse.json(report);
  } catch (error) {
    return errorResponse(error);
  }
}
