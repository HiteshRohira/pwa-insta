import { depths, springForMass, type Depth, type MassClass } from '@pwacn/core';
import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef } from 'react';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

export interface MotionSurfaceProps extends HTMLMotionProps<'div'> {
  mass?: MassClass;
  depth?: Depth;
}

export const MotionSurface = forwardRef<HTMLDivElement, MotionSurfaceProps>(
  function MotionSurface(
    { mass = 'surface', depth = 'base', style, transition, ...props },
    ref,
  ) {
    const reducedMotion = usePrefersReducedMotion();
    const depthToken = depths[depth];

    return (
      <motion.div
        ref={ref}
        data-pwacn-depth={depth}
        style={{
          position: 'relative',
          zIndex: depthToken.zIndex,
          boxShadow: depthToken.shadow,
          ...style,
        }}
        transition={
          transition ?? (reducedMotion ? { duration: 0.01 } : springForMass('snap', mass))
        }
        {...props}
      />
    );
  },
);
