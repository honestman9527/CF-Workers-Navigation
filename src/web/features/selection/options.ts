import type { Category, Tag } from '@shared/api/types';

import { buildCategoryTree, type CategoryNode } from '../categories/tree';

/** 只共享选项数据与匹配规则，前后台分别实现控件外观。 */
export type SelectOption = {
  value: string;
  label: string;
  keywords?: string;
  path?: string;
  depth?: number;
  parentValue?: string;
  private?: boolean;
  disabled?: boolean;
  hint?: string;
};

export type SearchSelectProps = {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  disabled?: boolean;
  id?: string;
  className?: string;
};

export function categoryOptions(categories: Category[], includeCounts = false): SelectOption[] {
  const options: SelectOption[] = [];
  function visit(nodes: CategoryNode[], parents: string[], parentValue?: string) {
    for (const node of nodes) {
      const path = [...parents, node.name];
      options.push({
        value: node.slug,
        label: node.name,
        path: path.join(' / '),
        depth: parents.length,
        parentValue,
        private: node.effectiveVisibility === 'private',
        hint: includeCounts ? `直属 ${node.bookmarkCount}` : undefined,
      });
      visit(node.children, path, node.slug);
    }
  }
  visit(buildCategoryTree(categories), []);
  return options;
}

/** 按关联书签数降序排列标签，计数相同时按名称和 id 稳定排序。 */
export function sortTagsByPopularity(tags: Tag[]): Tag[] {
  return [...tags].sort(
    (a, b) =>
      b.bookmarkCount - a.bookmarkCount ||
      a.name.localeCompare(b.name, 'zh-Hans-CN') ||
      a.id - b.id,
  );
}

export function tagOptions(tags: Tag[], includeCounts = false): SelectOption[] {
  return tags.map((tag) => ({
    value: tag.slug,
    label: tag.name,
    keywords: tag.slug !== tag.name ? tag.slug : undefined,
    hint: includeCounts ? String(tag.bookmarkCount) : undefined,
  }));
}

export function optionLabel(option: SelectOption): string {
  return option.path ?? option.label;
}

export function matchOption(option: SelectOption, query: string): boolean {
  const haystack = [optionLabel(option), option.keywords]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

/** URL 或刷新期间暂时缺失的选项保留原值，不能静默切换筛选。 */
export function retainSelectedOption(options: SelectOption[], value: string): SelectOption[] {
  return options.some((option) => option.value === value)
    ? options
    : [...options, { value, label: `当前选择：${value}` }];
}
