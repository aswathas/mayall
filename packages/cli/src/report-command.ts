import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@helix/forensic-engine';
import { heading, rule } from './ui.js';

function candidatePaths(caseId: string, json: boolean): string[] {
  const root = repoRoot();
  const reportFile = json ? 'report.json' : 'report.md';
  const out = [
    path.join(root, 'artifacts', 'custom', caseId, 'report', reportFile),
    path.join(root, 'artifacts', 'runs', caseId, 'report', reportFile),
  ];
  // artifacts/custom/<caseId>.report.md (flat engine cache)
  out.push(path.join(root, 'artifacts', 'custom', `${caseId}.${reportFile}`));

  const runsDir = path.join(root, 'artifacts', 'runs');
  if (existsSync(runsDir)) {
    for (const entry of readdirSync(runsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      out.push(path.join(runsDir, entry.name, caseId, 'report', reportFile));
    }
  }
  return out;
}

export function reportCommand(caseId: string, opts: { json?: boolean } = {}): number {
  const candidates = candidatePaths(caseId, Boolean(opts.json));
  const found = candidates.find((file) => existsSync(file));

  if (!found) {
    console.error(`No stored report found for case "${caseId}".`);
    console.error('');
    console.error('Looked for:');
    for (const candidate of candidates.slice(0, 5)) {
      console.error(`  ${path.relative(repoRoot(), candidate).split(path.sep).join('/')}`);
    }
    console.error('');
    console.error('Run `mayall run --custom` or `mayall run --scenario <id>` first, then pass the case id it printed.');
    return 1;
  }

  for (const line of heading(`case ${caseId}`, path.relative(repoRoot(), found).split(path.sep).join('/'))) {
    console.log(line);
  }
  console.log('');
  console.log(readFileSync(found, 'utf-8'));
  console.log(rule());
  console.log(`  source: ${found}`);
  console.log('');
  return 0;
}
