import type { CategoryNode } from '@nav/features/categories/tree';

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

export type CategorySelections = Record<string, string>;

export function resolveSelections(
  roots: CategoryNode[],
  previous: CategorySelections,
  active?: string,
): CategorySelections {
  const selections = Object.create(null) as CategorySelections;
  for (const root of roots) {
    const selected = previous[root.slug];
    selections[root.slug] =
      selected && categoryPath([root], selected).length ? selected : root.slug;
  }
  const path = categoryPath(roots, active);
  if (path.length) selections[path[0].slug] = path[path.length - 1].slug;
  return selections;
}
