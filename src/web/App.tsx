import { useAuth } from '@nav/features/auth/useAuth';
import { WorkspacePage } from '@nav/features/workspace/WorkspacePage';
import { LoginPage } from '@nav/pages/LoginPage';

export default function App() {
  const { authed, loading: authLoading, login, logout } = useAuth();

  if (authLoading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-background text-muted-foreground">
        正在打开书签柜…
      </main>
    );
  }

  if (!authed) {
    return <LoginPage onSubmit={login} />;
  }

  return <WorkspacePage authed={authed} logout={logout} />;
}
