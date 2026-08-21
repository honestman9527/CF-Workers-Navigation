import type { Tag } from '@shared/api/types';

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

/** 主内容区的横向标签筛选条：单选并可与分类叠加；再次点击选中项或点 X 清除。 */
export function TagFilterBar({
  tags,
  selected,
  onSelect,
}: {
  tags: Tag[];
  selected?: string;
  onSelect: (slug: string | undefined) => void;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selected) {
      selectedRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  }, [selected]);

  if (tags.length === 0) return null;

  return (
    <div
      className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 py-0.5"
      role="group"
      aria-label="按标签筛选"
    >
      {tags.map((item) => {
        const active = selected === item.slug;
        return (
          <button
            key={item.slug}
            ref={active ? selectedRef : undefined}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(active ? undefined : item.slug)}
            className={cn(
              'flex h-8 shrink-0 items-center gap-1 rounded-full border border-border/70 bg-card px-3 text-xs text-muted-foreground transition hover:border-primary/45 hover:text-foreground',
              active && 'border-transparent bg-primary/10 font-medium text-primary',
            )}
          >
            <span className="min-w-0">#{item.name}</span>
            <span className="shrink-0 font-mono text-[10px] opacity-70">{item.bookmarkCount}</span>
            {active ? <X className="size-3" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}
