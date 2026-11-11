import type { CategoryNode } from '@nav/features/categories/tree';

/** 当前范围使用稳定 DOM 标识，常用不带分类 slug。 */
export function categorySectionId(rootSlug?: string): string {
  if (!rootSlug) return 'section-common';
  return rootSlug === 'uncategorized' ? 'section-uncategorized' : `section-category-${rootSlug}`;
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
