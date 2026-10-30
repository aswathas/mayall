#!/usr/bin/env node
import { SCENARIOS } from '@helix/forensic-engine';
import { LONG_SESSION_ID, analyzeCommand, bundleCommand, runCommand } from './run.js';
import { customRunCommand } from './custom.js';
import { scenariosCommand } from './scenarios-command.js';
import { bibleCommand } from './bible.js';
import { verifyCommand } from './verify.js';
import { reportCommand } from './report-command.js';

interface Parsed {
  flags: Map<string, string | boolean>;
  positional: string[];
}

function parseArgs(argv: string[]): Parsed {
  const flags = new Map<string, string | boolean>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const body = arg.slice(2);
      const eq = body.indexOf('=');
      if (eq !== -1) {
        flags.set(body.slice(0, eq), body.slice(eq + 1));
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        flags.set(body, next);
        i += 1;
      } else {
        flags.set(body, true);
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function str(flags: Map<string, string | boolean>, key: string): string | undefined {
  const v = flags.get(key);
  return typeof v === 'string' ? v : undefined;
}

function bool(flags: Map<string, string | boolean>, key: string): boolean {
  return flags.has(key) && flags.get(key) !== 'false';
}

const USAGE = `MAYALL — Web3 exploit forensics console

  Reproduces an exploit in a local Foundry EVM, reconstructs the crime scene
  from the execution trace, and writes a complete forensic folder.

ONE COMMAND → COMPLETE FORENSIC FOLDER
  npx tsx scripts/mayall.mjs run --custom \\
    --vector reentrancy --txs 3 --amount 6 --seed 42 --out artifacts/custom

COMMANDS
  run [options]              run a fixed scenario or a custom attack
  scenarios                  list every scenario and what it drains
  bible [--sheet 04]         browse the Forensic Bible knowledge base
  verify [--llm]             run the whole suite and print a pass/fail table
  report <caseId> [--json]   print the stored report for a case
  analyze <folder>           re-analyse an existing run folder
  bundle <folder>            (re)build the forensic ZIP from a run folder
  list                       alias for scenarios

RUN OPTIONS
  --custom                   run the Custom Attack Lab instead of a fixed scenario
  --vector <id>              custom family: reentrancy | access-control |
                             oracle-manipulation | flash-loan | delegatecall | selfdestruct
  --txs <n>                  attacker transactions, 1..12          (default: 3)
  --amount <eth>             total ETH to drain                     (default: 6)
  --seed <n>                 noise seed                             (default: 1)
  --scenario <id>            fixed scenario id, or "all"            (default: all)
  --tx <n>                   transactions in the long-session run   (default: 200)
  --out <dir>                output base directory                  (default: artifacts/custom | artifacts/runs/<utc>-<scenario>)
  --narrative                author the executive summary with mcode (fixed scenarios)
  --no-llm                   custom: skip mcode, write deterministic documents
  --no-bundle                skip the evidence ZIP

FOLDER (custom run)
  <out>/<caseId>/report/{report.md,report.json,narrative.md,plan.md,diagram.mmd}
  <out>/<caseId>/evidence/{artifact.json,trace.txt,foundry-stdout.txt,foundry-stderr.txt,
                 storage-diff.csv,balance-timeline.csv,timeline.csv,patterns.json,
                 gas-flame.json,chain-of-custody.json,bundle.zip}
  <out>/<caseId>/README.md

EXAMPLES
  npx tsx scripts/mayall.mjs scenarios
  npx tsx scripts/mayall.mjs run --custom --vector reentrancy --txs 3 --amount 6 --seed 42
  npx tsx scripts/mayall.mjs run --scenario reentrancy --out artifacts/runs/reentrancy
  npx tsx scripts/mayall.mjs run --scenario long-session --tx 200 --narrative
  npx tsx scripts/mayall.mjs bible --sheet 04 --rows 20
  npx tsx scripts/mayall.mjs verify
  npx tsx scripts/mayall.mjs report custom-reentrancy-1793395833908

WHAT IS REAL
  Foundry is .tools/foundry; forge is resolved from there without touching PATH.
  mcode is %USERPROFILE%\\.minimax-code\\mcode.ps1 and authors the narrative + plan.
  Output is a LOCAL Foundry simulation, not mainnet evidence. Detectors are heuristics.
`;

function printList(): void {
  console.log('MAYALL scenarios\n');
  for (const spec of SCENARIOS) {
    console.log(`  ${spec.id.padEnd(20)} ${spec.title}  [${spec.vectorId}]`);
    console.log(`    proves: ${spec.description}`);
    console.log(`    look for: ${spec.lookFor.join('; ')}`);
    console.log('');
  }
  console.log(`  ${LONG_SESSION_ID.padEnd(20)} 200-Transaction Haystack  [reentrancy]`);
  console.log('    proves: one real re-entrancy drain can be isolated from ~200 benign vault transactions.');
  console.log('    look for: the repeated (SessionVault, withdraw) pair nested in a single transaction; value out of the vault to the initiating contract.');
  console.log('');
}

function intFlag(flags: Map<string, string | boolean>, key: string, fallback: number): number | null {
  const raw = str(flags, key);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const { flags, positional } = parseArgs(argv.slice(1));

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(USAGE);
    return 0;
  }

  switch (command) {
    case 'run': {
      const out = str(flags, 'out');

      if (bool(flags, 'custom')) {
        const txs = intFlag(flags, 'txs', 3);
        const seed = intFlag(flags, 'seed', 1);
        if (txs === null || !Number.isInteger(txs)) {
          console.error(`--txs must be an integer between 1 and 12 (got ${str(flags, 'txs') ?? ''})`);
          return 1;
        }
        if (seed === null || !Number.isInteger(seed)) {
          console.error(`--seed must be an integer (got ${str(flags, 'seed') ?? ''})`);
          return 1;
        }
        return customRunCommand({
          vector: str(flags, 'vector') ?? 'reentrancy',
          txs,
          amountEth: str(flags, 'amount') ?? '6',
          seed,
          out,
          llm: !bool(flags, 'no-llm'),
          bundle: !bool(flags, 'no-bundle'),
        });
      }

      const scenario = str(flags, 'scenario') ?? 'all';
      const tx = intFlag(flags, 'tx', 200);
      if (tx === null || !Number.isInteger(tx) || tx < 1) {
        console.error(`--tx must be a positive integer (got ${str(flags, 'tx') ?? ''})`);
        return 1;
      }
      return runCommand({
        scenario,
        out,
        tx,
        narrative: bool(flags, 'narrative'),
        bundle: !bool(flags, 'no-bundle'),
      });
    }
    case 'scenarios':
    case 'list':
      return scenariosCommand();
    case 'bible': {
      const rows = intFlag(flags, 'rows', 12);
      if (rows === null || rows < 1) {
        console.error('--rows must be a positive integer');
        return 1;
      }
      return bibleCommand({ sheet: str(flags, 'sheet'), rows });
    }
    case 'verify':
      return verifyCommand({ llm: bool(flags, 'llm') });
    case 'report': {
      const caseId = positional[0];
      if (!caseId) {
        console.error('report requires a case id: mayall report <caseId>');
        return 1;
      }
      return reportCommand(caseId, { json: bool(flags, 'json') });
    }
    case 'analyze': {
      const folder = positional[0];
      if (!folder) {
        console.error('analyze requires a run folder: mayall analyze <folder>');
        return 1;
      }
      return analyzeCommand(folder);
    }
    case 'bundle': {
      const folder = positional[0];
      if (!folder) {
        console.error('bundle requires a run folder: mayall bundle <folder>');
        return 1;
      }
      return bundleCommand(folder);
    }
    default:
      console.error(`Unknown command "${command}".`);
      console.error(USAGE);
      return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
