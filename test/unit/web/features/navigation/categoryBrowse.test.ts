import type { Category } from '@shared/api/types';

import { expect, it } from 'vitest';

import { buildCategoryTree } from '@nav/features/categories/tree';
import { categoryPath, findDefaultRoot } from '@nav/features/navigation/categoryBrowse';

it('按可见树解析当前分类路径，未知分类返回空，不受同名分类影响', () => {
  const roots = buildCategoryTree([
    { id: 1, name: '工具', slug: 'tools', parentId: null, systemKey: null, sortOrder: 0 },
    { id: 2, name: '前端', slug: 'frontend', parentId: 1, systemKey: null, sortOrder: 0 },
    { id: 3, name: '阅读', slug: 'reading', parentId: null, systemKey: null, sortOrder: 1 },
    { id: 4, name: '前端', slug: 'frontend-reading', parentId: 3, systemKey: null, sortOrder: 0 },
    { id: 5, name: '常用', slug: 'common', parentId: null, systemKey: 'common', sortOrder: 2 },
  ] as Category[]);
  expect(categoryPath(roots, 'frontend-reading').map((item) => item.slug)).toEqual([
    'reading',
    'frontend-reading',
  ]);
  expect(categoryPath(roots, 'private-hidden')).toEqual([]);
  expect(categoryPath(roots, 'frontend').map((item) => item.slug)).toEqual(['tools', 'frontend']);
  expect(findDefaultRoot(roots)?.slug).toBe('common');
});
