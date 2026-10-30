import { NextResponse } from 'next/server';
import { engine, errorResponse } from '../../../_lib';

export const dynamic = 'force-dynamic';

/**
 * Returns the stored forensic report for one incident. When no report has been
 * generated yet, a deterministic report is assembled on the fly and clearly
 * labelled `generatedBy: "deterministic"` — never presented as an AI report.
 */
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

    const stored = engineModule.readStoredReport(slug);
    if (stored) {
      return NextResponse.json({
        caseId: stored.caseId,
        slug: stored.slug,
        title: stored.title,
        generatedAt: stored.generatedAt,
        generatedBy: stored.generatedBy,
        model: stored.model,
        markdown: stored.markdown,
        mermaid: stored.mermaid,
        sections: stored.sections,
        analysis: stored.analysis,
        detection: stored.detection,
        generationNote: stored.generationNote,
      });
    }

    const analysis = engineModule.historicalIncidentBySlug(slug);
    if (!analysis) {
      return NextResponse.json({ error: 'Incident could not be analysed', slug }, { status: 404 });
    }

    const detection = engineModule.localDetectionsFor(incident);
    const generated = engineModule.buildDeterministicReport(analysis, incident, detection);

    return NextResponse.json({
      caseId: generated.caseId,
      slug: generated.slug,
      title: generated.title,
      generatedAt: generated.generatedAt,
      generatedBy: generated.generatedBy,
      model: generated.model,
      markdown: generated.markdown,
      mermaid: generated.mermaid,
      sections: generated.sections,
      analysis: generated.analysis,
      detection: generated.detection,
      generationNote: generated.generationNote,
      stored: false,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
