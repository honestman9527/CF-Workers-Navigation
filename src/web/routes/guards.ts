import type { AuthContext } from '@nav/features/auth/context';

import { redirect } from '@tanstack/react-router';

import { getPreferredFrontRoute } from '@nav/features/settings/store';

type GuardContext = { context: { auth: AuthContext } };

/** 未登录一律重定向到登录页（工作区与管理后台共用）。 */
export function requireAuth({ context }: GuardContext) {
  if (!context.auth.authed) {
    throw redirect({ to: '/login' });
  }
}

/** 已登录访问登录页时回到记忆偏好的前台视图。 */
export function redirectIfAuthed({ context }: GuardContext) {
  if (context.auth.authed) {
    throw redirect({ to: getPreferredFrontRoute() });
  }
}
