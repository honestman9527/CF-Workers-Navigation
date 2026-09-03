import { createRoute, useRouter } from '@tanstack/react-router';

import { parseLoginSearch } from '@nav/features/auth/redirect';
import { LoginPage } from '@nav/pages/LoginPage';

import { rootRoute } from './__root';
import { redirectIfAuthed } from './guards';

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: parseLoginSearch,
  beforeLoad: redirectIfAuthed,
  component: LoginRoute,
});

function LoginRoute() {
  const auth = useRouter().options.context.auth;
  return <LoginPage onSubmit={(password) => auth.login(password)} />;
}
