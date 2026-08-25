import { RouterProvider } from '@tanstack/react-router';
import { useEffect } from 'react';

import { useAuth } from '@nav/features/auth/useAuth';
import { getPreferredFrontRoute } from '@nav/features/settings/store';
import { router } from '@nav/router';

export default function App() {
  const auth = useAuth();
  const { authed, loading } = auth;

  useEffect(() => {
    router.update({ context: { auth } });
  }, [auth]);

  // 登录态即路由：退出/401 过期统一回登录页；登录成功按记忆偏好进对应前台 UI（启动台或书签柜）。守卫负责兜底。
  useEffect(() => {
    const path = router.state.location.pathname;
    if (!authed && path !== '/login') {
      void router.navigate({ to: '/login' });
    } else if (authed && path === '/login') {
      void router.navigate({ to: getPreferredFrontRoute() });
    }
  }, [authed]);

  if (loading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-background text-muted-foreground">
        正在打开书签柜…
      </main>
    );
  }

  return <RouterProvider router={router} />;
}
