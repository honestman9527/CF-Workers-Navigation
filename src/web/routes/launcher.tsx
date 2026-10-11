import { createRoute, redirect } from '@tanstack/react-router';

import { legacyNavigationSearch } from '@nav/features/navigation/search';

import { rootRoute } from './__root';

/** 旧启动台链接迁移到首页网页模式。 */
export const launcherRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/launch',
  beforeLoad: ({ location }) => {
    throw redirect({
      to: '/',
      search: legacyNavigationSearch(location.search, 'web'),
      replace: true,
    });
  },
});
