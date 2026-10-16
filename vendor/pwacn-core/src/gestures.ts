/** Experimental gesture thresholds. Tune on physical mobile hardware. */
export const gestures = {
  press: { movementTolerance: 8 },
  swipe: {
    activationDistance: 8,
    commitDistance: 0.35,
    velocityThreshold: 650,
  },
  sheet: { dragElastic: 0.12, dismissVelocity: 900, snapVelocity: 500 },
  edgeBack: { edgeWidth: 24, commitProgress: 0.4, velocityThreshold: 600 },
} as const;

export type Axis = 'x' | 'y';
export type GestureOwner =
  'edge-back' | 'sheet' | 'scroll' | 'swipe-action' | 'tabs' | (string & {});

export type GestureClaim = {
  owner: GestureOwner;
  axis: Axis;
  priority?: number;
};

/**
 * Coordinates nested gestures without coupling primitives to one another.
 * Higher-priority claims can take ownership before a gesture is committed;
 * the edge-back gesture intentionally wins over horizontal content gestures.
 */
export class GestureCoordinator {
  private active: (GestureClaim & { pointerId: number }) | null = null;

  claim(pointerId: number, claim: GestureClaim): boolean {
    if (!this.active) {
      this.active = { ...claim, pointerId };
      return true;
    }
    if (this.active.pointerId === pointerId && this.active.owner === claim.owner)
      return true;
    if ((claim.priority ?? 0) > (this.active.priority ?? 0)) {
      this.active = { ...claim, pointerId };
      return true;
    }
    return false;
  }

  owns(pointerId: number, owner: GestureOwner): boolean {
    return this.active?.pointerId === pointerId && this.active.owner === owner;
  }

  release(pointerId: number, owner?: GestureOwner) {
    const active = this.active;
    if (active && active.pointerId === pointerId && (!owner || active.owner === owner))
      this.active = null;
  }

  reset() {
    this.active = null;
  }
}

export const gestureCoordinator = new GestureCoordinator();

export function shouldSheetCaptureScroll({
  scrollTop,
  deltaY,
  velocityY = 0,
}: {
  scrollTop: number;
  deltaY: number;
  velocityY?: number;
}): boolean {
  return scrollTop <= 0 && (deltaY > 0 || velocityY > 0);
}

export function movementDistance(
  start: { x: number; y: number },
  current: { x: number; y: number },
): number {
  return Math.hypot(current.x - start.x, current.y - start.y);
}

export function directionLock(
  deltaX: number,
  deltaY: number,
  threshold: number = gestures.swipe.activationDistance,
): Axis | null {
  if (Math.hypot(deltaX, deltaY) < threshold) return null;
  return Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
}

export function shouldCommitGesture({
  progress,
  velocity,
  progressThreshold,
  velocityThreshold,
}: {
  progress: number;
  velocity: number;
  progressThreshold: number;
  velocityThreshold: number;
}): boolean {
  return progress >= progressThreshold || velocity >= velocityThreshold;
}

export function applyElasticBoundary(
  value: number,
  min: number,
  max: number,
  elasticity: number,
): number {
  if (value < min) return min - (min - value) * elasticity;
  if (value > max) return max + (value - max) * elasticity;
  return value;
}
