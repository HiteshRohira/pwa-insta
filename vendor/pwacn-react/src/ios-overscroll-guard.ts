/** Keep iOS WebKit's viewport from rubber-banding when an app scroll reaches its edge. */
export function installIOSOverscrollGuard(root: HTMLElement): () => void {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios) return () => {};

  let gesture:
    | {
        id: number;
        startX: number;
        startY: number;
        lastY: number;
        axis: 'x' | 'y' | null;
      }
    | undefined;

  const reset = () => {
    gesture = undefined;
  };
  const onStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      reset();
      return;
    }
    const touch = event.touches[0]!;
    gesture = {
      id: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      lastY: touch.clientY,
      axis: null,
    };
  };
  const onMove = (event: TouchEvent) => {
    if (!gesture || event.touches.length !== 1) return;
    const touch = event.touches[0]!;
    if (touch.identifier !== gesture.id) return;
    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;
    if (!gesture.axis) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 6) return;
      gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
    }
    const movementY = touch.clientY - gesture.lastY;
    gesture.lastY = touch.clientY;
    if (gesture.axis === 'x' || movementY === 0) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;

    for (
      let node: Element | null = target;
      node && node !== root;
      node = node.parentElement
    ) {
      const overflow = getComputedStyle(node).overflowY;
      if (!/^(auto|scroll|overlay)$/.test(overflow)) continue;
      const scroll = node as HTMLElement;
      if (scroll.scrollHeight <= scroll.clientHeight + 1) continue;
      const atTop = scroll.scrollTop <= 0;
      const atBottom = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 1;
      if ((movementY > 0 && atTop) || (movementY < 0 && atBottom)) {
        if (event.cancelable) event.preventDefault();
      }
      return;
    }
    if (event.cancelable) event.preventDefault();
  };

  root.addEventListener('touchstart', onStart, { passive: true });
  root.addEventListener('touchmove', onMove, { passive: false });
  root.addEventListener('touchend', reset);
  root.addEventListener('touchcancel', reset);
  return () => {
    root.removeEventListener('touchstart', onStart);
    root.removeEventListener('touchmove', onMove);
    root.removeEventListener('touchend', reset);
    root.removeEventListener('touchcancel', reset);
  };
}
