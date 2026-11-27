import type { CategoryNode } from '@nav/features/categories/tree';

import { COMMON_CATEGORY_SYSTEM_KEY } from '@shared/category-rules';

/** 当前范围使用稳定 DOM 标识。 */
export function categorySectionId(rootSlug?: string): string {
  if (!rootSlug) return 'section-common';
  return rootSlug === 'uncategorized' ? 'section-uncategorized' : `section-category-${rootSlug}`;
}

/** 解析首页默认入口分类：优先内置「常用」，否则退回首个可见一级分类。 */
export function findDefaultRoot(roots: CategoryNode[]): CategoryNode | undefined {
  return roots.find((node) => node.systemKey === COMMON_CATEGORY_SYSTEM_KEY) ?? roots[0];
}

/** 根到目标的路径，只使用当前身份可见的分类。 */
export function categoryPath(nodes: CategoryNode[], slug?: string): CategoryNode[] {
  if (!slug) return [];
  for (const node of nodes) {
    if (node.slug === slug) return [node];
    const childPath = categoryPath(node.children, slug);
    if (childPath.length) return [node, ...childPath];
  }
  return [];
}
