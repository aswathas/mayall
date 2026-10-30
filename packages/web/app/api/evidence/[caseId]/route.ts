import { NextResponse } from 'next/server';
import { errorResponse } from '../../_lib';
import { loadCaseEvidence } from '../../../../components/EvidenceWorkbenchLoader';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> },
): Promise<NextResponse> {
  try {
    const { caseId } = await params;
    const scenario = new URL(req.url).searchParams.get('scenario');
    const payload = await loadCaseEvidence(caseId, scenario);
    return NextResponse.json(payload);
  } catch (error) {
    return errorResponse(error);
  }
}
