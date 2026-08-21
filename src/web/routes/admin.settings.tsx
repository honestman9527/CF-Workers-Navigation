import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { adminRoute } from './admin';

export const adminSettingsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('@nav/features/admin/SettingsTab'), 'SettingsTab'),
});
