import { NextResponse } from 'next/server';
import { engine, errorResponse } from '../_lib';

export const dynamic = 'force-dynamic';

/**
 * Aggregate retrospective analysis over the whole incident registry.
 * Everything here is derived from registry metadata plus the Bible reference
 * sheets; no mainnet trace is read.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const analysis = engine().buildHistoricalAnalysis();
    return NextResponse.json(analysis);
  } catch (error) {
    return errorResponse(error);
  }
}
