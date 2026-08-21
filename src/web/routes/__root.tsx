import type { AuthContext } from '@nav/features/auth/context';

import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

const TanStackRouterDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-router-devtools').then((module) => ({
        default: module.TanStackRouterDevtools,
      })),
    )
  : null;

export const rootRoute = createRootRouteWithContext<{ auth: AuthContext }>()({
  component: RootLayout,
});

/** 各页面自持完整布局，根路由只做出口；开发环境挂 Devtools。 */
function RootLayout() {
  return (
    <>
      <Outlet />
      {TanStackRouterDevtools ? (
        <Suspense fallback={null}>
          <TanStackRouterDevtools />
        </Suspense>
      ) : null}
    </>
  );
}
