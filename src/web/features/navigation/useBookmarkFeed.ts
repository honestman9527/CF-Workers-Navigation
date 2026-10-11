import type { Bookmark, BookmarkListOptions } from '@shared/api/types';

import { useCallback, useEffect, useRef, useState } from 'react';

import { api, ApiError } from '@nav/api/client';

type FeedState = {
  key: string;
  items: Bookmark[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  loaded: boolean;
  error: string | null;
};
const empty = {
  items: [],
  nextCursor: null,
  loading: false,
  loadingMore: false,
  loaded: false,
  error: null,
};

/** 分区独立的游标资源；失败重试当前页，过期请求不能写回新筛选。 */
export function useBookmarkFeed({
  category,
  tag,
  untagged,
  pinned,
  query = '',
  enabled = true,
  version = 0,
  onUnauthorized,
}: {
  category?: string;
  tag?: string;
  untagged?: boolean;
  pinned?: boolean;
  query?: string;
  enabled?: boolean;
  version?: number;
  onUnauthorized: () => void;
}) {
  const key = JSON.stringify([category, tag, untagged, pinned, query, version]);
  const [state, setState] = useState<FeedState>({ ...empty, key });
  const [retry, setRetry] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const unauthorized = useRef(onUnauthorized);
  useEffect(() => {
    unauthorized.current = onUnauthorized;
  }, [onUnauthorized]);

  const request = useCallback(
    (signal: AbortSignal, cursor?: string) => {
      const options: BookmarkListOptions = {
        view: 'active',
        category,
        tag,
        untagged,
        pinned,
        limit: cursor ? 24 : 12,
        cursor,
      };
      return query
        ? api.searchBookmarks(undefined, query, options, signal)
        : api.getBookmarks(undefined, options, signal);
    },
    [category, tag, untagged, pinned, query],
  );

  useEffect(() => {
    if (!enabled) return;
    const current = new AbortController();
    controller.current = current;
    busy.current = true;
    setState({ ...empty, key, loading: true });
    request(current.signal)
      .then((page) => {
        if (!current.signal.aborted)
          setState({ ...empty, key, items: page.items, nextCursor: page.nextCursor, loaded: true });
      })
      .catch((error: unknown) => {
        if (current.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          unauthorized.current();
          return;
        }
        setState({ ...empty, key, error: error instanceof Error ? error.message : '加载失败' });
      })
      .finally(() => {
        if (!current.signal.aborted) busy.current = false;
      });
    return () => current.abort();
  }, [key, request, enabled, retry]);

  async function loadMore() {
    const current = controller.current;
    if (
      !enabled ||
      !current ||
      current.signal.aborted ||
      busy.current ||
      !state.nextCursor ||
      state.key !== key
    )
      return;
    busy.current = true;
    setState((prev) => ({ ...prev, loadingMore: true, error: null }));
    try {
      const page = await request(current.signal, state.nextCursor);
      if (current.signal.aborted) return;
      setState((prev) => ({
        ...prev,
        items: [
          ...prev.items,
          ...page.items.filter((item) => !prev.items.some((old) => old.id === item.id)),
        ],
        nextCursor: page.nextCursor,
        loadingMore: false,
      }));
    } catch (error) {
      if (current.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) {
        unauthorized.current();
        return;
      }
      setState((prev) => ({
        ...prev,
        loadingMore: false,
        error: error instanceof Error ? error.message : '加载失败',
      }));
    } finally {
      if (!current.signal.aborted) busy.current = false;
    }
  }

  return {
    ...(state.key === key ? state : { ...empty, key, loading: enabled }),
    loadMore,
    retry: () => {
      if (state.loaded) void loadMore();
      else setRetry((value) => value + 1);
    },
  };
}

export type BookmarkFeed = ReturnType<typeof useBookmarkFeed>;
