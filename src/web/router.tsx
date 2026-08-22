import type { AuthContext } from '@nav/features/auth/context';

import { createRouter, parseSearchWith, stringifySearchWith } from '@tanstack/react-router';

import { rootRoute } from './routes/__root';
import { adminRoute } from './routes/admin';
import { adminCategoriesRoute } from './routes/admin.categories';
import { adminDataRoute } from './routes/admin.data';
import { adminOverviewRoute } from './routes/admin.overview';
import { adminSettingsRoute } from './routes/admin.settings';
import { adminTagsRoute } from './routes/admin.tags';
import { launcherRoute } from './routes/launcher';
import { loginRoute } from './routes/login';
import { workspaceRoute } from './routes/workspace';

const routeTree = rootRoute.addChildren([
  launcherRoute,
  workspaceRoute,
  loginRoute,
  adminRoute.addChildren([
    adminOverviewRoute,
    adminCategoriesRoute,
    adminTagsRoute,
    adminSettingsRoute,
    adminDataRoute,
  ]),
]);

/** search 参数使用普通字符串编码（URLSearchParams 风格），而非默认 JSON 编码。 */
const parseSearch = parseSearchWith((value: string) => value);
const stringifySearch = stringifySearchWith((value: unknown) => JSON.stringify(value));

const initialAuthContext: AuthContext = {
  authed: false,
  login: async () => {},
  logout: async () => {},
};

export const router = createRouter({
  routeTree,
  context: { auth: initialAuthContext },
  parseSearch,
  stringifySearch,
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
