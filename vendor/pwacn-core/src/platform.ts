export const supports = {
  get pointerEvents() {
    return typeof window !== 'undefined' && 'PointerEvent' in window;
  },
  get vibration() {
    return typeof navigator !== 'undefined' && 'vibrate' in navigator;
  },
  get visualViewport() {
    return typeof window !== 'undefined' && 'visualViewport' in window;
  },
  get viewTransitions() {
    return typeof document !== 'undefined' && 'startViewTransition' in document;
  },
} as const;

export type HapticKind = 'selection' | 'light' | 'medium' | 'success' | 'warning';
export type HapticAdapter = (kind: HapticKind) => void;
export type SoundKind = 'tap' | 'open' | 'close' | 'success' | 'warning';
export type SoundAdapter = (kind: SoundKind) => void;

let adapter: HapticAdapter | undefined;
let soundAdapter: SoundAdapter | undefined;

const patterns: Record<HapticKind, number | number[]> = {
  selection: 8,
  light: 10,
  medium: 18,
  success: [10, 35, 14],
  warning: [20, 45, 20],
};

function emit(kind: HapticKind) {
  if (adapter) return adapter(kind);
  if (supports.vibration) navigator.vibrate(patterns[kind]);
}

export const haptics = {
  install(nextAdapter?: HapticAdapter) {
    adapter = nextAdapter;
  },
  selection: () => emit('selection'),
  impact: (weight: 'light' | 'medium' = 'light') => emit(weight),
  success: () => emit('success'),
  warning: () => emit('warning'),
};

/** Optional sound feedback. Silent by default until the host installs an adapter. */
export const sounds = {
  install(nextAdapter?: SoundAdapter) {
    soundAdapter = nextAdapter;
  },
  play(kind: SoundKind = 'tap') {
    soundAdapter?.(kind);
  },
};
