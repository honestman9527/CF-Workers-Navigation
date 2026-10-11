import { createRoute, redirect } from '@tanstack/react-router';

import { legacyNavigationSearch } from '@nav/features/navigation/search';

import { rootRoute } from './__root';

/** 旧工作区链接迁移到首页站内模式。 */
export const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspace',
  beforeLoad: ({ location }) => {
    throw redirect({
      to: '/',
      search: legacyNavigationSearch(location.search, 'site'),
      replace: true,
    });
  },
});
