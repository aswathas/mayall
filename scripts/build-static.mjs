#!/usr/bin/env node
/**
 * Mayall — static export builder for GitHub Pages.
 *
 *   node scripts/build-static.mjs
 *
 * GitHub Pages serves static files only. This builder produces a complete,
 * honest static mirror of the console:
 *
 *  - Pages are exported with Next's `output: 'export'` under `/mayall`.
 *  - Every GET API handler is executed once at build time and its real
 *    response is written out as static JSON. That keeps the deployed data
 *    identical to a local run without inventing a second implementation.
 *  - Handlers that mutate state or stream a live forge process
 *    (`/api/simulate`, `/api/simulate/all`, `/api/custom*`, `POST
 *    /api/report/[caseId]/narrative`) cannot exist on a static host and are
 *    deliberately omitted. The UI degrades to its local-only state.
 *
 * Why the staging copy?
 * ---------------------
 * Several contributors edit `packages/web/app/**` concurrently. The export's
 * two unavoidable rewrites — removing `dynamic = 'force-dynamic'` and adding
 * `generateStaticParams()` to dynamic segments — are applied to a throwaway
 * copy of the app in the OS temp directory. The working tree is never mutated,
 * so an interrupted build cannot leave the repository broken and no one else's
 * work is ever reverted. Non-exportable route files are renamed to
 * `route.ts.off` in that copy only.
 *
 * The live Foundry simulation is intentionally NOT part of the build: it needs
 * a local forge binary and a shell, neither of which GitHub Pages provides.
 * The committed simulation artifacts are real recordings of local
 * `forge test` runs, and every page says so.
 */

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT, 'packages', 'web');
const API_DIR = path.join(WEB_DIR, 'app', 'api');
const OUT_DIR = path.join(ROOT, 'static-export');
const BASE_PATH = (process.env.MAYALL_BASE_PATH ?? '/mayall').replace(/\/+$/, '');
const STAGE = fs.mkdtempSync(path.join(os.tmpdir(), 'mayall-static-'));
const STAGE_WEB = path.join(STAGE, 'packages', 'web');
const INSPECT_ONLY = process.argv.includes('--inspect');
const MAX_BUILD_ATTEMPTS = 2;

function log(...args) {
  console.log('[build-static]', ...args);
}

function fail(message) {
  console.error(`[build-static] ERROR: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function walk(dir, predicate, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, acc);
    else if (predicate(full)) acc.push(full);
  }
  return acc;
}

function linkDir(target, linkPath) {
  if (!fs.existsSync(target)) fail(`cannot link missing directory: ${target}`);
  if (fs.existsSync(linkPath)) return;
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
}

/* -------------------------------------------------------------------------- */
/* 1. Load the registry + the real route handlers.                             */
/* -------------------------------------------------------------------------- */

process.env.HELIX_ROOT = ROOT;
const nativeRequire = createRequire(path.join(ROOT, 'package.json'));
nativeRequire('tsx/cjs');
const engine = nativeRequire('@helix/forensic-engine');

const incidentSlugs = [...engine.INCIDENTS].map((incident) => incident.slug);
const scenarioIds = engine.SCENARIOS.map((scenario) => scenario.id);
const vectorIds = Object.keys(engine.ATTACK_VECTORS);
const caseIds = [...incidentSlugs, ...scenarioIds.map((id) => `lab-${id}`)];

function scenarioForCase(caseId) {
  if (caseId.startsWith('lab-')) {
    const id = caseId.slice(4);
    return engine.SCENARIO_BY_ID.has(id) ? id : null;
  }
  const incident = engine.INCIDENT_BY_SLUG.get(caseId);
  return incident?.scenarioId && engine.SCENARIO_BY_ID.has(incident.scenarioId)
    ? incident.scenarioId
    : null;
}

/**
 * Freshness is compared against the Foundry test file mtime. A fresh checkout
 * gives test files and artifacts near-identical timestamps, and the deploy job
 * has no forge binary, so the committed artifacts are touched to guarantee the
 * handlers reuse them instead of shelling out to a missing forge.
 */
function touchCommittedArtifacts() {
  const directory = engine.artifactsDir();
  const now = new Date();
  for (const scenarioId of scenarioIds) {
    const artifact = path.join(directory, `${scenarioId}.json`);
    if (fs.existsSync(artifact)) fs.utimesSync(artifact, now, now);
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Stage a disposable copy of the web app.                                  */
/* -------------------------------------------------------------------------- */

const NON_GET = ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const routeFiles = walk(API_DIR, (file) => path.basename(file) === 'route.ts');
const omitted = [];
const generatedRoutes = [];

function exportedMethods(source) {
  return ['GET', ...NON_GET].filter((method) =>
    new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${method}\\b`).test(source),
  );
}

const valuesForParam = (name) => {
  switch (name) {
    case 'slug':
      return incidentSlugs;
    case 'caseId':
      return caseIds;
    case 'vectorId':
      return vectorIds;
    default:
      return null;
  }
};

function prepareStage() {
  omitted.length = 0;
  generatedRoutes.length = 0;
  fs.rmSync(STAGE_WEB, { recursive: true, force: true });
  log(`staging in ${STAGE}`);

  linkDir(path.join(ROOT, 'node_modules'), path.join(STAGE, 'node_modules'));
  linkDir(path.join(ROOT, 'packages', 'core'), path.join(STAGE, 'packages', 'core'));
  linkDir(
    path.join(ROOT, 'packages', 'forensic-engine'),
    path.join(STAGE, 'packages', 'forensic-engine'),
  );

  fs.mkdirSync(STAGE_WEB, { recursive: true });
  fs.writeFileSync(
    path.join(STAGE, 'package.json'),
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  );

  for (const entry of [
    'app',
    'components',
    'lib',
    'public',
    'data',
    'fixtures',
    'remotion',
    'src',
    'next-env.d.ts',
    'next.config.mjs',
    'package.json',
    'postcss.config.mjs',
    'tsconfig.json',
  ]) {
    const from = path.join(WEB_DIR, entry);
    if (fs.existsSync(from)) {
      fs.cpSync(from, path.join(STAGE_WEB, entry), { recursive: true, force: true });
    }
  }

  /* Classify every route handler for the report, then remove them all from the
   * staging copy: their responses are produced directly from the real modules
   * below, which avoids Next's file-vs-directory collision between `/api/x` and
   * `/api/x/[param]` in a static export. */
  for (const file of routeFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const methods = exportedMethods(source);
    const routePath = `/api/${path
      .relative(API_DIR, file)
      .split(path.sep)
      .join('/')
      .replace(/\/route\.ts$/, '')}`.replace(/\/$/, '');
    const staged = path.join(STAGE_WEB, 'app', 'api', path.relative(API_DIR, file));

    if (methods.some((method) => NON_GET.includes(method))) {
      omitted.push(`${routePath} (${methods.join(', ')})`);
    } else if (
      /\/api\/(simulate|custom)(\/|$)/.test(routePath) &&
      routePath !== '/api/custom/options'
    ) {
      omitted.push(`${routePath} (live stream / local-only)`);
    }

    if (fs.existsSync(staged)) fs.renameSync(staged, `${staged}.off`);
  }

  /* Pages: make every force-dynamic page static for the export. */
  const appRoot = path.join(STAGE_WEB, 'app');
  for (const file of walk(appRoot, (candidate) => /\b(page|layout)\.tsx$/.test(candidate))) {
    const source = fs.readFileSync(file, 'utf8');
    const next = source
      .replace(
        /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]\s*;?/g,
        "export const dynamic = 'force-static';",
      )
      .replace(/export\s+const\s+revalidate\s*=\s*0\s*;?/g, 'export const revalidate = false;');
    if (next !== source) fs.writeFileSync(file, next);
  }

  /* Dynamic pages need generateStaticParams() on the segment layout. */
  const createdLayouts = new Set();
  for (const page of walk(appRoot, (file) => path.basename(file) === 'page.tsx')) {
    const relativeDir = path.relative(appRoot, path.dirname(page));
    const segments = relativeDir.split(path.sep);
    const bracketIndex = segments.findIndex((segment) => /^\[.+\]$/.test(segment));
    if (bracketIndex === -1) continue;
    if (/generateStaticParams/.test(fs.readFileSync(page, 'utf8'))) continue;

    const segmentDir = path.join(appRoot, ...segments.slice(0, bracketIndex + 1));
    const layoutFile = path.join(segmentDir, 'layout.tsx');
    if (createdLayouts.has(layoutFile)) continue;

    const paramName = segments[bracketIndex].replace(/^\[+|\]+$/g, '').replace(/^\.\.\./, '');
    const values = valuesForParam(paramName);
    if (!values) fail(`dynamic page "${path.relative(appRoot, page)}" has no known static values`);

    const body = `export function generateStaticParams() {\n  return [\n    ${values
      .map((value) => `{ ${paramName}: ${JSON.stringify(value)} },`)
      .join('\n    ')}\n  ];\n}`;

    if (fs.existsSync(layoutFile)) {
      const layout = fs.readFileSync(layoutFile, 'utf8');
      if (!/generateStaticParams/.test(layout)) {
        fs.writeFileSync(layoutFile, `${layout}\n\n${body}\n`);
      }
    } else {
      fs.writeFileSync(
        layoutFile,
        `import type { ReactNode } from 'react';\n\n${body}\n\nexport default function StaticSegmentLayout({ children }: { children: ReactNode }) {\n  return children;\n}\n`,
      );
    }
    createdLayouts.add(layoutFile);
    log(`static params layout: ${path.relative(STAGE_WEB, layoutFile)}`);
  }

  log(`${routeFiles.length} route handlers found; ${omitted.length} omitted from the static build`);
  for (const route of omitted) log(`  omitted ${route}`);
}

/* -------------------------------------------------------------------------- */
/* 3. Build the pages (re-staging once if the build hit a transient failure).  */
/* -------------------------------------------------------------------------- */

for (let attempt = 1; attempt <= MAX_BUILD_ATTEMPTS; attempt += 1) {
  prepareStage();

  if (INSPECT_ONLY) {
    log('inspect mode — stopping before the Next.js build');
    process.exit(0);
  }

  touchCommittedArtifacts();

  const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
  const result = spawnSync(process.execPath, [nextBin, 'build'], {
    cwd: STAGE_WEB,
    stdio: 'inherit',
    env: {
      ...process.env,
      HELIX_ROOT: ROOT,
      MAYALL_STATIC_EXPORT: '1',
      MAYALL_BASE_PATH: BASE_PATH,
      MAYALL_STATIC_SKIP_TYPECHECK: '1',
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  });

  if (result.status === 0) break;
  if (attempt === MAX_BUILD_ATTEMPTS) fail(`next build exited with ${result.status}`);
  log(`next build failed on attempt ${attempt}/${MAX_BUILD_ATTEMPTS}; re-staging and retrying`);
}

const exportDir = path.join(STAGE_WEB, 'out');
if (!fs.existsSync(path.join(exportDir, 'index.html'))) {
  fail(`expected ${path.join(exportDir, 'index.html')} after the build`);
}

/* -------------------------------------------------------------------------- */
/* 4. Publish the export into static-export/.                                  */
/* -------------------------------------------------------------------------- */

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.cpSync(exportDir, OUT_DIR, { recursive: true });

/* Rewrite absolute /api/ fetches so they work under the Pages base path. */
const REWRITE_EXTENSIONS = new Set(['.html', '.js', '.txt']);
let rewritten = 0;
for (const file of walk(OUT_DIR, (candidate) => REWRITE_EXTENSIONS.has(path.extname(candidate)))) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes('/api/')) continue;
  fs.writeFileSync(file, source.split('/api/').join(`${BASE_PATH}/api/`));
  rewritten += 1;
}
log(`rewrote /api/ client references in ${rewritten} files to ${BASE_PATH}/api/`);

/* -------------------------------------------------------------------------- */
/* 5. Generate the static API from the real GET handlers.                      */
/* -------------------------------------------------------------------------- */

function writeJsonRoute(routePath, text) {
  JSON.parse(text); // refuse to publish malformed JSON
  const relative = routePath.replace(/^\/api\//, '').replace(/\/+$/, '');
  const dir = path.join(OUT_DIR, 'api', ...relative.split('/'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), text);
  fs.writeFileSync(`${dir}.json`, text);
  generatedRoutes.push(routePath);
}

function writeFileRoute(routePath, buffer) {
  const relative = routePath.replace(/^\/api\//, '').replace(/\/+$/, '');
  const target = path.join(OUT_DIR, 'api', ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer);
  generatedRoutes.push(routePath);
}

async function invoke(routeFile, routePath, params) {
  const modulePath = path.join(API_DIR, ...routeFile.split('/'));
  const mod = nativeRequire(modulePath);
  if (typeof mod.GET !== 'function') throw new Error(`${routePath} does not export GET`);
  const request = new Request(`http://localhost${routePath}`);
  const context = params ? { params: Promise.resolve(params) } : undefined;
  return mod.GET(request, context);
}

async function generateJson(routeFile, routePath, params) {
  const response = await invoke(routeFile, routePath, params);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  writeJsonRoute(routePath.replace(/\?.*$/, ''), await response.text());
}

async function generateBinary(routeFile, routePath, params) {
  const response = await invoke(routeFile, routePath, params);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  writeFileRoute(routePath.replace(/\?.*$/, ''), Buffer.from(await response.arrayBuffer()));
}

const jobs = [];
const add = (routeFile, routePath, params) => jobs.push({ routeFile, routePath, params });

add('overview/route.ts', '/api/overview');
add('incidents/route.ts', '/api/incidents');
add('historical/route.ts', '/api/historical');
add('scenarios/route.ts', '/api/scenarios');
add('status/route.ts', '/api/status');
add('agents/route.ts', '/api/agents');
add('custom/options/route.ts', '/api/custom/options');
add('evidence/route.ts', '/api/evidence');
add('live/route.ts', '/api/live');
add('live/report/route.ts', '/api/live/report');

for (const slug of incidentSlugs) {
  add('incidents/[slug]/route.ts', `/api/incidents/${slug}`, { slug });
  add('historical/[slug]/route.ts', `/api/historical/${slug}`, { slug });
  add('historical/[slug]/report/route.ts', `/api/historical/${slug}/report`, { slug });
}

const evidenceCaseIds = [...new Set([...scenarioIds, ...incidentSlugs])];
for (const caseId of evidenceCaseIds) {
  add('evidence/[caseId]/route.ts', `/api/evidence/${caseId}`, { caseId });
  add('evidence/[caseId]/manifest/route.ts', `/api/evidence/${caseId}/manifest`, { caseId });
}

for (const caseId of caseIds) {
  const scenario = scenarioForCase(caseId);
  const query = scenario ? `?scenario=${encodeURIComponent(scenario)}` : '';
  add('report/[caseId]/route.ts', `/api/report/${caseId}${query}`, { caseId });
  add('report/[caseId]/markdown/route.ts', `/api/report/${caseId}/markdown${query}`, { caseId });
  add('bundle/[caseId]/route.ts', `/api/bundle/${caseId}${query}`, { caseId });
}

const failures = [];
/* Route helpers resolve sibling modules relative to the web package (the same
 * working directory `next dev` uses), so run the handlers from there. */
process.chdir(WEB_DIR);
for (const job of jobs) {
  try {
    if (job.routeFile.startsWith('report/[caseId]/markdown') || job.routeFile.startsWith('bundle/')) {
      await generateBinary(job.routeFile, job.routePath, job.params);
    } else {
      await generateJson(job.routeFile, job.routePath, job.params);
    }
  } catch (error) {
    failures.push(`${job.routePath}: ${error.message}`);
  }
}

log(`generated ${generatedRoutes.length} static API responses`);
for (const failure of failures) log(`  failed ${failure}`);
if (failures.length > 0) {
  log(`${failures.length} endpoint(s) could not be pre-rendered; the UI shows its local-only state for those.`);
}

/* -------------------------------------------------------------------------- */
/* 6. Housekeeping + verification.                                             */
/* -------------------------------------------------------------------------- */

fs.writeFileSync(path.join(OUT_DIR, '.nojekyll'), '');

for (const required of ['index.html', 'incidents/index.html', 'api/incidents/index.html']) {
  if (!fs.existsSync(path.join(OUT_DIR, required))) fail(`static export is missing ${required}`);
}

const apiJsonFiles = walk(path.join(OUT_DIR, 'api'), (file) => file.endsWith('.json'));
if (apiJsonFiles.length === 0) fail('static export contains no pre-rendered API JSON files');
for (const jsonFile of apiJsonFiles) JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

const html = fs.readFileSync(path.join(OUT_DIR, 'index.html'), 'utf8');
if (!html.includes('Mayall')) fail('exported index.html does not mention Mayall');

log(`verify: index.html present (contains "Mayall"), ${apiJsonFiles.length} API JSON files parsed`);
log(`verify: ${generatedRoutes.length} static API routes`);
log(`static export ready at ${OUT_DIR}`);
