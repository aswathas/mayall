import { NextResponse } from 'next/server';
import { customEngine, statusOf } from '../_engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The vector catalogue, the parameter bounds the UI must enforce, and the
 * toolchain status. One request is enough to draw the whole control column.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const mod = customEngine();
    const options = mod.customOptions();
    return NextResponse.json({
      vectors: options.vectors,
      limits: options.limits,
      toolchain: options.toolchain,
      test: { file: mod.CUSTOM_TEST_FILE, name: mod.CUSTOM_TEST_NAME },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load the attack catalogue.';
    return NextResponse.json({ error: message }, { status: statusOf(error) });
  }
}
