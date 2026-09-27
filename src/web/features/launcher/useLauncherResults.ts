import type { Bookmark } from '@shared/api/types';

import { useCallback, useEffect, useRef, useState } from 'react';

import { api, ApiError } from '@nav/api/client';

const PAGE_SIZE = 24;

/** 启动台搜索：防抖取首批结果，后续页由用户按需加载。 */
export function useLauncherResults(searchQuery: string, onUnauthorized: () => void) {
  const [results, setResults] = useState<Bookmark[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = searchQuery;
    setResults([]);
    setNextCursor(null);
    setLoadingMore(false);
    setError(null);
    if (!q) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    const timer = setTimeout(async () => {
      try {
        const page = await api.searchBookmarks(
          undefined,
          q,
          { limit: PAGE_SIZE },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setResults(page.items);
        setNextCursor(page.nextCursor);
      } catch (caught) {
        if (controller.signal.aborted) return;
        if (caught instanceof ApiError && caught.status === 401) {
          onUnauthorized();
          return;
        }
        setResults([]);
        setError(caught instanceof Error ? caught.message : '无法连接 Nav 服务');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [searchQuery, onUnauthorized]);

  const loadMore = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller || !nextCursor || loading || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.searchBookmarks(
        undefined,
        searchQuery,
        { cursor: nextCursor, limit: PAGE_SIZE },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setResults((previous) => [...previous, ...page.items]);
      setNextCursor(page.nextCursor);
      setError(null);
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 401) {
        onUnauthorized();
        return;
      }
      setError(caught instanceof Error ? caught.message : '加载更多结果失败');
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }, [nextCursor, loading, loadingMore, searchQuery, onUnauthorized]);

  return { results, nextCursor, loading, loadingMore, error, loadMore };
}
