import type { Bookmark, CategoryNode } from '@nav/api/types';

export function flattenCategories(
  tree: CategoryNode[],
  level = 0,
): Array<CategoryNode & { level: number }> {
  return tree.flatMap((category) => [
    { ...category, level },
    ...flattenCategories(category.children, level + 1),
  ]);
}

export function findCategoryById(tree: CategoryNode[], id: number): CategoryNode | null {
  for (const category of tree) {
    if (category.id === id) {
      return category;
    }

    const nested = findCategoryById(category.children, id);
    if (nested) {
      return nested;
    }
  }

  return null;
}

export function countBookmarksRecursive(category: CategoryNode): number {
  return category.totalBookmarkCount;
}

export function countBookmarks(tree: CategoryNode[]) {
  return tree.reduce((total, category) => total + countBookmarksRecursive(category), 0);
}

export function filterBookmarks(bookmarks: Bookmark[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return bookmarks;
  }

  return bookmarks.filter((bookmark) => {
    const haystack = [bookmark.title, bookmark.url, bookmark.description ?? '']
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function buildCategoryLookup(tree: CategoryNode[]): Map<number, string> {
  const lookup = new Map<number, string>();
  const walk = (nodes: CategoryNode[], ancestors: string[]) => {
    for (const node of nodes) {
      const trail = [...ancestors, node.name];
      lookup.set(node.id, trail.join(' / '));
      walk(node.children, trail);
    }
  };
  walk(tree, []);
  return lookup;
}

export function buildCountMap(tree: CategoryNode[]): Map<number, number> {
  const counts = new Map<number, number>();
  const walk = (node: CategoryNode) => {
    counts.set(node.id, node.totalBookmarkCount);
    for (const child of node.children) {
      walk(child);
    }
  };
  for (const node of tree) {
    walk(node);
  }
  return counts;
}

export function findAncestorPath(tree: CategoryNode[], id: number): CategoryNode[] {
  const walk = (nodes: CategoryNode[], trail: CategoryNode[]): CategoryNode[] | null => {
    for (const node of nodes) {
      if (node.id === id) {
        return trail;
      }
      const found = walk(node.children, [...trail, node]);
      if (found) {
        return found;
      }
    }
    return null;
  };
  return walk(tree, []) ?? [];
}
