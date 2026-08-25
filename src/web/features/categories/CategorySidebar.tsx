import type { Category } from '@shared/api/types';

import { FolderPlus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { UNCATEGORIZED_SLUG } from '@shared/api/types';

import { CategoryTree } from './CategoryTree';

export function CategorySidebar({
  categories,
  selectedSlug,
  onSelect,
}: {
  categories: Category[];
  selectedSlug?: string;
  onSelect: (slug: string) => void;
}) {
  return (
    <div className="grid max-h-[min(38vh,26rem)] gap-1 overflow-y-auto pr-1">
      <button
        type="button"
        onClick={() => onSelect(UNCATEGORIZED_SLUG)}
        className={cn(
          'nav-item rounded-xl px-3 py-2',
          selectedSlug === UNCATEGORIZED_SLUG && 'nav-item-active',
        )}
      >
        <FolderPlus className="size-3.5" />
        <span className="truncate">未分类</span>
      </button>
      <CategoryTree
        categories={categories}
        selectedSlug={selectedSlug}
        onSelect={onSelect}
        showLevel
        showCount
      />
    </div>
  );
}
