import { spawn } from 'node:child_process';
import { engine } from '../../_lib';
import { customEngine } from '../_engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const RUN_TIMEOUT_MS = 240_000;
const PROGRESS_MS = 900;

/**
 * The LIVE RUN. Spawns `forge test --match-path test/CustomAttack.t.sol
 * --match-test testCustomAttack -vvvv` and pipes its output to the browser as
 * Server-Sent Events:
 *
 *   event: line      { n, line }                         one forge output line
 *   event: progress  { elapsedMs, lines, tail }          periodic heartbeat
 *   event: done      { caseId, artifact, trace, ... }    terminal payload
 *   event: error     { message }                         terminal failure
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const params = url.searchParams;

  let plan: ReturnType<ReturnType<typeof customEngine>['planCustomRun']>;
  try {
    const mod = customEngine();
    plan = mod.planCustomRun({
      vector: params.get('vector') ?? undefined,
      txs: params.get('txs') ?? undefined,
      amountWei: params.get('amountWei') ?? undefined,
      seed: params.get('seed') ?? undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid attack parameters.';
    return new Response(
      `event: error\ndata: ${JSON.stringify({ message })}\n\n`,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      },
    );
  }

  const mod = customEngine();
  const forge = engine().foundryTool('forge');
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const startedMs = Date.now();

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send('open', {
        caseId: plan.caseId,
        vector: plan.request.vector,
        txs: plan.request.txs,
        amountWei: plan.request.amountWei.toString(),
        seed: plan.request.seed,
        command: `${forge} ${plan.args.join(' ')}`,
      });

      const child = spawn(forge, plan.args, {
        cwd: plan.cwd,
        env: { ...process.env, ...plan.env },
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let buffered = '';
      let lineCount = 0;
      const recent: string[] = [];

      const emitLine = (line: string) => {
        lineCount += 1;
        recent.push(line);
        if (recent.length > 10) recent.shift();
        send('line', { n: lineCount, line });
      };

      const consume = (chunk: string) => {
        buffered += chunk;
        let index = buffered.indexOf('\n');
        while (index >= 0) {
          const line = buffered.slice(0, index).replace(/\r$/, '');
          buffered = buffered.slice(index + 1);
          emitLine(line);
          index = buffered.indexOf('\n');
        }
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        stdout += text;
        consume(text);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        stderr += text;
        consume(text);
      });

      const progressTimer = setInterval(() => {
        send('progress', {
          elapsedMs: Date.now() - startedMs,
          lines: lineCount,
          tail: recent.slice(-6),
        });
      }, PROGRESS_MS);

      const timeoutTimer = setTimeout(() => {
        send('progress', { elapsedMs: Date.now() - startedMs, lines: lineCount, tail: ['forge timed out; terminating the run'] });
        child.kill();
      }, RUN_TIMEOUT_MS);

      const finish = (code: number | null) => {
        clearInterval(progressTimer);
        clearTimeout(timeoutTimer);
        if (buffered.trim().length) {
          emitLine(buffered.replace(/\r$/, ''));
          buffered = '';
        }

        void (async () => {
          try {
            const result = await mod.finalizeCustomRun(plan, {
              code: code ?? 1,
              stdout,
              stderr,
              durationMs: Date.now() - startedMs,
              command: `${forge} ${plan.args.join(' ')}`,
            });

            send('done', {
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
            const message = error instanceof Error ? error.message : 'The run finished but the evidence could not be assembled.';
            send('error', { message, caseId: plan.caseId });
          } finally {
            closed = true;
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
        })();
      };

      child.on('error', (error) => {
        send('error', {
          message: `${error.message} — Foundry may not be installed. Run \`npm run setup:foundry\` and try again.`,
        });
        clearInterval(progressTimer);
        clearTimeout(timeoutTimer);
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });

      child.on('close', (code) => {
        if (!closed) finish(code);
      });

      req.signal.addEventListener('abort', () => {
        child.kill();
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
