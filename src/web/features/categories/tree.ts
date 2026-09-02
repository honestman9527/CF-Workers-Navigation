import type { Category } from '@shared/api/types';

export type CategoryNode = Category & { children: CategoryNode[] };

function compare(a: Category, b: Category): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-Hans-CN');
}

export function siblingIds(categories: Category[], node: Category): number[] {
  return categories
    .filter((item) => (item.parentId ?? null) === (node.parentId ?? null))
    .sort(compare)
    .map((item) => item.id);
}

/** Total direct and descendant bookmark counts for each category. */
export function descendantTotals(categories: Category[]): Map<number, number> {
  const byParent = new Map<number | null, Category[]>();
  for (const category of categories) {
    const key = category.parentId ?? null;
    const list = byParent.get(key);
    if (list) list.push(category);
    else byParent.set(key, [category]);
  }
  const totals = new Map<number, number>();
  function sum(id: number): number {
    const cached = totals.get(id);
    if (cached !== undefined) return cached;
    const node = categories.find((item) => item.id === id);
    let result = node?.bookmarkCount ?? 0;
    for (const child of byParent.get(id) ?? []) result += sum(child.id);
    totals.set(id, result);
    return result;
  }
  for (const category of categories) sum(category.id);
  return totals;
}

/** Returns a category subtree's ids, including its root. */
export function subtreeIds(categories: Category[], rootId: number): number[] {
  const byParent = new Map<number | null, Category[]>();
  for (const category of categories) {
    const key = category.parentId ?? null;
    const list = byParent.get(key);
    if (list) list.push(category);
    else byParent.set(key, [category]);
  }
  const ids: number[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    ids.push(id);
    for (const child of byParent.get(id) ?? []) stack.push(child.id);
  }
  return ids;
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
