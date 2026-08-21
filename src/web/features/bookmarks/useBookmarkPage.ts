import type { Bookmark, BookmarkView } from '@shared/api/types';

import { useEffect, useState } from 'react';

import { api, ApiError } from '@nav/api/client';

export function useBookmarkPage({
  view,
  category,
  tag,
  pinned,
  query,
  fetchAll,
  onUnauthorized,
  onError,
}: {
  view: BookmarkView;
  category?: string;
  tag?: string;
  pinned: boolean;
  query: string;
  /** 全量拉取模式：游标循环取完当前视图所有书签，用于落地页按分类分组的展示。 */
  fetchAll?: boolean;
  onUnauthorized: () => void;
  onError: (message: string) => void;
}) {
  const [items, setItems] = useState<Bookmark[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const request = fetchAll
      ? (async () => {
          const items: Bookmark[] = [];
          let cursor: string | null = null;
          do {
            const page = await api.getBookmarks(
              undefined,
              {
                view,
                category,
                tag,
                pinned: pinned || undefined,
                cursor: cursor ?? undefined,
                limit: 100,
              },
              controller.signal,
            );
            items.push(...page.items);
            cursor = page.nextCursor;
          } while (cursor && !controller.signal.aborted);
          return { items, nextCursor: null as string | null };
        })()
      : debouncedQuery
        ? api.searchBookmarks(
            undefined,
            debouncedQuery,
            {
              view,
              category,
              tag,
              pinned: pinned || undefined,
              limit: 24,
            },
            controller.signal,
          )
        : api.getBookmarks(
            undefined,
            {
              view,
              category,
              tag,
              pinned: pinned || undefined,
              limit: 24,
            },
            controller.signal,
          );
    void request
      .then((page) => {
        setItems(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof ApiError && error.status === 401) onUnauthorized();
        else onError(error instanceof Error ? error.message : '加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [category, debouncedQuery, fetchAll, pinned, refreshKey, tag, view]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = debouncedQuery
        ? await api.searchBookmarks(undefined, debouncedQuery, {
            view,
            category,
            tag,
            pinned: pinned || undefined,
            cursor: nextCursor,
            limit: 24,
          })
        : await api.getBookmarks(undefined, {
            view,
            category,
            tag,
            pinned: pinned || undefined,
            cursor: nextCursor,
            limit: 24,
          });
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onUnauthorized();
      else onError(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoadingMore(false);
    }
  }

  return {
    items,
    loading,
    loadingMore,
    hasMore: nextCursor !== null,
    loadMore,
    refresh: () => setRefreshKey((value) => value + 1),
  };
}
