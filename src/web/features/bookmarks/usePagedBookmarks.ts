import type { Bookmark, BookmarkView } from '@shared/api/types';

import { useEffect, useState } from 'react';

import { api, ApiError } from '@nav/api/client';

/** 后台网站列表可选每页条数。 */
export const PAGE_SIZES = [10, 20, 50, 100] as const;

/**
 * 后台专用的页码分页：offset + total（服务端），筛选变化自动回第 1 页，
 * 越界（如删除末页最后一条）时自动收敛到最后一页。
 */
export function usePagedBookmarks({
  view,
  category,
  tag,
  pinned,
  query,
  pageSize,
  onUnauthorized,
  onError,
}: {
  view: BookmarkView;
  category?: string;
  tag?: string;
  pinned: boolean;
  query: string;
  pageSize: number;
  onUnauthorized: () => void;
  onError: (message: string) => void;
}) {
  const [items, setItems] = useState<Bookmark[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // 筛选条件或每页条数变化时回到第 1 页。
  useEffect(() => {
    setPage(1);
  }, [view, category, tag, pinned, query, pageSize]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const offset = (page - 1) * pageSize;
    const request = query
      ? api.searchBookmarks(
          undefined,
          query,
          {
            view,
            category,
            tag,
            pinned: pinned || undefined,
            offset,
            limit: pageSize,
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
            offset,
            limit: pageSize,
          },
          controller.signal,
        );
    void request
      .then((result) => {
        setItems(result.items);
        setTotal(result.total ?? result.items.length);
        // 越界收敛：本页为空且不在第 1 页时，跳到（可能缩小的）最后一页。
        if (result.items.length === 0 && page > 1) {
          setPage(Math.max(1, Math.ceil((result.total ?? 0) / pageSize)));
        }
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        if (caught instanceof ApiError && caught.status === 401) onUnauthorized();
        else onError(caught instanceof Error ? caught.message : '加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, pageSize, view, category, tag, pinned, query, refreshKey, onUnauthorized, onError]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    items,
    total,
    page,
    totalPages,
    loading,
    setPage,
    refresh: () => setRefreshKey((value) => value + 1),
  };
}
