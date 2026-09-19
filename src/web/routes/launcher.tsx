import { createRoute } from '@tanstack/react-router';

import { LauncherPage } from '@nav/features/launcher/LauncherPage';
import { parseLauncherSearch } from '@nav/features/launcher/search';

import { rootRoute } from './__root';

/** 启动台（命名路由）：中部搜索框 + 常用网站（置顶书签），搜索关键词/引擎由 URL 驱动。 */
export const launcherRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/launch',
  validateSearch: parseLauncherSearch,
  component: LauncherPage,
});
