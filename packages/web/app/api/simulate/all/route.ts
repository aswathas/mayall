import { NextResponse } from 'next/server';
import { engine, errorResponse } from '../../_lib';

export const maxDuration = 600;
export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  try {
    const { results, totalMs } = await engine().runAllSimulations();
    return NextResponse.json({ results, totalMs });
  } catch (error) {
    return errorResponse(error);
  }
}
