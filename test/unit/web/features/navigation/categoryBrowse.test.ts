import type { Category } from '@shared/api/types';

import { expect, it } from 'vitest';

import { buildCategoryTree } from '@nav/features/categories/tree';
import { categoryPath } from '@nav/features/navigation/categoryBrowse';

it('按可见树解析当前分类路径，未知分类返回空，不受同名分类影响', () => {
  const roots = buildCategoryTree([
    { id: 1, name: '工具', slug: 'tools', parentId: null, sortOrder: 0 },
    { id: 2, name: '前端', slug: 'frontend', parentId: 1, sortOrder: 0 },
    { id: 3, name: '阅读', slug: 'reading', parentId: null, sortOrder: 1 },
    { id: 4, name: '前端', slug: 'frontend-reading', parentId: 3, sortOrder: 0 },
  ] as Category[]);
  expect(categoryPath(roots, 'frontend-reading').map((item) => item.slug)).toEqual([
    'reading',
    'frontend-reading',
  ]);
  expect(categoryPath(roots, 'private-hidden')).toEqual([]);
  expect(categoryPath(roots, 'frontend').map((item) => item.slug)).toEqual(['tools', 'frontend']);
});
