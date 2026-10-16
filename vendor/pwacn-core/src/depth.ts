export type Depth = 'base' | 'raised' | 'overlay' | 'modal';

export type DepthToken = Readonly<{
  zIndex: number;
  shadow: string;
  backdropOpacity: number;
}>;

/** Experimental coordinated-depth tokens, not just z-index values. */
export const depths: Readonly<Record<Depth, DepthToken>> = {
  base: { zIndex: 0, shadow: 'none', backdropOpacity: 0 },
  raised: { zIndex: 10, shadow: '0 8px 24px rgb(18 18 16 / 0.12)', backdropOpacity: 0 },
  overlay: {
    zIndex: 40,
    shadow: '0 18px 50px rgb(18 18 16 / 0.2)',
    backdropOpacity: 0.18,
  },
  modal: {
    zIndex: 60,
    shadow: '0 24px 70px rgb(18 18 16 / 0.28)',
    backdropOpacity: 0.28,
  },
};
