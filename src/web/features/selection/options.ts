import type { Category, Tag } from '@shared/api/types';

import { buildCategoryTree, type CategoryNode } from '../categories/tree';

/** 只共享选项数据与匹配规则，前后台分别实现控件外观。 */
export type SelectOption = {
  value: string;
  label: string;
  path?: string;
  depth?: number;
  private?: boolean;
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
  function visit(nodes: CategoryNode[], parents: string[]) {
    for (const node of nodes) {
      const path = [...parents, node.name];
      options.push({
        value: node.slug,
        label: node.name,
        path: path.join(' / '),
        depth: parents.length,
        private: node.effectiveVisibility === 'private',
        hint: includeCounts ? `直属 ${node.bookmarkCount}` : undefined,
      });
      visit(node.children, path);
    }
  }
  visit(buildCategoryTree(categories), []);
  return options;
}

export function tagOptions(tags: Tag[]): SelectOption[] {
  return tags.map((tag) => ({ value: tag.slug, label: tag.name }));
}

export function optionLabel(option: SelectOption): string {
  return option.path ?? option.label;
}

export function matchOption(option: SelectOption, query: string): boolean {
  const label = optionLabel(option).toLocaleLowerCase();
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .every((word) => label.includes(word));
}

/** URL 或刷新期间暂时缺失的选项保留原值，不能静默切换筛选。 */
export function retainSelectedOption(options: SelectOption[], value: string): SelectOption[] {
  return options.some((option) => option.value === value)
    ? options
    : [...options, { value, label: `当前选择：${value}` }];
}
