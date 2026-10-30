import { NextResponse } from 'next/server';
import { buildCaseReport, errorResponse } from '../../_lib';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> },
): Promise<NextResponse> {
  try {
    const { caseId } = await params;
    const scenario = new URL(req.url).searchParams.get('scenario');
    const { report } = await buildCaseReport(caseId, scenario);
    return NextResponse.json(report);
  } catch (error) {
    return errorResponse(error);
  }
}
