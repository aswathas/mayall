import { NextResponse } from 'next/server';
import { errorResponse } from '../../../_lib';
import { loadCaseManifest } from '../../../../../components/EvidenceWorkbenchLoader';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> },
): Promise<NextResponse> {
  try {
    const { caseId } = await params;
    const scenario = new URL(req.url).searchParams.get('scenario');
    const manifest = await loadCaseManifest(caseId, scenario);
    return NextResponse.json(manifest);
  } catch (error) {
    return errorResponse(error);
  }
}
