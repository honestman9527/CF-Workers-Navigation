import { createRoute, redirect } from '@tanstack/react-router';

import { getPreferredFrontRoute } from '@nav/features/settings/store';

import { rootRoute } from './__root';
import { requireAuth } from './guards';

/** 根路径：登录后按记忆的前台偏好跳转启动台（/launch）或书签柜（/workspace）。 */
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    await requireAuth({ context });
    throw redirect({ to: getPreferredFrontRoute() });
  },
  component: () => null,
});
