import { useEffect, useRef, type ReactNode } from 'react';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

export interface VerticalPagerProps {
  children: ReactNode[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  className?: string;
  ariaLabel?: string;
}

/** A viewport-sized, native-scrolling pager for short-form content. */
export function VerticalPager({
  children,
  activeIndex,
  onActiveIndexChange,
  className,
  ariaLabel = 'Vertical pages',
}: VerticalPagerProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const lastReported = useRef(activeIndex);
  const reportedFromScroll = useRef(false);
  const frame = useRef(0);
  const reducedMotion = usePrefersReducedMotion();

  const commitIndex = (next: number) => {
    const node = viewport.current;
    const focused = document.activeElement;
    const previousPage = node?.querySelector(`[data-pwacn-page="${activeIndex}"]`);
    if (focused && previousPage?.contains(focused)) node?.focus({ preventScroll: true });
    onActiveIndexChange(next);
  };

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    if (reportedFromScroll.current) {
      reportedFromScroll.current = false;
      return;
    }
    const target = Math.max(0, Math.min(children.length - 1, activeIndex));
    if (Math.abs(node.scrollTop / Math.max(1, node.clientHeight) - target) > 0.05) {
      node.scrollTo({
        top: target * node.clientHeight,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    }
    lastReported.current = target;
  }, [activeIndex, children.length, reducedMotion]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <div
      ref={viewport}
      className={className}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      data-pwacn-vertical-pager=""
      onScroll={(event) => {
        cancelAnimationFrame(frame.current);
        const node = event.currentTarget;
        frame.current = requestAnimationFrame(() => {
          const next = Math.max(
            0,
            Math.min(
              children.length - 1,
              Math.round(node.scrollTop / Math.max(1, node.clientHeight)),
            ),
          );
          if (next !== lastReported.current) {
            lastReported.current = next;
            reportedFromScroll.current = true;
            commitIndex(next);
          }
        });
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const next = Math.max(
          0,
          Math.min(
            children.length - 1,
            activeIndex + (event.key === 'ArrowDown' ? 1 : -1),
          ),
        );
        commitIndex(next);
      }}
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        overscrollBehavior: 'none',
        WebkitOverflowScrolling: 'touch',
        scrollSnapType: 'y mandatory',
        scrollbarWidth: 'none',
        touchAction: 'pan-y',
      }}
    >
      {children.map((child, index) => (
        <div
          key={index}
          data-pwacn-page={index}
          aria-hidden={index !== activeIndex}
          inert={index !== activeIndex}
          style={{
            height: '100%',
            width: '100%',
            scrollSnapAlign: 'start',
            scrollSnapStop: 'always',
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
