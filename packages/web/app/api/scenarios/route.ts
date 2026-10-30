import { NextResponse } from 'next/server';
import { engine, errorResponse } from '../_lib';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(engine().SCENARIOS);
  } catch (error) {
    return errorResponse(error);
  }
}
