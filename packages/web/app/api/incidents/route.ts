import { NextResponse } from 'next/server';
import { engine, errorResponse } from '../_lib';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const incidents = [...engine().INCIDENTS].sort((a, b) => b.date.localeCompare(a.date));
    return NextResponse.json(incidents);
  } catch (error) {
    return errorResponse(error);
  }
}
