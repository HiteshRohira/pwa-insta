import {
  gestureCoordinator,
  gestures,
  haptics,
  shouldSheetCaptureScroll,
  sounds,
  springs,
} from '@pwacn/core';
import {
  AnimatePresence,
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useTransform,
} from 'motion/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useMobileViewport } from './use-mobile-viewport';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';
import { emitFeelTelemetry } from './feel-telemetry';

type SheetContextValue = {
  close: () => void;
  labelId: string;
  beginDrag: (event: React.PointerEvent | globalThis.PointerEvent) => void;
};
const SheetContext = createContext<SheetContextValue | null>(null);

const normalizeSnapPoints = (key: string) =>
  [
    ...new Set(key.split(',').map((point) => Math.min(1, Math.max(0.15, Number(point))))),
  ].sort((a, b) => b - a);

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** Content kept at the visible bottom edge through sheet snaps and drags. */
  footer?: ReactNode;
  title?: string;
  snapPoints?: number[];
  initialSnap?: number;
  className?: string;
  style?: CSSProperties;
  dismissible?: boolean;
  onSnapChange?: (snapPoint: number) => void;
}

export function BottomSheet({
  open,
  onOpenChange,
  children,
  footer,
  title = 'Sheet',
  snapPoints = [0.55, 0.9],
  initialSnap,
  className,
  style,
  dismissible = true,
  onSnapChange,
}: BottomSheetProps) {
  const reduced = usePrefersReducedMotion();
  const viewport = useMobileViewport();
  const y = useMotionValue(0);
  const controls = useDragControls();
  const labelId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const dragOrigin = useRef<{ pointerY: number; surfaceY: number } | null>(null);
  const motionState = useRef<'idle' | 'dragging' | 'settling'>('idle');
  const lastMotionFrame = useRef<number | null>(null);
  const motionToken = useRef(0);
  const activeAnimation = useRef<ReturnType<typeof animate> | null>(null);
  const handleDrag = useRef<{
    pointerId: number;
    startY: number;
    surfaceY: number;
    lastY: number;
    lastTime: number;
    velocity: number;
    responded: boolean;
  } | null>(null);
  const snapPointsKey = snapPoints.join(',');
  const normalizedSnaps = useMemo(
    () => normalizeSnapPoints(snapPointsKey),
    [snapPointsKey],
  );
  const [snap, setSnap] = useState(initialSnap ?? normalizedSnaps[0] ?? 0.9);
  const height = Math.max(240, viewport.height * (normalizedSnaps[0] ?? 0.9));
  const backdropOpacity = useTransform(y, [0, height], [1, 0]);
  const footerPadding = useTransform(
    y,
    (value) => `calc(env(safe-area-inset-bottom) + ${Math.max(0, value)}px)`,
  );
  const snapOffset = useCallback(
    (point: number) => Math.max(0, height - viewport.height * point),
    [height, viewport.height],
  );
  const settle = useCallback(
    (nextSnap: number, releaseVelocity = 0, onComplete?: () => void) => {
      setSnap(nextSnap);
      onSnapChange?.(nextSnap);
      const token = ++motionToken.current;
      activeAnimation.current = animate(
        y,
        snapOffset(nextSnap),
        reduced ? { duration: 0.01 } : { ...springs.sheet, velocity: releaseVelocity },
      );
      void activeAnimation.current.then(() => {
        if (token !== motionToken.current) return;
        motionState.current = 'idle';
        emitFeelTelemetry({
          timestamp: performance.now(),
          primitive: 'BottomSheet',
          gesture: 'drag-y',
          state: 'complete',
          surfaceY: y.get(),
          surfaceVelocityY: y.getVelocity(),
          activeSnapPoint: nextSnap,
          targetSnapPoint: nextSnap,
        });
        onComplete?.();
      });
    },
    [onSnapChange, reduced, snapOffset, y],
  );
  const close = useCallback(() => {
    sounds.play('close');
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const next = initialSnap ?? normalizedSnaps[0] ?? 0.9;
    setSnap(next);
    y.set(height);
    const frame = requestAnimationFrame(() => {
      sounds.play('open');
      motionState.current = 'settling';
      const token = ++motionToken.current;
      activeAnimation.current = animate(
        y,
        snapOffset(next),
        reduced ? { duration: 0.01 } : springs.sheet,
      );
      void activeAnimation.current.then(() => {
        if (token === motionToken.current) motionState.current = 'idle';
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [height, initialSnap, normalizedSnaps, open, reduced, snapOffset, y]);

  // Still patch: observe actual motion; do not wake the page at 60Hz while idle.
  useEffect(() => y.on('change', () => {
    if (motionState.current !== 'settling') return;
    const timestamp = performance.now();
    const previous = lastMotionFrame.current;
    lastMotionFrame.current = timestamp;
    emitFeelTelemetry({
      timestamp,
      primitive: 'BottomSheet',
      gesture: 'drag-y',
      state: 'settling',
      surfaceY: y.get(),
      surfaceVelocityY: y.getVelocity(),
      activeSnapPoint: snap,
      frameIntervalMs: previous == null ? undefined : timestamp - previous,
    });
  }), [snap, y]);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    const portalRoot = contentRef.current?.closest('.pwacn-sheet-layer');
    const siblings = [...document.body.children].filter((node) => node !== portalRoot);
    const previous = siblings.map((node) => ({
      node: node as HTMLElement,
      inert: (node as HTMLElement).inert,
      hidden: node.getAttribute('aria-hidden'),
    }));
    // Move focus before hiding the triggering subtree from accessibility.
    contentRef.current?.focus({ preventScroll: true });
    siblings.forEach((node) => {
      (node as HTMLElement).inert = true;
      node.setAttribute('aria-hidden', 'true');
    });
    document.documentElement.dataset.pwacnSheetOpen = '';
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) close();
      if (event.key !== 'Tab' || !contentRef.current) return;
      const focusable = [
        ...contentRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!focusable.length) return event.preventDefault();
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = previousOverflow;
      delete document.documentElement.dataset.pwacnSheetOpen;
      previous.forEach(({ node, inert, hidden }) => {
        node.inert = inert;
        if (hidden === null) node.removeAttribute('aria-hidden');
        else node.setAttribute('aria-hidden', hidden);
      });
      document.removeEventListener('keydown', escape);
      previousFocus.current?.focus();
    };
  }, [close, dismissible, open]);

  const beginDrag = (event: ReactPointerEvent | globalThis.PointerEvent) => {
    if (
      !gestureCoordinator.claim(event.pointerId, {
        owner: 'sheet',
        axis: 'y',
        priority: 20,
      })
    )
      return;
    if (motionState.current === 'settling') {
      activeAnimation.current?.stop();
      motionToken.current += 1;
      emitFeelTelemetry({
        timestamp: performance.now(),
        primitive: 'BottomSheet',
        gesture: 'drag-y',
        state: 'interrupted',
        pointerY: event.clientY,
        surfaceY: y.get(),
        surfaceVelocityY: y.getVelocity(),
        activeSnapPoint: snap,
        gestureOwner: 'sheet',
      });
    }
    controls.start(event);
  };

  useEffect(() => {
    const handle = handleRef.current;
    if (!open || !handle) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (
        !gestureCoordinator.claim(event.pointerId, {
          owner: 'sheet',
          axis: 'y',
          priority: 20,
        })
      )
        return;
      if (motionState.current === 'settling') {
        emitFeelTelemetry({
          timestamp: performance.now(),
          primitive: 'BottomSheet',
          gesture: 'drag-y',
          state: 'interrupted',
          pointerY: event.clientY,
          surfaceY: y.get(),
          surfaceVelocityY: y.getVelocity(),
          activeSnapPoint: snap,
          gestureOwner: 'sheet',
        });
      }
      activeAnimation.current?.stop();
      handleDrag.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        surfaceY: y.get(),
        lastY: event.clientY,
        lastTime: performance.now(),
        velocity: 0,
        responded: false,
      };
      motionState.current = 'dragging';
      emitFeelTelemetry({
        timestamp: performance.now(),
        primitive: 'BottomSheet',
        gesture: 'drag-y',
        state: 'contact',
        pointerY: event.clientY,
        surfaceY: y.get(),
        activeSnapPoint: snap,
        gestureOwner: 'sheet',
      });
    };
    const onPointerMove = (event: globalThis.PointerEvent) => {
      const drag = handleDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const timestamp = performance.now();
      const elapsed = Math.max(1, timestamp - drag.lastTime);
      drag.velocity = ((event.clientY - drag.lastY) / elapsed) * 1000;
      drag.lastY = event.clientY;
      drag.lastTime = timestamp;
      const surfaceY = Math.max(0, drag.surfaceY + event.clientY - drag.startY);
      y.set(surfaceY);
      if (!drag.responded) {
        drag.responded = true;
        emitFeelTelemetry({
          timestamp,
          primitive: 'BottomSheet',
          gesture: 'drag-y',
          state: 'responding',
          pointerY: event.clientY,
          surfaceY,
          activeSnapPoint: snap,
          gestureOwner: 'sheet',
        });
      }
      emitFeelTelemetry({
        timestamp,
        primitive: 'BottomSheet',
        gesture: 'drag-y',
        state: 'dragging',
        pointerY: event.clientY,
        surfaceY,
        pointerVelocityY: drag.velocity,
        surfaceVelocityY: y.getVelocity(),
        activeSnapPoint: snap,
        gestureOwner: 'sheet',
      });
      event.preventDefault();
    };
    const finish = (event: globalThis.PointerEvent) => {
      const drag = handleDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      handleDrag.current = null;
      gestureCoordinator.release(event.pointerId, 'sheet');
      const surfaceY = y.get();
      const dismissDistance = Math.min(260, Math.max(140, height * 0.34));
      const shouldDismiss =
        dismissible &&
        (surfaceY > snapOffset(snap) + dismissDistance ||
          drag.velocity > gestures.sheet.dismissVelocity);
      emitFeelTelemetry({
        timestamp: performance.now(),
        primitive: 'BottomSheet',
        gesture: 'drag-y',
        state: 'releasing',
        pointerY: event.clientY,
        surfaceY,
        pointerVelocityY: drag.velocity,
        surfaceVelocityY: y.getVelocity(),
        activeSnapPoint: snap,
        gestureOwner: 'sheet',
      });
      if (shouldDismiss) {
        haptics.impact('light');
        activeAnimation.current = animate(
          y,
          height,
          reduced ? { duration: 0.01 } : { ...springs.dismiss, velocity: drag.velocity },
        );
        void activeAnimation.current.then(() => {
          emitFeelTelemetry({
            timestamp: performance.now(),
            primitive: 'BottomSheet',
            gesture: 'drag-y',
            state: 'complete',
            surfaceY: y.get(),
            surfaceVelocityY: y.getVelocity(),
          });
          close();
        });
      } else {
        settle(snap, drag.velocity);
      }
    };
    handle.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      handle.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  });

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <SheetContext.Provider value={{ close, labelId, beginDrag }}>
          <motion.div
            className="pwacn-sheet-layer"
            style={{
              position: 'fixed',
              top: viewport.offsetTop,
              right: 0,
              left: 0,
              height: viewport.height,
              zIndex: 1000,
            }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1 }}
            transition={reduced ? { duration: 0.01 } : springs.sheet}
          >
            <motion.button
              type="button"
              aria-label="Close sheet"
              onClick={() => dismissible && close()}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduced ? { duration: 0.01 } : { duration: 0.2 }}
              style={{
                position: 'absolute',
                inset: 0,
                border: 0,
                background: 'rgb(0 0 0 / .42)',
                opacity: backdropOpacity,
              }}
            />
            <motion.div
              ref={contentRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={labelId}
              tabIndex={-1}
              className={className}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height,
                maxHeight:
                  'calc(var(--pwacn-viewport-height, 100dvh) - env(safe-area-inset-top))',
                paddingBottom: footer ? footerPadding : 'env(safe-area-inset-bottom)',
                boxSizing: 'border-box',
                display: footer ? 'flex' : undefined,
                flexDirection: footer ? 'column' : undefined,
                borderRadius: '24px 24px 0 0',
                color: 'var(--pwacn-sheet-foreground, CanvasText)',
                background: 'var(--pwacn-sheet-background, Canvas)',
                boxShadow: '0 -20px 70px rgb(0 0 0 / .2)',
                outline: 'none',
                y,
                ...style,
              }}
              initial={false}
              exit={{ y: height }}
              drag="y"
              dragControls={controls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: height }}
              dragElastic={{ top: 0.04, bottom: gestures.sheet.dragElastic }}
              onDragStart={(_, info) => {
                motionState.current = 'dragging';
                lastMotionFrame.current = performance.now();
                dragOrigin.current = { pointerY: info.point.y, surfaceY: y.get() };
              }}
              onDrag={(_, info) => {
                const timestamp = performance.now();
                lastMotionFrame.current = timestamp;
                const origin = dragOrigin.current;
                const trackingErrorPx = origin
                  ? info.point.y - origin.pointerY - (y.get() - origin.surfaceY)
                  : undefined;
                emitFeelTelemetry({
                  timestamp,
                  primitive: 'BottomSheet',
                  gesture: 'drag-y',
                  state: 'dragging',
                  pointerY: info.point.y,
                  surfaceY: y.get(),
                  pointerVelocityY: info.velocity.y,
                  surfaceVelocityY: y.getVelocity(),
                  trackingErrorPx,
                  activeSnapPoint: snap,
                  gestureOwner: 'sheet',
                });
              }}
              onDragEnd={(_, info) => {
                gestureCoordinator.reset();
                motionState.current = 'settling';
                lastMotionFrame.current = null;
                const current = y.get();
                const projected = current + info.velocity.y * 0.16;
                const lowestSnap = normalizedSnaps.at(-1) ?? snap;
                const atLowestSnap = snap === lowestSnap;
                const dismissDistance = Math.min(260, Math.max(140, height * 0.34));
                emitFeelTelemetry({
                  timestamp: performance.now(),
                  primitive: 'BottomSheet',
                  gesture: 'drag-y',
                  state: 'releasing',
                  pointerY: info.point.y,
                  surfaceY: current,
                  pointerVelocityY: info.velocity.y,
                  surfaceVelocityY: y.getVelocity(),
                  activeSnapPoint: snap,
                  gestureOwner: 'sheet',
                });
                if (
                  dismissible &&
                  ((atLowestSnap && projected > snapOffset(snap) + dismissDistance) ||
                    info.velocity.y > gestures.sheet.dismissVelocity)
                ) {
                  haptics.impact('light');
                  const token = ++motionToken.current;
                  activeAnimation.current = animate(
                    y,
                    height,
                    reduced
                      ? { duration: 0.01 }
                      : { ...springs.dismiss, velocity: info.velocity.y },
                  );
                  void activeAnimation.current.then(() => {
                    if (token !== motionToken.current) return;
                    emitFeelTelemetry({
                      timestamp: performance.now(),
                      primitive: 'BottomSheet',
                      gesture: 'drag-y',
                      state: 'complete',
                      surfaceY: y.get(),
                      surfaceVelocityY: y.getVelocity(),
                    });
                    close();
                  });
                  return;
                }
                const next = normalizedSnaps.reduce((nearest, point) =>
                  Math.abs(snapOffset(point) - projected) <
                  Math.abs(snapOffset(nearest) - projected)
                    ? point
                    : nearest,
                );
                if (next !== snap) haptics.selection();
                settle(next, info.velocity.y);
              }}
            >
              <div
                ref={handleRef}
                className="pwacn-sheet-handle-zone"
                style={{ padding: '14px 0 20px', cursor: 'grab', touchAction: 'none' }}
              >
                <div
                  style={{
                    width: 42,
                    height: 5,
                    borderRadius: 9,
                    background: 'var(--pwacn-sheet-handle, rgb(0 0 0 / .22))',
                    margin: 'auto',
                  }}
                />
              </div>
              <h2
                id={labelId}
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  overflow: 'hidden',
                  clip: 'rect(0 0 0 0)',
                }}
              >
                {title}
              </h2>
              {children}
              {footer ? <div data-pwacn-sheet-footer="">{footer}</div> : null}
            </motion.div>
          </motion.div>
        </SheetContext.Provider>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export function SheetScrollArea(props: HTMLAttributes<HTMLDivElement>) {
  const context = useContext(SheetContext);
  const pointer = useRef<{ id: number; y: number } | null>(null);
  return (
    <div
      {...props}
      data-pwacn-sheet-scroll=""
      onPointerDown={(event) => {
        props.onPointerDown?.(event);
        pointer.current = { id: event.pointerId, y: event.clientY };
      }}
      onPointerMove={(event) => {
        props.onPointerMove?.(event);
        const start = pointer.current;
        if (!start || start.id !== event.pointerId) return;
        const target = event.currentTarget;
        if (
          shouldSheetCaptureScroll({
            scrollTop: target.scrollTop,
            deltaY: event.clientY - start.y,
          })
        ) {
          context?.beginDrag(event);
          pointer.current = null;
        }
      }}
      onPointerUp={(event) => {
        props.onPointerUp?.(event);
        pointer.current = null;
        gestureCoordinator.release(event.pointerId, 'scroll');
      }}
      style={{
        overflowY: 'auto',
        overscrollBehavior: 'none',
        WebkitOverflowScrolling: 'touch',
        ...props.style,
      }}
    />
  );
}

export function SheetClose({ children, ...props }: HTMLAttributes<HTMLButtonElement>) {
  const context = useContext(SheetContext);
  return (
    <button {...props} type="button" onClick={context?.close}>
      {children}
    </button>
  );
}

export interface ActionSheetItem {
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export function ActionSheet({
  items,
  ...props
}: Omit<BottomSheetProps, 'children'> & { items: ActionSheetItem[] }) {
  return (
    <BottomSheet {...props} initialSnap={Math.min(0.75, 0.2 + items.length * 0.1)}>
      <div style={{ padding: '0 18px 18px' }}>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              item.onSelect();
              props.onOpenChange(false);
            }}
            style={{
              width: '100%',
              minHeight: 54,
              border: 0,
              borderBottom: '1px solid rgb(0 0 0 / .12)',
              background: 'transparent',
              color: item.destructive ? '#d83220' : 'inherit',
              textAlign: 'left',
              font: 'inherit',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

export function FullScreenModal(props: BottomSheetProps) {
  return (
    <BottomSheet
      {...props}
      snapPoints={[1]}
      initialSnap={1}
      style={{ borderRadius: 0, ...props.style }}
    />
  );
}
