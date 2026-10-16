import { prepareReelSpeed } from './reelSpeed';

// iOS registers audible media elements with Now Playing. Keep the inline
// picture muted and play its decoded soundtrack through ambient Web Audio.
// Do not use a hidden <audio>, a playback audio session, or a native fallback:
// those would put the reel back in the Dynamic Island.
export const usesAmbientReelAudio = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let context: AudioContext | undefined;
let activeSources = 0;
function audioContext() {
  if (!context) {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
    context = new AudioContext();
  }
  return context;
}

// Invoke synchronously in the tap handler, before fetching/decoding anything.
export function unlockReelAudio() {
  try { return audioContext().resume(); }
  catch (error) { return Promise.reject(error); }
}

const MAX_BYTES = 24 * 1024 * 1024;
const MAX_SECONDS = 180;
async function soundtrack(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, credentials: 'same-origin' });
  if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES)
    throw new Error('Soundtrack unavailable or too large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Soundtrack unavailable');
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new Error('Soundtrack too large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const buffer = await audioContext().decodeAudioData(await new Blob(chunks).arrayBuffer());
  if (buffer.duration > MAX_SECONDS) throw new Error('Soundtrack too long');
  return buffer;
}

export class ReelAudio {
  private abort = new AbortController();
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  private gain?: GainNode;
  private fastBuffer?: AudioBuffer;
  private speedAbort?: AbortController;
  private speedRequested = false;
  private speedFailed = false;
  private loading = false;
  private resuming = false;
  private failed = false;
  private muted = true;
  private disposed = false;
  private stalled = false;
  private offset = 0;
  private started = 0;
  private rate = 1;
  private listeners: [string, () => void][];

  constructor(private video: HTMLVideoElement, private url: string, private onError: () => void,
    private onSpeedError: () => void = () => {}) {
    this.listeners = [
      ['playing', () => { this.stalled = false; this.sync(true); }],
      ['pause', () => this.stop()],
      ['waiting', () => { this.stalled = true; this.stop(); }],
      ['seeking', () => this.stop()],
      ['seeked', () => this.sync(true)],
      ['ratechange', () => this.sync()],
      ['timeupdate', () => this.sync()],
      ['ended', () => this.stop()],
      ['emptied', () => this.stop()],
    ];
    for (const [event, listener] of this.listeners) video.addEventListener(event, listener);
    document.addEventListener('visibilitychange', this.visibility);
  }

  private visibility = () => { if (document.hidden) this.stop(); };

  setMuted(muted: boolean) {
    this.muted = muted;
    this.updateSpeed();
    if (muted) this.stop();
    else { void this.load(); this.sync(); }
  }

  setSpeed(fast: boolean) {
    this.speedRequested = fast;
    if (!fast) {
      this.speedAbort?.abort();
      this.speedAbort = undefined;
      this.speedFailed = false;
    }
    this.updateSpeed();
  }

  private updateSpeed() {
    if (this.disposed) return;
    const rate = this.speedRequested && (this.muted || this.fastBuffer) ? 2 : 1;
    if (this.video.playbackRate !== rate) {
      this.video.playbackRate = rate;
      this.sync();
    }
    if (!this.speedRequested || this.muted || !this.buffer || this.fastBuffer
      || this.speedAbort || this.speedFailed) return;
    const abort = new AbortController();
    this.speedAbort = abort;
    void prepareReelSpeed(this.buffer, abort.signal).then(buffer => {
      if (abort.signal.aborted || this.disposed) return;
      this.fastBuffer = buffer;
      this.updateSpeed();
    }).catch(() => {
      if (abort.signal.aborted || this.disposed) return;
      this.speedFailed = true;
      this.onSpeedError();
    }).finally(() => { if (this.speedAbort === abort) this.speedAbort = undefined; });
  }

  retry() { this.failed = false; void this.load(); }

  private async load() {
    if (this.loading || this.buffer || this.failed || this.disposed || this.muted) return;
    this.loading = true;
    try {
      if (this.video.duration > MAX_SECONDS) throw new Error('Soundtrack too long');
      const buffer = await soundtrack(this.url, this.abort.signal);
      if (this.disposed) return;
      this.buffer = buffer;
      this.sync(true);
      this.updateSpeed();
    } catch {
      if (!this.disposed) { this.failed = true; this.onError(); }
    } finally {
      this.loading = false;
      if (!activeSources && context?.state === 'running') void context.suspend().catch(() => {});
    }
  }

  private sync(force = false) {
    const video = this.video;
    if (this.disposed || this.muted || document.hidden || video.paused || video.seeking
      || this.stalled || video.readyState < 3 || !this.buffer) { this.stop(); return; }
    const c = audioContext();
    if (c.state !== 'running') {
      if (!this.resuming) {
        this.resuming = true;
        void c.resume().then(() => {
          this.resuming = false;
          if (c.state === 'running') this.sync(true);
        }).catch(() => { this.resuming = false; if (!this.disposed) this.onError(); });
      }
      return;
    }
    const position = video.currentTime % this.buffer.duration;
    const fast = video.playbackRate === 2 && this.fastBuffer;
    const buffer = fast || this.buffer;
    if (this.source && this.source.buffer === buffer && this.rate === video.playbackRate && !force) {
      const predicted = (this.offset + (c.currentTime - this.started) * this.rate) % this.buffer.duration;
      const drift = Math.abs(predicted - position);
      if (Math.min(drift, this.buffer.duration - drift) < .15) return;
    }
    const handoff = this.source && this.rate !== video.playbackRate ? .008 : 0;
    this.stop(handoff);
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = video.loop;
    // The prepared buffer is already twice as fast, with its original pitch.
    // Always play PCM at its native sample rate: no processor startup latency.
    const gain = c.createGain();
    source.connect(gain);
    gain.connect(c.destination);
    if (handoff) {
      gain.gain.setValueAtTime(0, c.currentTime);
      gain.gain.linearRampToValueAtTime(1, c.currentTime + handoff);
    }
    this.gain = gain;
    this.offset = position;
    this.started = c.currentTime;
    this.rate = video.playbackRate;
    this.source = source;
    activeSources++;
    source.onended = () => { if (this.source === source) this.stop(); };
    source.start(0, fast ? position / 2 : position);
  }

  private stop(fade = 0) {
    if (!this.source) return;
    const source = this.source;
    const gain = this.gain;
    this.source = undefined;
    this.gain = undefined;
    const cleanup = () => {
      source.onended = null;
      source.disconnect();
      gain?.disconnect();
      activeSources--;
      // A resync may create another source in this same turn.
      queueMicrotask(() => {
        if (!activeSources && context?.state === 'running') void context.suspend().catch(() => {});
      });
    };
    if (fade && gain) {
      const now = audioContext().currentTime;
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + fade);
      source.onended = cleanup;
      source.stop(now + fade);
    } else {
      source.onended = null;
      source.stop();
      cleanup();
    }
  }

  dispose() {
    this.disposed = true;
    this.abort.abort();
    this.speedAbort?.abort();
    this.stop();
    this.buffer = undefined;
    this.fastBuffer = undefined;
    for (const [event, listener] of this.listeners) this.video.removeEventListener(event, listener);
    document.removeEventListener('visibilitychange', this.visibility);
  }
}
