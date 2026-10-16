import { gestureCoordinator, gestures, springs } from '@pwacn/core';
import { animate, motion, useMotionValue } from 'motion/react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

export type SwipeTabItem<T extends string> = {
  value: T;
  label: string;
  content: ReactNode;
};

export interface SwipeTabsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  items: SwipeTabItem<T>[];
  className?: string;
  ariaLabel?: string;
}

export function SwipeTabs<T extends string>({
  value,
  onValueChange,
  items,
  className,
  ariaLabel = 'Content tabs',
}: SwipeTabsProps<T>) {
  const reduced = usePrefersReducedMotion();
  const instanceId = useId().replaceAll(':', '');
  const viewportRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const x = useMotionValue(0);
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    items.findIndex((item) => item.value === value),
  );
  const indexRef = useRef(index);
  const session = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: number;
    lastX: number;
    lastTime: number;
    velocity: number;
    intent: 'pending' | 'horizontal' | 'vertical';
  } | null>(null);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    indexRef.current = index;
    if (!width) return;
    animate(x, -index * width, reduced ? { duration: 0.01 } : springs.navigation);
  }, [index, reduced, width, x]);

  const settle = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(items.length - 1, nextIndex));
    animate(x, -clamped * width, reduced ? { duration: 0.01 } : springs.navigation);
    if (clamped !== indexRef.current) onValueChange(items[clamped]!.value);
  };

  const selectFromKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    itemIndex: number,
  ) => {
    const lastIndex = items.length - 1;
    const nextIndex =
      event.key === 'ArrowRight'
        ? (itemIndex + 1) % items.length
        : event.key === 'ArrowLeft'
          ? (itemIndex - 1 + items.length) % items.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? lastIndex
              : null;
    if (nextIndex === null) return;
    event.preventDefault();
    tabRefs.current[nextIndex]?.focus();
    onValueChange(items[nextIndex]!.value);
  };

  return (
    <div className={className}>
      <div className="pwacn-tab-list" role="tablist" aria-label={ariaLabel}>
        {items.map((item, itemIndex) => (
          <button
            key={item.value}
            ref={(element) => {
              tabRefs.current[itemIndex] = element;
            }}
            id={`pwacn-tab-${instanceId}-${item.value}`}
            type="button"
            role="tab"
            aria-selected={item.value === value}
            aria-controls={`pwacn-tab-panel-${instanceId}-${item.value}`}
            tabIndex={item.value === value ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            onKeyDown={(event) => selectFromKeyboard(event, itemIndex)}
          >
            {item.label}
            {item.value === value ? (
              <motion.span
                className="pwacn-tab-indicator"
                layoutId="pwacn-tab-indicator"
              />
            ) : null}
          </button>
        ))}
      </div>
      <div
        ref={viewportRef}
        className="pwacn-tab-viewport"
        style={{ overflow: 'hidden', touchAction: 'pan-y' }}
        onPointerDown={(event) => {
          if (event.button !== 0 || !width) return;
          x.stop();
          session.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            origin: x.get(),
            lastX: event.clientX,
            lastTime: performance.now(),
            velocity: 0,
            intent: 'pending',
          };
        }}
        onPointerMove={(event) => {
          const current = session.current;
          if (!current || current.pointerId !== event.pointerId) return;
          const deltaX = event.clientX - current.startX;
          const deltaY = event.clientY - current.startY;
          if (current.intent === 'pending') {
            if (Math.hypot(deltaX, deltaY) < gestures.swipe.activationDistance) return;
            current.intent =
              Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
            if (current.intent === 'vertical') return;
            if (
              !gestureCoordinator.claim(event.pointerId, {
                owner: 'tabs',
                axis: 'x',
                priority: 5,
              })
            ) {
              session.current = null;
              return;
            }
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          if (current.intent !== 'horizontal') return;
          const min = -(items.length - 1) * width;
          const raw = current.origin + deltaX;
          const next = raw > 0 ? raw * 0.12 : raw < min ? min + (raw - min) * 0.12 : raw;
          const now = performance.now();
          current.velocity =
            ((event.clientX - current.lastX) / Math.max(1, now - current.lastTime)) *
            1000;
          current.lastX = event.clientX;
          current.lastTime = now;
          x.set(next);
        }}
        onPointerUp={(event) => {
          const current = session.current;
          if (!current || current.pointerId !== event.pointerId) return;
          session.current = null;
          gestureCoordinator.release(event.pointerId, 'tabs');
          if (current.intent !== 'horizontal') return;
          const travel = x.get() - current.origin;
          const progress = Math.abs(travel) / width;
          const direction = travel < 0 ? 1 : -1;
          const velocityInDirection = -current.velocity * direction;
          const commit =
            progress > gestures.swipe.commitDistance ||
            velocityInDirection > gestures.swipe.velocityThreshold;
          settle(indexRef.current + (commit ? direction : 0));
        }}
        onPointerCancel={() => {
          session.current = null;
          gestureCoordinator.reset();
          settle(indexRef.current);
        }}
      >
        <motion.div
          className="pwacn-tab-track"
          style={{ x, display: 'flex', alignItems: 'flex-start' }}
        >
          {items.map((item) => (
            <div
              key={item.value}
              id={`pwacn-tab-panel-${instanceId}-${item.value}`}
              role="tabpanel"
              aria-labelledby={`pwacn-tab-${instanceId}-${item.value}`}
              aria-hidden={item.value !== value}
              inert={item.value !== value}
              className="pwacn-tab-panel"
              style={{ width: '100%', flex: '0 0 100%' }}
            >
              {item.content}
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
