import type { Bookmark, Category } from '@shared/api/types';

import { CopyPlus, Star } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { UNCATEGORIZED_SLUG } from '@shared/api/types';
import { COMMON_CATEGORY_SYSTEM_KEY } from '@shared/category-rules';

import { CategoryTree } from './CategoryTree';

/** 后台表格行专用的「复制到分类」浮层。 */
export function BookmarkCopyPicker({
  bookmark,
  categories,
  disabled = false,
  onCopy,
}: {
  bookmark: Bookmark;
  categories: Category[];
  disabled?: boolean;
  onCopy: (categoryId: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const privacyNoteId = useId();
  const commonCategory = useMemo(
    () => categories.find((item) => item.systemKey === COMMON_CATEGORY_SYSTEM_KEY),
    [categories],
  );
  const currentSlug = useMemo(() => {
    if (bookmark.categoryId === null) return UNCATEGORIZED_SLUG;
    return categories.find((item) => item.id === bookmark.categoryId)?.slug;
  }, [bookmark.categoryId, categories]);
  const inheritedPrivate =
    bookmark.effectiveVisibility === 'private' && bookmark.visibility === 'public';

  function selectTarget(categoryId: number | null) {
    if (disabled || categoryId === bookmark.categoryId) return;
    setOpen(false);
    onCopy(categoryId);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next && disabled) return;
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={`复制到分类：${bookmark.title}`}
            title="复制到分类"
          />
        }
      >
        <CopyPlus aria-hidden="true" className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="scrollbar-safe max-h-(--available-height) w-64 max-w-[calc(100vw-2rem)] origin-(--transform-origin) overflow-y-auto"
      >
        <PopoverTitle>复制到分类</PopoverTitle>
        <PopoverDescription>将「{bookmark.title}」的副本添加到另一个分类。</PopoverDescription>
        {inheritedPrivate ? (
          <p
            id={privacyNoteId}
            className="mt-1 rounded-lg border border-primary/20 bg-primary/8 px-2 py-1 text-xs text-primary"
          >
            当前书签继承了私有权限，复制到公开分类将自动保持私有。
          </p>
        ) : null}
        {commonCategory && bookmark.categoryId !== commonCategory.id ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full justify-start text-primary"
              disabled={disabled}
              onClick={() => selectTarget(commonCategory.id)}
            >
              <Star aria-hidden="true" className="size-3.5" />
              复制到「{commonCategory.name}」
            </Button>
            <Separator />
          </>
        ) : null}
        <div
          role="group"
          aria-label="选择目标分类"
          aria-describedby={inheritedPrivate ? privacyNoteId : undefined}
          className="scrollbar-safe max-h-72 overflow-y-auto"
        >
          <CategoryTree
            categories={categories}
            disabledSlug={currentSlug}
            includeUncategorized
            showLevel
            onSelect={(slug) => {
              const targetId =
                slug === UNCATEGORIZED_SLUG
                  ? null
                  : categories.find((item) => item.slug === slug)?.id;
              if (targetId !== undefined) selectTarget(targetId);
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
