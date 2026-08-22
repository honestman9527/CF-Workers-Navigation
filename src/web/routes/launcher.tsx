import { createRoute } from '@tanstack/react-router';

import { LauncherPage } from '@nav/features/launcher/LauncherPage';

import { rootRoute } from './__root';
import { requireAuth } from './guards';

/** 启动台首页：中部搜索框 + 常用网站（置顶书签）。 */
export const launcherRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: requireAuth,
  component: LauncherPage,
});
