import type { Category } from '@shared/api/types';

import { ChevronDown, Folder } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDismiss } from '@nav/hooks/useDismiss';
import { UNCATEGORIZED_SLUG } from '@shared/api/types';

import { CategoryTree } from './CategoryTree';
import { categoryIcon } from './icons';

/** 分类单选选择器（按钮 + 正下方展开的可折叠树，带 LV 层级徽标）。 */
export function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(rootRef, open, () => setOpen(false));

  const selected = useMemo(
    () => (value !== null ? categories.find((item) => item.id === value) : undefined),
    [categories, value],
  );
  const SelectedIcon = selected ? categoryIcon(selected.icon) : Folder;

  function selectSlug(slug: string) {
    if (slug === UNCATEGORIZED_SLUG) onChange(null);
    else {
      const category = categories.find((item) => item.slug === slug);
      onChange(category ? category.id : null);
    }
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="mt-2 w-full justify-start gap-2 font-normal"
        aria-label="选择分类"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <SelectedIcon className="size-4 text-primary" />
        <span className="min-w-0 flex-1 truncate text-left">
          {selected ? selected.name : '未分类'}
        </span>
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </Button>
      {open ? (
        <div className="scrollbar-safe animate-panel-enter max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-2">
          <CategoryTree
            categories={categories}
            selectedSlug={selected?.slug}
            showLevel
            includeUncategorized
            onSelect={selectSlug}
          />
        </div>
      ) : null}
    </div>
  );
}
