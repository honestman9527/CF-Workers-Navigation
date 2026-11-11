import type { Category } from '@shared/api/types';

import { useMemo } from 'react';

import { SearchSelect } from '@/components/ui/search-select';
import { UNCATEGORIZED_SLUG } from '@shared/api/types';

import { categoryOptions, retainSelectedOption } from '../selection/options';

/** 后台分类筛选：搜索完整路径，按深度优先顺序展示层级。 */
export function CategoryFilter({
  categories,
  selectedSlug,
  onSelect,
  disabled = false,
}: {
  categories: Category[];
  selectedSlug?: string;
  onSelect: (slug: string | undefined) => void;
  disabled?: boolean;
}) {
  const options = useMemo(
    () =>
      retainSelectedOption(
        [
          { value: '', label: '全部分类' },
          { value: UNCATEGORIZED_SLUG, label: '未分类' },
          ...categoryOptions(categories, true),
        ],
        selectedSlug ?? '',
      ),
    [categories, selectedSlug],
  );
  return (
    <SearchSelect
      options={options}
      value={selectedSlug ?? ''}
      onChange={(slug) => onSelect(slug || undefined)}
      disabled={disabled}
      label="筛选分类"
      placeholder="搜索分类或上级名称"
      className="max-w-full sm:max-w-64"
    />
  );
}
