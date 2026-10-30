import { NextResponse } from 'next/server';
import { engine, errorResponse } from '../../_lib';

export const dynamic = 'force-dynamic';

/** One incident's retrospective findings and registry metadata. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    const { slug } = await params;
    const engineModule = engine();
    const incident = engineModule.INCIDENT_BY_SLUG.get(slug);
    if (!incident) {
      return NextResponse.json({ error: 'Unknown incident', slug }, { status: 404 });
    }

    const analysis = engineModule.historicalIncidentBySlug(slug);
    if (!analysis) {
      return NextResponse.json({ error: 'Incident could not be analysed', slug }, { status: 404 });
    }

    return NextResponse.json({
      incident,
      analysis,
      report: engineModule.reportsPublishedFor(slug),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
