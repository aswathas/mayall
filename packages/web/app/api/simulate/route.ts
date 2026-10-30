import { NextResponse } from 'next/server';
import { engine, errorResponse } from '../_lib';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface SimulateBody {
  scenarioId?: unknown;
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json().catch(() => null)) as SimulateBody | null;
    const scenarioId = body?.scenarioId;

    if (typeof scenarioId !== 'string' || !scenarioId) {
      return NextResponse.json({ error: 'Missing scenarioId' }, { status: 400 });
    }
    if (!engine().SCENARIO_BY_ID.has(scenarioId)) {
      return NextResponse.json({ error: 'Unknown scenario' }, { status: 400 });
    }

    const result = await engine().runSimulation(scenarioId);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
