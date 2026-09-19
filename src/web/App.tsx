import { RouterProvider } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { resolveAuthRedirect } from '@nav/features/auth/redirect';
import { useAuth } from '@nav/features/auth/useAuth';
import { getPreferredFrontRoute } from '@nav/features/settings/store';
import { router } from '@nav/router';

export default function App() {
  const auth = useAuth();
  const { authed, loading } = auth;
  const previousAuth = useRef(false);

  // 认证结果确定后才同步路由：刷新受保护页面时，首次匹配会使用已确认的 auth context。
  useEffect(() => {
    if (loading) return;

    const wasAuthed = previousAuth.current;
    previousAuth.current = authed;
    const location = router.state.location;
    if (wasAuthed && !authed && location.pathname.startsWith('/admin')) {
      void router.navigate({
        to: getPreferredFrontRoute(),
        replace: true,
      });
      return;
    }

    if (authed && location.pathname === '/login') {
      const redirect = resolveAuthRedirect(location.search.redirect);
      void router.navigate({ href: redirect ?? getPreferredFrontRoute(), replace: true });
    }
  }, [authed, loading]);

  if (loading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-background text-muted-foreground">
        正在打开书签柜…
      </main>
    );
  }

  return <RouterProvider key={authed ? 'admin' : 'public'} router={router} context={{ auth }} />;
}
