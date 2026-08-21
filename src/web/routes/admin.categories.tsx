import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { adminRoute } from './admin';

export const adminCategoriesRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/categories',
  component: lazyRouteComponent(() => import('@nav/features/admin/CategoriesTab'), 'CategoriesTab'),
});
