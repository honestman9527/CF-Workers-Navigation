import type { AuthContext } from './context';

import { useRouter } from '@tanstack/react-router';

/** 从 TanStack Router context 读取当前认证上下文（由 App 注入并随登录态更新）。 */
export function useAuthContext(): AuthContext {
  return useRouter().options.context.auth;
}
