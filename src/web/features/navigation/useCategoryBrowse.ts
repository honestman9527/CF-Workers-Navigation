import type { CategoryNode } from '@nav/features/categories/tree';

import { useLocation, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { categoryPath } from './categoryBrowse';
import {
  parseNavigationSearch,
  readSearchMode,
  saveSearchMode,
  type NavigationSearch,
} from './search';

/** URL 是当前分类与筛选的唯一来源；历史只保存滚动，不记忆各一级的二级选择。 */
export function useCategoryBrowse(roots: CategoryNode[], ready: boolean) {
  const location = useLocation();
  const navigate = useNavigate();
  const search = parseNavigationSearch(location.search);
  const entryKey = location.state.__TSR_key ?? location.href;
  const [preferredMode, setPreferredMode] = useState(readSearchMode);
  const [missingCategory, setMissingCategory] = useState(false);
  const mode = search.mode ?? preferredMode;
  const searching = mode === 'site' && Boolean(search.q || search.tag || search.untagged);
  const path = categoryPath(roots, search.category);
  const [snapshots] = useState(() => new Map<string, number>());
  const lastEntry = useRef<string | undefined>(undefined);
  const browseTops = useRef(new Map<string, number>());
  const previousView = useRef({ searching, category: search.category });
  const remember = useCallback(() => {
    if (ready) {
      snapshots.set(entryKey, window.scrollY);
      if (!searching) browseTops.current.set(search.category ?? '', window.scrollY);
    }
  }, [entryKey, ready, snapshots, searching, search.category]);
  useEffect(() => {
    saveSearchMode(mode);
    setPreferredMode(mode);
  }, [mode]);
  useLayoutEffect(() => {
    if (!ready) return;
    if (lastEntry.current !== entryKey) {
      const restored =
        previousView.current.searching &&
        !searching &&
        previousView.current.category === search.category
          ? browseTops.current.get(search.category ?? '')
          : undefined;
      window.scrollTo({ top: snapshots.get(entryKey) ?? restored ?? 0, behavior: 'instant' });
      lastEntry.current = entryKey;
    }
    previousView.current = { searching, category: search.category };
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, [entryKey, ready, snapshots, remember, searching, search.category]);
  const update = useCallback(
    (
      next: NavigationSearch | ((previous: NavigationSearch) => NavigationSearch),
      replace = false,
    ) => {
      remember();
      return navigate({
        to: '/',
        search: (previous) =>
          parseNavigationSearch(
            typeof next === 'function' ? next(parseNavigationSearch(previous)) : next,
          ),
        replace,
        resetScroll: false,
      });
    },
    [navigate, remember],
  );
  const invalidCategory =
    ready && Boolean(search.category && search.category !== 'uncategorized' && !path.length);
  useEffect(() => {
    if (!invalidCategory) return;
    setMissingCategory(true);
    void update((previous) => ({ ...previous, category: undefined }), true);
  }, [invalidCategory, update]);
  function selectCategory(slug?: string, query = search.q ?? '') {
    setMissingCategory(false);
    return update((previous) => ({
      ...previous,
      mode,
      category: slug,
      q: query.trim() || undefined,
    }));
  }
  return {
    search,
    mode,
    searching,
    update,
    selectCategory,
    root: path[0],
    activeRoot: path[0]?.slug,
    missingCategory,
    invalidCategory,
  };
}
