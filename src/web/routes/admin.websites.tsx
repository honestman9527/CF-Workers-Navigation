import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { adminRoute } from './admin';

/** 统一的网站（书签）管理。 */
export const adminWebsitesRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/websites',
  component: lazyRouteComponent(() => import('@nav/features/admin/WebsitesTab'), 'WebsitesTab'),
});
