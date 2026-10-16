import { gestureCoordinator, gestures, shouldCommitGesture, springs } from '@pwacn/core';
import { animate, motion, useMotionValue } from 'motion/react';
import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

export interface SwipeableProps {
  children: ReactNode;
  action?: ReactNode;
  direction?: 'left' | 'right';
  actionWidth?: number;
  className?: string;
  style?: CSSProperties;
  onCommit?: () => void;
}

export function Swipeable({
  children,
  action,
  direction = 'left',
  actionWidth = 96,
  className,
  style,
  onCommit,
}: SwipeableProps) {
  const x = useMotionValue(0);
  const reduced = usePrefersReducedMotion();
  const session = useRef<{
    id: number;
    x: number;
    y: number;
    lastX: number;
    lastTime: number;
    velocity: number;
    active: boolean;
  } | null>(null);
  const sign = direction === 'left' ? -1 : 1;

  const settle = (target: number) =>
    animate(x, target, reduced ? { duration: 0.01 } : springs.snap);

  const end = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const current = session.current;
    if (!current || current.id !== event.pointerId) return;
    session.current = null;
    gestureCoordinator.release(event.pointerId, 'swipe-action');
    const progress = Math.abs(x.get()) / actionWidth;
    const velocity = current.velocity * sign;
    const commit =
      !cancelled &&
      shouldCommitGesture({
        progress,
        velocity,
        progressThreshold: gestures.swipe.commitDistance,
        velocityThreshold: gestures.swipe.velocityThreshold,
      });
    if (commit) {
      settle(sign * actionWidth).then(() => onCommit?.());
    } else {
      settle(0);
    }
  };

  return (
    <div
      className={className}
      data-pwacn-back-gesture="capture"
      style={{ position: 'relative', overflow: 'hidden', ...style }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: direction === 'left' ? 'flex-end' : 'flex-start',
        }}
      >
        {action}
      </div>
      <motion.div
        style={{ x, position: 'relative', touchAction: 'pan-y' }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          session.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            lastX: event.clientX,
            lastTime: performance.now(),
            velocity: 0,
            active: false,
          };
        }}
        onPointerMove={(event) => {
          const current = session.current;
          if (!current || current.id !== event.pointerId) return;
          const dx = event.clientX - current.x;
          const dy = event.clientY - current.y;
          if (!current.active) {
            if (Math.hypot(dx, dy) < gestures.swipe.activationDistance) return;
            if (Math.abs(dy) >= Math.abs(dx) || dx * sign <= 0) {
              session.current = null;
              return;
            }
            if (
              !gestureCoordinator.claim(event.pointerId, {
                owner: 'swipe-action',
                axis: 'x',
                priority: 10,
              })
            ) {
              session.current = null;
              return;
            }
            current.active = true;
          }
          const now = performance.now();
          current.velocity =
            ((event.clientX - current.lastX) / Math.max(1, now - current.lastTime)) *
            1000;
          current.lastX = event.clientX;
          current.lastTime = now;
          const raw = Math.max(0, dx * sign);
          const resisted =
            raw > actionWidth ? actionWidth + (raw - actionWidth) * 0.15 : raw;
          x.set(resisted * sign);
        }}
        onPointerUp={end}
        onPointerCancel={(event) => end(event, true)}
      >
        {children}
      </motion.div>
    </div>
  );
}
