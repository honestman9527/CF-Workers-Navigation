import type { Bookmark } from '@shared/api/types';

import { useEffect, useRef, useState } from 'react';

import { api, ApiError } from '@nav/api/client';

async function searchAllBookmarks(query: string, signal: AbortSignal): Promise<Bookmark[]> {
  const items: Bookmark[] = [];
  let cursor: string | null = null;
  do {
    const page = await api.searchBookmarks(
      undefined,
      query,
      { cursor: cursor ?? undefined, limit: 100 },
      signal,
    );
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor && !signal.aborted);
  return items;
}

/**
 * 启动台书签全量搜索：防抖 + 游标循环取全部匹配；关键词为空时清空结果。
 */
export function useLauncherResults(searchQuery: string, onUnauthorized: () => void) {
  const [results, setResults] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = searchQuery;
    if (!q) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      try {
        const items = await searchAllBookmarks(q, controller.signal);
        setResults(items);
        setError(null);
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
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, onUnauthorized]);

  return { results, loading, error };
}
