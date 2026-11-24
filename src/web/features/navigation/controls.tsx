import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/** 前台控件自持外观，与后台 shadcn/ui 共用同一套语义 CSS Token 与交互反馈。 */
export function FrontButton({
  className,
  tone = 'quiet',
  ...props
}: ComponentProps<'button'> & { tone?: 'quiet' | 'primary' | 'subtle' | 'danger' }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/45 disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 motion-safe:active:scale-[0.98]',
        tone === 'primary'
          ? 'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover'
          : tone === 'subtle'
            ? 'glass-surface border border-border bg-card text-foreground shadow-2xs hover:border-border-strong hover:bg-secondary/90'
            : tone === 'danger'
              ? 'bg-destructive/12 text-destructive hover:bg-destructive/20'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export const frontInputClass =
  'min-h-11 w-full rounded-xl border border-input bg-background/85 px-3.5 py-2 text-base text-foreground shadow-2xs outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-muted-foreground focus:border-primary focus:bg-background focus:ring-2 focus:ring-ring/25 disabled:opacity-50';

export function FrontInput({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(frontInputClass, className)} {...props} />;
}
