import type { Bookmark, BookmarkInput } from '@shared/api/types';

import { useEffect, useRef, useState } from 'react';

import { api } from '@nav/api/client';

export type BookmarkChange =
  | { kind: 'created' | 'updated' | 'pinned' | 'archived' | 'restored'; bookmark: Bookmark }
  | { kind: 'trashed' | 'deleted'; id: number };

type BookmarkMutationEffects = {
  onContentChange: (change: BookmarkChange) => void;
  reloadTags: () => Promise<unknown> | void;
  reloadCategories: () => Promise<unknown> | void;
  onSuccess: (change: BookmarkChange) => void;
  onError: (message: string) => void;
};

/**
 * 前后台共用书签写入与刷新规则；呈现决定游标覆盖或页码刷新及反馈外观。
 * 保存失败向编辑器传播，其余操作通过 onError 反馈。卸载后停止内容刷新，
 * 反馈仍由呈现决定生命周期，让后台共享提示可跨管理页面保留。
 * 同一书签的冲突提交明确报错，由呈现保留草稿或提示稍后重试。
 */
export function useBookmarkMutations(options: BookmarkMutationEffects) {
  const effects = useRef(options);
  const mounted = useRef(true);
  const pending = useRef(new Set<number | 'new'>());
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => {
    effects.current = options;
  }, [options]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function publishPending() {
    if (mounted.current) {
      setPendingIds(
        new Set([...pending.current].filter((id): id is number => typeof id === 'number')),
      );
    }
  }

  async function commit<T extends BookmarkChange>(
    id: number | undefined,
    write: () => Promise<T>,
  ): Promise<T> {
    const key = id ?? 'new';
    if (pending.current.has(key)) throw new Error('该书签正在处理中，请稍后重试');
    pending.current.add(key);
    publishPending();
    try {
      const change = await write();
      if (mounted.current) {
        effects.current.onContentChange(change);
        if (change.kind !== 'pinned') {
          await Promise.all([effects.current.reloadTags(), effects.current.reloadCategories()]);
        }
      }
      effects.current.onSuccess(change);
      return change;
    } finally {
      pending.current.delete(key);
      publishPending();
    }
  }

  async function save(input: BookmarkInput, id?: number): Promise<Bookmark> {
    const kind = id === undefined ? 'created' : 'updated';
    const change = await commit(id, async () => ({
      kind,
      bookmark:
        id === undefined
          ? await api.createBookmark('', input)
          : await api.updateBookmark('', id, input),
    }));
    return change.bookmark;
  }

  async function togglePin(bookmark: Bookmark) {
    try {
      await commit(bookmark.id, async () => ({
        kind: 'pinned',
        bookmark: await api.updateBookmark('', bookmark.id, { isPinned: !bookmark.isPinned }),
      }));
    } catch (error) {
      effects.current.onError(error instanceof Error ? error.message : '操作失败，请重试');
    }
  }

  async function changeState(id: number, state: 'archive' | 'trash' | 'restore' | 'delete') {
    try {
      await commit(id, async (): Promise<BookmarkChange> => {
        switch (state) {
          case 'archive':
            return { kind: 'archived', bookmark: await api.archiveBookmark('', id) };
          case 'restore':
            return { kind: 'restored', bookmark: await api.restoreBookmark('', id) };
          case 'trash':
            await api.deleteBookmark('', id);
            return { kind: 'trashed', id };
          case 'delete':
            await api.permanentDeleteBookmark('', id);
            return { kind: 'deleted', id };
        }
      });
    } catch (error) {
      effects.current.onError(error instanceof Error ? error.message : '操作失败，请重试');
    }
  }

  return { save, togglePin, changeState, pendingIds };
}
