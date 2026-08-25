import type { Bookmark, BookmarkPage, BookmarkView } from '@shared/api/types';

import { useEffect, useRef, useState } from 'react';

import { api, ApiError } from '@nav/api/client';

/**
 * 工作区的「一次取全部」数据源：按当前筛选（常用入口/分类/标签）游标循环取全部；
 * 输入搜索关键词时只按关键词全量匹配（忽略分类/标签/置顶）。不提供分页。
 */
export function useBookmarkPage({
  view,
  category,
  tag,
  pinned,
  query,
  onUnauthorized,
  onError,
}: {
  view: BookmarkView;
  category?: string;
  tag?: string;
  pinned: boolean;
  /** 搜索关键词（已由 URL 层防抖，此处直接使用）。 */
  query: string;
  onUnauthorized: () => void;
  onError: (message: string) => void;
}) {
  const [items, setItems] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  // 回调经 ref 读取，避免非稳定引用进入 effect 依赖导致每次渲染重取（页面传入的 reportError 每次渲染都是新引用）。
  const optionsRef = useRef({ onUnauthorized, onError });
  useEffect(() => {
    optionsRef.current = { onUnauthorized, onError };
  }, [onUnauthorized, onError]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const request = (async () => {
      const result: Bookmark[] = [];
      let cursor: string | null = null;
      do {
        // 全量搜索：不再依赖分类/标签/置顶，只按关键词匹配。
        const page: BookmarkPage = query
          ? await api.searchBookmarks(
              undefined,
              query,
              { view, cursor: cursor ?? undefined, limit: 100 },
              controller.signal,
            )
          : await api.getBookmarks(
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
        result.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor && !controller.signal.aborted);
      return result;
    })();
    void request
      .then((next) => {
        setItems(next);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        if (caught instanceof ApiError && caught.status === 401) {
          optionsRef.current.onUnauthorized();
        } else {
          optionsRef.current.onError(caught instanceof Error ? caught.message : '加载失败');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [category, pinned, query, refreshKey, tag, view]);

  return {
    items,
    loading,
    refresh: () => setRefreshKey((value) => value + 1),
  };
}
