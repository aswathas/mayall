import { NextResponse } from 'next/server';
import { customEngine, statusOf } from '../../_engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Serves the persisted forensic report for a custom case id. The canonical
 * `/api/report/[caseId]` route resolves engine scenarios only; custom attacks
 * are not engine scenarios, so the custom lab owns their report route.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ caseId: string }> },
): Promise<NextResponse> {
  try {
    const { caseId } = await params;
    const mod = customEngine();
    const report = mod.loadCustomReport(caseId);
    if (!report) {
      return NextResponse.json(
        { error: `No custom run found for "${caseId}". Run the attack first, then reopen the report.` },
        { status: 404 },
      );
    }
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load the custom report.';
    return NextResponse.json({ error: message }, { status: statusOf(error) });
  }
}
