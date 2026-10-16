import { useEffect, useState } from 'react';

export type MobileViewport = {
  width: number;
  height: number;
  keyboardHeight: number;
  keyboardOpen: boolean;
  offsetTop: number;
  safeArea: { top: number; right: number; bottom: number; left: number };
};

const emptyInsets = { top: 0, right: 0, bottom: 0, left: 0 };

function readSafeArea() {
  if (typeof document === 'undefined') return emptyInsets;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const safeArea = {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
  probe.remove();
  return safeArea;
}

function readViewport(): MobileViewport {
  if (typeof window === 'undefined')
    return {
      width: 0,
      height: 0,
      keyboardHeight: 0,
      keyboardOpen: false,
      offsetTop: 0,
      safeArea: emptyInsets,
    };
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const keyboardHeight = Math.max(
    0,
    window.innerHeight - height - (viewport?.offsetTop ?? 0),
  );
  return {
    width: viewport?.width ?? window.innerWidth,
    height,
    keyboardHeight,
    keyboardOpen: keyboardHeight > 100,
    offsetTop: viewport?.offsetTop ?? 0,
    safeArea: readSafeArea(),
  };
}

export function useMobileViewport(): MobileViewport {
  const [state, setState] = useState(readViewport);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const next = readViewport();
      document.documentElement.style.setProperty(
        '--pwacn-viewport-height',
        `${next.height}px`,
      );
      document.documentElement.style.setProperty(
        '--pwacn-keyboard-height',
        `${next.keyboardHeight}px`,
      );
      document.documentElement.style.setProperty(
        '--pwacn-safe-top',
        `${next.safeArea.top}px`,
      );
      document.documentElement.style.setProperty(
        '--pwacn-safe-right',
        `${next.safeArea.right}px`,
      );
      document.documentElement.style.setProperty(
        '--pwacn-safe-bottom',
        `${next.safeArea.bottom}px`,
      );
      document.documentElement.style.setProperty(
        '--pwacn-safe-left',
        `${next.safeArea.left}px`,
      );
      setState(next);
    };
    update();
    window.addEventListener('resize', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, []);
  return state;
}
