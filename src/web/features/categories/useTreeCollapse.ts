import type { CategoryNode } from '@nav/api/types';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { findAncestorPath } from '@nav/utils/bookmarks';

const STORAGE_KEY = 'nav.tree.collapsed';

function loadCollapsed(): Set<number> | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return new Set(parsed.filter((value): value is number => typeof value === 'number'));
  } catch {
    return null;
  }
}

function saveCollapsed(collapsed: Set<number>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
  } catch {
    // ignore quota / private mode failures
  }
}

function defaultCollapsed(nodes: CategoryNode[], depth = 0): Set<number> {
  const collapsed = new Set<number>();
  for (const node of nodes) {
    if (node.children.length > 0 && depth > 0) {
      collapsed.add(node.id);
    }
    for (const child of defaultCollapsed(node.children, depth + 1)) {
      collapsed.add(child);
    }
  }
  return collapsed;
}

export function useTreeCollapse(categories: CategoryNode[], selectedCategoryId: number | null) {
  const [collapsed, setCollapsed] = useState<Set<number> | null>(loadCollapsed);

  useEffect(() => {
    if (collapsed === null) {
      return;
    }
    saveCollapsed(collapsed);
  }, [collapsed]);

  useEffect(() => {
    if (collapsed !== null || categories.length === 0) {
      return;
    }
    const next = defaultCollapsed(categories);
    if (selectedCategoryId !== null) {
      for (const ancestor of findAncestorPath(categories, selectedCategoryId)) {
        next.delete(ancestor.id);
      }
    }
    setCollapsed(next);
  }, [categories, collapsed, selectedCategoryId]);

  useEffect(() => {
    if (selectedCategoryId === null || collapsed === null) {
      return;
    }
    const ancestors = findAncestorPath(categories, selectedCategoryId);
    if (ancestors.length === 0) {
      return;
    }
    setCollapsed((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const ancestor of ancestors) {
        if (next.has(ancestor.id)) {
          next.delete(ancestor.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [categories, collapsed, selectedCategoryId]);

  const toggle = useCallback((id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const resolvedCollapsed = useMemo(() => collapsed ?? new Set<number>(), [collapsed]);
  const isCollapsed = useCallback((id: number) => resolvedCollapsed.has(id), [resolvedCollapsed]);

  return { collapsed: resolvedCollapsed, toggle, isCollapsed };
}
