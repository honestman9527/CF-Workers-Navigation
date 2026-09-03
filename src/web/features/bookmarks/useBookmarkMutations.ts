import { useState } from 'react';

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
) {
  try {
    await action();
    options.refreshPage();
    await options.reloadTags();
    await options.reloadCategories();
    pushToast(message, 'success');
  } catch (error) {
    options.onError(error instanceof Error ? error.message : '操作失败');
  }
}

/**
 * 书签通用写操作包装：
 * - mutate(action, message)：执行动作 → 刷新书目/标签/分类 → 成功 toast，失败走 onError；
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

  async function mutate(action: () => Promise<unknown>, message: string) {
    await runBookmarkMutation(action, options, message);
  }

  function askConfirm(state: ConfirmRequest) {
    setConfirmState({
      ...state,
      action: () => runBookmarkMutation(state.action, options, state.successMessage),
    });
  }

  return { confirmState, mutate, askConfirm, setConfirmState };
}
