import {
  applyElasticBoundary,
  directionLock,
  gestures,
  springs,
  type Axis,
} from '@pwacn/core';
import { animate, motion, useMotionValue, type HTMLMotionProps } from 'motion/react';
import { forwardRef, useRef, type PointerEvent } from 'react';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

export interface DraggableProps extends Omit<
  HTMLMotionProps<'div'>,
  'onDrag' | 'onDragEnd'
> {
  axis?: Axis;
  min?: number;
  max?: number;
  elasticity?: number;
  directionLockThreshold?: number;
  onDrag?: (value: number, velocity: number) => void;
  onDragEnd?: (value: number, velocity: number) => void;
}

export const Draggable = forwardRef<HTMLDivElement, DraggableProps>(function Draggable(
  {
    axis = 'x',
    min = Number.NEGATIVE_INFINITY,
    max = Number.POSITIVE_INFINITY,
    elasticity = gestures.sheet.dragElastic,
    directionLockThreshold = gestures.swipe.activationDistance,
    onDrag,
    onDragEnd,
    style,
    ...props
  },
  ref,
) {
  const value = useMotionValue(0);
  const reduced = usePrefersReducedMotion();
  const session = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startValue: number;
    lastValue: number;
    lastTime: number;
    velocity: number;
    locked: Axis | null;
  } | null>(null);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = session.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    current.locked ??= directionLock(dx, dy, directionLockThreshold);
    if (!current.locked || current.locked !== axis) return;
    event.preventDefault();
    const delta = axis === 'x' ? dx : dy;
    const next = applyElasticBoundary(current.startValue + delta, min, max, elasticity);
    const now = performance.now();
    const elapsed = Math.max(1, now - current.lastTime);
    current.velocity = ((next - current.lastValue) / elapsed) * 1000;
    current.lastValue = next;
    current.lastTime = now;
    value.set(next);
    onDrag?.(next, current.velocity);
  };

  const finish = (event: PointerEvent<HTMLDivElement>) => {
    const current = session.current;
    if (!current || current.pointerId !== event.pointerId) return;
    session.current = null;
    onDragEnd?.(value.get(), current.velocity);
  };

  return (
    <motion.div
      ref={ref}
      {...props}
      style={{ ...style, [axis]: value, touchAction: axis === 'x' ? 'pan-y' : 'pan-x' }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        animate(value, value.get(), { duration: 0 });
        session.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startValue: value.get(),
          lastValue: value.get(),
          lastTime: performance.now(),
          velocity: 0,
          locked: null,
        };
      }}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={(event) => {
        finish(event);
        animate(value, 0, reduced ? { duration: 0.01 } : springs.rebound);
      }}
    />
  );
});
