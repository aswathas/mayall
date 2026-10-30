import { NextResponse } from 'next/server';
import { errorResponse } from '../_lib';
import { liveCaseEngine } from './_lib';
import type { LiveCase, LiveCaseAnalysis } from '../../../../forensic-engine/src/live-case';

export const dynamic = 'force-dynamic';

/**
 * The live case: verified facts, timeline, Mayall's analysis, the ten-detector
 * coverage matrix and every source. No mainnet trace is read; the analysis is
 * a retrospective classification over public reporting.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const { BINANCE_LIVE_CASE, analyzeLiveCase } = liveCaseEngine();
    const liveCase = BINANCE_LIVE_CASE as LiveCase;
    const analysis = analyzeLiveCase() as LiveCaseAnalysis;
    return NextResponse.json({
      liveCase,
      analysis,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
