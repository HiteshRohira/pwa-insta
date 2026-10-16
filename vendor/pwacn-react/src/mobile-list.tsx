import { type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { Pressable, type PressableProps } from './pressable';

export function MobileList({
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div role="list" data-pwacn-mobile-list="" {...props}>
      {children}
    </div>
  );
}

export function MobileSection({
  title,
  footer,
  listClassName,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  footer?: ReactNode;
  listClassName?: string;
  children: ReactNode;
}) {
  return (
    <section data-pwacn-mobile-section="" {...props}>
      {title ? <header data-pwacn-mobile-section-title="">{title}</header> : null}
      <MobileList className={listClassName}>{children}</MobileList>
      {footer ? <footer data-pwacn-mobile-section-footer="">{footer}</footer> : null}
    </section>
  );
}

export type MobileListItemProps = Omit<PressableProps, 'children'> & {
  leading?: ReactNode;
  children: ReactNode;
  supporting?: ReactNode;
  trailing?: ReactNode;
  interactive?: boolean;
};

export function MobileListItem({
  leading,
  children,
  supporting,
  trailing,
  interactive,
  className,
  onPress,
  style,
  ...props
}: MobileListItemProps) {
  const content = (
    <>
      {leading ? <span data-pwacn-mobile-list-leading="">{leading}</span> : null}
      <span data-pwacn-mobile-list-content="">
        <span>{children}</span>
        {supporting ? (
          <span data-pwacn-mobile-list-supporting="">{supporting}</span>
        ) : null}
      </span>
      {trailing ? <span data-pwacn-mobile-list-trailing="">{trailing}</span> : null}
    </>
  );
  const sharedStyle: CSSProperties = {
    minHeight: 44,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    ...style,
  };

  return (interactive ?? onPress != null) ? (
    <Pressable
      className={className}
      feedback="opacity"
      onPress={onPress}
      data-pwacn-mobile-list-item=""
      style={sharedStyle}
      {...props}
    >
      {content}
    </Pressable>
  ) : (
    <div
      role="listitem"
      className={className}
      data-pwacn-mobile-list-item=""
      style={sharedStyle}
    >
      {content}
    </div>
  );
}
