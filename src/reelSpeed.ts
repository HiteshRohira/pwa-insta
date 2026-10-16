// Prepare only on demand. One second of PCM is in flight at a time, rather
// than duplicating the entire decoded soundtrack in the worker.
export function prepareReelSpeed(input: AudioBuffer, signal: AbortSignal): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const channels = Math.min(input.numberOfChannels, 2);
    const output = new AudioBuffer({ length: Math.ceil(input.length / 2),
      sampleRate: input.sampleRate, numberOfChannels: channels });
    const left = input.getChannelData(0);
    const right = input.getChannelData(channels - 1);
    const worker = new Worker(new URL('./reelSpeed.worker.ts', import.meta.url), { type: 'module' });
    let read = 0;
    let written = 0;
    const close = () => { worker.terminate(); signal.removeEventListener('abort', abort); };
    const abort = () => { close(); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = event => { close(); reject(new Error(event.message)); };
    const send = () => {
      const frames = Math.min(input.sampleRate, input.length - read);
      const samples = new Float32Array(frames * 2);
      for (let i = 0; i < frames; i++) {
        samples[i * 2] = left[read + i];
        samples[i * 2 + 1] = right[read + i];
      }
      read += frames;
      worker.postMessage({ samples, sampleRate: input.sampleRate, done: read === input.length }, [samples.buffer]);
    };
    worker.onmessage = ({ data }: MessageEvent<{ samples: Float32Array; done: boolean; error?: string }>) => {
      if (signal.aborted) return;
      if (data.error) { close(); reject(new Error(data.error)); return; }
      const count = Math.min(data.samples.length / 2, output.length - written);
      for (let channel = 0; channel < channels; channel++) {
        const destination = output.getChannelData(channel);
        for (let i = 0; i < count; i++) destination[written + i] = data.samples[i * 2 + channel];
      }
      written += count;
      if (data.done) {
        close();
        if (written < output.length) reject(new Error('Incomplete speed soundtrack'));
        else resolve(output);
      } else send();
    };
    send();
  });
}
