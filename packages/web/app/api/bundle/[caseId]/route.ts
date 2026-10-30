import { buildCaseReport, engine, errorResponse } from '../../_lib';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  try {
    const { caseId } = await params;
    const scenario = new URL(req.url).searchParams.get('scenario');
    const { report, sim } = await buildCaseReport(caseId, scenario);
    const { filename, buffer } = await engine().buildForensicBundle(report, sim);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
