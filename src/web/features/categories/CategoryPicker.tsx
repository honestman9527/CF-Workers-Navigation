import type { Category } from '@shared/api/types';

import { useMemo } from 'react';

import { CategorySelect } from '@/components/ui/category-select';

import { categoryOptions } from '../selection/options';

/** 后台编辑器分类单选，与筛选入口保持相同的层级和搜索方式。 */
export function CategoryPicker({
  categories,
  value,
  onChange,
  disabled,
  id,
}: {
  categories: Category[];
  value: number | null;
  onChange: (id: number | null) => void;
  disabled?: boolean;
  id?: string;
}) {
  const options = useMemo(
    () => [{ value: '', label: '未分类' }, ...categoryOptions(categories)],
    [categories],
  );
  const selected = categories.find((category) => category.id === value);
  return (
    <CategorySelect
      id={id}
      disabled={disabled}
      options={options}
      value={selected?.slug ?? ''}
      onChange={(slug) =>
        onChange(categories.find((category) => category.slug === slug)?.id ?? null)
      }
      label="选择分类"
      placeholder="搜索分类或上级名称"
      className="mt-2 w-full"
    />
  );
}
