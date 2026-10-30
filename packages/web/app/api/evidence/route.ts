import { NextResponse } from 'next/server';
import { errorResponse } from '../_lib';
import { listEvidenceCases } from '../../../components/EvidenceWorkbenchLoader';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const payload = await listEvidenceCases();
    return NextResponse.json(payload);
  } catch (error) {
    return errorResponse(error);
  }
}
