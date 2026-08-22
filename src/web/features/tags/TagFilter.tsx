import type { Tag } from '@shared/api/types';

import { ChevronDown, Filter, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { TagChip } from './TagChip';

/** 主内容区的标签筛选：筛选按钮 + 按钮正下方展开面板（标签平铺换行），单选并可与分类叠加。 */
export function TagFilter({
  tags,
  selected,
  onSelect,
}: {
  tags: Tag[];
  selected?: string;
  onSelect: (slug: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);

  if (tags.length === 0) return null;

  const selectedTag = selected ? (tags.find((item) => item.slug === selected) ?? null) : null;

  return (
    <div role="group" aria-label="按标签筛选" className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant={selectedTag ? 'default' : 'outline'}
        size="sm"
        className="h-8 gap-1.5 rounded-full px-3"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Filter className="size-3.5" />
        {selectedTag ? (
          <>
            <span className="font-medium">#{selectedTag.name}</span>
            <span className="font-mono text-[10px] opacity-70">{selectedTag.bookmarkCount}</span>
          </>
        ) : (
          <span>标签筛选</span>
        )}
        <ChevronDown
          className={cn(
            'size-3 opacity-70 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </Button>

      {open ? (
        <div className="animate-panel-enter w-full rounded-xl border border-border/70 bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="px-0.5 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              按标签筛选
            </p>
            {selectedTag ? (
              <button
                type="button"
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-primary transition hover:bg-accent"
                onClick={() => onSelect(undefined)}
              >
                <X className="size-3" />
                清除
              </button>
            ) : null}
          </div>
          <div className="flex max-h-72 flex-wrap gap-1.5 overflow-y-auto">
            {tags.map((item) => (
              <TagChip
                key={item.slug}
                name={item.name}
                count={item.bookmarkCount}
                active={selected === item.slug}
                onClick={() => onSelect(selected === item.slug ? undefined : item.slug)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
