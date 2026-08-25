import { cn } from '@/lib/utils';

/** 统一的标签胶囊：筛选面板与书签卡片共用。带 onClick 时渲染为可点击按钮。 */
export function TagChip({
  name,
  count,
  active = false,
  className,
  onClick,
}: {
  name: string;
  count?: number;
  active?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="min-w-0">#{name}</span>
      {count !== undefined ? (
        <span className="shrink-0 font-mono text-[10px] opacity-70">{count}</span>
      ) : null}
    </>
  );
  const base =
    'inline-flex h-7 items-center gap-1 rounded-full border border-border/70 bg-card px-2.5 text-xs text-muted-foreground transition hover:border-primary/45 hover:text-foreground';
  if (onClick) {
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          base,
          active && 'border-transparent bg-primary/10 font-medium text-primary',
          className,
        )}
      >
        {inner}
      </button>
    );
  }
  return (
    <span
      className={cn(
        base,
        active && 'border-transparent bg-primary/10 font-medium text-primary',
        className,
      )}
    >
      {inner}
    </span>
  );
}
