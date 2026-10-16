import { type HTMLAttributes, type ReactNode } from 'react';

export function MobileScreen({
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div data-pwacn-mobile-screen="" {...props}>
      {children}
    </div>
  );
}

export function MobileHeader({
  leading,
  title,
  trailing,
  ...props
}: HTMLAttributes<HTMLElement> & {
  leading?: ReactNode;
  title?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <header data-pwacn-mobile-header="" {...props}>
      <span data-pwacn-mobile-header-leading="">{leading}</span>
      <strong data-pwacn-mobile-header-title="">{title}</strong>
      <span data-pwacn-mobile-header-trailing="">{trailing}</span>
    </header>
  );
}

export function MobileScrollArea({
  children,
  style,
  ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <main
      data-pwacn-mobile-scroll=""
      data-pwacn-scroll=""
      {...props}
      style={{ overscrollBehavior: 'none', ...style }}
    >
      {children}
    </main>
  );
}
