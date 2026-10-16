import { haptics, springs } from '@pwacn/core';
import { AnimatePresence, motion, Reorder } from 'motion/react';
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ActionSheet, type ActionSheetItem } from './sheet';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

export function NavigationBar({
  title,
  leading,
  trailing,
  largeTitle = false,
  translucent = true,
  className,
}: {
  title: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  largeTitle?: boolean;
  translucent?: boolean;
  className?: string;
}) {
  return (
    <header
      className={className}
      data-pwacn-navigation-bar=""
      data-large-title={largeTitle}
      style={{
        minHeight: largeTitle ? 96 : 48,
        padding:
          'calc(8px + env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 8px max(12px, env(safe-area-inset-left))',
        display: 'grid',
        gridTemplateColumns: 'minmax(64px,1fr) auto minmax(64px,1fr)',
        alignItems: largeTitle ? 'end' : 'center',
        position: 'relative',
        zIndex: 20,
        background: translucent
          ? 'color-mix(in srgb, Canvas 82%, transparent)'
          : 'Canvas',
        backdropFilter: translucent ? 'blur(20px) saturate(180%)' : undefined,
        borderBottom: '0.5px solid color-mix(in srgb, CanvasText 18%, transparent)',
      }}
    >
      <div>{leading}</div>
      <strong style={{ fontSize: largeTitle ? 30 : 17, letterSpacing: '-0.02em' }}>
        {title}
      </strong>
      <div style={{ justifySelf: 'end' }}>{trailing}</div>
    </header>
  );
}

export function Picker<T extends string>({
  label,
  value,
  options,
  onValueChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onValueChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <label data-pwacn-picker="" style={{ display: 'grid', gap: 6 }}>
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          haptics.selection();
          onValueChange(event.target.value as T);
        }}
        style={{ minHeight: 44, font: 'inherit', borderRadius: 10, paddingInline: 12 }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ContextMenu({
  children,
  items,
  title = 'Actions',
}: {
  children: ReactNode;
  items: ActionSheetItem[];
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const cancel = () => window.clearTimeout(timer.current);
  return (
    <>
      <span
        data-pwacn-context-menu=""
        onContextMenu={(event) => {
          event.preventDefault();
          setOpen(true);
          haptics.impact('medium');
        }}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse') return;
          timer.current = window.setTimeout(() => {
            haptics.impact('medium');
            setOpen(true);
          }, 480);
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onPointerMove={cancel}
      >
        {children}
      </span>
      <ActionSheet open={open} onOpenChange={setOpen} title={title} items={items} />
    </>
  );
}

type Toast = { id: number; message: ReactNode; tone?: 'default' | 'success' | 'warning' };
const ToastContext = createContext<(toast: Omit<Toast, 'id'>) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const reduced = usePrefersReducedMotion();
  const show = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(
      () => setToasts((current) => current.filter((item) => item.id !== id)),
      2600,
    );
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {typeof document !== 'undefined'
        ? createPortal(
            <div
              role="status"
              aria-live="polite"
              style={{
                position: 'fixed',
                inset: 'auto 16px calc(16px + env(safe-area-inset-bottom))',
                zIndex: 2000,
                display: 'grid',
                justifyItems: 'center',
                gap: 8,
                pointerEvents: 'none',
              }}
            >
              <AnimatePresence>
                {toasts.map((toast) => (
                  <motion.div
                    key={toast.id}
                    data-pwacn-toast=""
                    initial={
                      reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                    transition={reduced ? { duration: 0.01 } : springs.control}
                    style={{
                      padding: '11px 16px',
                      borderRadius: 999,
                      color: 'white',
                      background:
                        toast.tone === 'warning'
                          ? '#b44118'
                          : toast.tone === 'success'
                            ? '#18723b'
                            : 'rgb(24 24 28 / .92)',
                      boxShadow: '0 10px 35px rgb(0 0 0 / .25)',
                      backdropFilter: 'blur(18px)',
                    }}
                  >
                    {toast.message}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export function RefreshControl({
  children,
  onRefresh,
  threshold = 72,
}: {
  children: ReactNode;
  onRefresh: () => void | Promise<void>;
  threshold?: number;
}) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<number | null>(null);
  const finish = async () => {
    if (pull >= threshold && !refreshing) {
      setRefreshing(true);
      haptics.impact('medium');
      await onRefresh();
      setRefreshing(false);
    }
    start.current = null;
    setPull(0);
  };
  return (
    <div
      data-pwacn-refresh-control=""
      onPointerDown={(event) => {
        if (event.currentTarget.scrollTop <= 0) start.current = event.clientY;
      }}
      onPointerMove={(event) => {
        if (start.current === null || event.currentTarget.scrollTop > 0) return;
        setPull(Math.min(110, Math.max(0, (event.clientY - start.current) * 0.5)));
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      style={{ position: 'relative', overflowY: 'auto', overscrollBehavior: 'none' }}
    >
      <div
        aria-hidden="true"
        style={{
          height: pull,
          display: 'grid',
          placeItems: 'center',
          transition: start.current === null ? 'height 180ms ease' : undefined,
        }}
      >
        {refreshing
          ? 'Refreshing…'
          : pull >= threshold
            ? 'Release to refresh'
            : pull > 8
              ? 'Pull to refresh'
              : null}
      </div>
      {children}
    </div>
  );
}

export function ReorderableList<T extends string>({
  items,
  onReorder,
  renderItem,
  label = 'Reorderable list',
}: {
  items: T[];
  onReorder: (items: T[]) => void;
  renderItem: (item: T) => ReactNode;
  label?: string;
}) {
  return (
    <Reorder.Group
      axis="y"
      values={items}
      onReorder={onReorder}
      aria-label={label}
      style={{ listStyle: 'none', margin: 0, padding: 0 }}
    >
      {items.map((item) => (
        <Reorder.Item
          key={item}
          value={item}
          tabIndex={0}
          style={{ touchAction: 'none' }}
        >
          {renderItem(item)}
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}

export function Carousel({
  children,
  label = 'Carousel',
  onIndexChange,
}: {
  children: ReactNode[];
  label?: string;
  onIndexChange?: (index: number) => void;
}) {
  const id = useId();
  const pages = useMemo(() => children, [children]);
  return (
    <div
      id={id}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      data-pwacn-carousel=""
      onScroll={(event) => {
        const element = event.currentTarget;
        const index = Math.round(element.scrollLeft / Math.max(1, element.clientWidth));
        onIndexChange?.(index);
      }}
      style={{
        display: 'grid',
        gridAutoFlow: 'column',
        gridAutoColumns: '100%',
        overflowX: 'auto',
        scrollSnapType: 'x mandatory',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {pages.map((page, index) => (
        <section
          key={index}
          aria-label={`${index + 1} of ${pages.length}`}
          style={{ scrollSnapAlign: 'start' }}
        >
          {page}
        </section>
      ))}
    </div>
  );
}
