import { type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

export type SurfaceTheme = {
  screen?: string;
  sheet?: string;
  sheetForeground?: string;
  overlay?: string;
  separator?: string;
  accent?: string;
};

export function SurfaceThemeProvider({
  theme,
  children,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { theme: SurfaceTheme; children: ReactNode }) {
  const variables = {
    '--pwacn-screen-background': theme.screen,
    '--pwacn-sheet-background': theme.sheet,
    '--pwacn-sheet-foreground': theme.sheetForeground,
    '--pwacn-overlay-color': theme.overlay,
    '--pwacn-separator-color': theme.separator,
    '--pwacn-accent-color': theme.accent,
    ...style,
  } as CSSProperties;
  return (
    <div data-pwacn-surface-theme="" style={variables} {...props}>
      {children}
    </div>
  );
}
