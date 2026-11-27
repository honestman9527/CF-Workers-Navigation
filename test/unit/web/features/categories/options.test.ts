import type { Category } from '@shared/api/types';

import { expect, it } from 'vitest';

import { descendantTotals } from '@nav/features/categories/tree';
import {
  categoryOptions,
  matchOption,
  retainSelectedOption,
  sortTagsByPopularity,
  tagOptions,
} from '@nav/features/selection/options';

const root: Category = {
  id: 1,
  name: '开发',
  slug: 'dev',
  parentId: null,
  systemKey: null,
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

it('按关联书签数降序排列标签，并在带计数选项中支持按英文 slug 检索', () => {
  const input = [
    { id: 1, name: '冷门', slug: 'cold-slug', bookmarkCount: 1 },
    { id: 2, name: '文档', slug: 'docs', bookmarkCount: 8 },
    { id: 3, name: '工具', slug: 'tools', bookmarkCount: 8 },
    { id: 4, name: '零使用', slug: 'unused', bookmarkCount: 0 },
  ];
  const sorted = sortTagsByPopularity(input);
  expect(sorted.map((item) => item.id)).toEqual([3, 2, 1, 4]);
  expect(input.map((item) => item.id)).toEqual([1, 2, 3, 4]);

  const opts = tagOptions(sorted, true);
  expect(opts[0]).toEqual({
    value: 'tools',
    label: '工具',
    keywords: 'tools',
    hint: '8',
  });
  expect(matchOption(opts[1]!, 'DOCS')).toBe(true);
  expect(matchOption(opts[1]!, '文档')).toBe(true);
  expect(matchOption(opts[1]!, 'unknown')).toBe(false);
});
