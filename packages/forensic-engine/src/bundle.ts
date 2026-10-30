import JSZip from 'jszip';
import type { ForensicReport, SimulationResult } from '@helix/core';
import { reportToMarkdown, sha256 } from './report.js';

/**
 * Assembles the forensic bundle: the artifacts an investigator needs to hand
 * over, including a hash manifest so the bundle can be verified later.
 */
export async function buildForensicBundle(
  report: ForensicReport,
  sim: SimulationResult,
): Promise<{ filename: string; buffer: Buffer }> {
  const zip = new JSZip();
  const manifestFiles: { path: string; sha256: string; bytes: number }[] = [];

  const add = (path: string, content: string) => {
    zip.file(path, content);
    manifestFiles.push({ path, sha256: sha256(content), bytes: Buffer.byteLength(content) });
  };

  const art = sim.artifact;
  add('report/report.md', reportToMarkdown(report));
  add(
    'report/report.json',
    JSON.stringify(report, null, 2),
  );
  add(
    'evidence/artifact.json',
    JSON.stringify(
      art ?? { note: 'No structured artifact was produced by the simulation.' },
      null,
      2,
    ),
  );
  add('evidence/trace.txt', sim.traceText || 'No trace captured.');
  add('evidence/foundry-stdout.txt', sim.stdout || '');
  add('evidence/foundry-stderr.txt', sim.stderr || '');
  add(
    'evidence/storage-diff.csv',
    [
      'contract,contractName,slot,label,kind,before,after,changed',
      ...(art?.storageWrites ?? []).map((w) =>
        [w.contract, w.contractName, w.slot, `"${w.label}"`, w.kind, w.before, w.after, w.before !== w.after].join(','),
      ),
    ].join('\n'),
  );
  add(
    'evidence/balance-timeline.csv',
    [
      'address,label,beforeWei,afterWei,deltaWei',
      ...(art?.balances ?? []).map((b) =>
        [b.address, `"${b.label}"`, b.beforeWei, b.afterWei, b.deltaWei].join(','),
      ),
    ].join('\n'),
  );
  add(
    'evidence/timeline.csv',
    [
      'step,title,description,txHash,gasUsed,valueWei',
      ...(art?.steps ?? []).map((s) =>
        [s.n, `"${s.title}"`, `"${s.description.replace(/"/g, "'")}"`, s.txHash, s.gasUsed, s.valueWei].join(','),
      ),
    ].join('\n'),
  );
  add(
    'evidence/patterns.json',
    JSON.stringify(sim.detections, null, 2),
  );
  add(
    'evidence/gas-flame.json',
    JSON.stringify(sim.flame, null, 2),
  );
  add(
    'chain-of-custody.json',
    JSON.stringify(
      {
        caseRef: report.caseRef,
        scenario: sim.scenario,
        command: sim.command,
        startedAt: sim.startedAt,
        durationMs: sim.durationMs,
        ok: sim.ok,
        generatedAt: report.generatedAt,
        files: manifestFiles,
      },
      null,
      2,
    ),
  );

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { filename: `${report.caseRef}-forensic-bundle.zip`, buffer };
}
