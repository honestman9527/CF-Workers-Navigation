import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { adminRoute } from './admin';

export const adminOverviewRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/',
  component: lazyRouteComponent(() => import('@nav/features/admin/OverviewTab'), 'OverviewTab'),
});
