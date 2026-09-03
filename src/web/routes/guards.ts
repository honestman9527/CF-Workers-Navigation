import type { AuthContext } from '@nav/features/auth/context';

import { redirect } from '@tanstack/react-router';

import { getAuthReturnPath, resolveAuthRedirect } from '@nav/features/auth/redirect';
import { getPreferredFrontRoute } from '@nav/features/settings/store';

type GuardContext = {
  context: { auth: AuthContext };
  location: {
    pathname: string;
    searchStr: string;
    hash: string;
  };
};

/** 未登录一律转登录页，并记录当前完整站内地址（工作区与管理后台共用）。 */
export function requireAuth({ context, location }: GuardContext) {
  if (!context.auth.authed) {
    throw redirect({
      to: '/login',
      search: { redirect: getAuthReturnPath(location) },
    });
  }
}

/** 已登录访问登录页时优先恢复原站内地址，否则回到记忆偏好的前台视图。 */
export function redirectIfAuthed({
  context,
  location,
}: GuardContext & { location: { search: { redirect?: unknown } } }) {
  if (context.auth.authed) {
    const target = resolveAuthRedirect(location.search.redirect) ?? getPreferredFrontRoute();
    throw redirect({ href: target });
  }
}
