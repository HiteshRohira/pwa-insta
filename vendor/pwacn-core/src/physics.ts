/**
 * Experimental behavioral tokens. Values will be tuned against real devices and
 * are intentionally not part of pwacn's stable API yet.
 */
export type MassClass = 'micro' | 'control' | 'surface' | 'screen';

export type SpringToken = Readonly<{
  type: 'spring';
  stiffness: number;
  damping: number;
  mass: number;
  restDelta: number;
  restSpeed: number;
}>;

export const mass: Readonly<Record<MassClass, number>> = {
  micro: 0.28,
  control: 0.48,
  surface: 0.9,
  screen: 1.1,
};

const spring = (stiffness: number, damping: number, massValue: number): SpringToken => ({
  type: 'spring',
  stiffness,
  damping,
  mass: massValue,
  restDelta: 0.001,
  restSpeed: 0.01,
});

export const springs = {
  press: spring(520, 32, mass.control),
  control: spring(460, 30, mass.control),
  snap: spring(420, 34, mass.surface),
  sheet: spring(380, 36, mass.surface),
  navigation: spring(350, 38, mass.screen),
  dismiss: spring(440, 40, mass.surface),
  rebound: spring(500, 30, mass.surface),
} as const;

export type SpringPreset = keyof typeof springs;

export function springForMass(preset: SpringPreset, massClass: MassClass): SpringToken {
  return { ...springs[preset], mass: mass[massClass] };
}
