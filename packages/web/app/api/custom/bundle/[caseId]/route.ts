import { NextResponse } from 'next/server';
import { engine } from '../../../_lib';
import { customEngine, statusOf } from '../../_engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Builds and serves the ZIP forensic bundle for a persisted custom run. The
 * bundle contents come from the existing `buildForensicBundle` builder, so the
 * hash manifest and evidence layout match every other case.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  try {
    const { caseId } = await params;
    const mod = customEngine();
    const report = mod.loadCustomReport(caseId);
    const sim = mod.loadCustomSimulation(caseId);

    if (!report || !sim) {
      return NextResponse.json(
        { error: `No custom run found for "${caseId}". Run the attack first, then download the bundle.` },
        { status: 404 },
      );
    }

    const { filename, buffer } = await engine().buildForensicBundle(report, sim);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not build the custom bundle.';
    return NextResponse.json({ error: message }, { status: statusOf(error) });
  }
}
