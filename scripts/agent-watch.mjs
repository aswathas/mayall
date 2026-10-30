/**
 * Agent watch — scans the machine for running delegation agents and writes a
 * status snapshot the /agents page can poll.
 *
 * Detects:
 *   - cmdc (command-code) agents via `node ... command-code ... prompt-<name>.txt`
 *   - agy agents via `agy.exe -p ... prompt-<name>.txt`
 *
 * Output: data/agents/status.json
 */
import { execFile } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'data', 'agents');
const OUT_FILE = path.join(OUT_DIR, 'status.json');
const PROMPT_DIR = path.join(ROOT, 'scripts');

/** Human labels for each brief we launch agents with. */
const LABELS = {
  'motion': 'Motion + evidence components',
  'motion-reel': 'Forensic reel (MP4, motion-graphics)',
  'overview': 'Overview dashboard + incident registry',
  'lab': 'Lab, case file, report, docs, app shell',
  'qa': 'QA + accessibility harness',
  'pitch': 'Hackathon pitch deck',
  'cli': 'Mayall CLI pipeline',
  'bible': 'Forensic Bible section',
  'showcase': 'Judge showcase site',
  'attacklab': 'Custom Attack Lab (live Foundry run)',
  'historical': 'Historical analysis + AI reports',
  'evidence': 'Evidence workbench + trace explainer',
  'intro': 'Remotion intro + live tracker page',
  'binance': 'Live case: Binance $6.3B breach',
};

const MODELS = {
  cmdc: 'deepseek/deepseek-v4.1-flash',
  agy: 'agy (gemini/claude family)',
};

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? '' : stdout);
    });
  });
}

/** CIM serialises DateTime as `/Date(1690000000000)/` in some modes; normalise both shapes. */
function parseStart(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const raw = String(value);
  const epoch = raw.match(/\/Date\((-?\d+)\)\//);
  if (epoch) return new Date(Number(epoch[1])).toISOString();
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  const alt = raw.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (alt) {
    const iso = `${alt[1]}-${alt[2]}-${alt[3]}T${alt[4]}:${alt[5]}:${alt[6]}Z`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

/** Pull the first meaningful line out of a brief so the UI can describe the job. */
async function briefSummary(name) {
  const file = path.join(PROMPT_DIR, `prompt-${name}.txt`);
  if (!existsSync(file)) return '';
  try {
    const text = await readFile(file, 'utf8');
    const heading = text.match(/^#\s+(.+)$/m);
    if (heading) return heading[1].trim();
    const first = text.split('\n').find((l) => l.trim().length > 20);
    return (first || '').trim().slice(0, 140);
  } catch {
    return '';
  }
}

async function snapshot() {
  const raw = await run('powershell.exe', [
    '-NoProfile',
    '-Command',
    "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -or $_.Name -eq 'agy.exe' } | Select-Object ProcessId,Name,CreationDate,CommandLine | ConvertTo-Json -Compress",
  ]);

  let procs = [];
  try {
    const parsed = raw.trim() ? JSON.parse(raw) : [];
    procs = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    procs = [];
  }

  const found = new Map();

  for (const p of procs) {
    const cmd = String(p.CommandLine || '');
    const m = cmd.match(/prompt-([a-z-]+)\.txt/);
    if (!m) continue;
    const name = m[1];
    const kind = /agy\.exe/i.test(cmd) ? 'agy' : 'cmdc';
    const prev = found.get(name);
    if (prev && prev.pid < p.ProcessId) continue;
    const modelMatch = cmd.match(/--model\s+([^\s]+)/);
    found.set(name, {
      name,
      label: LABELS[name] || name,
      kind,
      model: modelMatch ? modelMatch[1] : MODELS[kind] || kind,
      pid: p.ProcessId,
      started: parseStart(p.CreationDate),
    });
  }

  const agents = [];
  for (const agent of found.values()) {
    agents.push({ ...agent, summary: await briefSummary(agent.name) });
  }
  agents.sort((a, b) => a.name.localeCompare(b.name));

  const payload = {
    updatedAt: new Date().toISOString(),
    count: agents.length,
    cmdc: agents.filter((a) => a.kind === 'cmdc').length,
    agy: agents.filter((a) => a.kind === 'agy').length,
    agents,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

const intervalMs = Number(process.env.MAYALL_AGENT_WATCH_MS || 5000);
let running = true;

async function loop() {
  while (running) {
    try {
      const p = await snapshot();
      console.log(`[agent-watch] ${p.count} agents (${p.cmdc} cmdc, ${p.agy} agy) @ ${p.updatedAt}`);
    } catch (err) {
      console.error('[agent-watch] failed:', err.message);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });

await snapshot();
await loop();
