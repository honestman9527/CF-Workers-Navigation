import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { rootRoute } from './__root';
import { requireAuth } from './guards';

/** 管理后台布局路由：header + tab 导航 + Outlet，各 tab 独立懒加载 chunk。 */
export const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  beforeLoad: requireAuth,
  component: lazyRouteComponent(() => import('@nav/features/admin/AdminPage'), 'AdminPage'),
  pendingComponent: AdminPending,
});

function AdminPending() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background text-muted-foreground">
      正在打开管理后台…
    </main>
  );
}
