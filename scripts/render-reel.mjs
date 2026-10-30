// scripts/render-reel.mjs
// Wrapper around the reference virtual-clock renderer.
//   node scripts/render-reel.mjs sheet   -> artifacts/motion/contact-sheet.png
//   node scripts/render-reel.mjs draft   -> artifacts/motion/draft.mp4   (960x540)
//   node scripts/render-reel.mjs final   -> artifacts/motion/mayall-reel.mp4 (1920x1080)
//   node scripts/render-reel.mjs all     -> sheet, draft, final
//
// The virtual-clock injection is the same discipline as scripts/claude-video-render.mjs:
// performance.now, Date.now and requestAnimationFrame are replaced, time advances by exactly
// 1/fps per frame, and every frame is a screenshot of a pure function of t.

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const scenePath = resolve(root, 'docs/motion/scene.html');
const outDir = resolve(root, 'artifacts/motion');
const workDir = resolve(outDir, '_work');

const DURATION = 26; // seconds
const FPS = 24;
const SHEET_COLS = 5;
const SHEET_ROWS = 6;
const SHEET_W = 384;
const SHEET_H = 216;

const virtualClock = () => {
  let now = 0;
  let queue = [];
  const startDate = Date.now();
  performance.now = () => now;
  Date.now = () => startDate + now;
  window.requestAnimationFrame = (cb) => queue.push(cb);
  window.cancelAnimationFrame = () => {};
  window.__advance = (ms) => {
    now += ms;
    const callbacks = queue;
    queue = [];
    callbacks.forEach((cb) => cb(now));
    document.getAnimations().forEach((a) => {
      a.pause();
      a.currentTime = now;
    });
  };
};

async function openScene(width, height) {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width, height } });
  await page.addInitScript(virtualClock);
  await page.goto(pathToFileURL(scenePath).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => window.__previewQueued === true, null, { timeout: 15000 });
  const fonts = await page.evaluate(() => window.__fontStatus);
  return { browser, page, fonts };
}

async function renderSheet() {
  mkdirSync(workDir, { recursive: true });
  const { browser, page, fonts } = await openScene(1920, 1080);
  const frames = [];

  for (let i = 0; i < DURATION; i++) {
    // Sample 0.6 s after the second boundary so the sheet never lands exactly
    // on a hard cut and every cell carries readable content.
    const sample = i + 0.6;
    await page.evaluate(([tt, label]) => {
      window.renderAt(tt);
      const cv = document.querySelector('canvas');
      const x = cv.getContext('2d');
      x.save();
      x.font = '500 13px "JetBrains Mono", "Cascadia Mono", Consolas, monospace';
      x.fillStyle = 'rgba(255,59,48,0.95)';
      x.textAlign = 'left';
      x.textBaseline = 'alphabetic';
      x.fillText('t=' + String(label).padStart(2, '0') + 's', 96, 86);
      x.restore();
    }, [sample, i]);
    const png = await page.screenshot({ type: 'png' });
    const name = join(workDir, `sheet_${String(i).padStart(2, '0')}.png`);
    writeFileSync(name, png);
    frames.push(name);
    process.stdout.write(`sheet ${i + 1}/${DURATION}\r`);
  }
  await browser.close();
  process.stdout.write('\n');

  const out = resolve(outDir, 'contact-sheet.png');
  const vf = [
    `scale=${SHEET_W}:${SHEET_H}:flags=lanczos`,
    `tile=${SHEET_COLS}x${SHEET_ROWS}:nb_frames=${DURATION}:margin=6:padding=6:color=0x090607`
  ].join(',');
  await runFfmpeg([
    '-y',
    '-framerate', '1',
    '-start_number', '0',
    '-i', join(workDir, 'sheet_%02d.png'),
    '-vf', vf,
    '-frames:v', '1',
    '-update', '1',
    out
  ]);
  console.log(`wrote ${out}`);
  console.log('fonts:', JSON.stringify(fonts));
  return out;
}

async function renderVideo(width, height, outName, label) {
  mkdirSync(outDir, { recursive: true });
  const { browser, page, fonts } = await openScene(width, height);
  const frameCount = Math.round(DURATION * FPS);
  const frameMs = 1000 / FPS;
  const out = resolve(outDir, outName);

  const ffmpeg = spawn('ffmpeg', [
    '-y',
    '-f', 'image2pipe',
    '-framerate', String(FPS),
    '-i', '-',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '18',
    '-movflags', '+faststart',
    out
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  for (let i = 0; i < frameCount; i++) {
    await page.evaluate((ms) => window.__advance(ms), i === 0 ? 0 : frameMs);
    const png = await page.screenshot({ type: 'png' });
    if (!ffmpeg.stdin.write(png)) await once(ffmpeg.stdin, 'drain');
    if (i % FPS === 0) process.stdout.write(`${label} frame ${i}/${frameCount}\r`);
  }
  ffmpeg.stdin.end();
  await new Promise((done, fail) => {
    ffmpeg.on('close', (code) => (code === 0 ? done() : fail(new Error(`ffmpeg exited ${code}`))));
    ffmpeg.on('error', fail);
  });
  await browser.close();
  process.stdout.write('\n');
  console.log(`wrote ${out}`);
  console.log('fonts:', JSON.stringify(fonts));
  return out;
}

function runFfmpeg(args) {
  return new Promise((done, fail) => {
    const p = spawn('ffmpeg', args, { stdio: 'inherit' });
    p.on('close', (code) => (code === 0 ? done() : fail(new Error(`ffmpeg exited ${code}`))));
    p.on('error', fail);
  });
}

const mode = (process.argv[2] || 'all').toLowerCase();
if (!existsSync(scenePath)) {
  console.error('scene not found:', scenePath);
  process.exit(1);
}

if (mode === 'sheet' || mode === 'all') await renderSheet();
if (mode === 'draft' || mode === 'all') await renderVideo(960, 540, 'draft.mp4', 'draft');
if (mode === 'final' || mode === 'all') await renderVideo(1920, 1080, 'mayall-reel.mp4', 'final');
if (!['sheet', 'draft', 'final', 'all'].includes(mode)) {
  console.error('unknown mode:', mode);
  process.exit(1);
}
