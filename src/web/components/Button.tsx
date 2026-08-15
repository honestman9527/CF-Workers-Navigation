import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

import { Button as UiButton } from '@/components/ui/primitives';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';
type Size = 'sm' | 'md';

const variantMap = {
  primary: 'default',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'destructive',
  icon: 'ghost',
} as const;

export function Button({
  children,
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>) {
  const uiVariant = variantMap[variant];
  const uiSize =
    variant === 'icon' ? (size === 'sm' ? 'icon-sm' : 'icon') : size === 'sm' ? 'sm' : 'default';

  return (
    <UiButton className={className} variant={uiVariant} size={uiSize} {...props}>
      {children}
    </UiButton>
  );
}
