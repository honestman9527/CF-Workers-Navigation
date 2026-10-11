import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/** 前台控件自持外观；不通过后台组件库继承样式。 */
export function FrontButton({
  className,
  tone = 'quiet',
  ...props
}: ComponentProps<'button'> & { tone?: 'quiet' | 'primary' }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        tone === 'primary'
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export const frontInputClass =
  'min-h-11 w-full rounded-xl border border-input bg-card px-3 py-2 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50';

export function FrontInput({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(frontInputClass, className)} {...props} />;
}
