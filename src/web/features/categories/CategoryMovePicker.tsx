import type { Category } from '@shared/api/types';

import { FolderInput, FolderTree } from 'lucide-react';
import { useMemo, useState, type RefObject } from 'react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

import { CategoryTree } from './CategoryTree';

/** 支持独立按钮或分类操作菜单控制的树形移动浮层。 */
export function CategoryMovePicker({
  categories,
  excludedIds,
  value,
  disabled = false,
  onChange,
  open: controlledOpen,
  onOpenChange,
  anchorRef,
}: {
  categories: Category[];
  excludedIds: ReadonlySet<number>;
  value: number | null;
  disabled?: boolean;
  onChange: (parentId: number | null) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  function changeOpen(next: boolean) {
    if (next && disabled) return;
    if (controlledOpen === undefined) setLocalOpen(next);
    onOpenChange?.(next);
  }
  const availableCategories = useMemo(
    () => categories.filter((category) => !excludedIds.has(category.id)),
    [categories, excludedIds],
  );
  const selected =
    value === null ? undefined : categories.find((category) => category.id === value);
  function select(parentId: number | null) {
    if (disabled) return;
    onChange(parentId);
    changeOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      {!anchorRef ? (
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={'移动 ' + (selected ? '到 ' + selected.name : '到根目录')}
            />
          }
        >
          <FolderInput />
        </PopoverTrigger>
      ) : null}
      <PopoverContent
        anchor={anchorRef}
        finalFocus={anchorRef}
        align="end"
        className="max-h-(--available-height) w-64 max-w-[calc(100vw-2rem)] overflow-y-auto"
      >
        <PopoverTitle>移动到</PopoverTitle>
        <PopoverDescription>移动会重新计算权限，移出私有分类可能公开内容。</PopoverDescription>
        <Button
          variant="ghost"
          className="w-full justify-start"
          disabled={disabled}
          onClick={() => select(null)}
        >
          <FolderTree data-icon="inline-start" />
          根目录
        </Button>
        <Separator />
        <div className="scrollbar-safe max-h-72 overflow-y-auto" inert={disabled}>
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
      </PopoverContent>
    </Popover>
  );
}
