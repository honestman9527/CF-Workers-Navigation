import type { Category } from '@shared/api/types';

export type CategoryNode = Category & { children: CategoryNode[] };

function compare(a: Category, b: Category): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-Hans-CN');
}

/** 由扁平分类列表构建树；孤儿节点（父级缺失）按根节点处理。 */
export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const nodes = new Map<number, CategoryNode>();
  for (const category of categories) {
    nodes.set(category.id, { ...category, children: [] });
  }
  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId !== null ? nodes.get(node.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRecursive = (list: CategoryNode[]) => {
    list.sort(compare);
    for (const node of list) sortRecursive(node.children);
  };
  sortRecursive(roots);
  return roots;
}

/** 深度优先展平，用于表单下拉等扁平选择。 */
export function flattenCategoryTree(
  nodes: CategoryNode[],
  depth = 0,
): Array<CategoryNode & { depth: number }> {
  const result: Array<CategoryNode & { depth: number }> = [];
  for (const node of nodes) {
    result.push({ ...node, depth });
    result.push(...flattenCategoryTree(node.children, depth + 1));
  }
  return result;
}

/** 返回目标 slug 分类的所有祖先 id（含自身），用于自动展开选中路径。 */
export function ancestorIds(categories: Category[], targetSlug: string | undefined): number[] {
  if (!targetSlug || targetSlug === 'uncategorized') return [];
  const bySlug = new Map(categories.map((category) => [category.slug, category]));
  const byId = new Map(categories.map((category) => [category.id, category]));
  const target = bySlug.get(targetSlug);
  if (!target) return [];
  const ids: number[] = [];
  let current: Category | undefined = target;
  while (current) {
    ids.push(current.id);
    current = current.parentId !== null ? byId.get(current.parentId) : undefined;
  }
  return ids;
}
