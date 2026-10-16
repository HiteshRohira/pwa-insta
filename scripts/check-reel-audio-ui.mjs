import { webkit, devices } from '@playwright/test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Real AAC decode/output, not a mocked AudioContext. ffmpeg generates a small
// tone fixture outside the repo so visual/audio proof never becomes a source asset.
const dir = await mkdtemp(join(tmpdir(), 'reel-audio-'));
const fixture = join(dir, 'tone.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i',
  'testsrc2=size=180x320:rate=24', '-f', 'lavfi', '-i',
  'sine=frequency=440:sample_rate=44100', '-t', '12', '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', fixture]);
const browser = await webkit.launch();
try {
  const context = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const Base = window.AudioContext;
    window.__audio = { contexts: [], sources: [], outputs: [], decodes: 0 };
    const BaseWorker = window.Worker;
    window.__speed = { blocked: true, pending: [], workers: [] };
    window.Worker = class extends BaseWorker {
      constructor(...args) {
        super(...args);
        this.row = { terminated: false };
        window.__speed.workers.push(this.row);
      }
      postMessage(...args) {
        const send = () => { if (!this.row.terminated) super.postMessage(...args); };
        if (window.__speed.blocked) window.__speed.pending.push(send);
        else send();
      }
      terminate() { this.row.terminated = true; return super.terminate(); }
    };
    // Measure final audible output, including the prepared 2× soundtrack.
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function(target, ...args) {
      if (target === this.context.destination) {
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 8192;
        analyser.smoothingTimeConstant = 0;
        window.__audio.outputs.push(analyser);
        connect.call(this, analyser);
        return connect.call(analyser, target, ...args);
      }
      return connect.call(this, target, ...args);
    };
    window.AudioContext = class extends Base {
      constructor(...args) { super(...args); window.__audio.contexts.push(this); }
      decodeAudioData(...args) { window.__audio.decodes++; return super.decodeAudioData(...args); }
      createBufferSource() {
        const source = super.createBufferSource();
        const stop = source.stop.bind(source);
        const start = source.start.bind(source);
        const row = { source, stopped: false };
        source.start = (...args) => {
          row.offset = args[1] || 0;
          row.videoTime = document.querySelector('[data-pwacn-page="0"] video')?.currentTime;
          row.videoRate = document.querySelector('[data-pwacn-page="0"] video')?.playbackRate;
          return start(...args);
        };
        source.stop = (...args) => { row.stopped = true; return stop(...args); };
        window.__audio.sources.push(row);
        return source;
      }
    };
  });
  const media = await readFile(fixture);
  let failSound = false;
  await page.route('**/media/reel-*.mp4', r => {
    if (failSound && r.request().resourceType() === 'fetch') {
      failSound = false;
      return r.fulfill({ status: 503, body: 'Temporary failure' });
    }
    return r.fulfill({ body: media, contentType: 'video/mp4' });
  });
  await page.goto(`${process.env.UI_BASE_URL || 'http://localhost:4310'}/?demo=1`);
  await page.getByRole('button', { name: 'Reels', exact: true }).filter({ visible: true }).click();
  const reel = page.locator('[data-pwacn-page="0"]');
  const surface = reel.getByRole('button', { name: 'Reel playback surface' });
  await surface.click();
  await page.waitForFunction(() => [...document.querySelectorAll('video')].some(v => !v.paused && v.currentTime > 0));
  assert.equal(await page.evaluate(() => window.__audio.decodes), 0, 'muted playback does not download/decode audio');
  await surface.click();
  await page.waitForFunction(() => document.querySelector('[data-pwacn-page="0"] video').paused);
  await reel.getByRole('button', { name: 'Unmute video' }).click();
  await surface.click();
  await page.waitForFunction(() => window.__audio.sources.some(r => !r.stopped));
  await page.waitForFunction(() => {
    const analyser = window.__audio.outputs.at(-1);
    if (!analyser) return false;
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    return data.some(x => Math.abs(x) > .01);
  });
  assert.equal(await reel.locator('video').evaluate(v => v.muted), true, 'audible reel never unmutes the native element');
  assert.equal(await reel.locator('video').evaluate(v => v.preservesPitch), false,
    'iOS picture bypasses native pitch processing; only the separate soundtrack preserves pitch');
  // Playback loops remain audible without a second decode.
  await page.waitForTimeout(12500);
  assert.equal(await page.evaluate(() => window.__audio.decodes), 1);
  const allStopped = () => window.__audio.sources.every(r => r.stopped);
  await surface.click();
  await page.waitForFunction(allStopped);
  await page.waitForFunction(() => window.__audio.contexts[0].state === 'suspended');
  await surface.click();
  await page.waitForFunction(() => window.__audio.sources.some(r => !r.stopped));
  const holdSpeed = () => surface.evaluate(button => {
    const r = button.getBoundingClientRect();
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 7,
      clientX: r.left + r.width * .1, clientY: r.top + r.height * .3 }));
  });
  const progress = () => reel.locator('video').evaluate(async v => {
    const start = v.currentTime;
    const clock = performance.now();
    await new Promise(resolve => setTimeout(resolve, 600));
    return { advanced: (v.currentTime - start + v.duration) % v.duration,
      elapsed: (performance.now() - clock) / 1000 };
  });
  const releaseWorker = () => page.evaluate(() => {
    window.__speed.blocked = false;
    for (const send of window.__speed.pending.splice(0)) send();
  });
  // Deliberately stall preparation: normal playback must continue and a
  // released hold must never apply 2× later when that preparation completes.
  await holdSpeed();
  await reel.getByRole('status').filter({ hasText: 'Preparing 2×' }).waitFor();
  let timing = await progress();
  assert.ok(Math.abs(timing.advanced / timing.elapsed - 1) < .2, '1× keeps moving while 2× prepares');
  await surface.dispatchEvent('pointerup', { pointerId: 7, button: 0 });
  await releaseWorker();
  assert.equal(await reel.locator('video').evaluate(v => v.playbackRate), 1);
  assert.equal(await page.evaluate(() => window.__speed.workers.every(w => w.terminated)), true, 'release cancels preparation');
  // Repeat with a completed preparation and observe the frames through the
  // handoff. The soundtrack must start at the live position, never hold-start.
  await reel.locator('video').evaluate(v => { v.currentTime = .2; });
  await page.waitForFunction(() => !document.querySelector('[data-pwacn-page="0"] video').seeking);
  await page.evaluate(() => { window.__speed.blocked = true; });
  await reel.locator('video').evaluate(v => {
    window.__motion = { frames: [], gaps: [], seeks: 0 };
    v.addEventListener('seeking', () => window.__motion.seeks++);
    let previous;
    const frame = (now, data) => {
      if (previous) window.__motion.gaps.push(now - previous);
      previous = now;
      window.__motion.frames.push(data.mediaTime);
      v.requestVideoFrameCallback(frame);
    };
    v.requestVideoFrameCallback(frame);
  });
  await holdSpeed();
  await reel.getByRole('status').filter({ hasText: 'Preparing 2×' }).waitFor();
  timing = await progress();
  assert.ok(Math.abs(timing.advanced / timing.elapsed - 1) < .2);
  await releaseWorker();
  await page.waitForFunction(() => document.querySelector('[data-pwacn-page="0"] video').playbackRate === 2);
  await reel.getByRole('status').filter({ hasText: /^2×$/ }).waitFor();
  assert.equal(await page.evaluate(() => window.__speed.workers.every(w => w.terminated)), true, 'no worker runs during 2× playback');
  const handoff = await page.evaluate(() => {
    const row = window.__audio.sources.findLast(r => !r.stopped);
    return { offset: row.offset, videoTime: row.videoTime, rate: row.source.playbackRate.value,
      videoRate: row.videoRate, duration: row.source.buffer.duration };
  });
  assert.equal(handoff.rate, 1, 'prepared audio uses its native sample rate');
  assert.equal(handoff.videoRate, 2);
  assert.ok(Math.abs(handoff.offset * 2 - handoff.videoTime) < .02, 'audio starts at the live media position');
  assert.ok(Math.abs(handoff.duration - 6) < .05, 'pitch-preserved audio has half the original duration');
  const originalPitch = () => {
    const analyser = window.__audio.outputs.at(-1);
    const bins = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(bins);
    let peak = 1;
    for (let i = 2; i < bins.length; i++) if (bins[i] > bins[peak]) peak = i;
    const hz = peak * analyser.context.sampleRate / analyser.fftSize;
    return bins[peak] > -35 && Math.abs(hz - 440) < 15;
  };
  await page.waitForFunction(originalPitch);
  timing = await progress();
  assert.ok(Math.abs(timing.advanced / timing.elapsed - 2) < .25, '2× still advances video at double speed');
  await page.waitForFunction(originalPitch);
  const motion = await page.evaluate(() => window.__motion);
  assert.equal(motion.seeks, 0, 'speed transition never seeks the video');
  assert.ok(motion.frames.length > 10, 'video frames keep arriving through preparation and handoff');
  assert.ok(motion.frames.every((time, i) => !i || time >= motion.frames[i - 1]), 'presented video frames never rewind');
  assert.ok(Math.max(...motion.gaps) < 150, 'preparation and handoff do not stall video frames');
  assert.equal(await reel.locator('video').evaluate(v => v.muted), true, '2× keeps native media muted');
  await surface.dispatchEvent('pointerup', { pointerId: 7, button: 0 });
  await page.waitForFunction(() => document.querySelector('[data-pwacn-page="0"] video').playbackRate === 1);
  await page.waitForFunction(originalPitch);
  await page.waitForTimeout(400);
  const exitMotion = await page.evaluate(() => window.__motion);
  assert.equal(exitMotion.seeks, 0, 'releasing 2× never seeks');
  assert.ok(exitMotion.frames.every((time, i) => !i || time >= exitMotion.frames[i - 1]),
    'presented frames never rewind on release either');
  assert.ok(Math.max(...exitMotion.gaps) < 150, 'release does not stall video frames');
  assert.equal(await reel.locator('video').evaluate(v => v.preservesPitch), false);
  const workers = await page.evaluate(() => window.__speed.workers.length);
  await holdSpeed();
  await page.waitForFunction(() => document.querySelector('[data-pwacn-page="0"] video').playbackRate === 2);
  assert.equal(await page.evaluate(() => window.__speed.workers.length), workers, 'later holds reuse the prepared soundtrack');
  await page.waitForFunction(originalPitch);
  await surface.dispatchEvent('pointercancel', { pointerId: 7, button: 0 });
  await page.waitForFunction(() => document.querySelector('[data-pwacn-page="0"] video').playbackRate === 1);
  await page.waitForFunction(originalPitch);
  await surface.click();
  await reel.getByRole('button', { name: 'Mute video' }).click();
  await page.waitForFunction(allStopped);
  await reel.getByRole('button', { name: 'Unmute video' }).click();
  await surface.click();
  await page.waitForFunction(() => window.__audio.sources.some(r => !r.stopped));
  await reel.getByRole('button', { name: "View comments on maya.onfilm's post", exact: true }).click();
  await page.waitForFunction(allStopped);
  await page.getByRole('button', { name: 'Close comments' }).click();
  await page.getByRole('region', { name: 'Reels', exact: true }).press('ArrowDown');
  await page.waitForFunction(allStopped);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('video')].every(v => v.muted)), true);
  // A failed soundtrack remains muted rather than falling back to Now Playing.
  await page.evaluate(() => localStorage.removeItem('still-preferences'));
  failSound = true;
  await page.reload();
  await page.getByRole('button', { name: 'Reels', exact: true }).filter({ visible: true }).click();
  await reel.getByRole('button', { name: 'Unmute video' }).click();
  await page.getByRole('button', { name: 'Retry sound' }).waitFor();
  assert.equal(await reel.locator('video').evaluate(v => v.muted), true);
  await page.getByRole('button', { name: 'Retry sound' }).click();
  await reel.getByRole('button', { name: 'Play video', exact: true }).click();
  await page.waitForFunction(() => window.__audio.sources.some(r => !r.stopped));
  assert.equal(await page.getByRole('button', { name: 'Retry sound' }).count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
  console.log('Ambient reel audio passed in WebKit: uninterrupted 1× during delayed preparation, release cancellation, forward-only video frames, live-position handoff, original 440 Hz pitch at 2× and after release, no worker during 2×, muted native media, loop, pause/resume, mute, overlay and scrolling cleanup.');
} finally { await browser.close(); await rm(dir, { recursive: true, force: true }); }
