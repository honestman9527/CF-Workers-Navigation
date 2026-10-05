import { createRoute } from '@tanstack/react-router';

import { LauncherPage } from '@nav/features/launcher/LauncherPage';
import { parseLauncherSearch } from '@nav/features/launcher/search';

import { rootRoute } from './__root';

/** 启动台：本地时间、站内搜索与底部常用 Dock，关键词/引擎由 URL 驱动。 */
export const launcherRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/launch',
  validateSearch: parseLauncherSearch,
  component: LauncherPage,
});
