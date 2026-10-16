import { gestures, movementDistance, springForMass, type MassClass } from '@pwacn/core';
import { motion } from 'motion/react';
import {
  forwardRef,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { emitFeelTelemetry } from './feel-telemetry';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

export type PressFeedback = 'scale' | 'opacity' | 'none';

export interface PressableProps {
  as?: ElementType;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  mass?: MassClass;
  feedback?: PressFeedback;
  movementTolerance?: number;
  onPress?: (event: MouseEvent<HTMLElement>) => void;
  onPressStart?: () => void;
  onPressEnd?: (cancelled: boolean) => void;
  onFeedback?: () => void;
  type?: 'button' | 'submit' | 'reset';
  role?: string;
  tabIndex?: number;
  'aria-label'?: string;
  'aria-pressed'?: boolean;
  'aria-checked'?: boolean;
  [key: `data-${string}`]: string | number | boolean | undefined;
}

type Point = { x: number; y: number };

export const Pressable = forwardRef<HTMLElement, PressableProps>(function Pressable(
  {
    as: Component = 'button',
    children,
    className,
    style,
    disabled = false,
    mass = 'control',
    feedback = 'scale',
    movementTolerance = gestures.press.movementTolerance,
    onPress,
    onPressStart,
    onPressEnd,
    onFeedback,
    type,
    role,
    tabIndex,
    ...rest
  },
  forwardedRef,
) {
  const MotionComponent = useMemo(() => motion.create(Component), [Component]);
  const reducedMotion = usePrefersReducedMotion();
  const [pressed, setPressed] = useState(false);
  const pressedRef = useRef(false);
  const pointerId = useRef<number | null>(null);
  const start = useRef<Point | null>(null);
  const cancelled = useRef(false);
  const contactTime = useRef<number | null>(null);

  const updatePressed = (next: boolean) => {
    pressedRef.current = next;
    setPressed(next);
  };

  useLayoutEffect(() => {
    if (!pressed || contactTime.current == null) return;
    emitFeelTelemetry({
      timestamp: performance.now(),
      primitive: 'Pressable',
      gesture: 'press',
      state: 'responding',
      surfaceScale: feedback === 'scale' && !reducedMotion ? 0.965 : 1,
    });
  }, [feedback, pressed, reducedMotion]);

  const finish = (wasCancelled: boolean) => {
    if (!pressedRef.current && pointerId.current === null) return;
    updatePressed(false);
    pointerId.current = null;
    start.current = null;
    cancelled.current = wasCancelled;
    emitFeelTelemetry({
      timestamp: performance.now(),
      primitive: 'Pressable',
      gesture: 'press',
      state: wasCancelled ? 'cancelled' : 'releasing',
      surfaceScale: 1,
      cancelled: wasCancelled,
    });
    onPressEnd?.(wasCancelled);
  };

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (disabled || event.button !== 0) return;
    pointerId.current = event.pointerId;
    start.current = { x: event.clientX, y: event.clientY };
    cancelled.current = false;
    contactTime.current = performance.now();
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic deterministic traces do not create a browser pointer capture record.
    }
    updatePressed(true);
    emitFeelTelemetry({
      timestamp: contactTime.current,
      primitive: 'Pressable',
      gesture: 'press',
      state: 'contact',
      pointerX: event.clientX,
      pointerY: event.clientY,
      surfaceScale: 1,
    });
    onFeedback?.();
    onPressStart?.();
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (pointerId.current !== event.pointerId || !start.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const outside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;
    const dragged =
      movementDistance(start.current, { x: event.clientX, y: event.clientY }) >
      movementTolerance;
    const invalid = outside || dragged;
    if (invalid === cancelled.current) return;
    cancelled.current = invalid;
    updatePressed(!invalid);
    emitFeelTelemetry({
      timestamp: performance.now(),
      primitive: 'Pressable',
      gesture: 'press',
      state: invalid ? 'cancelled' : 'responding',
      pointerX: event.clientX,
      pointerY: event.clientY,
      surfaceScale: invalid || reducedMotion || feedback !== 'scale' ? 1 : 0.965,
      cancelled: invalid,
    });
  };

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (disabled || cancelled.current) {
      event.preventDefault();
      cancelled.current = false;
      return;
    }
    onPress?.(event);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (disabled || event.repeat || !['Enter', ' '].includes(event.key)) return;
    contactTime.current = performance.now();
    updatePressed(true);
    emitFeelTelemetry({
      timestamp: contactTime.current,
      primitive: 'Pressable',
      gesture: 'keyboard-press',
      state: 'contact',
      surfaceScale: 1,
    });
    onFeedback?.();
    onPressStart?.();
    if (Component !== 'button') event.preventDefault();
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLElement>) => {
    if (disabled || !['Enter', ' '].includes(event.key)) return;
    updatePressed(false);
    emitFeelTelemetry({
      timestamp: performance.now(),
      primitive: 'Pressable',
      gesture: 'keyboard-press',
      state: 'releasing',
      surfaceScale: 1,
    });
    onPressEnd?.(false);
    if (Component !== 'button') {
      event.preventDefault();
      event.currentTarget.click();
    }
  };

  const animate = reducedMotion
    ? { opacity: pressed && feedback !== 'none' ? 0.72 : 1 }
    : {
        scale: pressed && feedback === 'scale' ? 0.965 : 1,
        opacity: pressed && feedback === 'opacity' ? 0.62 : 1,
      };

  const semanticProps =
    Component === 'button'
      ? { disabled, type: type ?? 'button', role }
      : {
          'aria-disabled': disabled || undefined,
          role: role ?? 'button',
          tabIndex: disabled ? -1 : (tabIndex ?? 0),
        };

  return (
    <MotionComponent
      ref={forwardedRef}
      className={className}
      style={{
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        ...style,
      }}
      animate={animate}
      transition={reducedMotion ? { duration: 0.01 } : springForMass('press', mass)}
      onAnimationComplete={() => {
        if (pressedRef.current) return;
        emitFeelTelemetry({
          timestamp: performance.now(),
          primitive: 'Pressable',
          gesture: 'press',
          state: 'complete',
          surfaceScale: 1,
        });
      }}
      data-pressed={pressed || undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event: PointerEvent<HTMLElement>) => {
        if (pointerId.current === event.pointerId) finish(cancelled.current);
      }}
      onPointerCancel={() => finish(true)}
      onLostPointerCapture={() => {
        if (pointerId.current !== null) finish(true);
      }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      {...semanticProps}
      {...rest}
    >
      {children}
    </MotionComponent>
  );
});
