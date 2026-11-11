import type { Category } from '@shared/api/types';

import { expect, it } from 'vitest';

import { descendantTotals } from '@nav/features/categories/tree';
import {
  categoryOptions,
  matchOption,
  retainSelectedOption,
} from '@nav/features/selection/options';

const root: Category = {
  id: 1,
  name: '开发',
  slug: 'dev',
  parentId: null,
  icon: null,
  sortOrder: 0,
  bookmarkCount: 2,
  visibility: 'public',
  effectiveVisibility: 'public',
};

it('保留排序、缺失父级和权限信息，搜索父级时能定位后代', () => {
  const categories = [
    {
      ...root,
      id: 3,
      parentId: 2,
      name: 'React',
      slug: 'react',
      effectiveVisibility: 'private' as const,
    },
    { ...root, id: 2, parentId: 1, name: '前端', slug: 'front' },
    root,
    { ...root, id: 4, parentId: 999, name: '其他', slug: 'other', sortOrder: 1 },
  ];
  const options = categoryOptions(categories);
  expect(options.map((option) => option.value)).toEqual(['dev', 'front', 'react', 'other']);
  expect(options[2]).toMatchObject({ path: '开发 / 前端 / React', depth: 2, private: true });
  expect(options[3]).toMatchObject({ path: '其他', depth: 0 });
  expect(matchOption(options[2], '开发 REACT')).toBe(true);
  expect(matchOption(options[2], '开发 后端')).toBe(false);
  expect([...descendantTotals(categories)]).toEqual([
    [3, 2],
    [2, 4],
    [1, 6],
    [4, 2],
  ]);
});

it('索引暂时缺失时保留筛选原值，不产生重复选项', () => {
  const options = [{ value: '', label: '全部标签' }];
  expect(retainSelectedOption(options, '')).toBe(options);
  const retained = retainSelectedOption(options, 'missing');
  expect(retained.at(-1)).toEqual({ value: 'missing', label: '当前选择：missing' });
  expect(options).toHaveLength(1);
});
