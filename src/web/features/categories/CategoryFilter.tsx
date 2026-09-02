import type { Category } from '@shared/api/types';

import { ChevronDown, FolderTree, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDismiss } from '@nav/hooks/useDismiss';

import { CategoryTree } from './CategoryTree';

/**
 * 后台工具栏的分类筛选（按钮 + 浮层面板内联展开的可折叠树）。
 * 顶部「全部分类」清除筛选；树带 LV 层级徽标与书签计数。
 */
export function CategoryFilter({
  categories,
  selectedSlug,
  onSelect,
}: {
  categories: Category[];
  selectedSlug?: string;
  onSelect: (slug: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useDismiss(panelRef, open, () => setOpen(false));

  const selectedName = useMemo(
    () =>
      selectedSlug
        ? (categories.find((item) => item.slug === selectedSlug)?.name ?? selectedSlug)
        : null,
    [categories, selectedSlug],
  );

  return (
    <div className="relative">
      <Button
        type="button"
        variant={selectedSlug ? 'default' : 'outline'}
        size="sm"
        className="h-9 gap-1.5 rounded-lg px-3 text-xs"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <FolderTree className="size-3.5" />
        <span className="max-w-[8rem] truncate">{selectedName ?? '全部分类'}</span>
        <ChevronDown
          className={cn(
            'size-3 opacity-70 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </Button>
      {open ? (
        <div
          ref={panelRef}
          className="animate-panel-enter absolute top-full left-0 z-50 mt-1 w-64 rounded-xl border border-border/70 bg-popover p-2 shadow-md"
        >
          <button
            type="button"
            onClick={() => {
              onSelect(undefined);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <span className="min-w-0 flex-1 truncate">全部分类</span>
            {selectedSlug ? <X className="size-3 shrink-0" /> : null}
          </button>
          <div className="scrollbar-safe mt-1 max-h-72 overflow-y-auto border-t border-border/60 pt-1">
            <CategoryTree
              categories={categories}
              selectedSlug={selectedSlug}
              showLevel
              showCount
              includeUncategorized
              onSelect={(slug) => {
                onSelect(slug);
                setOpen(false);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
