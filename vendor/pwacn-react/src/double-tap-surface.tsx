import { useRef, type ReactNode } from 'react';

export interface DoubleTapSurfaceProps {
  children: ReactNode;
  onDoubleTap: () => void;
  className?: string;
  ariaLabel: string;
}

/** Recognizes a double tap without turning a scroll gesture into an action. */
export function DoubleTapSurface({
  children,
  onDoubleTap,
  className,
  ariaLabel,
}: DoubleTapSurfaceProps) {
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);

  return (
    <div
      className={className}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      data-pwacn-double-tap-surface=""
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        start.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const point = start.current;
        start.current = null;
        if (!point || point.id !== event.pointerId) return;
        if (Math.hypot(event.clientX - point.x, event.clientY - point.y) > 12) {
          lastTap.current = null;
          return;
        }
        const now = performance.now();
        const previous = lastTap.current;
        if (
          previous &&
          now - previous.time < 320 &&
          Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 48
        ) {
          lastTap.current = null;
          onDoubleTap();
        } else {
          lastTap.current = { time: now, x: event.clientX, y: event.clientY };
        }
      }}
      onPointerCancel={() => {
        start.current = null;
        lastTap.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onDoubleTap();
      }}
      style={{ touchAction: 'pan-y', WebkitTapHighlightColor: 'transparent' }}
    >
      {children}
    </div>
  );
}
