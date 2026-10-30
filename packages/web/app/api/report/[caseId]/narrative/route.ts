import { NextResponse } from 'next/server';
import { engine, errorResponse } from '../../../_lib';

export const dynamic = 'force-dynamic';

interface NarrativeBody {
  text?: unknown;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> },
): Promise<NextResponse> {
  try {
    const { caseId } = await params;
    const body = (await req.json().catch(() => null)) as NarrativeBody | null;
    const text = body?.text;

    if (typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'text must be a non-empty string' }, { status: 400 });
    }

    const path = engine().saveNarrative(caseId, text);
    return NextResponse.json({ ok: true, path });
  } catch (error) {
    return errorResponse(error);
  }
}
