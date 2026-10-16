import {
  gestureCoordinator,
  gestures,
  springs,
  stackReducer,
  type Presentation,
  type StackEntry,
  type StackState,
} from '@pwacn/core';
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from 'motion/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { emitFeelTelemetry } from './feel-telemetry';
import { installIOSOverscrollGuard } from './ios-overscroll-guard';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

type ScreenData = { node: ReactNode };
type EntryOptions = { key?: string; pathname?: string; presentation?: Presentation };
type Navigation = {
  push: (node: ReactNode, options?: EntryOptions) => void;
  pop: (options?: { interactive?: boolean }) => void;
  replace: (node: ReactNode, options?: EntryOptions) => void;
  canGoBack: boolean;
  pathname: string;
};
const NavigationContext = createContext<Navigation | null>(null);

export function useMobileStack(): Navigation {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('useMobileStack must be used inside MobileStack');
  return context;
}

type Drag = {
  pointerId: number;
  startX: number;
  startY: number;
  origin: number;
  lastX: number;
  lastTime: number;
  velocity: number;
  axis: 'x' | 'y' | null;
  responded: boolean;
};

function StackScreen({
  entry,
  active,
  behind,
  modal,
  depth,
  zIndex,
  reduced,
  interactive,
  progress,
  width,
  edgeBack,
  backGestureRegion,
  onPointerDown,
  screenRefs,
}: {
  entry: StackEntry<ScreenData>;
  active: boolean;
  behind: boolean;
  modal: boolean;
  depth: number;
  zIndex: number;
  reduced: boolean;
  interactive: boolean;
  progress: MotionValue<number>;
  width: number;
  edgeBack: boolean;
  backGestureRegion: 'edge' | 'screen';
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  screenRefs: { current: Map<string, HTMLDivElement> };
}) {
  const foregroundX = useTransform(progress, (value) => value);
  const backgroundX = useTransform(progress, (value) => -width * 0.24 + value * 0.24);
  const canDrag = active && edgeBack && depth > 1 && !modal;
  return (
    <motion.div
      ref={(node) => {
        if (node) screenRefs.current.set(entry.key, node);
        else screenRefs.current.delete(entry.key);
      }}
      data-pwacn-screen={active ? 'active' : 'preserved'}
      data-pwacn-edge-back={canDrag && backGestureRegion === 'edge' ? '' : undefined}
      data-pwacn-back-surface={canDrag && backGestureRegion === 'screen' ? '' : undefined}
      aria-hidden={!active}
      inert={!active}
      initial={
        depth === 1
          ? false
          : reduced
            ? { opacity: 0 }
            : { x: modal ? 0 : '100%', y: modal ? '100%' : 0 }
      }
      animate={
        interactive && (active || behind)
          ? false
          : active
            ? { x: 0, y: 0, scale: 1, opacity: 1 }
            : { x: modal ? 0 : '-24%', y: 0, scale: modal ? 0.96 : 1, opacity: 1 }
      }
      exit={
        reduced
          ? { opacity: 0 }
          : { x: modal ? 0 : '100%', y: modal ? '100%' : 0, opacity: 1 }
      }
      transition={reduced ? { duration: 0.01 } : springs.navigation}
      onPointerDown={canDrag ? onPointerDown : undefined}
      style={{
        ...(interactive && active
          ? { x: foregroundX }
          : interactive && behind
            ? { x: backgroundX }
            : {}),
        position: 'absolute',
        inset: 0,
        minHeight: '100%',
        pointerEvents: active ? 'auto' : 'none',
        overflow: 'hidden',
        touchAction: canDrag && backGestureRegion === 'screen' ? 'pan-y' : undefined,
        background: 'var(--pwacn-screen-background, #f2f2f7)',
        boxShadow: active && depth > 1 ? '-12px 0 28px rgb(0 0 0 / .14)' : 'none',
        zIndex,
      }}
    >
      {entry.data?.node}
    </motion.div>
  );
}

/**
 * A preserved screen stack. `history="browser"` adds same-URL entries solely to adapt
 * platform Back; the stack owns screens and animation. `history="memory"` is fully local.
 * An explicit pathname is optional and changes the URL only at navigation commitment.
 */
export function MobileStack({
  initialScreen,
  edgeBack = true,
  backGestureRegion = 'edge',
  maxMountedScreens = 3,
  history = 'browser',
}: {
  initialScreen: ReactNode;
  edgeBack?: boolean;
  backGestureRegion?: 'edge' | 'screen';
  maxMountedScreens?: number;
  history?: 'browser' | 'memory';
}) {
  const reduced = usePrefersReducedMotion();
  const screenRefs = useRef(new Map<string, HTMLDivElement>());
  const entryCache = useRef(new Map<string, StackEntry<ScreenData>>());
  const stackRef = useRef<HTMLDivElement>(null);
  const progress = useMotionValue(0);
  const drag = useRef<Drag | null>(null);
  const settle = useRef<AnimationPlaybackControls | null>(null);
  const generation = useRef(0);
  const pendingBack = useRef(false);
  const gestureCommitted = useRef(false);
  const [interactive, setInteractive] = useState(false);
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? 390 : window.innerWidth,
  );
  const [state, dispatch] = useReducer(stackReducer<ScreenData>, {
    entries: [
      {
        key: 'root',
        pathname: typeof window === 'undefined' ? '/' : window.location.pathname,
        presentation: 'push',
        data: { node: initialScreen },
      },
    ],
    direction: 'replace',
  } satisfies StackState<ScreenData>);
  const entriesRef = useRef(state.entries);
  entriesRef.current = state.entries;
  const rootEntry = useRef(state.entries[0]);

  useLayoutEffect(() => {
    const node = stackRef.current;
    if (!node) return;
    const update = () => setWidth(node.getBoundingClientRect().width);
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = stackRef.current;
    if (node) return installIOSOverscrollGuard(node);
  }, []);

  const abortGesture = useCallback(() => {
    generation.current += 1;
    settle.current?.stop();
    settle.current = null;
    if (drag.current) gestureCoordinator.release(drag.current.pointerId, 'edge-back');
    drag.current = null;
    progress.set(0);
    setInteractive(false);
  }, [progress]);

  const makeEntry = useCallback(
    (node: ReactNode, options?: EntryOptions): StackEntry<ScreenData> => ({
      key: options?.key ?? crypto.randomUUID(),
      pathname: options?.pathname ?? window.location.pathname,
      presentation: options?.presentation ?? 'push',
      data: { node },
    }),
    [],
  );

  const commitPop = useCallback(
    (alreadyAnimated = false) => {
      if (entriesRef.current.length <= 1 || pendingBack.current) return;
      if (history === 'browser') {
        gestureCommitted.current = alreadyAnimated;
        pendingBack.current = true;
        window.history.back();
      } else if (alreadyAnimated) {
        dispatch({ type: 'pop' });
        progress.set(0);
        setInteractive(false);
      } else {
        setInteractive(true);
        const token = ++generation.current;
        const control = animate(
          progress,
          width,
          reduced ? { duration: 0.01 } : springs.navigation,
        );
        settle.current = control;
        void control.then(() => {
          if (token !== generation.current) return;
          settle.current = null;
          dispatch({ type: 'pop' });
          progress.set(0);
          setInteractive(false);
        });
      }
    },
    [history, progress, reduced, width],
  );

  const navigation = useMemo<Navigation>(() => {
    const saveActiveScroll = () => {
      const active = entriesRef.current.at(-1);
      const host = active ? screenRefs.current.get(active.key) : undefined;
      const scroll = host?.querySelector<HTMLElement>(
        '[data-pwacn-scroll],.settings-scroll,.detail-scroll',
      );
      if (active && scroll)
        dispatch({
          type: 'set-scroll',
          key: active.key,
          scrollPosition: scroll.scrollTop,
        });
    };
    return {
      push: (node, options) => {
        abortGesture();
        saveActiveScroll();
        const entry = makeEntry(node, options);
        entryCache.current.set(entry.key, entry);
        dispatch({ type: 'push', entry });
        if (history === 'browser')
          window.history.pushState(
            { pwacn: true, pwacnKey: entry.key },
            '',
            entry.pathname,
          );
      },
      pop: (options) => {
        if (!options?.interactive) abortGesture();
        commitPop(options?.interactive);
      },
      replace: (node, options) => {
        abortGesture();
        const entry = makeEntry(node, options);
        entryCache.current.set(entry.key, entry);
        dispatch({ type: 'replace', entry });
        if (history === 'browser')
          window.history.replaceState(
            { pwacn: true, pwacnKey: entry.key },
            '',
            entry.pathname,
          );
      },
      canGoBack: state.entries.length > 1,
      pathname: state.entries.at(-1)?.pathname ?? '/',
    };
  }, [abortGesture, commitPop, history, makeEntry, state.entries]);

  useEffect(() => {
    if (history !== 'browser') return;
    const root = rootEntry.current;
    if (root) entryCache.current.set(root.key, root);
    window.history.replaceState(
      { ...(window.history.state ?? {}), pwacn: true, pwacnKey: root?.key },
      '',
    );
    const onPopState = (event: PopStateEvent) => {
      pendingBack.current = false;
      const targetKey = event.state?.pwacnKey as string | undefined;
      const entries = entriesRef.current;
      const current = entries.at(-1);
      if (targetKey === current?.key) return;
      const targetIndex = entries.findIndex((entry) => entry.key === targetKey);
      if (targetIndex >= 0 && targetIndex < entries.length - 1) {
        const finish = () => {
          entriesRef.current = entries.slice(0, targetIndex + 1);
          dispatch({ type: 'pop-to', key: targetKey! });
          progress.set(0);
          setInteractive(false);
        };
        if (gestureCommitted.current) {
          gestureCommitted.current = false;
          finish();
        } else if (targetIndex === entries.length - 2 && !settle.current) {
          setInteractive(true);
          const token = ++generation.current;
          const control = animate(
            progress,
            width,
            reduced ? { duration: 0.01 } : springs.navigation,
          );
          settle.current = control;
          void control.then(() => {
            if (generation.current !== token) return;
            settle.current = null;
            finish();
          });
        } else {
          abortGesture();
          finish();
        }
      } else {
        abortGesture();
        gestureCommitted.current = false;
        const cached = targetKey ? entryCache.current.get(targetKey) : undefined;
        if (cached) {
          entriesRef.current = [...entries, cached];
          dispatch({ type: 'push', entry: cached });
        }
        // An entry outside pwacn belongs to the platform/browser.
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [abortGesture, history, progress, reduced, width]);

  const activeEntry = state.entries.at(-1);
  useEffect(() => {
    // The outgoing surface is already at the edge; the revealed screen is at zero.
    if (interactive && !drag.current && !settle.current) {
      progress.set(0);
      setInteractive(false);
    }
  }, [activeEntry?.key, interactive, progress]);
  useLayoutEffect(() => {
    if (!activeEntry) return;
    const frame = requestAnimationFrame(() => {
      const host = screenRefs.current.get(activeEntry.key);
      const scroll = host?.querySelector<HTMLElement>(
        '[data-pwacn-scroll],.settings-scroll,.detail-scroll',
      );
      if (scroll) scroll.scrollTop = activeEntry.scrollPosition ?? 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [activeEntry]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!edgeBack || entriesRef.current.length < 2 || drag.current) return;
      if ((event.target as Element).closest('[data-pwacn-back-gesture="capture"]'))
        return;
      const box = event.currentTarget.getBoundingClientRect();
      const relativeX = event.clientX - box.left;
      if (
        backGestureRegion === 'edge'
          ? relativeX > gestures.edgeBack.edgeWidth
          : relativeX <= gestures.edgeBack.edgeWidth
      )
        return;
      if (
        !gestureCoordinator.claim(event.pointerId, {
          owner: 'edge-back',
          axis: 'x',
          priority: 100,
        })
      )
        return;
      if (settle.current) {
        generation.current += 1;
        settle.current.stop();
        settle.current = null;
        emitFeelTelemetry({
          timestamp: performance.now(),
          primitive: 'InteractiveBack',
          gesture: 'edge-back',
          state: 'interrupted',
          axis: 'x',
          pointerX: event.clientX,
          surfaceX: progress.get(),
          gestureOwner: 'edge-back',
        });
      }
      const now = performance.now();
      drag.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        origin: progress.get(),
        lastX: event.clientX,
        lastTime: now,
        velocity: 0,
        axis: null,
        responded: false,
      };
      setInteractive(true);
      emitFeelTelemetry({
        timestamp: now,
        primitive: 'InteractiveBack',
        gesture: 'edge-back',
        state: 'contact',
        axis: 'x',
        pointerX: event.clientX,
        surfaceX: progress.get(),
        gestureOwner: 'edge-back',
      });
    },
    [backGestureRegion, edgeBack, progress],
  );

  useEffect(() => {
    const onMove = (event: globalThis.PointerEvent) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      if (!current.axis && Math.hypot(dx, dy) >= gestures.swipe.activationDistance)
        current.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (current.axis === 'y') {
        gestureCoordinator.release(event.pointerId, 'edge-back');
        drag.current = null;
        if (current.origin === 0) setInteractive(false);
        return;
      }
      if (current.axis !== 'x') return;
      const now = performance.now();
      current.velocity =
        ((event.clientX - current.lastX) / Math.max(1, now - current.lastTime)) * 1000;
      current.lastX = event.clientX;
      current.lastTime = now;
      const surfaceX = Math.min(width, Math.max(0, current.origin + dx));
      progress.set(surfaceX);
      if (!current.responded) {
        current.responded = true;
        emitFeelTelemetry({
          timestamp: now,
          primitive: 'InteractiveBack',
          gesture: 'edge-back',
          state: 'responding',
          axis: 'x',
          pointerX: event.clientX,
          surfaceX,
          gestureOwner: 'edge-back',
        });
      }
      emitFeelTelemetry({
        timestamp: now,
        primitive: 'InteractiveBack',
        gesture: 'edge-back',
        state: 'dragging',
        axis: 'x',
        pointerX: event.clientX,
        surfaceX,
        pointerVelocityX: current.velocity,
        surfaceVelocityX: progress.getVelocity(),
        trackingErrorPx: Math.abs(current.origin + dx - surfaceX),
        gestureOwner: 'edge-back',
      });
      event.preventDefault();
    };
    const onFinish = (event: globalThis.PointerEvent) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      drag.current = null;
      gestureCoordinator.release(event.pointerId, 'edge-back');
      if (current.axis !== 'x') {
        if (current.origin === 0) setInteractive(false);
        return;
      }
      const surfaceX = progress.get();
      const committed =
        event.type !== 'pointercancel' &&
        (surfaceX > width * gestures.edgeBack.commitProgress ||
          current.velocity > gestures.edgeBack.velocityThreshold);
      const now = performance.now();
      emitFeelTelemetry({
        timestamp: now,
        primitive: 'InteractiveBack',
        gesture: 'edge-back',
        state: 'releasing',
        axis: 'x',
        pointerX: event.clientX,
        surfaceX,
        pointerVelocityX: current.velocity,
        surfaceVelocityX: progress.getVelocity(),
        gestureOwner: 'edge-back',
      });
      emitFeelTelemetry({
        timestamp: now,
        primitive: 'InteractiveBack',
        gesture: 'edge-back',
        state: 'settling',
        axis: 'x',
        surfaceX,
        surfaceVelocityX: current.velocity,
        gestureOwner: 'edge-back',
      });
      const token = ++generation.current;
      const control = animate(
        progress,
        committed ? width : 0,
        reduced
          ? { duration: 0.01 }
          : { ...springs.navigation, velocity: current.velocity },
      );
      settle.current = control;
      void control.then(() => {
        if (token !== generation.current) return;
        settle.current = null;
        if (committed) {
          emitFeelTelemetry({
            timestamp: performance.now(),
            primitive: 'InteractiveBack',
            gesture: 'edge-back',
            state: 'route-commit',
            axis: 'x',
            surfaceX: width,
            gestureOwner: 'edge-back',
          });
          commitPop(true);
        } else setInteractive(false);
        emitFeelTelemetry({
          timestamp: performance.now(),
          primitive: 'InteractiveBack',
          gesture: 'edge-back',
          state: 'complete',
          axis: 'x',
          surfaceX: committed ? width : 0,
          surfaceVelocityX: 0,
        });
      });
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onFinish);
    window.addEventListener('pointercancel', onFinish);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onFinish);
      window.removeEventListener('pointercancel', onFinish);
    };
  }, [commitPop, progress, reduced, width]);

  const visibleEntries = state.entries.slice(-Math.max(2, maxMountedScreens));
  return (
    <NavigationContext.Provider value={navigation}>
      <div
        ref={stackRef}
        data-pwacn-stack=""
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          overscrollBehavior: 'none',
        }}
      >
        <>
          {visibleEntries.map((entry, index) => (
            <StackScreen
              key={entry.key}
              entry={entry}
              active={index === visibleEntries.length - 1}
              behind={index === visibleEntries.length - 2}
              modal={entry.presentation === 'modal'}
              depth={state.entries.length}
              zIndex={index}
              reduced={reduced}
              interactive={interactive}
              progress={progress}
              width={width}
              edgeBack={edgeBack}
              backGestureRegion={backGestureRegion}
              onPointerDown={onPointerDown}
              screenRefs={screenRefs}
            />
          ))}
        </>
      </div>
    </NavigationContext.Provider>
  );
}

export function SharedElement({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div style={{ viewTransitionName: `pwacn-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}` }}>
      {children}
    </div>
  );
}
