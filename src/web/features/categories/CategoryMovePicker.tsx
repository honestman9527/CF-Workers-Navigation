import type { Category } from '@shared/api/types';

import { FolderInput, FolderTree } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDismiss } from '@nav/hooks/useDismiss';

import { CategoryTree } from './CategoryTree';

/** 后台分类移动选择器：使用与分类筛选相同的可折叠树浮层。 */
export function CategoryMovePicker({
  categories,
  excludedIds,
  value,
  disabled = false,
  onChange,
}: {
  categories: Category[];
  excludedIds: ReadonlySet<number>;
  value: number | null;
  disabled?: boolean;
  onChange: (parentId: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(rootRef, open, () => setOpen(false));

  const availableCategories = useMemo(
    () => categories.filter((category) => !excludedIds.has(category.id)),
    [categories, excludedIds],
  );
  const selected =
    value === null ? undefined : categories.find((category) => category.id === value);
  function select(parentId: number | null) {
    onChange(parentId);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="size-6 text-muted-foreground hover:text-foreground"
        disabled={disabled}
        aria-label={`移动 ${selected ? `到 ${selected.name}` : '到根目录'}`}
        aria-expanded={open}
        title="调整层级 / 移动到…"
        onClick={() => setOpen((current) => !current)}
      >
        <FolderInput className="size-3.5" />
      </Button>
      {open ? (
        <div className="animate-panel-enter absolute top-full right-0 z-50 mt-1 w-64 rounded-lg border border-border bg-popover p-2">
          <button
            type="button"
            onClick={() => select(null)}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground',
              value === null && 'bg-primary/10 font-medium text-primary',
            )}
          >
            <FolderTree className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">根目录</span>
          </button>
          <div className="scrollbar-safe mt-1 max-h-72 overflow-y-auto border-t border-border/60 pt-1">
            <CategoryTree
              categories={availableCategories}
              selectedSlug={selected?.slug}
              showLevel
              onSelect={(slug) => {
                const category = availableCategories.find((item) => item.slug === slug);
                if (category) select(category.id);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
