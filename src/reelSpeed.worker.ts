import { Stretch } from '@soundtouchjs/core';

type Chunk = { samples: Float32Array<ArrayBuffer>; sampleRate: number; done: boolean };
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Chunk>) => void) | null;
  postMessage(message: { samples?: Float32Array<ArrayBuffer>; done?: boolean; error?: string }, transfer: Transferable[]): void;
};
let stretch: Stretch | undefined;

scope.onmessage = ({ data }) => {
  try {
    stretch ??= new Stretch({ sampleRate: data.sampleRate, createBuffers: true });
    stretch.tempo = 2;
    stretch.inputBuffer!.putSamples(data.samples);
    // Flush the final analysis window; the caller trims padding to exactly
    // half the original duration. No work runs on the live audio thread.
    if (data.done) stretch.inputBuffer!.putSamples(new Float32Array(stretch.sampleReq * 4));
    stretch.process();
    const output = stretch.outputBuffer!;
    const frames = output.frameCount;
    const samples = new Float32Array(frames * 2);
    output.extract(samples, 0, frames);
    output.receive(frames);
    scope.postMessage({ samples, done: data.done }, [samples.buffer]);
  } catch (error) {
    scope.postMessage({ error: String(error) }, []);
  }
};
