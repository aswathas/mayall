import { NextResponse } from 'next/server';
import { engine, errorResponse } from '../../_lib';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    const { slug } = await params;
    const incident = engine().INCIDENT_BY_SLUG.get(slug);
    if (!incident) {
      return NextResponse.json({ incident: null }, { status: 404 });
    }
    return NextResponse.json({ incident });
  } catch (error) {
    return errorResponse(error);
  }
}
