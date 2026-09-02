import { useCallback, useState } from 'react';

import { ApiError } from '@nav/api/client';
import { pushToast } from '@nav/components/Toast';
import { useAuthContext } from '@nav/features/auth/useAuthContext';

/** Handles the shared admin-session failure behavior for one-off actions. */
export function handleAdminUnauthorized(
  auth: ReturnType<typeof useAuthContext>,
  caught: unknown,
): boolean {
  if (caught instanceof ApiError && caught.status === 401) {
    void auth.logout();
    return true;
  }
  return false;
}

/**
 * 管理后台通用的「执行写操作」包装：busy/error 状态 + 401 登出 + 成功 toast。
 * 供分类、标签等 tab 复用的 run(action, { message, refresh })。
 */
export function useAdminRun() {
  const auth = useAuthContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (
      action: () => Promise<unknown>,
      options?: { message?: string; refresh?: () => Promise<unknown> | void },
    ) => {
      setBusy(true);
      setError(null);
      try {
        await action();
        await options?.refresh?.();
        if (options?.message) pushToast(options.message, 'success');
      } catch (caught) {
        if (handleAdminUnauthorized(auth, caught)) {
        } else {
          setError(caught instanceof ApiError ? caught.message : '操作失败，请重试');
        }
      } finally {
        setBusy(false);
      }
    },
    [auth],
  );

  return { busy, error, run, setError };
}
