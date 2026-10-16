import { haptics, springs } from '@pwacn/core';
import { motion } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { Pressable } from './pressable';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

export interface MobileSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}

/** A semantic, pointer-down-responsive switch with one shared physical vocabulary. */
export function MobileSwitch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  className,
}: MobileSwitchProps) {
  const reduced = usePrefersReducedMotion();
  return (
    <Pressable
      className={className}
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      mass="micro"
      feedback="none"
      onFeedback={haptics.selection}
      onPress={() => onCheckedChange(!checked)}
      data-pwacn-switch=""
      data-checked={checked}
      style={{
        width: 51,
        height: 31,
        padding: 2,
        border: 0,
        borderRadius: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: checked ? 'flex-end' : 'flex-start',
        background: checked ? '#34c759' : '#e9e9ea',
        boxShadow: 'inset 0 0 0 .5px rgb(0 0 0 / .08)',
      }}
    >
      <motion.span
        aria-hidden="true"
        layout
        transition={reduced ? { duration: 0.01 } : springs.control}
        style={{
          width: 27,
          height: 27,
          display: 'block',
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 2px 5px rgb(0 0 0 / .25), 0 0 0 .5px rgb(0 0 0 / .08)',
        }}
      />
    </Pressable>
  );
}

export type Segment<T extends string> = { value: T; label: ReactNode };

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  items,
  label,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  items: Segment<T>[];
  label: string;
  className?: string;
}) {
  const id = useId().replaceAll(':', '');
  const reduced = usePrefersReducedMotion();
  return (
    <div
      className={className}
      role="radiogroup"
      aria-label={label}
      data-pwacn-segmented=""
      style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)` }}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <Pressable
            key={item.value}
            role="radio"
            aria-checked={selected}
            feedback="none"
            mass="micro"
            onPress={() => onValueChange(item.value)}
            style={{ position: 'relative', zIndex: 0 }}
          >
            {selected ? (
              <motion.span
                layoutId={`pwacn-segment-${id}`}
                aria-hidden="true"
                transition={reduced ? { duration: 0.01 } : springs.control}
                style={{ position: 'absolute', inset: 0, zIndex: -1 }}
              />
            ) : null}
            {item.label}
          </Pressable>
        );
      })}
    </div>
  );
}
