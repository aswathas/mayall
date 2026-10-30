import { SCENARIOS } from '@helix/forensic-engine';
import { CUSTOM_VECTORS } from '../../forensic-engine/src/custom.js';
import { heading, pad, rule, truncate } from './ui.js';

export function scenariosCommand(): number {
  for (const line of heading('scenarios', 'what each run proves and what it drains')) console.log(line);

  console.log('');
  console.log('  FIXED SCENARIOS    mayall run --scenario <id>');
  console.log(`  ${'─'.repeat(74)}`);
  for (const spec of SCENARIOS) {
    console.log(`  ${pad(spec.id, 22)}${pad(spec.title, 38)}[${spec.vectorId}]`);
    console.log(`  ${' '.repeat(22)}proves: ${truncate(spec.description, 74)}`);
    console.log('  ');
  }
  console.log(`  ${pad('long-session', 22)}${pad('200-Transaction Haystack', 38)}[reentrancy]`);
  console.log(`  ${' '.repeat(22)}proves: one real re-entrancy drain isolated from ~200 benign vault transactions.`);
  console.log('');

  console.log('  CUSTOM ATTACK LAB  mayall run --custom --vector <id> --txs <n> --amount <eth> --seed <n>');
  console.log(`  ${'─'.repeat(74)}`);
  for (const vector of CUSTOM_VECTORS) {
    console.log(`  ${pad(vector.id, 22)}${pad(vector.label, 26)}${vector.severity.toUpperCase()}`);
    console.log(`  ${' '.repeat(22)}drains: ${truncate(vector.drains, 74)}`);
    console.log(`  ${' '.repeat(22)}breaks: ${truncate(vector.assumption, 74)}`);
    console.log('  ');
  }
  console.log(`  ${rule()}`);
  console.log('  Every scenario is a real Foundry proof-of-concept executed against a local EVM.');
  console.log('  Detectors are heuristics; each finding prints the evidence it rests on.');
  console.log('');
  return 0;
}
