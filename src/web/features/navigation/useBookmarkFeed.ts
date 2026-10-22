import type { Bookmark, BookmarkListOptions } from '@shared/api/types';

import { useCallback, useEffect, useRef, useState } from 'react';

import { api, ApiError } from '@nav/api/client';

import { createBookmarkFeedCache, type BookmarkFeedCache } from './bookmarkFeedCache';

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

/** 分区独立的游标资源；已访问分类可恢复，取消的响应不能写入缓存。 */
export function useBookmarkFeed({
  category,
  tag,
  untagged,
  pinned,
  query = '',
  enabled = true,
  cacheVisited = false,
  version = 0,
  onUnauthorized,
  coordinator,
}: {
  category?: string;
  tag?: string;
  untagged?: boolean;
  pinned?: boolean;
  query?: string;
  enabled?: boolean;
  cacheVisited?: boolean;
  version?: number;
  onUnauthorized: () => void;
  coordinator?: BookmarkFeedCache;
}) {
  const key = JSON.stringify([category, tag, untagged, pinned, query, version]);
  const [state, setState] = useState<FeedState>({ ...empty, key });
  const stateRef = useRef(state);
  const [ownCoordinator] = useState(createBookmarkFeedCache);
  const changes = coordinator ?? ownCoordinator;
  const [retry, setRetry] = useState(0);
  const cache = useRef(new Map<string, FeedState>());
  const cacheVersion = useRef(version);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const unauthorized = useRef(onUnauthorized);
  useEffect(() => {
    unauthorized.current = onUnauthorized;
  }, [onUnauthorized]);

  const publish = useCallback(
    (next: FeedState) => {
      stateRef.current = next;
      if (cacheVisited && (next.loaded || next.error)) {
        cache.current.set(next.key, { ...next, loading: false, loadingMore: false });
      }
      setState(next);
    },
    [cacheVisited],
  );

  useEffect(
    () =>
      changes.subscribe((bookmark) => {
        const patch = (value: FeedState): FeedState => ({
          ...value,
          items: value.items.map((item) => (item.id === bookmark.id ? bookmark : item)),
        });
        for (const [cacheKey, value] of cache.current) cache.current.set(cacheKey, patch(value));
        publish(patch(stateRef.current));
      }),
    [changes, publish],
  );

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
        ? api.searchBookmarks(query, options, signal)
        : api.getBookmarks(options, signal);
    },
    [category, tag, untagged, pinned, query],
  );

  useEffect(() => {
    if (cacheVersion.current !== version) {
      cache.current.clear();
      cacheVersion.current = version;
    }
    if (!enabled) return;
    const current = new AbortController();
    controller.current = current;
    const saved = cacheVisited ? cache.current.get(key) : undefined;
    busy.current = !saved;
    if (saved) {
      publish(saved);
      return () => current.abort();
    }
    publish({ ...empty, key, loading: true });
    const read = changes.beginRead(current.signal);
    request(current.signal)
      .then((page) => {
        if (!current.signal.aborted)
          publish({
            ...empty,
            key,
            items: read.reconcile(page.items),
            nextCursor: page.nextCursor,
            loaded: true,
          });
      })
      .catch((error: unknown) => {
        if (current.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          unauthorized.current();
          return;
        }
        publish({ ...empty, key, error: error instanceof Error ? error.message : '加载失败' });
      })
      .finally(() => {
        read.finish();
        if (!current.signal.aborted) busy.current = false;
      });
    return () => {
      current.abort();
      read.finish();
    };
  }, [key, request, enabled, retry, version, cacheVisited, publish, changes]);

  async function loadMore() {
    const current = controller.current;
    const snapshot = stateRef.current;
    if (
      !enabled ||
      !current ||
      current.signal.aborted ||
      busy.current ||
      !snapshot.nextCursor ||
      snapshot.key !== key
    )
      return;
    busy.current = true;
    publish({ ...snapshot, loadingMore: true, error: null });
    const read = changes.beginRead(current.signal);
    try {
      const page = await request(current.signal, snapshot.nextCursor);
      if (current.signal.aborted) return;
      const latest = stateRef.current;
      publish({
        ...latest,
        items: [
          ...latest.items,
          ...read
            .reconcile(page.items)
            .filter((item) => !latest.items.some((old) => old.id === item.id)),
        ],
        nextCursor: page.nextCursor,
        loadingMore: false,
        error: null,
      });
    } catch (error) {
      if (current.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) {
        unauthorized.current();
        return;
      }
      publish({
        ...stateRef.current,
        loadingMore: false,
        error: error instanceof Error ? error.message : '加载失败',
      });
    } finally {
      read.finish();
      if (!current.signal.aborted) busy.current = false;
    }
  }

  return {
    ...(state.key === key
      ? state
      : (cacheVisited && cache.current.get(key)) || { ...empty, key, loading: enabled }),
    loadMore,
    retry: () => {
      if (state.loaded) void loadMore();
      else {
        cache.current.delete(key);
        setRetry((value) => value + 1);
      }
    },
  };
}

export type BookmarkFeed = ReturnType<typeof useBookmarkFeed>;
