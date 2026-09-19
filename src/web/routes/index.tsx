import { createRoute, redirect } from '@tanstack/react-router';

import { getPreferredFrontRoute } from '@nav/features/settings/store';

import { rootRoute } from './__root';

/** 根路径：按记忆的前台偏好跳转启动台（/launch）或书签柜（/workspace）。 */
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: getPreferredFrontRoute() });
  },
  component: () => null,
});
