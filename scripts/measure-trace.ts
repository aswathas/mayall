/** Measure the real parsed trace-node count for a scenario from its forensic bundle. */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseForgeTrace, flattenTrace } from '../packages/forensic-engine/src/trace-parser';

const scenario = process.argv[2] ?? 'reentrancy';
const zips = globSync('artifacts/bundles/*.zip').filter((z) => z.includes(scenario));
if (!zips.length) {
  console.log('no bundle for', scenario);
  process.exit(0);
}

const zip = zips[0];
const out = execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem; ' +
      `$z=[IO.Compression.ZipFile]::OpenRead('${zip.replace(/\\/g, '\\\\')}');` +
      `$e=$z.Entries | Where-Object { $_.FullName -like '*trace.txt' } | Select-Object -First 1;` +
      `$r=New-Object IO.StreamReader($e.Open()); $t=$r.ReadToEnd(); $r.Close(); $z.Dispose(); $t`,
  ],
  { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
);

const parsed = parseForgeTrace(out);
const nodes = flattenTrace(parsed.root);
const depths = nodes.map((n) => n.depth ?? 0);
console.log(`${scenario}: parsed.nodes = ${parsed.nodes.length}`);
console.log(`  flattenTrace(root) = ${nodes.length}`);
console.log(`  max depth = ${Math.max(...depths)}`);
const flatIds = new Set(parsed.nodes.map((n: any) => n.id));
const treeIds = new Set(nodes.map((n: any) => n.id));
const onlyFlat = [...flatIds].filter((id) => !treeIds.has(id));
console.log(`  only in parsed.nodes: ${onlyFlat.length ? onlyFlat.join(', ') : 'none'}`);
