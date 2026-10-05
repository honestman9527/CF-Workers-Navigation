import type { Category } from '@shared/api/types';

import { ChevronDown, FolderTree, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

import { CategoryTree } from './CategoryTree';

/** 后台分类筛选：浮层内保留可折叠分类树。 */
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
  const selectedName = useMemo(
    () =>
      selectedSlug
        ? (categories.find((item) => item.slug === selectedSlug)?.name ?? selectedSlug)
        : null,
    [categories, selectedSlug],
  );
  function select(slug: string | undefined) {
    onSelect(slug);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant={selectedSlug ? 'default' : 'outline'} size="lg" />}>
        <FolderTree data-icon="inline-start" />
        <span className="max-w-32 truncate">{selectedName ?? '全部分类'}</span>
        <ChevronDown
          data-icon="inline-end"
          className={cn('transition-transform', open && 'rotate-180')}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-(--available-height) w-64 max-w-[calc(100vw-2rem)] overflow-y-auto"
      >
        <PopoverTitle className="sr-only">筛选分类</PopoverTitle>
        <Button variant="ghost" className="w-full justify-start" onClick={() => select(undefined)}>
          <span className="min-w-0 flex-1 truncate">全部分类</span>
          {selectedSlug ? <X data-icon="inline-end" /> : null}
        </Button>
        <Separator />
        <div className="scrollbar-safe max-h-72 overflow-y-auto">
          <CategoryTree
            categories={categories}
            selectedSlug={selectedSlug}
            showLevel
            showCount
            includeUncategorized
            onSelect={select}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
