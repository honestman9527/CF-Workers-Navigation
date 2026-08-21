import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { adminRoute } from './admin';

/** 导入 / 导出 tab。 */
export const adminDataRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/data',
  component: lazyRouteComponent(() => import('@nav/features/admin/TransferTab'), 'TransferTab'),
});
