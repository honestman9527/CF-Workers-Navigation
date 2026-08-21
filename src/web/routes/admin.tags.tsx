import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { adminRoute } from './admin';

export const adminTagsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/tags',
  component: lazyRouteComponent(() => import('@nav/features/admin/TagsTab'), 'TagsTab'),
});
