import { useEffect, useMemo, useRef, useState } from 'react';

export type FeelTelemetryState =
  | 'contact'
  | 'responding'
  | 'dragging'
  | 'releasing'
  | 'settling'
  | 'complete'
  | 'interrupted'
  | 'cancelled'
  | 'route-commit';

export type FeelTelemetrySample = Readonly<{
  timestamp: number;
  primitive: string;
  gesture: string;
  state: FeelTelemetryState;
  axis?: 'x' | 'y';
  pointerX?: number;
  pointerY?: number;
  surfaceX?: number;
  surfaceY?: number;
  surfaceScale?: number;
  pointerVelocityX?: number;
  pointerVelocityY?: number;
  surfaceVelocityX?: number;
  surfaceVelocityY?: number;
  trackingErrorPx?: number;
  activeSnapPoint?: number;
  targetSnapPoint?: number;
  gestureOwner?: string;
  frameIntervalMs?: number;
  cancelled?: boolean;
}>;

export type FeelTelemetrySummary = Readonly<{
  sampleCount: number;
  eventToCommitMs: number | null;
  meanTrackingErrorPx: number | null;
  p95TrackingErrorPx: number | null;
  releaseVelocityPxPerSec: number | null;
  animationInitialVelocityPxPerSec: number | null;
  velocityContinuity: number | null;
  settleTimeMs: number | null;
  longFrames: number;
  interruptions: number;
  gestureTransfers: string[];
}>;

type Subscriber = (sample: FeelTelemetrySample) => void;

const subscribers = new Set<Subscriber>();

export function emitFeelTelemetry(sample: FeelTelemetrySample) {
  subscribers.forEach((subscriber) => subscriber(sample));
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent('pwacn:feel', { detail: sample }));
}

export function subscribeFeelTelemetry(subscriber: Subscriber) {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

export function summarizeFeelTelemetry(
  samples: readonly FeelTelemetrySample[],
): FeelTelemetrySummary {
  const tracking = samples
    .filter((sample) => sample.state === 'dragging' && sample.trackingErrorPx != null)
    .map((sample) => Math.abs(sample.trackingErrorPx ?? 0))
    .sort((a, b) => a - b);
  const release = [...samples].reverse().find((sample) => sample.state === 'releasing');
  const initialAnimation = samples.find(
    (sample) =>
      sample.state === 'settling' &&
      release != null &&
      sample.timestamp >= release.timestamp,
  );
  const complete = [...samples].reverse().find((sample) => sample.state === 'complete');
  const contact = samples.find((sample) => sample.state === 'contact');
  const response = samples.find((sample) => sample.state === 'responding');
  const axis = release?.axis ?? initialAnimation?.axis ?? 'y';
  const releaseVelocity = release
    ? axis === 'x'
      ? (release.pointerVelocityX ?? null)
      : (release.pointerVelocityY ?? null)
    : null;
  const initialVelocity = initialAnimation
    ? axis === 'x'
      ? (initialAnimation.surfaceVelocityX ?? null)
      : (initialAnimation.surfaceVelocityY ?? null)
    : null;
  const gestureTransfers = [
    ...new Set(
      samples
        .map((sample) => sample.gestureOwner)
        .filter((owner): owner is string => owner != null),
    ),
  ];
  return {
    sampleCount: samples.length,
    eventToCommitMs:
      contact && response ? Math.max(0, response.timestamp - contact.timestamp) : null,
    meanTrackingErrorPx: tracking.length
      ? tracking.reduce((total, value) => total + value, 0) / tracking.length
      : null,
    p95TrackingErrorPx: tracking.length
      ? (tracking[Math.min(tracking.length - 1, Math.floor(tracking.length * 0.95))] ??
        null)
      : null,
    releaseVelocityPxPerSec: releaseVelocity,
    animationInitialVelocityPxPerSec: initialVelocity,
    velocityContinuity:
      releaseVelocity && initialVelocity != null
        ? Math.abs(initialVelocity / releaseVelocity)
        : null,
    settleTimeMs:
      release && complete ? Math.max(0, complete.timestamp - release.timestamp) : null,
    longFrames: samples.filter((sample) => (sample.frameIntervalMs ?? 0) > 20).length,
    interruptions: samples.filter((sample) => sample.state === 'interrupted').length,
    gestureTransfers,
  };
}

export function useFeelTelemetry(primitive?: string, limit = 900) {
  const samplesRef = useRef<FeelTelemetrySample[]>([]);
  const [samples, setSamples] = useState<FeelTelemetrySample[]>([]);
  const [current, setCurrent] = useState<FeelTelemetrySample | null>(null);

  useEffect(
    () =>
      subscribeFeelTelemetry((sample) => {
        if (primitive && sample.primitive !== primitive) return;
        const next = [...samplesRef.current, sample].slice(-limit);
        samplesRef.current = next;
        setSamples(next);
        setCurrent(sample);
      }),
    [limit, primitive],
  );

  return {
    current,
    samples,
    summary: useMemo(() => summarizeFeelTelemetry(samples), [samples]),
    clear: () => {
      samplesRef.current = [];
      setSamples([]);
      setCurrent(null);
    },
  };
}
