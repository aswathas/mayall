import { buildCaseReport, engine, errorResponse } from '../../../_lib';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  try {
    const { caseId } = await params;
    const scenario = new URL(req.url).searchParams.get('scenario');
    const { report } = await buildCaseReport(caseId, scenario);
    const markdown = engine().reportToMarkdown(report);

    return new Response(markdown, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${caseId}-report.md"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
