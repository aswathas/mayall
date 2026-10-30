import { readdirSync } from 'node:fs';
import { NextResponse } from 'next/server';
import { engine, errorResponse } from '../_lib';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const { artifactsDir, foundryAvailable, SCENARIOS } = engine();

    let artifacts = 0;
    try {
      // Only count artifacts that belong to a known scenario — the directory
      // may hold unrelated files.
      const known = new Set(SCENARIOS.map((s) => `${s.id}.json`));
      artifacts = readdirSync(artifactsDir()).filter((f) => known.has(f)).length;
    } catch {
      artifacts = 0;
    }

    return NextResponse.json({
      foundry: foundryAvailable(),
      scenarios: SCENARIOS.length,
      artifacts,
      version: '0.1.0',
    });
  } catch (error) {
    return errorResponse(error);
  }
}
