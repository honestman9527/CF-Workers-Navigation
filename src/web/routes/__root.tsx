import type { AuthContext } from '@nav/features/auth/context';

import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

import { useAppearance } from '@nav/hooks/useAppearance';
import { useTheme } from '@nav/hooks/useTheme';

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

/** 各页面自持完整布局，根路由同步全局主题与外观变量；开发环境挂 Devtools。 */
function RootLayout() {
  useTheme();
  useAppearance();

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
