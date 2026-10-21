import type { CategoryNode } from '@nav/features/categories/tree';

import { useLocation, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  categoryPath,
  categorySectionId,
  type CategorySelections,
  resolveSelections,
} from './categoryBrowse';
import {
  parseNavigationSearch,
  readSearchMode,
  saveSearchMode,
  type NavigationSearch,
} from './search';

type Snapshot = { selections: CategorySelections; top: number; browseTop: number };

/** URL、模式偏好与历史快照在此协作；调用者不编排记忆、导航和 DOM 恢复。 */
export function useCategoryBrowse(roots: CategoryNode[], ready: boolean) {
  const location = useLocation();
  const navigate = useNavigate();
  const search = parseNavigationSearch(location.search);
  const entryKey = location.state.__TSR_key ?? location.href;
  const category = search.category;
  const [preferredMode, setPreferredMode] = useState(readSearchMode);
  const mode = search.mode ?? preferredMode;
  const searching = mode === 'site' && Boolean(search.q || search.tag || search.untagged);
  useEffect(() => {
    saveSearchMode(mode);
    setPreferredMode(mode);
  }, [mode]);
  const [snapshots] = useState(() => new Map<string, Snapshot>());
  const [frame, setFrame] = useState<{ key: string; selections: CategorySelections }>({
    key: entryKey,
    selections: {},
  });
  const prior = frame.key === entryKey ? frame.selections : snapshots.get(entryKey)?.selections;
  const selections = useMemo(
    () => (ready ? resolveSelections(roots, prior ?? frame.selections, category) : {}),
    [ready, roots, prior, frame.selections, category],
  );
  const signature = JSON.stringify(selections);
  // 在子组件发起请求前同步历史选择，避免短暂请求上一历史条目的分类。
  if (ready && (frame.key !== entryKey || JSON.stringify(frame.selections) !== signature)) {
    setFrame({ key: entryKey, selections });
  }
  const lastEntry = useRef<string | undefined>(undefined);
  const wasSearching = useRef(false);
  const browseTop = useRef(0);
  const remember = useCallback(() => {
    if (!ready) return;
    if (!searching) browseTop.current = window.scrollY;
    snapshots.set(entryKey, { selections, top: window.scrollY, browseTop: browseTop.current });
  }, [entryKey, selections, searching, ready, snapshots]);

  useLayoutEffect(() => {
    if (!ready) return;
    const snapshot = snapshots.get(entryKey);
    const changedEntry = lastEntry.current !== entryKey;
    if (changedEntry && snapshot) {
      browseTop.current = snapshot.browseTop;
      window.scrollTo({ top: snapshot.top, behavior: 'instant' });
    } else if (!searching && wasSearching.current) {
      window.scrollTo({ top: browseTop.current, behavior: 'instant' });
    } else if (lastEntry.current === undefined) {
      if (!searching && category) {
        const root = categoryPath(roots, category)[0];
        document
          .getElementById(categorySectionId(root?.slug ?? category))
          ?.scrollIntoView({ block: 'start', behavior: 'instant' });
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    }
    if (!searching) browseTop.current = window.scrollY;
    wasSearching.current = searching;
    lastEntry.current = entryKey;
    remember();
    window.addEventListener('scroll', remember, { passive: true });
    window.addEventListener('popstate', remember);
    return () => {
      window.removeEventListener('scroll', remember);
      window.removeEventListener('popstate', remember);
    };
  }, [entryKey, category, roots, searching, ready, snapshots, remember]);

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

  async function selectCategory(slug: string) {
    await update((previous) => ({
      ...previous,
      mode,
      category: slug,
      q: undefined,
      tag: undefined,
      untagged: undefined,
    }));
    const root = categoryPath(roots, slug)[0];
    document
      .getElementById(categorySectionId(root?.slug ?? slug))
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.focus({ preventScroll: true });
  }

  async function locateSection(rootSlug?: string) {
    const selected =
      rootSlug === 'uncategorized'
        ? rootSlug
        : rootSlug
          ? (selections[rootSlug] ?? rootSlug)
          : undefined;
    await update((previous) => ({
      ...previous,
      mode,
      category: selected,
      q: undefined,
      tag: undefined,
      untagged: undefined,
    }));
    document
      .getElementById(categorySectionId(rootSlug))
      ?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  return {
    search,
    mode,
    searching,
    selections,
    activeRoot: categoryPath(roots, category)[0]?.slug,
    update,
    selectCategory,
    locateSection,
  };
}
