import { useRef, useState } from 'react';

import { pushToast } from '@nav/components/Toast';

export type ConfirmRequest = {
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  action: () => Promise<unknown>;
  successMessage: string;
};

export async function runBookmarkMutation(
  action: () => Promise<unknown>,
  options: {
    refreshPage: () => void;
    reloadTags: () => Promise<unknown> | void;
    reloadCategories: () => Promise<unknown> | void;
    onError: (message: string) => void;
  },
  message: string,
  { refreshRelated = true }: { refreshRelated?: boolean } = {},
) {
  try {
    await action();
    options.refreshPage();
    if (refreshRelated) {
      await options.reloadTags();
      await options.reloadCategories();
    }
    pushToast(message, 'success');
  } catch (error) {
    options.onError(error instanceof Error ? error.message : '操作失败');
  }
}

/**
 * 书签通用写操作包装：
 * - mutate(action, message, options)：执行动作并刷新；常用切换可跳过分类/标签刷新，并按书签 ID 防重复提交；
 * - askConfirm(request)：登记危险操作（移入回收站 / 归档 / 永久删除）的二次确认状态。
 * 工作区与管理后台「网站管理」共用；确认弹框用 ConfirmStateDialog 渲染。
 */
export function useBookmarkMutations(options: {
  refreshPage: () => void;
  reloadTags: () => Promise<unknown> | void;
  reloadCategories: () => Promise<unknown> | void;
  onError: (message: string) => void;
}) {
  const [confirmState, setConfirmState] = useState<ConfirmRequest | null>(null);
  const pendingRef = useRef(new Set<number>());
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(new Set());

  async function mutate(
    action: () => Promise<unknown>,
    message: string,
    mutation: { bookmarkId?: number; refreshRelated?: boolean } = {},
  ) {
    const id = mutation.bookmarkId;
    if (id !== undefined) {
      if (pendingRef.current.has(id)) return;
      pendingRef.current.add(id);
      setPendingIds(new Set(pendingRef.current));
    }
    try {
      await runBookmarkMutation(action, options, message, mutation);
    } finally {
      if (id !== undefined) {
        pendingRef.current.delete(id);
        setPendingIds(new Set(pendingRef.current));
      }
    }
  }

  function askConfirm(state: ConfirmRequest) {
    setConfirmState({
      ...state,
      action: () => runBookmarkMutation(state.action, options, state.successMessage),
    });
  }

  return { confirmState, mutate, askConfirm, setConfirmState, pendingIds };
}
