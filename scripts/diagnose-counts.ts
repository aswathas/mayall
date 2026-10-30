/** Diagnose the chain / attack-vector counts so the UI and API agree. */
import { ATTACK_VECTORS, resolveAttackVectorId } from '../packages/core/src/index';
import { INCIDENTS } from '../packages/core/src/incidents';

const chains = new Set<string>();
const raw = new Set<string>();
const norm = new Set<string>();
const odd: string[] = [];

for (const incident of INCIDENTS) {
  chains.add(incident.chain);
  for (const v of incident.vectors) {
    raw.add(v);
    const n = resolveAttackVectorId(v);
    norm.add(n);
    if (!ATTACK_VECTORS[n]) odd.push(`UNKNOWN ${incident.slug}: ${v}`);
    else if (v !== n) odd.push(`LABELFORM ${incident.slug}: ${v} -> ${n}`);
  }
}

console.log('incidents:', INCIDENTS.length);
console.log('chains:', chains.size, [...chains].join(', '));
for (const i of INCIDENTS) {
  console.log(`  ${i.slug.padEnd(34)} ${String(i.chain).padEnd(10)} ${i.vectors.join(',')}`);
}
console.log('raw vector ids:', raw.size, [...raw].sort().join(', '));
console.log('normalised:', norm.size, [...norm].sort().join(', '));
console.log('oddities:', odd.length ? odd.join(' | ') : 'none');
