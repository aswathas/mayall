import { NextResponse } from 'next/server';
import { customEngine, statusOf } from './_engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Rehydrates a persisted custom case, so `/attack-lab?case=<caseId>` can show
 * the same evidence without re-running forge.
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const caseId = new URL(req.url).searchParams.get('caseId');
    if (!caseId) {
      return NextResponse.json({ error: 'Missing caseId.' }, { status: 400 });
    }
    const mod = customEngine();
    const result = mod.loadCustomResult(caseId);
    if (!result) {
      return NextResponse.json(
        { error: `No custom run found for "${caseId}". Run the attack first.` },
        { status: 404 },
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load the custom case.';
    return NextResponse.json({ error: message }, { status: statusOf(error) });
  }
}

interface CustomBody {
  vector?: unknown;
  txs?: unknown;
  amountWei?: unknown;
  seed?: unknown;
}

/**
 * Runs one parameterised attack and returns the evidence. The heavy lifting
 * (forge invocation, trace parsing, detectors, report, bundle) lives in the
 * engine; this handler only validates the request and trims the payload.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json().catch(() => null)) as CustomBody | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Expected a JSON body with vector, txs, amountWei and seed.' }, { status: 400 });
    }

    const mod = customEngine();

    let amountWei: bigint | undefined;
    if (body.amountWei !== undefined && body.amountWei !== null && body.amountWei !== '') {
      try {
        amountWei = BigInt(typeof body.amountWei === 'string' ? body.amountWei : String(body.amountWei));
      } catch {
        return NextResponse.json({ error: 'amountWei must be an integer number of wei.' }, { status: 400 });
      }
    }

    const result = await mod.runCustomAttack({
      vector: typeof body.vector === 'string' ? body.vector : undefined,
      txs: typeof body.txs === 'number' || typeof body.txs === 'string' ? body.txs : undefined,
      amountWei,
      seed: typeof body.seed === 'number' || typeof body.seed === 'string' ? body.seed : undefined,
    });

    return NextResponse.json({
      caseId: result.caseId,
      ok: result.ok,
      vector: result.vector,
      vectorLabel: result.vectorLabel,
      startedAt: result.startedAt,
      durationMs: result.durationMs,
      command: result.command,
      request: result.request,
      artifact: result.artifact,
      trace: result.trace,
      flame: result.flame,
      detections: result.detections,
      report: result.report,
      traceSummary: result.traceSummary,
      bundleUrl: result.bundleUrl,
      reportUrl: result.reportUrl,
      stdoutTail: result.stdoutTail,
      stderr: result.stderr,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Custom attack failed.';
    return NextResponse.json({ error: message }, { status: statusOf(error) });
  }
}
