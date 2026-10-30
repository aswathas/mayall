// Render any HTML animation to MP4, frame by frame, with a virtual clock.
// npm i playwright-core  (uses your installed Chrome; needs ffmpeg on PATH)
// node claude-video-render.mjs scene.html out.mp4 [seconds=6] [fps=60] [width=1920] [height=1080]
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const [input, output = 'out.mp4', seconds = '6', fps = '60', width = '1920', height = '1080'] = process.argv.slice(2)
const frameCount = Math.round(Number(seconds) * Number(fps))
const frameMs = 1000 / Number(fps)

const virtualClock = () => {
  let now = 0
  let queue = []
  const startDate = Date.now()
  performance.now = () => now
  Date.now = () => startDate + now
  window.requestAnimationFrame = (cb) => queue.push(cb)
  window.cancelAnimationFrame = () => {}
  window.__advance = (ms) => {
    now += ms
    const callbacks = queue
    queue = []
    callbacks.forEach((cb) => cb(now))
    document.getAnimations().forEach((a) => { a.pause(); a.currentTime = now })
  }
}

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } })
await page.addInitScript(virtualClock)
const url = input.startsWith('http') ? input : pathToFileURL(resolve(input)).href
await page.goto(url, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)

const ffmpeg = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', fps, '-i', '-',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', output], { stdio: ['pipe', 'inherit', 'inherit'] })

for (let i = 0; i < frameCount; i++) {
  await page.evaluate((ms) => window.__advance(ms), i === 0 ? 0 : frameMs)
  ffmpeg.stdin.write(await page.screenshot({ type: 'png' }))
  if (i % Number(fps) === 0) console.log(`frame ${i}/${frameCount}`)
}
ffmpeg.stdin.end()
await new Promise((done) => ffmpeg.on('close', done))
await browser.close()
console.log(`wrote ${output}`)
