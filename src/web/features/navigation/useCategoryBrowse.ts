import type { CategoryNode } from '@nav/features/categories/tree';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { categoryPath, type CategorySelections, resolveSelections } from './categoryBrowse';

type Snapshot = { selections: CategorySelections; top: number; browseTop: number };

/** 历史快照和分区选择仅存在于本次挂载中，刷新只按 URL 重建目标路径。 */
export function useCategoryBrowse(
  entryKey: string,
  roots: CategoryNode[],
  category: string | undefined,
  searching: boolean,
  ready: boolean,
) {
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
          .getElementById(root ? `section-category-${root.slug}` : `section-${category}`)
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

  return { selections, activeRoot: categoryPath(roots, category)[0]?.slug, remember };
}
